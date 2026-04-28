# Credit Stamina — Letter Feature Evidence Audit

**Pass:** 1 (against design doc dated 2026-04-28)
**Date:** 2026-04-28
**Method:** Read-only static analysis of mobile (`~/Code/credit-stamina-mobile`) + API (`~/Library/Mobile Documents/com~apple~CloudDocs/Documents/GitHub/credit-stamina-api/`). Canonical API file: `railway-deploy/server.js`.
**Status:** Findings updated to reflect April 28 session resolutions.

## Executive summary

15 sub-systems audited (1-11 + A-D). Roughly 5 fully built, 6 partial, 4 not built. Biggest surprises: (1) ESIGN consent IS captured in mobile + Supabase but the API mailing endpoint never gates on it — legally captured, operationally unenforced; (2) the production mailing path uses **LetterStream**, not Click2Mail, while Click2Mail service code exists but is loaded only by dead `routes/index.js` — entire vendor migration is half-staged; (3) **no human review queue exists at all** — letters go straight from Claude → DB → Authorize.net charge → LetterStream → USPS with zero human gate, contradicting the design's P0 review-queue requirement; (4) **no follow-up letter generation route exists on the API**, even though the mobile believes one does and falls back to the regular generate endpoint with escalation flags that the server prompt template ignores; (5) the FCRA 30-day timer is computed from `sent_date` in both repos, not delivery date as design requires.

---

## Resolved Findings (April 28 session)

The following commits resolved findings from this audit during the April 28 working session. They are listed in chronological order. References to each are inline in the relevant sub-system entry below.

| Commit | Repo | Title |
|---|---|---|
| `f03bae2` | mobile | Letter view crash guard for null `currentLetter` |
| `26ecc65` | mobile | Letter content fallback rendering (`letter_content` → `.content` shim) |
| `2725953` | api | Letter mail price raised to $9.99 (api-side: constants + comments + frontend) |
| `a357008` | mobile | Letter mail price raised to $9.99 (mobile UI labels + payment form) |
| `c272084` | mobile | Monitor lane goodwill suggestion fix (`getRecommendation` returns `null` for non-disputable lanes) |
| `957a987` | api | **Bug A**: `status='sent'` set alongside `send_status` when letter is mailed |
| `d0f057f` | mobile | **Bug C**: `'responded'` added to `isSent` allow-list |
| `3fecce5` | api | **Bug B retirement**: dedicated `/letters/:id/outcome` route + web admin UI removed |

Open items from the original audit (ESIGN persistence, profile completeness gate, escalation Potemkin, Click2Mail migration, FCRA delivery-date math, dual `status`/`send_status` consolidation, KBA, letter chain history, etc.) remain unresolved and are flagged below.

---

## Per-sub-system audit (priority order)

### SECTION A — ESIGN Consent Capture (P0 LEGAL)

**CURRENT STATE:** Partial — consent captured client-side, persisted to Supabase, but **no API-side enforcement gate**.

**EVIDENCE:**
- ✅ Mobile hook: `src/hooks/useESignConsent.js:19-70` — full lifecycle (`hasConsented`, `giveConsent`, `withdrawConsent`).
- ✅ Mobile screen: `src/screens/ESignConsentScreen.js:27-33, 102-152` — legal text citing 15 U.S.C. §7001 (ESIGN Act) + UETA, version-tracked (`CONSENT_VERSION = '1.1'`), checkbox + "Continue" button.
- ✅ Mobile gate before signing: `src/screens/LettersScreen.js:444-448` — routes to ESignConsentScreen if `!hasConsented`; sign button disabled while loading.
- ✅ Persistence: `src/services/api.js:1232-1290` — `legalAPI.recordESignConsent` writes to Supabase `esign_consents` table directly. Schema comment at lines 1206-1213 lists `user_id`, `version`, `consented_at`, `id`. **IP and exact agreement text not visible in the schema as commented** — direct DB inspection needed.
- ❌ No API endpoint: zero matches in `railway-deploy/` for `esign|ESIGN|consent_log|agreement_version|electronic_signature` route handlers. No `/api/esign-consent`, no consents table referenced server-side.
- ❌ No mailing-time enforcement: `railway-deploy/server.js:4267-4517` (`POST /api/letters/:id/mail`) never queries `esign_consents`. A request bypassing the mobile UI can mail without consent.

