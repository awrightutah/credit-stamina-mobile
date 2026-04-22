// ============================================
// Credit Stamina - PDF Parser
// Supports: Equifax, Experian, TransUnion
// ============================================

const pdfParse = require('pdf-parse');

// ============================================
// BUREAU DETECTION
// ============================================

function detectBureau(text) {
    const upper = text.substring(0, 2000).toUpperCase();
    if (upper.includes('EQUIFAX')) return 'equifax';
    if (upper.includes('EXPERIAN')) return 'experian';
    if (upper.includes('TRANSUNION') || upper.includes('TRANS UNION')) return 'transunion';
    return 'unknown';
}

// ============================================
// UTILITY PARSERS
// ============================================

function parseAmount(str) {
    if (!str || str.trim() === '' || str.trim() === '-') return null;
    const cleaned = str.replace(/[$,\s]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
}

function parseDate(str) {
    if (!str || str.trim() === '' || str.trim() === '-') return null;
    str = str.trim();
    // MM/DD/YYYY
    const mdy = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (mdy) return `${mdy[3]}-${mdy[1].padStart(2,'0')}-${mdy[2].padStart(2,'0')}`;
    // MM/YYYY
    const my = str.match(/^(\d{1,2})\/(\d{4})$/);
    if (my) return `${my[2]}-${my[1].padStart(2,'0')}-01`;
    // Mon YYYY (e.g. "Dec 2025")
    const monYear = str.match(/^([A-Za-z]{3})\s+(\d{4})$/);
    if (monYear) {
        const months = {jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',
                        jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12'};
        const m = months[monYear[1].toLowerCase()];
        if (m) return `${monYear[2]}-${m}-01`;
    }
    return null;
}

function calcAgeMonths(dateOpenedStr) {
    if (!dateOpenedStr) return null;
    const opened = new Date(dateOpenedStr);
    if (isNaN(opened)) return null;
    const now = new Date();
    return Math.floor((now - opened) / (1000 * 60 * 60 * 24 * 30.44));
}

function calcUtilization(balance, limit) {
    if (!balance || !limit || limit === 0) return null;
    return Math.round((balance / limit) * 100);
}

// ============================================
// LANE ASSIGNMENT (same logic as server.js)
// ============================================

function assignLane(account) {
    const pastDue = account.past_due_amount || 0;
    const type = (account.account_type || '').toLowerCase();
    const status = (account.status || '').toLowerCase();

    if (pastDue > 0) return 'Active Damage';
    if (type.includes('collection') || type.includes('debt buyer') ||
        status.includes('charge-off') || status.includes('charge off') ||
        status.includes('charged off') || status.includes('collection')) {
        return 'Removable';
    }
    return 'Aging/Monitor';
}

// Normalize a parsed account's balance and status so closed/paid accounts
// with no balance don't appear as missing data.  Applied by all three parsers.
function normalizeAccount(account) {
    // Balance: null on a paid/closed account → 0 (expected, not missing)
    const statusLower = (account.status || '').toLowerCase();
    const isClosed = statusLower.includes('paid') || statusLower.includes('closed') ||
                     !!account.date_closed;
    if (account.current_balance === null) {
        account.current_balance = 0;
    }

    // Status: null/empty → 'Closed' when we can infer closure, else 'Unknown'
    if (!account.status || account.status.trim() === '') {
        account.status = account.date_closed ? 'Closed' : 'Unknown';
    }

    return account;
}

// ============================================
// EQUIFAX PARSER
// ============================================

function parseEquifax(text) {
    const accounts = [];
    const lines = text.split('\n');

    // Find "Credit Accounts" section
    let startIdx = 0;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim() === 'Credit Accounts') {
            startIdx = i;
            break;
        }
    }

    // Split into account blocks by detecting creditor name pattern
    // Pattern: ALL CAPS line followed by address line followed by Account Number line
    let i = startIdx;
    while (i < lines.length) {
        const line = lines[i].trim();

        // Detect creditor name: line that is mostly uppercase, not a header/footer
        if (isCreditorName(line, lines, i)) {
            const block = extractEquifaxBlock(lines, i);
            if (block) {
                accounts.push(block);
                // Skip forward to the next blank line (end of this account block)
                // then keep going — don't use a hardcoded skip that can overshoot
                let j = i + 1;
                while (j < lines.length && lines[j].trim() !== '') j++;
                i = j; // land on the blank line; outer i++ will advance past it
                continue;
            }
        }
        i++;
    }

    return accounts;
}

