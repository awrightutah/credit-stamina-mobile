# Credit Stamina — Budget Feature Evidence Audit

**Pass:** 1
**Date:** 2026-04-28
**Method:** Read-only static analysis of mobile (`~/Code/credit-stamina-mobile`) + API (`~/Library/Mobile Documents/com~apple~CloudDocs/Documents/GitHub/credit-stamina-api/`). Canonical API file: `railway-deploy/server.js`. Schema inferred from migration files in `database/` and `railway-deploy/migrations/`; live deployed schema not yet verified (see Open Questions).
**Status:** Findings only. Not fixed in this session. Multi-day fix planned for next session pending paradigm decision.

## Executive summary

The mobile `BudgetScreen` and the API `/api/budget` endpoints were designed for **two different paradigms** and do not share a contract. Mobile presents a simple "income / expenses / savings" form; the API expects a category-by-category breakdown (rent, utilities, food, transportation, insurance, entertainment, dining out, etc.). The mismatch is not a single typo — it spans 4 of 5 mobile-side budget fields, every field name in the payment-plan creation flow, and one API route that doesn't exist (PUT for plan updates).

**Top three surprises:**
1. **The paradigm split.** Mobile sends `monthly_expenses` + `savings_goal` + `strategy` to `POST /api/budget`. The API destructures none of these and instead expects 11 expense category fields. Mobile reads `budget.monthly_expenses` and `budget.savings_goal` back from the response — neither column exists in the `budgets` table per migrations. The savings goal field in the mobile UI can never be set or retrieved by any user.
2. **Every field name in plan creation is mismatched.** Mobile sends `{name, strategy, target_amount, monthly_payment}`. API destructures `{plan_name, strategy_type, monthly_payment_amount, total_debt_amount, budget_id}`. Zero overlap. Plans are created with all-null metadata. Depending on which deployed migration is authoritative, the insert may also be NOT NULL-violating on `strategy_type`.
3. **Mobile calls a `PUT /api/debt-payment-plans/:id` endpoint that doesn't exist.** Plan edits silently fail with "Failed to update plan." User-visible bug.

Five bugs catalogued (Bud-1 through Bud-5). Three High severity, two Medium-High to Medium. Plus six architectural concerns around the paradigm split, schema duplication, RLS workaround patterns, and the bills/PWA bypass paths.

---

## Surface area inventory

### Mobile (`/Users/andrewwright/Code/credit-stamina-mobile`)

| File | Lines | Role |
|---|---|---|
| `src/screens/BudgetScreen.js` | 881 | Single screen — budget form, bills CRUD, payment plans, AI advice |
| `src/navigation/AppNavigator.js:31, 169` | — | Routes `'Budget'` → `BudgetScreen` (modal stack) |
| `src/services/api.js:966-995` | 30 | `budgetAPI` — calls `/api/budget` + `/api/debt-payment-plans` |
| `src/services/api.js:906-965` | 60 | `billsAPI` — talks **directly to Supabase**, bypasses API entirely |

### API (`railway-deploy/server.js` canonical, byte-mirrored in root `server.js`)

| Route | Line (railway / root) | DB target | Notes |
|---|---|---|---|
| `POST /api/budget` (upsert) | 5272 / 4950 | `budgets` | Destructures 13 fields; mobile sends 4 |
| `GET /api/budget` | 5366 / 5042 | `budgets` | Returns row as-is |
| `POST /api/debt-payment-plans` | 5387 / 5063 | `debt_payment_plans` | Hardcodes `estimated_payoff_months: 12` |
| `GET /api/debt-payment-plans` | 5418 / 5094 | `debt_payment_plans` | Order by created_at desc |
| `POST /api/debt-payments` | 5439 / 5115 | `debt_payments` | No mobile caller |
| `GET /api/debt-payments` | 5470 / 5146 | `debt_payments` | No mobile caller |

**No PUT/DELETE handlers** for any budget route. **No `/api/bills` routes** at all.