**GAP ANALYSIS:**
- Versus design: design requires "Recorded: timestamp, IP address, user identification, agreement version text" + gate "Before any letter is signed and mailed on their behalf." Mobile records timestamp + user_id + version. **IP and agreement_text persistence: unverified, probably not stored.** Mailing gate: missing on API.
- Required: (1) verify Supabase schema captures IP + agreement-text snapshot; (2) add API-side check in `/api/letters/:id/mail` that queries `esign_consents` for an active row before charging.

**CONFIDENCE:** **High** that consent capture works; **High** that API-side gate is absent.

---

### SECTION 3 — AI Letter Generation (Profile Data Population, P0 BUG)

**CURRENT STATE:** Partial — generation works; profile data flow is unsafe and produces placeholder strings when user hasn't completed `EditProfileScreen`.

**EVIDENCE:**
- Mobile populates from `user.user_metadata` only: `LettersScreen.js:1057-1064`. No completeness gate before sending.
- API prompt template uses ONLY req.body fields, no DB fallback: `railway-deploy/server.js:1702-1768`. Prompt instructs Claude *"Include the sender's full contact info at the top of the letter."* If `user_name` or `user_address` is empty, Claude inserts `[Your Full Name]` / `[Your Address]` placeholders.
- ❌ No completeness check anywhere. ❌ No DB fallback in API.

**GAP ANALYSIS:** Two viable fixes (mobile-side guard routing user to EditProfileScreen, OR API-side `profiles` table fallback). Option (b) is more robust because it survives mobile-bypass clients.

**CONFIDENCE:** **High** — root cause is unambiguous; bug confirmed in emulator on 2026-04-28.

---

### SECTION 6 — Click2Mail Integration (CURRENTLY DEAD)

**CURRENT STATE:** Not built (in production). Service code exists; production never invokes it.

**EVIDENCE:**
- ✅ Service file exists: `railway-deploy/services/click2mail.service.js`. Full API surface (init, sendCertifiedLetter, createDocument, createAddressList, createJob, submitJob, getJobStatus). Returns simulated `trackingNumber: SIM-${Date.now()}` if credentials missing.
- ✅ Service init: `railway-deploy/routes/index.js:14-21` calls `click2mailService.init({...})`.
- ❌ But `routes/index.js` is **only loaded by `server-modular.js`**, not by `railway-deploy/server.js`. Production entry per `railway.json`'s `startCommand` is `node server.js`. → Click2Mail init never runs in production.
- ❌ Live mailing path: `railway-deploy/server.js:4454` calls LetterStream directly: `fetch('https://api.letterstream.com/v1/letters', ...)`.
- ❌ Mobile UI tip mentions Click2Mail (`DisputeTrackerScreen.js:240`) but actual mail submission is LetterStream — user-facing copy is wrong.
- ❌ No webhook receiver for either provider.

**GAP ANALYSIS:** Required: (1) port the actual mailing call from LetterStream → `click2MailService.sendCertifiedLetter(...)`; (2) confirm Click2Mail credentials are loaded outside the dead `routes/index.js`; (3) build the webhook receiver; (4) call Click2Mail's address validation API before charging; (5) update mobile UI labels; (6) update `LETTER_MAIL_PRICE` constant alongside the migration.

**CONFIDENCE:** **High** — the migration is genuinely half-staged.

---

### SECTION 7 — Human Review Queue (Pre-Mailing)

**CURRENT STATE:** **Not built.** Letters go straight from creation → payment → mailing with zero human gate.