function isCreditorName(line, lines, idx) {
    if (!line || line.length < 3 || line.length > 80) return false;
    // Creditor names never contain a colon — field labels always do (e.g. "Date of Last Payment:")
    if (line.includes(':')) return false;
    // Skip known non-creditor lines
    const skip = ['ANDREW K WRIGHT', 'ANDREW WRIGHT', 'Confirmation #',
                  'Credit Accounts', 'Payment History', 'Year', 'Prepared for:',
                  'Page ', 'Credit Report', 'Negative Information', 'Inquiries',
                  'Closed or Paid', 'Account/Zero', 'Zero Balance'];
    for (const s of skip) {
        if (line.includes(s)) return false;
    }
    // Skip lines starting with numbers (page artifacts like "158Closed...")
    if (/^\d/.test(line)) return false;
    // Must be mostly uppercase letters
    const letters = line.replace(/[^A-Za-z]/g, '');
    if (letters.length < 3) return false;
    const upperCount = (line.match(/[A-Z]/g) || []).length;
    if (upperCount < 3) return false;
    // Check next few lines for "Account Number:" pattern
    for (let j = idx + 1; j < Math.min(idx + 8, lines.length); j++) {
        if (lines[j].includes('Account Number:')) return true;
    }
    return false;
}

function extractEquifaxBlock(lines, startIdx) {
    const creditor = lines[startIdx].trim()
        .replace(/ - Closed$/, '')
        .replace(/ - Open$/, '')
        .trim();

    // Collect block lines (up to 40 lines)
    const blockLines = lines.slice(startIdx, startIdx + 40).join('\n');

    const account = { creditor, bureau: 'Equifax' };

    // Account Number
    const acctMatch = blockLines.match(/Account Number:\s*\*?(\w+)/);
    account.account_number = acctMatch ? acctMatch[1] : null;

    // Loan/Account Type + Status (on same line: "Loan/Account Type: X | Status: Y")
    const typeStatusLine = blockLines.match(/Loan\/Account Type:\s*([^|]+)\|\s*Status:\s*([^\n]*)/);
    if (typeStatusLine) {
        account.account_type = typeStatusLine[1].trim();
        const rawStatus = typeStatusLine[2].trim();
        account.status = (rawStatus === '' || rawStatus.startsWith('Date ') || rawStatus.startsWith('Terms'))
            ? null : rawStatus;
    } else {
        const typeMatch = blockLines.match(/Loan\/Account Type:\s*([^\n|]+)/);
        account.account_type = typeMatch ? typeMatch[1].trim() : null;
        const statusMatch2 = blockLines.match(/\bStatus:\s*([^\n|]+)/);
        account.status = statusMatch2 ? statusMatch2[1].trim() : null;
    }

    // Date Opened
    const openedMatch = blockLines.match(/Date Opened:\s*(\d{2}\/\d{2}\/\d{4})/);
    account.date_opened = parseDate(openedMatch ? openedMatch[1] : null);

    // Balance
    const balanceMatch = blockLines.match(/Balance:\s*\$([0-9,]+)/);
    account.current_balance = parseAmount(balanceMatch ? '$' + balanceMatch[1] : null);

    // Credit Limit
    const limitMatch = blockLines.match(/Credit Limit:\s*\$([0-9,]+)/);
    account.credit_limit = parseAmount(limitMatch ? '$' + limitMatch[1] : null);

    // High Credit
    const highMatch = blockLines.match(/High Credit:\s*\$([0-9,]+)/);
    account.high_balance = parseAmount(highMatch ? '$' + highMatch[1] : null);

    // Amount Past Due
    const pastDueMatch = blockLines.match(/Amount Past Due:\s*\$([0-9,]+)/);
    account.past_due_amount = parseAmount(pastDueMatch ? '$' + pastDueMatch[1] : null) || 0;

    // Charge Off Amount
    const chargeOffMatch = blockLines.match(/Charge Off Amount:\s*\$([0-9,]+)/);
    account.charge_off_amount = parseAmount(chargeOffMatch ? '$' + chargeOffMatch[1] : null);

    // Date of Last Payment
    const lastPayMatch = blockLines.match(/Date of Last Payment:\s*(\d{2}\/\d{2}\/\d{4})/);
    account.last_payment_date = parseDate(lastPayMatch ? lastPayMatch[1] : null);

    // Date Closed
    const closedMatch = blockLines.match(/Date Closed:\s*(\d{2}\/\d{2}\/\d{4})/);
    account.date_closed = parseDate(closedMatch ? closedMatch[1] : null);

    // Date Reported
    const reportedMatch = blockLines.match(/Date Reported:\s*(\d{2}\/\d{2}\/\d{4})/);
    account.last_reported_date = parseDate(reportedMatch ? reportedMatch[1] : null);

    // Normalize + compute
    normalizeAccount(account);
    account.account_age_in_months = calcAgeMonths(account.date_opened);
    account.utilization_rate = calcUtilization(account.current_balance, account.credit_limit);
    account.lane = assignLane(account);

    // Only return if we have minimum required data
    if (!account.creditor || !account.account_type) return null;

    return account;
}