### Modular routes (DEAD — same pattern as today's letter cleanup)

| File | Reason dead |
|---|---|
| `railway-deploy/routes/budget.routes.js` | Loaded only by `server-modular.js`, not the production entry. Has GET `/`, POST `/`, GET `/debug-accounts`. Includes a `getServiceClient()` helper that bypasses RLS for budget writes. |
| `railway-deploy/routes/bills.routes.js` | Same — dead. Has `/save-contact`, `/send-test-reminder`, GET/POST/PUT/DELETE for bills. |

### PWA (`frontend/`)

`frontend/index.html:511, 925-1110+` — `screen-budget-planner` UI fragment, screen-sized. References elements `#budget-income`, `#budget-snapshot`, `#budget-summary-grid`, `#budget-summary-item.income`, `#budget-summary-item.expenses`. Designed for the **API's category-by-category schema** (rent, utilities, food, transportation, insurance, etc.). The PWA mounts as static assets (per earlier session inventory), no longer the root URL. Whether the PWA budget flow still works in production is not traced — out of scope for this audit.

### DB schema (per migration files in repo — verify against deployed state)

| Table | Source migration(s) | Notes |
|---|---|---|
| `budgets` | `database/budget_planner_migration.sql` | 13 input columns: `monthly_income`, `income_frequency`, plus 11 category fields. 4 GENERATED columns: `total_essential_expenses`, `total_discretionary_expenses`, `total_expenses`, `available_for_debt`. **No `monthly_expenses` column. No `savings_goal` column. No `strategy` column.** |
| `debt_payment_plans` | `database/budget_planner_migration.sql` AND `railway-deploy/migrations/debt_payment_plans_table.sql` | **Two migrations, slightly different definitions.** NOT NULL constraints differ between the two. Whichever ran last wins. |
| `debt_payment_allocations` | `database/budget_planner_migration.sql` | Per-account allocation: priority_order, payoff_order, strategy_reason, credit_score_impact. |
| `debt_allocations` | `railway-deploy/migrations/debt_allocations_table.sql` | **Different table, overlapping purpose.** Simpler shape: payment_plan_id, account_id, account_name, monthly_payment, payoff_date, payoff_order. |
| `debt_payments` | (referenced by API at line 5439-5488; migration not located in repo) | Tracks actual payments made. May not have a committed migration file. |
| `bills` | `railway-deploy/supabase_bills_migration.sql:7` | RLS enabled, mobile writes directly via Supabase client. |

---

## Per-bug detailed findings

### Bug Bud-1: Mobile POST /api/budget payload shape doesn't match API expectations

**Severity:** High.

**Description:** Mobile `handleSaveBudget` sends a 4-field payload; API destructures 13 different fields with only `monthly_income` overlapping.

**Sites:**
- Mobile: `src/screens/BudgetScreen.js:154-159` — sends `{ monthly_income, monthly_expenses, savings_goal, strategy }`
- API: `railway-deploy/server.js:5283-5297` (and `server.js:4961-4975` mirror) — destructures `{ monthly_income, income_frequency, rent_mortgage, utilities, food_groceries, transportation, insurance, other_essentials, entertainment, dining_out, shopping, subscriptions, other_discretionary }`

**Impact:** Three of four mobile fields silently dropped. Only `monthly_income` is persisted. The user fills in monthly income, monthly expenses, savings goal, and selects a strategy — three of those four entries vanish on save. No error surfaced; the API returns the saved row (with all category fields at their default 0), and the mobile UI shows it as "saved."

**Recommendation:** Decision required first — see Open Questions on paradigm. Possible fixes: (a) reshape mobile to send categories, (b) reshape API + schema to accept `monthly_expenses` + `savings_goal` + `strategy` directly, (c) add columns to `budgets` table for the simpler totals while keeping the categories optional.

---

### Bug Bud-2: Mobile reads budget.monthly_expenses and budget.savings_goal from columns that don't exist