**EVIDENCE:**
- ❌ No review-queue infrastructure on API: zero matches for `review_queue|pending_review|admin_review|reviewed_by|review_status`.
- ❌ No admin review endpoint: `railway-deploy/routes/admin.routes.js` has no letter approve/reject handlers.
- ❌ No "In Review" status string in mobile enums: `LettersScreen.js:63-69`, `DisputeTrackerScreen.js:29-37`.
- ❌ Status assigned at creation: `railway-deploy/server.js:1780` saves `status: 'Draft'`. Mailing flow at `server.js:4267+` transitions directly `Draft → sent` (via `send_status` field) with no intermediate review state.
- ❌ Authorize.net charge happens BEFORE any review possibility: `server.js:4335-4406` charges first, then attempts mailing.

**GAP ANALYSIS:** Required to satisfy design v1: review_status column, mailing-flow gate, admin endpoints + UI, rejection → auto-refund, mobile UI states, daily admin reminder. Significant work — design correctly flags this as P0.

**CONFIDENCE:** **High.**

---

### SECTION B — KBA / Identity Verification

**CURRENT STATE:** **Not built.** Authentication is email + password only.

**EVIDENCE:**
- ❌ Zero matches for `KBA|verify identity|last 4 SSN|last4|Precise ID|LexisNexis` in either repo. Registration captures email + password only.
- Generic "By signing, you confirm your identity..." text at `SignatureScreen.js:349` — affirmation only, no verification.
- Profile fields (`address_street`, etc.) collected in `EditProfileScreen.js` but never matched against credit report data.

**GAP ANALYSIS:** Design's v1 minimal recommendation (match name + DOB + last-4 SSN against credit report) requires DOB and SSN to be collected — currently neither is.

**CONFIDENCE:** **High.**

---

### SECTION C — FCRA Compliance / 30-Day Clock

**CURRENT STATE:** Partial — 30-day clock exists, but timed from **send date** instead of **delivery date** as design requires.

**EVIDENCE:**
- Mobile timer (uses sent_date): `DisputeTrackerScreen.js:45-56` — `letter.sent_at || letter.mailed_at` as base. NOT delivery date.
- API deadline (set at mail time, also send-based): `railway-deploy/server.js:4483` — `deadline_date = sent_date + 30 days`.
- FCRA citations in prompts: `railway-deploy/server.js:1757`, `LettersScreen.js:896`, `api.js:432`.
- ❌ No auto-violation flag: zero matches for `fcra_violation|no_response_violation|30_day_violation`.
- Frivolous-dispute protection: `server.js:1728` enforces "4 per bureau per month" — adjacent compliance feature, in place.

**GAP ANALYSIS:** Date source must change to delivery (requires Click2Mail/LetterStream webhook capture). Both mobile (`DisputeTrackerScreen.js:46`) and API (`server.js:4483`) need date-math updates. Auto-escalation at day 31 missing.

**CONFIDENCE:** **High.**

---

### SECTION D — CROA Compliance / Disclosures

**CURRENT STATE:** Mostly built (mobile-side disclosures present). API has no CROA infrastructure.

**EVIDENCE:**
- ✅ Mobile registration disclosure: `RegisterScreen.js:452-478` — full text citing 15 U.S.C. §1679, 3-day cancellation right, "cannot guarantee any specific result," "will not charge any fee until services have been fully performed."
- ✅ AI disclaimer: `AIDisclaimer.js:4-5` — non-guarantee + "not a substitute for professional legal or financial advice." Used at `LettersScreen.js:670`.
- ❌ No 3-day cancellation enforcement on API.
- ❌ "No payment for services not yet performed" partly violated by subscription-up-front architecture.
- ❌ No CROA-specific quality gate on AI output (LLM-as-judge gate is design v2).

**GAP ANALYSIS:** Disclosures present; legal sufficiency requires counsel. 3-day cancellation enforcement missing. Subscription model interpretation needs lawyer review.

**CONFIDENCE:** **Medium-High** — disclosure presence verifiable; legal sufficiency requires counsel.

