require('dotenv').config(); // MUST be first before any other requires

const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const multer = require('multer');
const Anthropic = require('@anthropic-ai/sdk');
const { parseCreditReportPDF } = require('./pdf-parser');
const { extractAndAnalyzeWithAI } = require('./ai-extractor');

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// Multer: store PDF in memory (max 20MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF files are allowed'));
  }
});

const app = express();
const port = process.env.PORT || 3000;

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Helper: get an authenticated Supabase client using the user's JWT token
async function getSupabaseClient(req) {
  // Try multiple sources for the user's JWT token
  // 1. Custom header (tunnel may not strip x- headers)
  let token = req.headers['x-user-token'];
  
  // 2. Authorization header (may be overwritten by tunnel)
  if (!token) {
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
  }
  
  // 3. Form body token (most reliable - tunnel can't intercept body)
  if (!token && req.body && req.body.user_token) {
    token = req.body.user_token;
  }

  // 4. JSON body token
  if (!token && req.body && req.body.access_token) {
    token = req.body.access_token;
  }

  if (token) {
    const parts = token.split('.');
    if (parts.length === 3) {
      console.log(`🔐 Using user JWT (length=${token.length}, source=body/header)`);
      const client = createClient(supabaseUrl, supabaseKey);
      // Use setSession to properly authenticate the client
      await client.auth.setSession({ 
        access_token: token, 
        refresh_token: token // refresh token not needed for server-side ops
      });
      return client;
    }
  }
  
  console.log(`⚠️ No valid JWT found, using anon client`);
  return supabase;
}

// Helper: get current authenticated user from request
async function getCurrentUser(req) {
  let token = req.headers['x-user-token'];
  if (!token) {
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) token = authHeader.substring(7);
  }
  if (!token && req.body && req.body.user_token) token = req.body.user_token;
  if (!token && req.body && req.body.access_token) token = req.body.access_token;
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    if (!payload.sub) return null;
    return { id: payload.sub, email: payload.email };
  } catch (e) {
    return null;
  }
}

// Middleware
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      // Local development
      'http://localhost:3000',
      'http://localhost:8080',
      // S3 deployed frontend
      'https://sites.super.myninja.ai',
      // Cloudflare tunnels (any subdomain)
      /\.trycloudflare\.com$/,
      // Your future domains - add these when ready:
      // 'https://app.creditstamina.com',
      // 'https://creditstamina.com',
      // 'https://www.creditstamina.com',
    ];
    
    const allowed = allowedOrigins.some(o => 
      typeof o === 'string' ? o === origin : o.test(origin)
    );
    
    if (allowed) {
      callback(null, true);
    } else {
      // In production, log but still allow (for WordPress iframe embedding)
      console.log(`CORS request from: ${origin}`);
      callback(null, true);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-User-Token', 'apikey']
}));
app.use(express.json());

// Serve frontend static files
const path = require('path');
app.use(express.static(path.join(__dirname, 'frontend')));

// ==================== Helper Functions ====================

// Fallback rule-based lane (used if AI analysis fails)
function calculateLane(accountData) {
  const pastDue = parseFloat(accountData.pastDueAmount || accountData.past_due_amount || 0);
  const status = (accountData.status || '').toLowerCase();
  const accountType = (accountData.accountType || accountData.account_type || '').toLowerCase();

  if (pastDue > 0) return 'Active Damage';
  if (accountType.includes('collection') || status.includes('charge-off') || status.includes('collection')) return 'Removable';
  return 'Aging/Monitor';
}

// Fallback action generation (used if AI analysis fails)
function generateAction(accountData, lane) {
  const creditor = accountData.creditor || 'Account';
  switch (lane) {
    case 'Active Damage':
      return { nextAction: 'Contact creditor about past due balance', priority: 1, dueDateOffset: 3, notes: `Contact ${creditor} to discuss getting the account current or setting up a payment arrangement.` };
    case 'Removable':
      return { nextAction: 'Send pay-for-delete letter', priority: 2, dueDateOffset: 7, notes: `This ${creditor} collection/charge-off may be removable. Consider a pay-for-delete letter.` };
    default:
      return { nextAction: 'Monitor account for changes', priority: 3, dueDateOffset: 30, notes: `This ${creditor} account is stable. Monitor for changes.` };
  }
}