**Severity:** High.

**Description:** Mobile renders `monthlyExpenses` and `savingsGoal` derived directly from properties of the API's GET /api/budget response. Neither property exists in the `budgets` table per migration files.

**Sites:**
- Mobile: `src/screens/BudgetScreen.js:114, 116`:
  ```js
  const monthlyExpenses = Math.max(budget?.monthly_expenses || 0, totalBills);
  const savingsGoal = budget?.savings_goal || 0;
  ```
- DB: `database/budget_planner_migration.sql` — `budgets` table has no `monthly_expenses` or `savings_goal` columns. Has `total_expenses` (GENERATED column from category fields).

**Impact:** `monthlyExpenses` always falls back to `totalBills` (sum of bills entered separately). `savingsGoal` is permanently 0 for every user — the field is rendered in the UI (as the savings goal display) but cannot be set or retrieved by anyone. The savings goal feature is functionally broken end-to-end.

**Recommendation:** Tied to paradigm decision (Bud-1). If keeping mobile's "totals" paradigm, add `monthly_expenses` and `savings_goal` columns to `budgets`. If keeping API's "categories" paradigm, change mobile to render `total_expenses` (generated) and remove the savings goal feature or re-home it.

---

### Bug Bud-3: Mobile selectedStrategy is sent but never persists

**Severity:** Medium.

**Description:** Mobile's strategy picker (snowball/avalanche/hybrid/lowest_payment) sends a `strategy` field on budget save. The API ignores it. The `budgets` table has no strategy column. Strategy is not persisted as part of the budget at all.

**Sites:**
- Mobile: `src/screens/BudgetScreen.js:158` — `strategy: selectedStrategy` in `data` payload
- API: `server.js:5283-5297` — `strategy` not destructured
- DB: `budgets` table — no strategy column

**Impact:** User selects a strategy on the budget form, hits save → choice lost. May be intentional design (strategy is supposed to live on `debt_payment_plans.strategy_type`, set when user creates a plan) but the form UI suggests it's saved with the budget. UX mismatch with implementation.

**Recommendation:** Either (a) remove the strategy picker from the budget form (move it exclusively to the plan-creation modal), or (b) add `strategy` to the `budgets` schema and accept it server-side.

---

### Bug Bud-4: POST /api/debt-payment-plans — every field name mismatched

**Severity:** High.

**Description:** Mobile sends a 4-field payload for plan creation. None of those field names match what the API destructures.

**Sites:**
- Mobile: `src/screens/BudgetScreen.js:246-251`:
  ```js
  { name, strategy, target_amount, monthly_payment }
  ```
- API: `railway-deploy/server.js:5393`:
  ```js
  { plan_name, strategy_type, budget_id, monthly_payment_amount, total_debt_amount }
  ```

| Mobile field | API field | Match? |
|---|---|---|
| `name` | `plan_name` | ❌ |
| `strategy` | `strategy_type` | ❌ |
| `target_amount` | `total_debt_amount` | ❌ |
| `monthly_payment` | `monthly_payment_amount` | ❌ |
| (not sent) | `budget_id` | ❌ |

**Impact:** Every destructured field on the API side is `undefined`. Plan rows are inserted with `plan_name=null, strategy_type=null, monthly_payment_amount=null, total_debt_amount=null, budget_id=null, estimated_payoff_months=12` (hardcoded), `user_id=current_user`. Plans appear in the user's plan list with no name, no strategy, no amounts.

**NOT NULL exposure:** The `debt_payment_plans_table.sql` migration declares `plan_name TEXT NOT NULL` and `strategy_type TEXT NOT NULL`. The `budget_planner_migration.sql` migration declares the same fields but without explicit NOT NULL on strategy. **If the deployed schema is from `debt_payment_plans_table.sql`, the insert is throwing on the NOT NULL constraint and plan creation is fully broken (not just data-stripped).** Whichever migration ran last wins; deployment-state verification needed.