---

### SECTION 1 — Account Selection / Dispute Initiation

**CURRENT STATE:** Partial — accounts tap into a detail modal that has actions, but no "Dispute this account?" gating dialog by lane.

**EVIDENCE:**
- Account tap handler: `AccountsScreen.js:452-455` opens `AccountDetailModal`.
- "Take Action" button: `AccountsScreen.js:331` navigates to ActionsScreen, NOT directly to letter generation.
- Lane suggestion logic at `LettersScreen.js:128-176` runs only inside GenerateModal context, not at account-tap time.
- No special-case for Monitor lane in original audit. **Resolved on 2026-04-28 via commit `c272084`** — `getRecommendation` now returns `null` for `Aging/Monitor` and unclassified accounts. Defense-in-depth fix; the broader P1 lane-gate at the account-tap site remains future work.

**GAP ANALYSIS:** Required: lane-gated dispute prompt at account-tap site; gate goodwill out of Monitor lane (partially addressed).

**CONFIDENCE:** **High** on the structural gap.

---

### SECTION 2 — AI Letter Type Suggestion

**CURRENT STATE:** Built (mobile-side). API doesn't suggest — it accepts.

**EVIDENCE:**
- Mobile suggestion engine: `LettersScreen.js:128-176`. Lane-driven; user can override.
- API accepts but doesn't validate: `railway-deploy/server.js:1702`.

**GAP ANALYSIS:** Could be hardened by API-side validation. Enhancement, not a bug.

**CONFIDENCE:** **High.**

---

### SECTION 4 — Recipient Address Resolution

**CURRENT STATE:** Partial — bureau addresses hardcoded; no address validation; manual entry fallback exists.

**EVIDENCE:**
- Hardcoded bureau pre-fill: `LettersScreen.js:408-426`.
- Manual entry form: `LettersScreen.js:717-740`.
- ❌ No Click2Mail address validation anywhere.
- API mailing route trusts mobile fields: `server.js:4280-4288`.

**GAP ANALYSIS:** Wire Click2Mail address-verify call before Authorize.net charge; handle failure → refund.

**CONFIDENCE:** **High** on validation absence.

---

### SECTION 5 — Pricing & Payment

**CURRENT STATE:** ✅ **RESOLVED on 2026-04-28** via commits `2725953` (api) + `a357008` (mobile). Single $9.99 price across API constants, mobile UI labels, web admin frontend. Constants block byte-identical between root and railway-deploy server.js.

**HISTORICAL FINDING (now resolved):** Original audit found wrong price ($2.99) hardcoded in five mobile sites and four API sites; not API-authoritative.

**REMAINING ITEM (P3, deferred):** API-authoritative pricing — mobile reads from API instead of hardcoded constant. Pre-public-launch cleanup.

**CONFIDENCE:** **High** — price audit covered exhaustively.

---

### SECTION 8 — Tracking & Status Updates

**CURRENT STATE:** Partial — tracking number captured + USPS link works; status state machine incomplete; no webhooks for live updates.

**EVIDENCE:**
- Tracking persisted on mail success: `railway-deploy/server.js:4479-4485`. **As of 2026-04-28 (commit `957a987`), this update also sets `status: 'sent'`** (previously `send_status` only — see Bug A).
- Mobile UI: `LettersScreen.js:764-772` renders tracking card + USPS URL.
- Status enums: mobile has 5-7 known states; API uses both `status` and `send_status` fields inconsistently (`server.js:1780, 4481`).
- ❌ No webhook receiver: zero matches for `letterstream.*webhook|click2mail.*webhook|/api/webhooks/(letterstream|click2mail)`.

**GAP ANALYSIS:** Reconcile `status` vs `send_status` (architectural decision, deferred); add webhook receiver (overlaps with §6); implement state transitions; mobile UI for full state machine.

**CONFIDENCE:** **High.**

---

### SECTION 9 — Bureau / Creditor Response Logging

