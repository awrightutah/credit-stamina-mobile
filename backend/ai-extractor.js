// ============================================
// Credit Stamina - AI-Powered PDF Extractor
// Uses Claude to extract and analyze all accounts
// from a credit report PDF in a single pass
// ============================================

const pdfParse = require('pdf-parse');
const Anthropic = require('@anthropic-ai/sdk');

async function extractAndAnalyzeWithAI(pdfBuffer, selectedBureau) {
  // Create client lazily so dotenv has already loaded the API key
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
  });
  // Step 1: Extract raw text from PDF
  let rawText;
  try {
    const data = await pdfParse(pdfBuffer);
    rawText = data.text;
  } catch (e) {
    throw new Error('Could not read PDF: ' + e.message);
  }

  if (!rawText || rawText.trim().length < 100) {
    throw new Error('PDF appears to be empty or unreadable');
  }

  // Truncate if extremely long (keep first 80k chars = ~20k tokens)
  const truncated = rawText.length > 80000 ? rawText.substring(0, 80000) + '\n[...truncated]' : rawText;

  const today = new Date().toISOString().split('T')[0];

  // Step 2: Single Claude call to extract + analyze everything
  const prompt = `You are a credit repair expert analyzing a credit report PDF. Extract ALL credit accounts and analyze each one.

TODAY'S DATE: ${today}
SELECTED BUREAU: ${selectedBureau}

CREDIT REPORT TEXT:
---
${truncated}
---

TASK: Extract every credit account (tradeline) from this report. For each account:
1. Extract all available data fields
2. Normalize the creditor name (clean, consistent format)
3. Assign a lane and action based on credit repair strategy

LANE DEFINITIONS:
- "Active Damage": Currently hurting score RIGHT NOW (past due balance > 0, active delinquency, recent late payments). Needs immediate action.
- "Removable": Collection, charge-off, or negative account that could be removed via dispute/negotiation. No active past due.
- "Aging/Monitor": Stable account — positive, or negative but aging off naturally. Monitor or wait.

LANE RULES:
- past_due_amount > 0 → almost always "Active Damage"
- Account falls off within 12 months → "Aging/Monitor" (don't disturb it)
- Collections/charge-offs with balance → "Removable" unless 6+ years old
- Active cards with high utilization but current → "Aging/Monitor"
- "Paid" collections/charge-offs → "Removable" (can still dispute)

Return ONLY a valid JSON object in this exact format:
{
  "bureau": "Equifax" | "Experian" | "TransUnion",
  "report_date": "YYYY-MM-DD or null",
  "accounts": [
    {
      "creditor": "Clean creditor name (e.g. Capital One Auto Finance)",
      "account_number": "last 4 digits only, or null",
      "account_type": "e.g. Auto Loan, Credit Card, Collection, Mortgage, Student Loan",
      "status": "e.g. Open, Closed, Charged Off, In Collections, 30 Days Late",
      "current_balance": number or 0,
      "past_due_amount": number or 0,
      "credit_limit": number or null,
      "high_balance": number or null,
      "monthly_payment": number or null,
      "date_opened": "YYYY-MM-DD or null",
      "date_closed": "YYYY-MM-DD or null",
      "last_reported_date": "YYYY-MM-DD or null",
      "last_payment_date": "YYYY-MM-DD or null",
      "date_account_will_be_removed": "YYYY-MM-DD or null",
      "account_age_in_months": number or null,
      "remarks": "any remarks/comments from the report or null",
      "lane": "Active Damage" | "Removable" | "Aging/Monitor",
      "next_action": "specific actionable task (max 80 chars)",
      "priority": 1 | 2 | 3,
      "due_date_offset_days": number,
      "strategy": "brief strategy explanation (max 200 chars)",
      "recommended_letter_type": "pay-for-delete" | "goodwill" | "bureau-dispute" | "debt-validation" | "get-current" | "none",
      "notes": "why this lane and action (max 300 chars)"
    }
  ]
}

IMPORTANT:
- Extract EVERY account, even positive ones
- Use null for missing fields, never omit fields
- Normalize creditor names consistently (e.g. "LVNV FUNDING LLC" not "LVNV FUNDING LLC405731042336****")
- For past_due_amount: use the ACTUAL past due dollar amount, NOT the full balance
- If "X days past due" but no dollar amount given, set past_due_amount to 1
- Return ONLY the JSON, no explanation or markdown`;

  console.log(`🤖 Sending ${Math.round(truncated.length / 1000)}k chars to Claude for extraction...`);

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 16000,
    messages: [{ role: 'user', content: prompt }]
  });

  const responseText = message.content[0].text.trim();
  console.log(`📥 Claude response length: ${responseText.length} chars, stop_reason: ${message.stop_reason}`);

  // Extract JSON from response
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error('Claude response:', responseText.substring(0, 500));
    throw new Error('Claude did not return valid JSON');
  }

  let jsonStr = jsonMatch[0];

  // If response was truncated (max_tokens hit), try to repair the JSON
  if (message.stop_reason === 'max_tokens') {
    console.warn('⚠️ Claude response was truncated! Attempting JSON repair...');
    const lastCompleteAccount = jsonStr.lastIndexOf('},\n    {');
    if (lastCompleteAccount > 0) {
      jsonStr = jsonStr.substring(0, lastCompleteAccount + 1) + '\n  ]\n}';
      console.log('🔧 Repaired truncated JSON by removing incomplete last account');
    } else {
      const lastBrace = jsonStr.lastIndexOf('}');
      if (lastBrace > 0) {
        jsonStr = jsonStr.substring(0, lastBrace + 1) + '\n  ]\n}';
      }
    }
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    console.error('JSON parse error:', e.message);
    const errPos = parseInt(e.message.match(/position (\d+)/)?.[1] || 0);
    console.error('JSON snippet around error:', jsonStr.substring(Math.max(0, errPos - 100), errPos + 100));

    // Aggressive repair: find all complete account objects
    const accountMatches = jsonStr.match(/\{[^{}]*"creditor"[^{}]*\}/g);
    if (accountMatches && accountMatches.length > 0) {
      console.log(`🔧 Aggressive repair: found ${accountMatches.length} account objects`);
      const bureauMatch = jsonStr.match(/"bureau"\s*:\s*"([^"]+)"/);
      const reportDateMatch = jsonStr.match(/"report_date"\s*:\s*"([^"]+)"/);
      parsed = {
        bureau: bureauMatch ? bureauMatch[1] : selectedBureau,
        report_date: reportDateMatch ? reportDateMatch[1] : null,
        accounts: accountMatches.map(a => { try { return JSON.parse(a); } catch(e2) { return null; } }).filter(Boolean)
      };
    } else {
      throw new Error('Could not parse Claude JSON response: ' + e.message);
    }
  }

  if (!parsed.accounts || !Array.isArray(parsed.accounts)) {
    throw new Error('No accounts array in Claude response');
  }

  // Normalize and validate accounts
  const today_date = new Date();
  const accounts = parsed.accounts.map(a => {
    // Calculate account age if not provided
    if (!a.account_age_in_months && a.date_opened) {
      const opened = new Date(a.date_opened);
      if (!isNaN(opened)) {
        a.account_age_in_months = Math.floor((today_date - opened) / (1000 * 60 * 60 * 24 * 30.44));
      }
    }

    // Calculate utilization if not provided
    if (!a.utilization_rate && a.current_balance && a.credit_limit) {
      a.utilization_rate = Math.round((a.current_balance / a.credit_limit) * 100);
    }

    return {
      creditor: (a.creditor || '').trim(),
      account_number: a.account_number || null,
      account_type: a.account_type || null,
      status: a.status || null,
      current_balance: Number(a.current_balance) || 0,
      past_due_amount: Number(a.past_due_amount) || 0,
      credit_limit: a.credit_limit ? Number(a.credit_limit) : 0,
      high_balance: a.high_balance ? Number(a.high_balance) : 0,
      monthly_payment: a.monthly_payment ? Number(a.monthly_payment) : null,
      date_opened: a.date_opened || null,
      date_closed: a.date_closed || null,
      last_reported_date: a.last_reported_date || null,
      last_payment_date: a.last_payment_date || null,
      date_account_will_be_removed: a.date_account_will_be_removed || null,
      estimated_date_removed: a.date_account_will_be_removed || null,
      account_age_in_months: a.account_age_in_months || 0,
      utilization_rate: a.utilization_rate || 0,
      remarks: a.remarks || null,
      bureau: parsed.bureau || selectedBureau,
      // AI analysis fields
      lane: a.lane || 'Aging/Monitor',
      next_action: a.next_action || 'Monitor account',
      priority: a.priority || 3,
      due_date_offset_days: a.due_date_offset_days || 30,
      strategy: a.strategy || null,
      recommended_letter_type: a.recommended_letter_type || 'none',
      notes: a.notes || null
    };
  }).filter(a => a.creditor && a.creditor.length > 1);

  console.log(`✅ Claude extracted ${accounts.length} accounts from ${parsed.bureau || selectedBureau} report`);

  return {
    bureau: parsed.bureau || selectedBureau,
    report_date: parsed.report_date || null,
    total_found: accounts.length,
    accounts
  };
}

module.exports = { extractAndAnalyzeWithAI };