// AI-powered analysis of a single account
async function analyzeAccountWithAI(account) {
  try {
    const today = new Date();
    const prompt = `You are a credit repair expert. Analyze this credit account and return a JSON object with your recommendations.

ACCOUNT DATA:
- Creditor: ${account.creditor || 'Unknown'}
- Account Type: ${account.account_type || 'Unknown'}
- Status: ${account.status || 'Unknown'}
- Current Balance: $${account.current_balance || 0}
- Past Due Amount: $${account.past_due_amount || 0}
- Credit Limit: $${account.credit_limit || 0}
- High Balance: $${account.high_balance || 0}
- Date Opened: ${account.date_opened || 'Unknown'}
- Last Reported: ${account.last_reported_date || 'Unknown'}
- Last Payment: ${account.last_payment_date || 'Unknown'}
- Account Age: ${account.account_age_in_months || 0} months
- Date Falls Off Report: ${account.date_account_will_be_removed || account.estimated_date_removed || 'Unknown'}
- Remarks: ${account.remarks || 'None'}
- Bureau: ${account.bureau || 'Unknown'}
- Today's Date: ${today.toISOString().split('T')[0]}

LANE DEFINITIONS:
- "Active Damage": Account is CURRENTLY hurting the credit score (past due balance, recent late payments, active delinquency). Action needed NOW.
- "Removable": Collection, charge-off, or negative account that could potentially be removed through negotiation or dispute. No active past due.
- "Aging/Monitor": Stable account — either positive, or negative but aging off naturally. Best to monitor or wait.

IMPORTANT RULES:
- If past_due_amount > 0, it's almost always "Active Damage"
- If account falls off within 12 months, consider "Aging/Monitor" even if negative (don't disturb it)
- Collections with balances are usually "Removable" unless very old (7+ years)
- Charge-offs with no collection activity may be "Aging/Monitor" if close to falling off
- Active credit cards with high utilization but current payments = "Aging/Monitor"

Return ONLY valid JSON, no explanation:
{
  "lane": "Active Damage" | "Removable" | "Aging/Monitor",
  "next_action": "specific actionable task (max 80 chars)",
  "priority": 1 | 2 | 3,
  "due_date_offset_days": number,
  "strategy": "brief strategy explanation (max 200 chars)",
  "recommended_letter_type": "pay-for-delete" | "goodwill" | "bureau-dispute" | "debt-validation" | "get-current" | "none",
  "notes": "detailed explanation of why this lane and action (max 300 chars)"
}`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }]
    });

    const text = message.content[0].text.trim();
    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');
    return JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.error(`AI analysis failed for ${account.creditor}:`, e.message);
    return null;
  }
}

function calculateUtilization(currentBalance, creditLimit) {
  if (!creditLimit || creditLimit === 0) return 0;
  return Math.round((parseFloat(currentBalance) / parseFloat(creditLimit)) * 100);
}

function calculateAccountAge(dateOpened) {
  if (!dateOpened) return 0;
  const opened = new Date(dateOpened);
  const now = new Date();
  const diffTime = Math.abs(now - opened);
  return Math.floor(diffTime / (1000 * 60 * 60 * 24 * 30));
}

function parseCreditReport(creditReport) {
  const tradeLine = creditReport.trade_line || creditReport.tradeLine || {};
  return {
    creditor: tradeLine.creditor_name || tradeLine.creditor || '',
    accountNumber: tradeLine.account_number || tradeLine.accountNumber || '',
    currentBalance: tradeLine.current_balance || tradeLine.currentBalance || 0,
    pastDueAmount: tradeLine.past_due_amount || tradeLine.pastDueAmount || 0,
    status: tradeLine.account_status || tradeLine.status || '',
    accountType: tradeLine.account_type || tradeLine.accountType || '',
    dateOpened: tradeLine.date_opened || tradeLine.dateOpened || null,
    lastReportedDate: tradeLine.date_reported || tradeLine.lastReportedDate || null,
    lastPaymentDate: tradeLine.date_last_payment || tradeLine.lastPaymentDate || null,
    highBalance: tradeLine.high_balance || tradeLine.highBalance || 0,
    terms: tradeLine.terms || '',
    paymentHistory: tradeLine.payment_history || tradeLine.paymentHistory || '',
    creditLimit: tradeLine.credit_limit || tradeLine.creditLimit || 0,
    amountPastDue: tradeLine.amount_past_due || tradeLine.amountPastDue || 0,
    delinquentAmount: tradeLine.delinquent_amount || tradeLine.delinquentAmount || 0,
    dateAccountWillBeRemoved: tradeLine.date_removed || tradeLine.dateAccountWillBeRemoved || null,
    estimatedDateRemoved: tradeLine.estimated_removed || tradeLine.estimatedDateRemoved || null,
    remarks: tradeLine.remarks || '',
    rawText: JSON.stringify(tradeLine)
  };
}