**CURRENT STATE:** **Two parallel outcome-logging paths exist in production**, with different vocabularies, different storage tables, and no reconciliation.

**Original audit covered only the LettersScreen.DetailModal flow.** During the April 28 session, the iOS screenshot review surfaced the AccountDetailModal flow that the audit had missed. Both paths are live; both are in scope going forward.

**Path 1 — `LettersScreen.DetailModal` (audit covered):**
- File: `src/screens/LettersScreen.js:790-832`.
- Scope: **letter-level** outcome.
- Outcome vocabulary: `accepted | declined | no_response` (3 options).
- API target: `lettersAPI.updateStatus(currentLetter.id, ...)` at `LettersScreen.js:536` → `PUT /api/letters/:id` (the **generic** update route at `railway-deploy/server.js:1673`).
- DB target: `dispute_letters` row.
- Fields written: `outcome`, `denial_reason`, `response_date`, `status`, `send_status` — all real DB columns.

**Path 2 — `AccountDetailModal` (audit missed):**
- File: `src/screens/AccountsScreen.js:271-292` (the "LOG DISPUTE OUTCOME" section).
- Scope: **account-level** outcome.
- Outcome vocabulary: `removed | partial | denied | pending` (4 options) — visible labels: ✅ Removed / Fixed, ⚠️ Partial Win, ❌ Denied, ⏳ Still Pending.
- API target: `actionsAPI.create({...})` at `AccountsScreen.js:180-186`.
- DB target: `action_queue` row (NOT `dispute_letters`).
- Fields written: `title`, `lane`, `priority: 'low'|'high'`, `status: 'complete'`, `notes`.

**Architectural observation:** The two paths do not reconcile. Logging an outcome on a letter does not update the account's outcome state, and vice versa. Aggregate reporting across both paths is impossible without a unifying schema. **P2 architectural concern — see Triple-Vocabulary section below.**

---

### SECTION 10 — AI Follow-Up Letter Generation (P0 Bug — Potemkin Feature)

**CURRENT STATE:** Partial / largely fake. Mobile UI works end-to-end but the server silently treats escalations as normal letters.

**EVIDENCE:**
- ✅ Mobile escalation handler: `LettersScreen.js:565-598` (`handleGenerateEscalation`).
- Mobile endpoint adapter: `src/services/api.js:418-434` — first tries `POST /api/letters/escalate`, falls back on 404/405 to `POST /api/letters/generate` with `is_escalation: true`, `escalation_round`, `escalation_reason`.
- ❌ API: **no route handler for `/api/letters/escalate` exists.** The fallback `/api/letters/generate` route at `:1694` does **not** read `is_escalation`, `escalation_round`, or `escalation_reason` — those fields are silently ignored. Resulting letter is generated with the original prompt template.
- ✅ Mobile UI gate works: `LettersScreen.js:887-914`.

**GAP ANALYSIS:** Letters going out as "follow-ups" today are textually identical to first-pass letters. **Real users sending escalations expecting FCRA §611(a)(7) Method of Verification language got plain dispute letters.** Required: add `/api/letters/escalate` route OR teach `/api/letters/generate` to honor escalation params; provide escalation-specific prompt templates.

**CONFIDENCE:** **High** — confirmed end-to-end.

---

### SECTION 11 — Letter Chain / History

**CURRENT STATE:** Not built — no archival/closure model.

**EVIDENCE:**
- ❌ No archive UI; no `closed`/`archived` status; status values used are `Draft`, `sent`, `responded`, `resolved`.
- Letters list filters by `letter_type`, never by lifecycle status.

**GAP ANALYSIS:** Define "closed" semantics; add `closed_at` column and/or `parent_letter_id` FK; build History tab/filter; preserve full chain timeline.

**CONFIDENCE:** **High** on absence; needs decision on what "closed" means.

---

## Bug catalog