// ============================================
// EXPERIAN PARSER
// ============================================

function parseExperian(text) {
    const accounts = [];
    const lines = text.split('\n');

    // pdf-parse merges label+value on same line for Experian:
    // "Account NameCAPITAL ONE AUTO FINANCE"
    // "Account TypeCredit card"
    // "Balance$243"
    // etc.
    // Anchor: lines starting with "Account Name" followed by creditor

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('Account Name') && line.length > 'Account Name'.length) {
            const creditor = line.replace(/^Account Name/, '').trim();
            if (creditor && creditor.length > 1) {
                const block = extractExperianBlock(lines, i, creditor);
                if (block) accounts.push(block);
                // Skip to next blank line so we don't re-detect inside this block
                let j = i + 1;
                while (j < lines.length && lines[j].trim() !== '') j++;
                i = j;
            }
        }
    }

    return accounts;
}

function extractExperianBlock(lines, startIdx, creditor) {
    if (!creditor || creditor.length < 2) return null;

    // Collect ~120 lines for this block
    const blockArr = lines.slice(startIdx, startIdx + 120);
    const account = { creditor, bureau: 'Experian' };

    // Helper: find line starting with label, extract value after label
    function getVal(label) {
        for (const line of blockArr) {
            const l = line.trim();
            if (l.startsWith(label) && l.length > label.length) {
                return l.slice(label.length).trim();
            }
        }
        return null;
    }

    // Account Number
    const acctNum = getVal('Account Number');
    account.account_number = acctNum ? acctNum.replace(/X+/g, '').replace(/[^0-9]/g, '').slice(-6) || null : null;

    account.account_type = getVal('Account Type');
    account.date_opened = parseDate(getVal('Date Opened'));
    account.last_reported_date = parseDate(getVal('Balance Updated'));

    // Balance
    account.current_balance = parseAmount(getVal('Balance'));
    account.credit_limit = parseAmount(getVal('Credit Limit'));
    account.high_balance = parseAmount(getVal('Highest Balance'));

    // Status - may span 2 lines (line continues on next)
    let statusLine = getVal('Status');
    // Check if next line after Status line is a continuation (not a label)
    for (let i = 0; i < blockArr.length; i++) {
        if (blockArr[i].trim().startsWith('Status') && blockArr[i].trim().length > 'Status'.length) {
            // Check next non-empty line
            for (let j = i + 1; j < Math.min(i + 4, blockArr.length); j++) {
                const next = blockArr[j].trim();
                if (!next) continue;
                // If it doesn't start with a known label, it's a continuation
                const knownLabels = ['Status Updated', 'Balance', 'Recent Payment', 'Monthly Payment',
                                     'Credit Limit', 'Highest Balance', 'Terms', 'On Record Until',
                                     'Payment History', 'Contact Info', 'Comment', 'Additional info'];
                const isContinuation = !knownLabels.some(lbl => next.startsWith(lbl));
                if (isContinuation && !next.startsWith('http') && next.length < 100) {
                    statusLine = (statusLine || '') + ' ' + next;
                }
                break;
            }
            break;
        }
    }
    // Normalize status: "$X written off" → "Charged Off"
    const chargeOffMatch = (statusLine || '').match(/\$([0-9,]+)\s+written off/i);
    account.charge_off_amount = chargeOffMatch ? parseAmount('$' + chargeOffMatch[1]) : null;
    if (chargeOffMatch) {
        statusLine = 'Charged Off';
    }
    account.status = statusLine;

    // Extract past due from status line (Experian embeds this: "$X past due")
    const pastDueMatch = (statusLine || '').match(/\$([0-9,]+)\s+past due/i);
    // Also detect "X days past due" pattern from status
    const daysPastDue = /\d+\s+days?\s+past\s+due/i.test(statusLine || '');
    if (pastDueMatch) {
        account.past_due_amount = parseAmount('$' + pastDueMatch[1]);
    } else if (daysPastDue) {
        // Delinquent but no dollar amount given — flag as Active Damage
        account.past_due_amount = 1;
    } else {
        account.past_due_amount = 0;
    }

    // Recent Payment
    const recentPay = getVal('Recent Payment');
    account.last_payment_date = (recentPay && recentPay !== '-') ? parseDate(recentPay) : null;

    // Normalize + compute
    normalizeAccount(account);
    account.account_age_in_months = calcAgeMonths(account.date_opened);
    account.utilization_rate = calcUtilization(account.current_balance, account.credit_limit);
    account.lane = assignLane(account);

    if (!account.creditor || !account.account_type) return null;
    return account;
}