**Recommendation:** Rename mobile's fields to match the API. Also consider adding `budget_id` to the mobile payload (the user's current budget) so plans link properly to a budget. This is the single highest-leverage fix in the budget feature.

---

### Bug Bud-5: PUT /api/debt-payment-plans/:id endpoint doesn't exist

**Severity:** Medium-High.

**Description:** Mobile's `updatePaymentPlan` calls a PUT endpoint that has no handler in the API.

**Sites:**
- Mobile: `src/services/api.js:989`:
  ```js
  updatePaymentPlan: async (id, data) => api.put(`/api/debt-payment-plans/${id}`, data)
  ```
- API: `railway-deploy/server.js` has POST and GET for `/api/debt-payment-plans`. **No PUT handler exists.** Search for `app.put('/api/debt-payment-plans` returns no results.

**Impact:** When the user opens an existing plan, edits it, and hits save (`BudgetScreen.js:253` — `budgetAPI.updatePaymentPlan`), Express returns the default 404. Mobile catches the error and displays "Failed to update plan." User-visible bug — plan edits are silently impossible.

**Recommendation:** Add a `PUT /api/debt-payment-plans/:id` route that does an `.update()` on `debt_payment_plans` with user_id scoping. ~10 lines.

---

## Architectural concerns

### A. Paradigm split (root cause of Bud-1 through Bud-3)

Mobile and API were designed for incompatible paradigms:
- **API + DB:** category-by-category breakdown (11 expense categories with auto-computed totals via GENERATED columns).
- **Mobile UI:** simple 3-field form (income, expenses, savings goal) plus separate `bills` CRUD.

The PWA at `frontend/screen-budget-planner` matches the API's paradigm (category UI). Mobile diverges. This is the root cause of Bud-1, Bud-2, and Bud-3 — they're symptoms of the paradigm mismatch, not independent bugs.

**Decision required before implementation:**
- Keep API's category paradigm and reshape mobile UI?
- Keep mobile's totals paradigm and reshape API + add columns?
- Hybrid: support both shapes (categories optional, totals primary) via schema additions?

### B. `bills` data path bypasses the API

Mobile `billsAPI` (`src/services/api.js:906-965`) talks directly to Supabase via the client SDK, bypassing the Express API entirely. Same architectural quirk as ESIGN consent (also direct-Supabase-from-mobile, flagged in the letter audit). Inconsistent with everything else in the budget flow. Worth flagging as a P2 architectural decision: keep the bypass (relies on RLS), or route through API for consistency?

### C. Three "debt allocation/payment" tables with overlapping purpose

- `debt_payments` (API writes via `POST /api/debt-payments` at `server.js:5439`; migration file not located in repo)
- `debt_allocations` (per `railway-deploy/migrations/debt_allocations_table.sql`)
- `debt_payment_allocations` (per `database/budget_planner_migration.sql`)

The `_allocations` and `_payment_allocations` tables overlap conceptually (both link plan ↔ account with monthly_payment + payoff_order). Without DB inspection it's unclear which is deployed. Worth verifying as part of the schema-verification step.

### D. `debt_payment_plans` has two conflicting migration files

Both `database/budget_planner_migration.sql` and `railway-deploy/migrations/debt_payment_plans_table.sql` define this table, with slightly different schemas (NOT NULL constraints differ on `strategy_type`). Last-run-wins behavior. Affects Bud-4's failure mode.

### E. `estimated_payoff_months` is hardcoded to 12

`server.js:5404` — every payment plan gets `estimated_payoff_months: 12` regardless of the user's actual debt amount, monthly payment, or strategy choice. No real calculation. Pairs with Bud-3's broader observation that the strategy picker (snowball/avalanche/hybrid) doesn't affect any computation downstream.

### F. Modular `budget.routes.js` includes a service-role-key workaround