// ==================== ACCOUNTS ====================

app.post('/api/accounts', async (req, res) => {
  const db = await getSupabaseClient(req);
  try {
    const creditReport = req.body;
    if (!creditReport) return res.status(400).json({ error: 'No credit report data provided' });

    const accountData = parseCreditReport(creditReport);
    const lane = calculateLane(accountData);
    const accountAgeInMonths = calculateAccountAge(accountData.dateOpened);
    const utilizationRate = calculateUtilization(accountData.currentBalance, accountData.creditLimit);

    const dbRecord = {
      lane, creditor: accountData.creditor, account_number: accountData.accountNumber,
      current_balance: accountData.currentBalance, past_due_amount: accountData.pastDueAmount,
      status: accountData.status, account_type: accountData.accountType,
      date_opened: accountData.dateOpened || null, last_reported_date: accountData.lastReportedDate || null,
      last_payment_date: accountData.lastPaymentDate || null, high_balance: accountData.highBalance,
      terms: accountData.terms, payment_history: accountData.paymentHistory,
      account_age_in_months: accountAgeInMonths, credit_limit: accountData.creditLimit,
      amount_past_due: accountData.amountPastDue, delinquent_amount: accountData.delinquentAmount,
      date_account_will_be_removed: accountData.dateAccountWillBeRemoved || null,
      estimated_date_removed: accountData.estimatedDateRemoved || null,
      utilization_rate: utilizationRate, remarks: accountData.remarks, raw_text: accountData.rawText
    };

    const { data: account, error: accountError } = await db.from('accounts').insert(dbRecord).select().single();
    if (accountError) return res.status(500).json({ error: 'Failed to create account', details: accountError.message });

    const actionData = generateAction(accountData, lane);
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + actionData.dueDateOffset);

    const { data: action, error: actionError } = await db.from('action_queue').insert({
      account_name: accountData.creditor, lane, next_action: actionData.nextAction,
      priority: actionData.priority, due_date: dueDate, status: 'Pending',
      notes: actionData.notes, account_id: account.id
    }).select().single();

    res.status(201).json({ message: 'Account and action created successfully', account, action });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

app.get('/api/accounts', async (req, res) => {
  const db = await getSupabaseClient(req);
  try {
    const user = await getCurrentUser(req);
    const query = db.from('accounts').select('*').order('created_at', { ascending: false });
    if (user) query.eq('user_id', user.id);
    const { data: accounts, error } = await query;
    if (error) return res.status(500).json({ error: 'Failed to fetch accounts', details: error.message });
    res.status(200).json(accounts || []);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

app.delete('/api/accounts/:id', async (req, res) => {
  const db = await getSupabaseClient(req);
  try {
    const { id } = req.params;
    await db.from('action_queue').delete().eq('account_id', id);
    const { error } = await db.from('accounts').delete().eq('id', id);
    if (error) return res.status(500).json({ error: 'Failed to delete account', details: error.message });
    res.status(200).json({ message: 'Account deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// ==================== ACTIONS ====================

app.get('/api/actions', async (req, res) => {
  const db = await getSupabaseClient(req);
  try {
    const user = await getCurrentUser(req);
    const { status, lane } = req.query;
    let query = db.from('action_queue').select('*').order('priority', { ascending: true }).order('due_date', { ascending: true });
    if (user) query = query.eq('user_id', user.id);
    if (status) query = query.eq('status', status);
    if (lane) query = query.eq('lane', lane);
    const { data: actions, error } = await query;
    if (error) return res.status(500).json({ error: 'Failed to fetch actions', details: error.message });
    res.status(200).json(actions || []);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

app.put('/api/actions/:id/status', async (req, res) => {
  const db = await getSupabaseClient(req);
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: 'Status is required' });
    const { data: action, error } = await db.from('action_queue').update({ status, updated_at: new Date() }).eq('id', id).select().single();
    if (error) return res.status(500).json({ error: 'Failed to update action status', details: error.message });
    res.status(200).json({ message: 'Action status updated successfully', action });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

app.delete('/api/actions/:id', async (req, res) => {
  const db = await getSupabaseClient(req);
  try {
    const { id } = req.params;
    const { error } = await db.from('action_queue').delete().eq('id', id);
    if (error) return res.status(500).json({ error: 'Failed to delete action', details: error.message });
    res.status(200).json({ message: 'Action deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// NEW: Create manual action
app.post('/api/actions', async (req, res) => {
  const db = await getSupabaseClient(req);
  try {
    const { account_name, lane, next_action, priority, due_date, notes, account_id, user_id } = req.body;
    if (!next_action) return res.status(400).json({ error: 'next_action is required' });

    const record = {
      account_name: account_name || 'Manual',
      lane: lane || 'Aging/Monitor',
      next_action,
      priority: priority || 3,
      due_date: due_date || null,
      status: 'Pending',
      notes: notes || null,
      account_id: account_id || null
    };
    if (user_id) record.user_id = user_id;

    const { data: action, error } = await db.from('action_queue').insert(record).select().single();
    if (error) return res.status(500).json({ error: 'Failed to create action', details: error.message });
    res.status(201).json({ message: 'Action created successfully', action });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// ==================== PDF UPLOAD ====================

app.post('/api/upload-pdf', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No PDF file uploaded' });

    const db = await getSupabaseClient(req);
    const userId = req.body.user_id || null;
    const selectedBureau = req.body.bureau || 'Unknown';
    console.log(`📄 Processing PDF: ${req.file.originalname} (${Math.round(req.file.size / 1024)}KB) bureau=${selectedBureau}`);

    // Use AI to extract and analyze all accounts in one pass
    const parseResult = await extractAndAnalyzeWithAI(req.file.buffer, selectedBureau);
    console.log(`✅ AI extracted ${parseResult.total_found} accounts from ${parseResult.bureau}`);

    // Create credit_report record for upload history
    let creditReportId = null;
    try {
      const reportRecord = {
        bureau: parseResult.bureau,
        file_name: req.file.originalname,
        processing_status: 'Processing',
        accounts_extracted: 0
      };
      if (userId) reportRecord.user_id = userId;

      const { data: reportRow, error: reportError } = await db
        .from('credit_reports')
        .insert(reportRecord)
        .select()
        .single();

      if (!reportError && reportRow) creditReportId = reportRow.id;
    } catch (e) {
      console.log('credit_reports table not yet created, skipping upload history');
    }

    if (parseResult.total_found === 0) {
      if (creditReportId) {
        await db.from('credit_reports').update({ processing_status: 'Complete', accounts_extracted: 0 }).eq('id', creditReportId);
      }
      return res.status(200).json({
        message: 'PDF parsed but no accounts found. The format may not be supported.',
        bureau: parseResult.bureau,
        accounts_created: 0,
        accounts_updated: 0,
        accounts: []
      });
    }

    const results = [];
    const errors = [];

    for (const parsedAccount of parseResult.accounts) {
      try {
        const dbRecord = {
          lane: parsedAccount.lane,
          creditor: parsedAccount.creditor,
          account_number: parsedAccount.account_number,
          current_balance: parsedAccount.current_balance || 0,
          past_due_amount: parsedAccount.past_due_amount || 0,
          status: parsedAccount.status,
          account_type: parsedAccount.account_type,
          date_opened: parsedAccount.date_opened || null,
          last_reported_date: parsedAccount.last_reported_date || null,
          last_payment_date: parsedAccount.last_payment_date || null,
          high_balance: parsedAccount.high_balance || 0,
          credit_limit: parsedAccount.credit_limit || 0,
          utilization_rate: parsedAccount.utilization_rate || 0,
          account_age_in_months: parsedAccount.account_age_in_months || 0,
          date_account_will_be_removed: parsedAccount.date_account_will_be_removed || null,
          estimated_date_removed: parsedAccount.estimated_date_removed || null,
          remarks: parsedAccount.remarks || null,
          bureau: parseResult.bureau,
          strategy: parsedAccount.strategy || null,
          raw_text: JSON.stringify(parsedAccount)
        };

        if (userId) dbRecord.user_id = userId;
        if (creditReportId) dbRecord.credit_report_id = creditReportId;

        // Smart upsert: check if account already exists for this user+creditor+bureau
        let account = null;
        let isUpdate = false;

        if (userId) {
          // Find existing account - use account_number if available, otherwise creditor name
          let query = db.from('accounts')
            .select('*')
            .eq('user_id', userId)
            .eq('bureau', parseResult.bureau)
            .order('created_at', { ascending: false })
            .limit(1);

          if (parsedAccount.account_number) {
            // Match by account number (most reliable)
            query = query.eq('account_number', parsedAccount.account_number);
          } else {
            // Match by creditor name (case-insensitive)
            query = query.ilike('creditor', `%${parsedAccount.creditor.substring(0, 15)}%`);
          }

          const { data: existingRows } = await query;
          const existing = existingRows && existingRows.length > 0 ? existingRows[0] : null;

          // Clean up any additional duplicates
          if (existingRows && existingRows.length > 1) {
            const extraIds = existingRows.slice(1).map(r => r.id);
            await db.from('action_queue').delete().in('account_id', extraIds);
            await db.from('accounts').delete().in('id', extraIds);
            console.log(`  🧹 Removed ${extraIds.length} duplicate(s) for ${parsedAccount.creditor}`);
          }

          if (existing) {
            isUpdate = true;
            const { data: updated, error: updateError } = await db.from('accounts')
              .update({ ...dbRecord, updated_at: new Date() })
              .eq('id', existing.id)
              .select().single();

            if (updateError) {
              console.error(`❌ Update error for ${parsedAccount.creditor}:`, updateError.message);
              errors.push({ creditor: parsedAccount.creditor, error: updateError.message });
              continue;
            }
            account = updated;

            // Update action queue
            await db.from('action_queue')
              .update({
                lane: parsedAccount.lane,
                next_action: parsedAccount.next_action,
                priority: parsedAccount.priority,
                notes: parsedAccount.notes,
                status: 'Pending'
              })
              .eq('account_id', existing.id);

            console.log(`  🔄 Updated: ${parsedAccount.creditor} → ${parsedAccount.lane}`);
          }
        }

        // Insert new account if not found
        if (!account) {
          const { data: inserted, error: accountError } = await db.from('accounts').insert(dbRecord).select().single();
          if (accountError) {
            console.error(`❌ Insert error for ${parsedAccount.creditor}:`, accountError.message);
            errors.push({ creditor: parsedAccount.creditor, error: accountError.message });
            continue;
          }
          account = inserted;

          const dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + (parsedAccount.due_date_offset_days || 30));

          const actionRecord = {
            account_name: parsedAccount.creditor,
            lane: parsedAccount.lane,
            next_action: parsedAccount.next_action,
            priority: parsedAccount.priority,
            due_date: dueDate,
            status: 'Pending',
            notes: parsedAccount.notes,
            account_id: account.id
          };
          if (userId) actionRecord.user_id = userId;
          await db.from('action_queue').insert(actionRecord);
          console.log(`  ✨ New: ${parsedAccount.creditor} → ${parsedAccount.lane}`);
        }

        results.push({
          creditor: account.creditor,
          lane: account.lane,
          id: account.id,
          ai_analyzed: true,
          updated: isUpdate
        });

      } catch (err) {
        console.error(`❌ Exception for ${parsedAccount.creditor}:`, err.message);
        errors.push({ creditor: parsedAccount.creditor, error: err.message });
      }
    }

    // Update credit_report record with final count
    if (creditReportId) {
      await db.from('credit_reports').update({
        processing_status: 'Complete',
        accounts_extracted: results.length
      }).eq('id', creditReportId);
    }

    const newAccounts = results.filter(r => !r.updated).length;
    const updatedAccounts = results.filter(r => r.updated).length;

    res.status(201).json({
      message: `Successfully processed ${results.length} accounts from ${parseResult.bureau} report`,
      bureau: parseResult.bureau,
      accounts_found: parseResult.total_found,
      accounts_created: newAccounts,
      accounts_updated: updatedAccounts,
      errors_count: errors.length,
      accounts: results,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error('Error in POST /api/upload-pdf:', error);
    res.status(500).json({ error: 'Failed to parse PDF', details: error.message });
  }
});
// ==================== CLEAR BUREAU DATA ====================

app.delete('/api/accounts/bureau/:bureau', async (req, res) => {
  const db = await getSupabaseClient(req);
  try {
    const { data: { user } } = await db.auth.getUser();
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    const bureau = req.params.bureau;
    
    // Get all account IDs for this user+bureau first
    const { data: accounts } = await db.from('accounts')
      .select('id')
      .eq('user_id', user.id)
      .eq('bureau', bureau);
    
    if (accounts && accounts.length > 0) {
      const ids = accounts.map(a => a.id);
      // Delete related action queue items
      await db.from('action_queue').delete().in('account_id', ids);
      // Delete accounts
      await db.from('accounts').delete().in('id', ids);
    }

    // Delete credit reports for this bureau
    await db.from('credit_reports')
      .delete()
      .eq('user_id', user.id)
      .eq('bureau', bureau);

    console.log(`🗑️ Cleared ${accounts?.length || 0} ${bureau} accounts for user ${user.id}`);
    res.json({ message: `Cleared ${accounts?.length || 0} ${bureau} accounts`, deleted: accounts?.length || 0 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ==================== HOUSEHOLD / INVITE ENDPOINTS ====================

// Get current user's profile
app.get('/api/profile', async (req, res) => {
  const db = await getSupabaseClient(req);
  try {
    const { data: { user } } = await db.auth.getUser();
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    const { data, error } = await db.from('profiles').select('*').eq('id', user.id).maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data || { id: user.id, email: user.email });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update profile
app.put('/api/profile', async (req, res) => {
  const db = await getSupabaseClient(req);
  try {
    const { data: { user } } = await db.auth.getUser();
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    const { first_name, last_name, phone, address } = req.body;
    const { data, error } = await db.from('profiles')
      .upsert({ id: user.id, email: user.email, first_name, last_name, phone, address, updated_at: new Date() })
      .select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Send household invite
app.post('/api/household/invite', async (req, res) => {
  const db = await getSupabaseClient(req);
  try {
    const { data: { user } } = await db.auth.getUser();
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    // Check if already invited
    const { data: existing } = await db.from('household_invites')
      .select('*').eq('invited_by', user.id).eq('invite_email', email).eq('status', 'pending').maybeSingle();
    if (existing) return res.status(400).json({ error: 'An invite has already been sent to this email' });

    const { data, error } = await db.from('household_invites')
      .insert({ invited_by: user.id, invite_email: email })
      .select().single();
    if (error) return res.status(500).json({ error: error.message });

    console.log(`📧 Household invite sent to ${email} by ${user.email}`);
    res.json({ message: `Invite sent to ${email}`, invite: data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get household invites (sent by current user)
app.get('/api/household/invites', async (req, res) => {
  const db = await getSupabaseClient(req);
  try {
    const { data: { user } } = await db.auth.getUser();
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    const { data, error } = await db.from('household_invites')
      .select('*').eq('invited_by', user.id).order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Accept household invite
app.post('/api/household/accept', async (req, res) => {
  const db = await getSupabaseClient(req);
  try {
    const { data: { user } } = await db.auth.getUser();
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Invite token is required' });

    const { data: invite, error: inviteError } = await db.from('household_invites')
      .select('*').eq('invite_token', token).eq('status', 'pending').maybeSingle();

    if (inviteError || !invite) return res.status(404).json({ error: 'Invalid or expired invite' });
    if (new Date(invite.expires_at) < new Date()) return res.status(400).json({ error: 'Invite has expired' });
    if (invite.invite_email !== user.email) return res.status(403).json({ error: 'This invite was sent to a different email address' });

    // Accept the invite
    await db.from('household_invites').update({ status: 'accepted', accepted_by: user.id }).eq('id', invite.id);

    // Link profiles with same household_id
    const householdId = invite.invited_by; // use primary user's ID as household ID
    await db.from('profiles').upsert({ id: user.id, email: user.email, household_id: householdId, is_primary_user: false, invited_by: invite.invited_by });
    await db.from('profiles').upsert({ id: invite.invited_by, household_id: householdId, is_primary_user: true });

    res.json({ message: 'Successfully joined household', household_id: householdId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Cancel/revoke invite
app.delete('/api/household/invite/:id', async (req, res) => {
  const db = await getSupabaseClient(req);
  try {
    const { data: { user } } = await db.auth.getUser();
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    const { error } = await db.from('household_invites')
      .update({ status: 'cancelled' }).eq('id', req.params.id).eq('invited_by', user.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ message: 'Invite cancelled' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// CREDIT REPORTS (HISTORY)
// ============================================

app.get('/api/credit-reports', async (req, res) => {
  try {
    const db = await getSupabaseClient(req);
    const user = await getCurrentUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const { data, error } = await db.from('credit_reports').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/credit-reports/:id', async (req, res) => {
  try {
    const db = await getSupabaseClient(req);
    const user = await getCurrentUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const { error } = await db.from('credit_reports').delete().eq('id', req.params.id).eq('user_id', user.id);
    if (error) throw error;
    res.json({ message: 'Deleted' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// SCORE HISTORY
// ============================================

app.get('/api/scores', async (req, res) => {
  try {
    const db = await getSupabaseClient(req);
    const user = await getCurrentUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const { data, error } = await db.from('score_history').select('*').eq('user_id', user.id).order('recorded_date', { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/scores', async (req, res) => {
  try {
    const db = await getSupabaseClient(req);
    const user = await getCurrentUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const { bureau, score, recorded_date, notes } = req.body;
    if (!bureau || !score) return res.status(400).json({ error: 'bureau and score required' });
    const record = { user_id: user.id, bureau, score: parseInt(score), recorded_date: recorded_date || new Date().toISOString().split('T')[0], notes: notes || null };
    const { data, error } = await db.from('score_history').insert(record).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/scores/:id', async (req, res) => {
  try {
    const db = await getSupabaseClient(req);
    const user = await getCurrentUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const { error } = await db.from('score_history').delete().eq('id', req.params.id).eq('user_id', user.id);
    if (error) throw error;
    res.json({ message: 'Deleted' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// DISPUTE LETTERS
// ============================================

app.get('/api/letters', async (req, res) => {
  try {
    const db = await getSupabaseClient(req);
    const user = await getCurrentUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const { data, error } = await db.from('dispute_letters').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/letters', async (req, res) => {
  try {
    const db = await getSupabaseClient(req);
    const user = await getCurrentUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const record = { ...req.body, user_id: user.id };
    const { data, error } = await db.from('dispute_letters').insert(record).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/letters/:id', async (req, res) => {
  try {
    const db = await getSupabaseClient(req);
    const user = await getCurrentUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const { data, error } = await db.from('dispute_letters').update(req.body).eq('id', req.params.id).eq('user_id', user.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/letters/:id', async (req, res) => {
  try {
    const db = await getSupabaseClient(req);
    const user = await getCurrentUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const { error } = await db.from('dispute_letters').delete().eq('id', req.params.id).eq('user_id', user.id);
    if (error) throw error;
    res.json({ message: 'Deleted' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/letters/generate', async (req, res) => {
  try {
    const db = await getSupabaseClient(req);
    const user = await getCurrentUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { account_id, letter_type, user_name, user_address } = req.body;
    if (!account_id || !letter_type) return res.status(400).json({ error: 'account_id and letter_type required' });

    // Get account details
    const { data: account, error: accErr } = await db.from('accounts').select('*').eq('id', account_id).single();
    if (accErr || !account) return res.status(404).json({ error: 'Account not found' });

    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    const letterPrompts = {
      'pay-for-delete': `Write a professional pay-for-delete letter from "${user_name}" at "${user_address}" to ${account.creditor}. The account number ends in ${account.account_number || 'XXXX'}. Current balance: $${account.current_balance}. Request complete deletion from all credit bureaus in exchange for payment. Be firm but professional. Include today's date: ${today}.`,
      'goodwill': `Write a professional goodwill letter from "${user_name}" at "${user_address}" to ${account.creditor}. Account ending in ${account.account_number || 'XXXX'}. Request removal of negative marks as a goodwill gesture. Acknowledge the past issue, emphasize current good standing. Include today's date: ${today}.`,
      'bureau-dispute': `Write a professional credit bureau dispute letter from "${user_name}" at "${user_address}" disputing the account from ${account.creditor} (account ending ${account.account_number || 'XXXX'}) reported by ${account.bureau || 'the bureau'}. Dispute inaccurate information and request verification or deletion. Reference FCRA Section 611. Include today's date: ${today}.`,
      'debt-validation': `Write a professional debt validation letter from "${user_name}" at "${user_address}" to ${account.creditor}. Account ending in ${account.account_number || 'XXXX'}. Demand full debt validation under FDCPA Section 809. Request original creditor info, amount breakdown, and proof of right to collect. Include today's date: ${today}.`,
      'get-current': `Write a professional hardship/payment arrangement letter from "${user_name}" at "${user_address}" to ${account.creditor}. Account ending in ${account.account_number || 'XXXX'}. Current balance: $${account.current_balance}, past due: $${account.past_due_amount}. Request a payment plan to get current. Include today's date: ${today}.`
    };

    const promptText = letterPrompts[letter_type] || letterPrompts['bureau-dispute'];

    const anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await anthropicClient.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1500,
      messages: [{ role: 'user', content: promptText }]
    });

    const letterContent = message.content[0].text;

    // Save to database
    const record = {
      user_id: user.id,
      account_id,
      creditor: account.creditor,
      letter_type,
      content: letterContent,
      status: 'Draft',
      bureau: account.bureau || null
    };
    const { data: saved, error: saveErr } = await db.from('dispute_letters').insert(record).select().single();
    if (saveErr) console.warn('Could not save letter:', saveErr.message);

    res.json({ letter: letterContent, saved: saved || null });
  } catch (e) {
    console.error('Error generating letter:', e);
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// AI ADVISOR
// ============================================

app.post('/api/ai-advisor', async (req, res) => {
  try {
    const db = await getSupabaseClient(req);
    const user = await getCurrentUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { message: userMessage } = req.body;
    if (!userMessage) return res.status(400).json({ error: 'message required' });

    // Get user's accounts for context
    const { data: accounts } = await db.from('accounts').select('creditor, lane, current_balance, past_due_amount, status, account_type, bureau').eq('user_id', user.id).limit(30);

    const accountSummary = accounts && accounts.length > 0
      ? accounts.map(a => `- ${a.creditor} (${a.account_type}, ${a.bureau}): ${a.lane}, Balance $${a.current_balance}, Past Due $${a.past_due_amount}, Status: ${a.status}`).join('\n')
      : 'No accounts uploaded yet.';

    const systemPrompt = `You are a credit repair expert AI advisor. You help users understand and improve their credit. Be specific, actionable, and encouraging. Keep responses concise (under 300 words).

USER'S CREDIT ACCOUNTS:
${accountSummary}`;

    const anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await anthropicClient.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 600,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }]
    });

    res.json({ response: message.content[0].text });
  } catch (e) {
    console.error('Error in AI advisor:', e);
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// CLEAR ALL USER DATA
// ============================================

app.delete('/api/user/clear-all', async (req, res) => {
  try {
    const db = await getSupabaseClient(req);
    const user = await getCurrentUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const uid = user.id;
    await Promise.all([
      db.from('action_queue').delete().eq('user_id', uid),
      db.from('dispute_letters').delete().eq('user_id', uid),
      db.from('score_history').delete().eq('user_id', uid),
      db.from('credit_reports').delete().eq('user_id', uid),
    ]);
    await db.from('accounts').delete().eq('user_id', uid);
    res.json({ message: 'All data cleared' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// DELETE USER ACCOUNT (App Store required)
// ============================================

app.delete('/api/user/delete-account', async (req, res) => {
  try {
    const db   = await getSupabaseClient(req);
    const user = await getCurrentUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const uid = user.id;

    // Delete all user data from every table
    await Promise.all([
      db.from('action_queue').delete().eq('user_id', uid),
      db.from('dispute_letters').delete().eq('user_id', uid),
      db.from('score_history').delete().eq('user_id', uid),
      db.from('credit_reports').delete().eq('user_id', uid),
      db.from('profiles').delete().eq('id', uid).catch(() => null),
      db.from('points').delete().eq('user_id', uid).catch(() => null),
      db.from('billing').delete().eq('user_id', uid).catch(() => null),
    ]);
    await db.from('accounts').delete().eq('user_id', uid);

    // Attempt auth user deletion using service role key (requires SUPABASE_SERVICE_ROLE_KEY env var)
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (serviceKey) {
      try {
        const { createClient: mkClient } = require('@supabase/supabase-js');
        const adminClient = mkClient(supabaseUrl, serviceKey);
        await adminClient.auth.admin.deleteUser(uid);
        console.log(`[delete-account] Auth user ${uid} deleted via admin API`);
      } catch (adminErr) {
        console.warn('[delete-account] Admin user delete failed (non-fatal):', adminErr.message);
      }
    }

    res.json({ message: 'Account deleted successfully', deleted: true });
  } catch (e) {
    console.error('[delete-account] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy', 
    message: 'Credit Stamina API is running',
    endpoints: [
      'POST /api/accounts', 'GET /api/accounts', 'DELETE /api/accounts/:id',
      'GET /api/actions', 'POST /api/actions', 'PUT /api/actions/:id/status', 'DELETE /api/actions/:id',
      'POST /api/upload-pdf',
      'GET /api/credit-reports', 'DELETE /api/credit-reports/:id',
      'GET /api/scores', 'POST /api/scores', 'DELETE /api/scores/:id',
      'GET /api/letters', 'POST /api/letters', 'PUT /api/letters/:id', 'DELETE /api/letters/:id',
      'POST /api/letters/generate',
      'POST /api/ai-advisor'
    ]
  });
});

// Serve index.html for all non-API routes (SPA fallback)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

// ==================== Start Server ====================

app.listen(port, '0.0.0.0', () => {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║         🏋️  Credit Stamina API Server 🏋️               ║
║                                                          ║
║         Server running on http://localhost:${port}           ║
║                                                          ║
║         New endpoints: scores, letters, credit-reports   ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
  `);
});