| # | Severity | Title | Status |
|---|---|---|---|
| 1 | **High** | Web admin's `/api/letters/:id/outcome` route writes to non-existent `outcome_notes` and `outcome_date` columns. **Original audit misdiagnosed this as a mobile/API contract bug.** Mobile path was always correct: it sends valid fields (`outcome`, `denial_reason`, `response_date`, `status`, `send_status`) to `PUT /api/letters/:id` (generic route). The dedicated `/outcome` route's only consumer was the PWA web admin's `saveLetterOutcome` flow, which the user confirmed was never used in production. | ✅ **RESOLVED** — full retirement via commit `3fecce5` (route handler + web admin UI + state vars + scratch file deleted). |
| 2 | **High** | Escalation letters are NOT actually escalated — API ignores `is_escalation` flags. Mobile believes follow-up generates an escalated letter; server returns a plain dispute letter. | ❌ **OPEN** (Section 10). |
| 3 | **High** | FCRA timer uses `sent_date`, must use delivery date per design. | ❌ **OPEN** (Section C). |
| 4 | **Medium** | No API-side gate on ESIGN consent at mail time. Client-side bypass possible. | ❌ **OPEN** (Section A). |
| 5 | **Medium** | Two parallel status fields (`status` and `send_status`) tracked independently. Inconsistent across queries. | ❌ **OPEN** (Section 8). |
| 6 | **Medium** | Goodwill letter suggested for Monitor-lane accounts; design says Monitor should not enter dispute flow. | ✅ **RESOLVED** — commit `c272084` (`getRecommendation` returns null for non-disputable lanes). Broader P1 entry-point lane-gate remains open. |
| 7 | **Low** | Mobile UI tip text names "Click2Mail" but production mails via LetterStream. | ❌ **OPEN** (`DisputeTrackerScreen.js:240`). |
| 8 | **Low** | `letter_send_endpoint_new.js` is dead code with inconsistent pricing. | ❌ **OPEN** (out of scope for pricing commit). |
| 9 | **Low** | Onboarding doesn't require profile completion → underlies §3 P0 placeholder bug. | ❌ **OPEN** (Section 3). |

### Bug A: Mailing endpoint never sets `status='sent'`

**Severity:** High (rendered outcome UI unreachable in production for most users).

**Description:** API mailing endpoints set `send_status='sent'` but never set `status='sent'`, leaving the row's `status` field stuck at `'Draft'` after a real mailing.

**Sites:**
- `server.js:4163` (root, `POST /api/letters/send-certified`)
- `railway-deploy/server.js:4187` (`POST /api/letters/send-certified`, drift-twin of above)
- `railway-deploy/server.js:4480` (`POST /api/letters/:id/mail`)

**Impact:** Mobile's outcome-tracking UI gates visibility on `status` (`LettersScreen.js:429` `isSent` allow-list `['sent','mailed','delivered']`), not `send_status`. After a real mailing, the API row had `status='Draft'` and `send_status='sent'`. Mobile's optimistic local update at `LettersScreen.js:474` set `status='sent'` in component state, masking the bug within a single mailing session. But after closing and reopening the DetailModal (which triggers `fetchLetters` and replaces local state with API truth), `status` reverted to `'Draft'`, `isSent` became false, and the response-tracking section disappeared. **Most real users could not log letter-level outcomes** unless they happened to do so within the same session as the mailing.

**Discovery:** Pre-implementation investigation of original audit Bug #1.

**Resolution:** Commit `957a987` — added `status: 'sent'` to all three mailing-endpoint update payloads. Drift-twin pair (root `:4163` and railway-deploy `:4187`) kept byte-identical for the `send-certified` update block.

### Bug C: `'responded'` missing from mobile `isSent` allow-list

**Severity:** High (made saved-outcome chip and escalation card immediately invisible after user action).

**Description:** `handleUpdateResponse` in `LettersScreen.js:521-532` sets `status: 'responded'` on outcome save (for every outcome path — both ternary branches resolve to `'responded'`). The `isSent` gate at `LettersScreen.js:429` only matched `['sent','mailed','delivered']`. So as soon as a user saved an outcome, `isSent` became false and all `isSent`-gated UI sections (saved-outcome chip at line 783, escalation card at line 883) immediately disappeared.

