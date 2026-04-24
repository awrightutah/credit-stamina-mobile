const KNOWN_ERRORS = [
  { match: /invalid login credentials/i,          msg: 'Incorrect email or password. Please try again.' },
  { match: /email not confirmed/i,                msg: 'Please verify your email before signing in. Check your inbox for a confirmation link.' },
  { match: /user already registered/i,            msg: 'An account already exists with this email. Try signing in instead.' },
  { match: /email already (in use|taken)/i,       msg: 'An account already exists with this email. Try signing in instead.' },
  { match: /password.*at least/i,                 msg: 'Password must be at least 8 characters.' },
  { match: /refresh.?token/i,                     msg: 'Your session expired. Please sign in again.' },
  { match: /token (is|has) expired/i,             msg: 'Your session expired. Please sign in again.' },
  { match: /jwt expired/i,                        msg: 'Your session expired. Please sign in again.' },
  { match: /too many requests/i,                  msg: 'Too many attempts. Please wait a moment and try again.' },
  { match: /rate limit/i,                         msg: 'Too many attempts. Please wait a moment and try again.' },
  { match: /network (request failed|error)/i,     msg: 'Network error. Please check your connection and try again.' },
  { match: /failed to fetch/i,                    msg: 'Network error. Please check your connection and try again.' },
  { match: /signup.*disabled/i,                   msg: 'Account registration is temporarily disabled. Please try again later.' },
  { match: /weak password/i,                      msg: 'Password is too weak. Use at least 8 characters with a mix of letters and numbers.' },
  { match: /invalid email/i,                      msg: 'Please enter a valid email address.' },
  { match: /user not found/i,                     msg: 'No account found with this email.' },
  { match: /account.*not.*found/i,                msg: 'No account found with this email.' },
];

export const friendlyAuthError = (error) => {
  const raw = error?.message ?? String(error ?? '');

  for (const { match, msg } of KNOWN_ERRORS) {
    if (match.test(raw)) return msg;
  }

  // Strip internal "AuthApiError: " prefix
  const stripped = raw.replace(/^AuthApiError:\s*/i, '').trim();

  // Refuse to surface any string that leaks infrastructure, database, or
  // stack-trace details — fall back to a generic message instead.
  const leaksInfra = /supabase|railway|anthropic|postgres|pgrst|jwt|rls|relation\s+(does\s+not\s+exist|.*rls)|column\s+.*\s+does\s+not\s+exist/i.test(stripped);
  const looksTechnical = /[\[\{]|0x[0-9a-f]{4,}|at [A-Z]/i.test(stripped);
  if (!stripped || leaksInfra || looksTechnical) {
    return 'Something went wrong. Please try again.';
  }

  // Capitalise first letter and ensure it ends with a period
  const clean = stripped.charAt(0).toUpperCase() + stripped.slice(1);
  return clean.endsWith('.') || clean.endsWith('!') ? clean : clean + '.';
};