// ============================================
// TRANSUNION PARSER
// ============================================

function parseTransUnion(text) {
    const accounts = [];
    const lines = text.split('\n');

    // TransUnion format (pdf-parse):
    // "CREDITOR NAME1234567890****" - creditor + masked account number ending in * chars
    // "Account Information"
    // "Date Opened MM/DD/YYYY"
    // "Loan Type AUTOMOBILE"
    // "Balance $18,903"
    // etc.
    // KEY IDENTIFIER: valid creditor lines end with "****" or "**" (masked acct numbers)

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Valid creditor lines end with * characters (masked account numbers)
        if (/\*{2,4}$/.test(line) && line.length > 4 && !line.startsWith('http')) {
            const block = extractTransUnionBlock(lines, i);
            if (block) {
                accounts.push(block);
                // Skip to next blank line instead of a hardcoded offset
                let j = i + 1;
                while (j < lines.length && lines[j].trim() !== '') j++;
                i = j;
            }
        }
    }

    return accounts;
}

function extractTransUnionBlock(lines, startIdx) {
    const creditorRaw = lines[startIdx].trim();

    // Extract creditor name: remove trailing masked account number
    // Examples:
    //   "CAINE & WEINER1652****"                        → "CAINE & WEINER"
    //   "CAPITAL ONE AUTO6201045473322****"              → "CAPITAL ONE AUTO"
    //   "LVNV FUNDING LLC405731042336****"               → "LVNV FUNDING LLC"
    //   "ATLANTIC CAP BKSELFLENDERCBA0000000001093****"  → "ATLANTIC CAP BKSELFLENDER"
    //   "SELF FINANCIAL INC / LEAD BANK16460****"        → "SELF FINANCIAL INC / LEAD BANK"
    // Strategy: strip stars, then strip digits, then check if remaining ends with a known
    // account prefix (CBA, CRD, etc.) by looking for letter→digit boundary
    let creditor = creditorRaw;

    // Remove trailing stars
    creditor = creditor.replace(/\*+$/, '');

    // Remove trailing digits
    creditor = creditor.replace(/\d+$/, '');

    // Now check: does it end with uppercase letters that are part of an account number?
    // Account number prefixes like CBA, CRD are always uppercase and directly follow the creditor name
    // We detect this by checking if the string ends with uppercase letters that were
    // immediately followed by digits (before we stripped them)
    // Simple heuristic: if the raw string (before stars) had digits right after these letters, strip them
    const withoutStars = creditorRaw.replace(/\*+$/, '');
    // Find the position where digits start in the original (after creditor name)
    const digitStart = withoutStars.search(/\d/);
    if (digitStart > 0) {
        // Take everything before the first digit
        let beforeDigits = withoutStars.substring(0, digitStart);
        // But also remove any trailing uppercase-only "prefix" that's part of the account number
        // (e.g. "CBA" in "BKSELFLENDERCBA0000...")
        // These are uppercase letters that appear right before the digits with no space
        // The suffix before digits may be "WORDCBA" or "WORDCRD" where CBA/CRD is account code
        // Split at last space to get the last "word" and check if it ends with an account code
        const lastSpaceIdx = beforeDigits.lastIndexOf(' ');
        if (lastSpaceIdx >= 0) {
            const lastWord = beforeDigits.substring(lastSpaceIdx + 1);
            // Known real last words that should be kept
            const keepLastWords = ['LLC', 'INC', 'BANK', 'AUTO', 'ONE', 'AND', 'THE', 'OF',
                                   'UNION', 'CREDIT', 'FUND', 'MANAGEMENT', 'ASSOCIATES',
                                   'FINANCIAL', 'PREMIER', 'COLLECTION', 'SPRINGVILLE',
                                   'SERVIC', 'WEINER', 'ASSOCIATES', 'COMPANY'];
            if (!keepLastWords.includes(lastWord)) {
                // Check if last word ends with a known account code suffix
                const codeSuffixes = ['CBA', 'CRD', 'VT'];
                for (const code of codeSuffixes) {
                    if (lastWord.endsWith(code) && lastWord.length > code.length) {
                        beforeDigits = beforeDigits.substring(0, lastSpaceIdx + 1) +
                                       lastWord.slice(0, -code.length);
                        break;
                    }
                }
                // If the entire last word is just an account code (no real word part)
                if (codeSuffixes.includes(lastWord)) {
                    beforeDigits = beforeDigits.substring(0, lastSpaceIdx);
                }
            }
        } else {
            // No space - the whole thing might be "WORDCBA" - strip known codes
            const codeSuffixes = ['CBA', 'CRD'];
            for (const code of codeSuffixes) {
                if (beforeDigits.endsWith(code)) {
                    beforeDigits = beforeDigits.slice(0, -code.length);
                    break;
                }
            }
        }
        creditor = beforeDigits.trim();
    }

    // Final cleanup
    creditor = creditor.replace(/[\/\s]+$/, '').trim();

    // If nothing left, fall back
    if (!creditor || creditor.length < 2) {
        const m = creditorRaw.match(/^([A-Za-z][A-Za-z\s&\/\-\.]+)/);
        creditor = m ? m[1].trim() : creditorRaw.substring(0, 30).trim();
    }

    if (!creditor || creditor.length < 2) return null;

    // Extract account number from end of creditor line
    const acctMatch = creditorRaw.match(/([0-9*]{6,})$/);
    const accountNumber = acctMatch ? acctMatch[1].replace(/\*/g, '').slice(-6) : null;

    // Collect block lines
    const blockArr = lines.slice(startIdx, startIdx + 80);
    const account = { creditor, account_number: accountNumber, bureau: 'TransUnion' };

    // TransUnion: "Label Value" on same line (label + space + value)
    function getVal(label) {
        for (const line of blockArr) {
            const l = line.trim();
            if (l.startsWith(label + ' ') || l.startsWith(label + '\t')) {
                return l.slice(label.length).trim();
            }
        }
        return null;
    }

    account.account_type = getVal('Loan Type') || getVal('Account Type');
    account.date_opened = parseDate(getVal('Date Opened'));
    account.current_balance = parseAmount(getVal('Balance'));
    account.high_balance = parseAmount(getVal('High Balance'));
    // Credit limit for revolving accounts; original loan amount for installment loans
    account.credit_limit = parseAmount(getVal('Credit Limit')) ||
                           parseAmount(getVal('Original Amount')) ||
                           parseAmount(getVal('Loan Amount')) || null;
    account.last_payment_date = parseDate(getVal('Last Payment Made'));
    account.last_reported_date = parseDate(getVal('Date Updated'));
    account.date_account_will_be_removed = parseDate(getVal('Estimated Date Removed')) ||
                                           parseDate(getVal('Date Removed'));
    account.date_closed = parseDate(getVal('Date Closed'));
    account.remarks = getVal('Remarks') || getVal('Comment');

    // Pay Status - may have >brackets< for adverse
    const payStatus = getVal('Pay Status');
    account.status = payStatus ? payStatus.replace(/[><]/g, '').trim() : null;

    // Past due: first try to find an explicit "Amount Past Due" field
    const explicitPastDue = parseAmount(getVal('Amount Past Due') || getVal('Past Due Amount') || getVal('Past Due'));
    
    const payStatusLower = (payStatus || '').toLowerCase();
    const statusLower = (account.status || '').toLowerCase();
    
    const isDaysPastDue = /(\d+)\s+days?\s+past\s+due/i.test(payStatus || '');
    const isCollection = statusLower.includes('collection') || payStatusLower.includes('collection');
    const isChargeOff = statusLower.includes('charge off') || statusLower.includes('charged off') ||
                        payStatusLower.includes('charge off') || payStatusLower.includes('charged off');

    if (explicitPastDue !== null && explicitPastDue > 0) {
        // Use the actual past due amount if available
        account.past_due_amount = explicitPastDue;
    } else if (isDaysPastDue && !isCollection && !isChargeOff) {
        // Currently delinquent (X days past due) but NOT a collection/charge-off —
        // flag as Active Damage so the user knows to act now.
        // Collections and charge-offs are handled by assignLane's type/status check
        // and should land in "Removable", not "Active Damage".
        account.past_due_amount = 1;
    } else {
        // Collections and charge-offs: past_due_amount = 0 so assignLane uses the
        // type/status check → "Removable" (dispute/pay-for-delete, not a payment urgency)
        account.past_due_amount = 0;
    }

    // Normalize + compute
    normalizeAccount(account);
    account.account_age_in_months = calcAgeMonths(account.date_opened);
    account.utilization_rate = calcUtilization(account.current_balance, account.credit_limit);
    account.lane = assignLane(account);

    if (!account.creditor) return null;
    return account;
}

// ============================================
// MAIN PARSE FUNCTION
// ============================================

async function parseCreditReportPDF(buffer) {
    const data = await pdfParse(buffer);
    const text = data.text;

    const bureau = detectBureau(text);
    let accounts = [];

    if (bureau === 'equifax') {
        accounts = parseEquifax(text);
    } else if (bureau === 'experian') {
        accounts = parseExperian(text);
    } else if (bureau === 'transunion') {
        accounts = parseTransUnion(text);
    } else {
        throw new Error('Could not detect credit bureau. Please upload an Equifax, Experian, or TransUnion report.');
    }

    // Deduplicate by account_number + creditor
    const seen = new Set();
    const unique = accounts.filter(a => {
        const key = `${a.creditor}-${a.account_number || 'nonum'}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    // Normalize bureau name to proper display case
    const bureauDisplay = bureau === 'equifax' ? 'Equifax' 
                        : bureau === 'experian' ? 'Experian' 
                        : bureau === 'transunion' ? 'TransUnion' 
                        : bureau;

    return {
        bureau: bureauDisplay,
        total_found: unique.length,
        accounts: unique
    };
}

module.exports = { parseCreditReportPDF };