**Impact:** Users wanting to generate a follow-up letter via the escalation card lost access to it the moment they finished logging the outcome that triggered the need for follow-up. Saved-outcome chip also vanished, leaving the user with no visual confirmation that their save persisted (until next refresh).

**Discovery:** Second-order finding from Bug A investigation. Once Bug A made the outcome UI reachable post-mailing, the next-step UX (logging an outcome → seeing chip → tapping escalation) was found broken at the chip-display step.

**Resolution:** Commit `d0f057f` — added `'responded'` to the `isSent` allow-list in `LettersScreen.js:429`. One-line fix. Pairs with `957a987` to make the outcome-tracking flow reachable end-to-end in production for the first time.

---

## Triple-Vocabulary Issue (P2 architectural)

Three independent outcome vocabularies coexist in the codebase, with no overlap of keys. Aggregate reporting and unified outcome semantics are impossible until consolidated.

| Surface | File:line | Vocabulary keys | DB target |
|---|---|---|---|
| Mobile letter UI (`LettersScreen.DetailModal`) | `src/screens/LettersScreen.js:797-799` | `accepted` \| `declined` \| `no_response` | `dispute_letters.outcome` (via generic `PUT /api/letters/:id`) |
| Mobile account UI (`AccountDetailModal`) | `src/screens/AccountsScreen.js:115-120` | `removed` \| `partial` \| `denied` \| `pending` | `action_queue` row (via `actionsAPI.create`) |
| PWA web admin (retired) | (deleted in commit `3fecce5`) | `success` \| `partial` \| `failed` \| `pending` | (was) `dispute_letters.outcome` (via dedicated `/outcome` route, broken because of non-existent columns) |

The PWA admin vocabulary is now retired. Two live vocabularies remain and don't reconcile.

**Status:** P2 architectural concern. Defer until other open work lands. Pick one vocabulary (or define a canonical translation) and migrate.

---

## Cross-cutting summary

- **Sub-systems fully built (5):** §2 AI letter type suggestion, §9 response logging *(but two-path with no reconciliation)*, §A ESIGN capture *(client-side; API gate missing)*, §C FCRA citations, §D CROA disclosures.
- **Sub-systems partial (6):** §1 account selection, §3 profile-data population (P0 bug), §4 recipient address, §5 pricing *(resolved)*, §8 tracking & status *(Bug A resolved; webhooks + state machine still pending)*, §10 AI follow-up letter generation *(Potemkin)*.
- **Sub-systems not built (4):** §6 Click2Mail integration, §7 human review queue, §11 letter chain/history, §B KBA.

### Top 3 surprises (from original audit)

1. **§10 escalation is a Potemkin feature** — mobile UI works end-to-end, API silently ignores escalation flags, letters going out are identical to first-pass disputes.
2. **§A ESIGN consent bypasses the API** — direct Supabase write, no server-side gate at mailing time.
3. **Two mailing providers half-staged** — LetterStream live, Click2Mail dead-code-but-named-in-mobile-UI.

### Recommended next investigations (now mostly executed)

The original audit recommended verifying (a) the Supabase `esign_consents` schema, and (b) reproducing Bug #1 against a real DB row. Both were performed during the April 28 session:
- (a) **Result:** Bug A discovered (mailing never sets `status`); Bug C discovered (mobile gate excludes `'responded'`); the "Bug #1 outcome field-name mismatch" framing was found to be misdirected — see Bug #1 entry above for the corrected story.
- (b) **Result:** Verified field-name issue is real but in the web-admin/API path, not mobile/API. Mobile/API path was always correct.

---

*End of evidence audit. Pass 1, with April 28 session resolutions integrated. Future updates should append a new "Resolved Findings (next session date)" section rather than rewrite history.*