`railway-deploy/routes/budget.routes.js` exposes a `getServiceClient()` helper that uses `SUPABASE_SERVICE_ROLE_KEY` to bypass RLS, *specifically* for budget writes. Suggests someone hit RLS errors on `budgets` writes at some point and built the service-role version as a workaround. The modular file is dead in production, so the live route uses the request-scoped Supabase client (subject to RLS). **If the deployed `budgets` table has RLS policies that block authenticated user INSERT/UPDATE, the live route silently fails too.** Worth checking RLS policies as part of schema verification.

---

## Open questions

1. **Paradigm decision** — category breakdown, simple totals, or hybrid? Required before any Bud-1/Bud-2/Bud-3 fix can proceed.
2. **Schema verification** — does the deployed `budgets` table actually have `monthly_expenses` / `savings_goal` columns added later that aren't in the migrations I read? Does deployed `debt_payment_plans` enforce NOT NULL on `strategy_type`? Which `debt_*allocations` tables actually exist? See SQL in "Recommended next steps."
3. **AI advice surface (untraced).** `BudgetScreen.js:104-108` declares `aiAdvice` state with `setAiAdvice`, `aiLoading`, `aiError`. Which endpoint generates the advice and whether it works was not traced in this audit. **Marked as unverified.** Likely calls some `/api/ai-*` route or `aiAPI.generate()` — needs follow-up if AI advice is part of the budget feature redesign.
4. **`debt_payments` migration location.** API writes to this table but no committed migration file was found in `database/` or `railway-deploy/migrations/`. Where does its schema live? Possibly a Supabase-Studio-only migration not committed to the repo.
5. **PWA budget reachability.** PWA `screen-budget-planner` exists but its production reachability through the legacy app shell isn't traced. If the PWA is still used by anyone, fixing the paradigm split affects them too.
6. **Modular dead-code cleanup scope.** `routes/budget.routes.js` and `routes/bills.routes.js` are dead in production. Whether to delete them in the same commit as the budget fix or defer to a separate cleanup pass is a scope decision.

---

## Recommended next steps for tomorrow

1. **Run the schema verification SQL** (below) in Supabase SQL Editor. Compare against the migration files cited in the inventory. Specifically check: does `budgets` have `monthly_expenses` / `savings_goal` columns? Does `debt_payment_plans.strategy_type` have NOT NULL? Which `debt_*allocations` tables exist? What RLS policies are on `budgets`?

```sql
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (table_name LIKE '%budget%'
       OR table_name LIKE '%debt_%'
       OR table_name = 'bills')
ORDER BY table_name, ordinal_position;
```

Also useful for RLS check:
```sql
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE tablename IN ('budgets', 'debt_payment_plans', 'debt_payments', 'debt_allocations', 'debt_payment_allocations', 'bills')
ORDER BY tablename, policyname;
```

2. **Probe live `POST /api/debt-payment-plans`** with the mobile-shaped payload (curl/Postman):
   ```bash
   curl -X POST $API_URL/api/debt-payment-plans \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"name":"test","strategy":"avalanche","target_amount":1000,"monthly_payment":100}'
   ```
   Confirm whether it returns 200 with a null-filled plan, or 5xx with a NOT NULL constraint violation. Result determines whether Bud-4 is "wrong-data-saved" or "fully-broken" severity-wise.

3. **Make the paradigm decision.** Until this is locked, Bud-1/Bud-2/Bud-3 fixes are blocked. Recommend: paste the three-paradigm options to a quick decision conversation, pick one, then sequence the fix work.

4. **Sequence the fixes.** Likely order, contingent on paradigm decision:
   - Bud-5 (add PUT route) — paradigm-independent, ~10 lines, immediate.
   - Bud-4 (rename plan-creation fields) — paradigm-independent, mobile-side only.
   - Bud-1 + Bud-2 + Bud-3 — paradigm-dependent, larger scope.
   - Architectural concerns (A-F) — defer until the bug fixes land and stabilize.

---

*End of evidence audit. Pass 1. No fixes applied. Fix work planned for next session.*
