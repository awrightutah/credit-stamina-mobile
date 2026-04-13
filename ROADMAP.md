# Credit Stamina Mobile — Product Roadmap
*Last updated: April 13, 2026*

---

## VERSION 1.0.0 — CURRENT (TestFlight)
*Submitted April 13, 2026 · Build 1 · iOS only*

### Authentication & Security
- Email/password login and registration
- Google Places address autocomplete at signup
- Face ID / Touch ID biometric login
- 15-minute biometric grace window (no re-prompt on quick return)
- Biometric enrollment offer after first password login
- Session restore with 10-second timeout and clean fallback
- Forgot password / reset via email
- Session expiry detection with user-friendly message

### Core App Screens
- **Dashboard** — score gauge, account lane stats, pending actions count, points badge, quick action tiles, budget snapshot, recent activity feed
- **Accounts** — grouped by lane (Active Damage / Removable / Aging-Monitor), account detail modal with notes, creditor/balance/bureau info, add/edit/delete accounts
- **Actions** — AI + rule-based action plan, pending/completed/dismissed filters, mark done, dismiss, regenerate, local cache survives backgrounding
- **Letters** — generate dispute letters by type (Bureau Dispute, Goodwill, Pay for Delete, Debt Validation, Hardship), view full letter, mail via USPS, delete, filter by type, push notification reminders
- **Score** — FICO gauge with tier colors, bureau tabs (TransUnion / Equifax / Experian), score history line chart, log new score, goal setting, score simulator link, AI score analysis
- **Profile** — user card, points progress bar, subscription status, preferences, admin section, account management links, sign out

### Supporting Screens
- AI Advisor (chat-style credit Q&A)
- Action Plan (30/60/90 day AI plan)
- Upload Credit Report (PDF picker, AI analysis)
- Budget Tracker (bill management, debt payoff suggestions, monthly cash flow)
- Score Simulator
- Edit Profile (name, phone, mailing address)
- Settings (notifications, display, data)
- Privacy & Security
- Family Plan (screen built, invite flow pending)
- Billing & Payments (Authorize.net, saved cards)
- Billing History (screen built, transaction data pending)
- Dispute Tracker (screen built, response tracking pending)
- Onboarding flow for first-time users

### Points & Rewards
- Earn points per action: upload report (50), log score (25), complete action (20), generate letter (30), mail letter (35), add bill (10)
- 500 points = 1 free month redemption
- Progress bar on Profile screen

### Payments
- Authorize.net subscription ($24.99/mo) and one-time charges
- Saved payment methods with card brand detection
- New card entry with real-time validation
- Promo / test user rate ($9.99/mo lifetime) with badge display

### Promo Code System
- Admin generates unique one-time invite codes (CS-XXXXXXXX format)
- Single-use to prevent sharing abuse
- Applied at registration — sets lifetime $9.99 rate on profile
- Admin can also apply promo rate directly to existing users

### Admin Dashboard
- **Overview tab** — total users, pro subscribers, letters sent, estimated monthly revenue, points system info, recent signups
- **Users tab** — searchable list, subscription status badges, points balance, tap to edit
- **Edit User modal** — subscription override, points balance, quick actions (Set Free Plan, Apply $9.99 Promo, Generate Invite Code)
- **States tab** — toggle each state Active/Inactive, search, active count
- **Activity tab** — recent platform activity feed

### Service State Restrictions
- Signup blocked for unlicensed states with friendly message
- 10 states currently active: AK, MT, NM, ND, OR, RI, SD, UT, VT, WY
- Admin can toggle states on/off without app update or code change

### Infrastructure
- React Native 0.85, New Architecture (Fabric) enabled
- Supabase direct queries + Railway backend (Node/Express) hybrid
- RLS policies using JWT-based admin check (no infinite recursion)
- SECURITY DEFINER RPCs for admin data access
- AsyncStorage for biometric session tokens and action plan cache
- Push notifications (APNs) with deep-link handler for Letters screen
- Portrait-only, dark theme throughout
- Production push notification entitlement
- Face ID, camera, photo library usage descriptions in Info.plist

---

## VERSION 1.0.1 — BUG FIX RELEASE
*Target: 1–2 weeks after TestFlight launch*

### Known Issues to Fix
- [ ] Settings screen notification toggle reads assumed state, not actual iOS permission — should call `checkNotificationPermissions()` on mount
- [ ] Push notification deep links only wired for Letters — add Score, Actions, Budget
- [ ] Admin Activity tab blocked by RLS on `activity_log` table — apply same SECURITY DEFINER pattern as `admin_get_users`
- [ ] Billing History screen not populated — wire Authorize.net transaction history endpoint
- [ ] Family Plan invite flow not built — screen exists but sends nowhere
- [ ] Dispute Tracker response tracking not wired — screen exists, logic pending
- [ ] OfflineBanner component exists but not connected to app layout
- [ ] Score chart has no tap interaction — tapping a point should show exact date and score value

### TestFlight Feedback Fixes
- [ ] Triage and fix issues reported by beta testers (placeholder — populate during testing)

---

## VERSION 1.1.0 — POLISH RELEASE
*Target: 1 month post-TestFlight*

### UI & UX Improvements
- [ ] Replace "CS" text logo on login screen with actual Credit Stamina logo/icon
- [ ] Empty state illustrations for Accounts, Letters, Actions when no data exists — replace blank screens with helpful prompts and a clear first action
- [ ] Skeleton loading screens instead of plain spinners on Dashboard and Accounts
- [ ] Haptic feedback on key interactions (mark action done, redeem points, successful login)
- [ ] Score history chart — pinch-to-zoom, tap-a-point detail callout
- [ ] Letter preview screen — full-screen readable view with share sheet (copy, email, print)
- [ ] Pull-to-refresh visual consistency across all screens
- [ ] Smoother tab bar transitions

### Onboarding Improvements
- [ ] Guided first-run flow after registration: upload report → see accounts → generate first action plan
- [ ] Tooltip overlays explaining each tab on first visit
- [ ] Sample data mode for users who haven't uploaded a report yet

### Notifications
- [ ] Deep links for all notification types (Score, Actions, Budget due dates, Letter follow-ups)
- [ ] Letter follow-up reminders at 30, 60, 90 days after mailing
- [ ] Weekly score check-in reminder ("Time to log your credit score")
- [ ] Action plan nudge if no actions completed in 7 days

### Account & Profile
- [ ] Profile photo / avatar upload
- [ ] Change password from within the app (Privacy & Security screen)
- [ ] Biometric toggle in Privacy & Security to enroll or unenroll without reinstalling

### Admin Improvements
- [ ] Activity tab working with SECURITY DEFINER fix
- [ ] User detail screen (tap a user to see their full profile, accounts count, letters count)
- [ ] Export users list to CSV
- [ ] Revenue chart (monthly MRR trend)

---

## VERSION 1.2.0 — FEATURE EXPANSION
*Target: 2–3 months post-launch*

### Family Plan (Full Build)
- [ ] Invite family member via email or SMS link
- [ ] Secondary user can register under the primary account (2 seats included)
- [ ] Primary user can view/switch between household profiles
- [ ] Shared subscription billing

### Dispute Tracker (Full Build)
- [ ] Log bureau responses with date and outcome
- [ ] Track per-account dispute status across all three bureaus independently
- [ ] Automated follow-up reminders based on FCRA response deadlines (30 days)
- [ ] Dispute outcome history (removed, updated, verified, no response)

### Credit Education (Learn Tab)
- [ ] Article library covering credit fundamentals, dispute strategies, debt management
- [ ] Short video explainers for key topics
- [ ] Personalized article suggestions based on user's account lane data
- [ ] Earn points for completing lessons

### Score Monitoring
- [ ] Connect to credit monitoring service (Experian/Equifax API or partner)
- [ ] Automatic score updates without manual logging
- [ ] Alert when score changes by more than 10 points
- [ ] Alert when new account or inquiry appears

### Expanded State Rollout
- [ ] Legal review and licensing for additional states (TX, FL, CA, etc.)
- [ ] In-app waitlist for users in inactive states — notify them when their state goes live
- [ ] State-specific letter templates (some states have additional consumer protections)

### Payments & Billing
- [ ] Annual subscription option ($199/yr — save ~$100 vs monthly)
- [ ] Apple Pay for new subscriptions
- [ ] Billing history fully populated with Authorize.net transaction detail
- [ ] Subscription pause self-service (currently requires contacting support)
- [ ] Upgrade/downgrade flow for family plan add-on

### Analytics (Admin)
- [ ] Monthly active users chart
- [ ] Feature usage breakdown (which screens are used most)
- [ ] Churn tracking (cancellations per month)
- [ ] Points redemption rate
- [ ] Letter generation and mail rate

---

## VERSION 2.0.0 — MAJOR UPDATE
*Target: 6 months post-launch*

### AI Credit Coach
- [ ] Personalized AI coach that tracks progress over time, not just single-session Q&A
- [ ] Remembers user's history, goals, which letters have been sent, which disputes resolved
- [ ] Proactive weekly check-ins with specific recommendations ("Your Capital One dispute is 45 days old — time to escalate")
- [ ] Natural language chat interface with suggested quick replies

### Automated Dispute Workflow
- [ ] One-tap "dispute all removable accounts" — generates all letters, queues for mailing
- [ ] Batch USPS mail submission for multiple letters at once
- [ ] Automatic follow-up letter generation when no response after 30 days
- [ ] Escalation path: initial dispute → validation → CFPB complaint template

### Credit Builder Tools
- [ ] Secured credit card recommendations based on current score tier
- [ ] Credit builder loan tracker
- [ ] Authorized user strategy guide — find accounts to piggyback
- [ ] Pay-for-delete negotiation script generator

### Score Prediction Engine
- [ ] "What if" modeling: what happens to my score if I pay off this account?
- [ ] Projected score timeline based on current trajectory
- [ ] Debt payoff optimizer — which debt to pay first for maximum score impact (beyond basic avalanche/snowball)

### Document Vault
- [ ] Encrypted in-app storage for dispute letters, bureau responses, account statements
- [ ] Organized by account and timeline
- [ ] Export full dispute history as PDF for attorney or lender review

### Referral Program
- [ ] Share a personal referral link — both users get 1 month free
- [ ] Track referral count and earnings on Profile screen
- [ ] Referral leaderboard for power users

### Enterprise / Credit Counselor Tier
- [ ] Multi-client dashboard for credit counselors and housing agencies
- [ ] Assign clients, track progress across all clients in one view
- [ ] White-label option for non-profit housing counselors
- [ ] Bulk user management and reporting

---

## GOOGLE PLAY ROADMAP
*Android launch target: 3–4 months after iOS App Store approval*

### Technical Work Required
- [ ] Audit and replace all iOS-only dependencies
  - `react-native-biometrics` — verify Android fingerprint/face support (library supports both, needs testing)
  - `@react-native-community/push-notification-ios` — replace with cross-platform solution (e.g. `notifee` or Firebase Cloud Messaging)
  - Document picker — verify Android behavior
- [ ] Replace APNs push infrastructure with Firebase Cloud Messaging (FCM) for Android, keep APNs for iOS
- [ ] Update `AppDelegate` patterns to include Android equivalents
- [ ] Test and fix any New Architecture (Fabric) issues on Android
- [ ] Create Android app signing keystore and store securely
- [ ] Set up Google Play Developer account ($25 one-time fee)
- [ ] Create app in Google Play Console with same bundle ID strategy

### Design Adjustments
- [ ] Android navigation back button handling (hardware back button)
- [ ] Status bar color and style for Android
- [ ] Material Design touches where expected by Android users (optional but improves feel)
- [ ] Splash screen using `react-native-splash-screen` or the new RN 0.73+ approach for Android

### Compliance
- [ ] Google Play Data Safety form — document what data is collected and why
- [ ] Review Google Play policy for financial apps — may require additional verification
- [ ] Android-specific privacy policy additions if required

### Testing
- [ ] Test on at least 3 Android device sizes/OS versions (Android 10, 12, 14)
- [ ] Google Play Internal Testing track → Closed Testing → Open Testing → Production (same staged rollout as TestFlight)

---

## APP STORE PUBLIC LAUNCH CHECKLIST
*Full public launch after TestFlight validation*

### App Store Connect Requirements
- [ ] App icon — all required sizes generated and uploaded (1024x1024 master)
- [ ] Screenshots — iPhone 6.9" (iPhone 15 Pro Max), iPhone 6.5", iPad Pro 12.9" (if supporting iPad)
  - Minimum 3 screenshots per device size, recommended 6–10
  - Show: Login, Dashboard, Score screen, Actions, Letters, Admin (or key selling screens)
- [ ] App Preview video (optional but increases conversion — 15–30 second screen recording)
- [ ] App name: "Credit Stamina — Credit Repair" (with subtitle for SEO)
- [ ] Subtitle (30 chars): "Repair & Build Your Credit"
- [ ] Description (4000 chars) — compelling copy covering key features and benefits
- [ ] Keywords (100 chars) — credit repair, dispute letters, credit score, credit builder, FICO
- [ ] Support URL — creditstamina.com/support
- [ ] Privacy Policy URL — creditstamina.com/privacy (required for apps with user accounts)
- [ ] Age rating — 4+ (no objectionable content)

### Legal & Compliance
- [ ] Confirm active state list is current and legally reviewed
- [ ] Terms of Service linked in app and hosted publicly
- [ ] Privacy Policy covers data collected (email, name, address, financial data, biometrics)
- [ ] CROA (Credit Repair Organizations Act) compliance review — required disclosures for credit repair apps
- [ ] Cancellation policy clearly stated in-app (Apple requires this for subscription apps)
- [ ] In-app subscription must use Apple's required subscription disclosure language

### Apple Review Requirements
- [ ] All screens functional — Apple reviewers will tap every button
- [ ] No placeholder content or "coming soon" screens visible to users
- [ ] Demo account available for Apple reviewer (include in App Review notes)
  - Create a test account in an active state (e.g. UT) with sample data preloaded
- [ ] Push notifications must work in production (not just simulator)
- [ ] Face ID prompt must appear in context and not be misleading
- [ ] No references to other platforms (Android, web) in app store screenshots

### Technical Requirements
- [ ] All TestFlight bugs resolved
- [ ] Crash rate below 1% (check Xcode Organizer / Firebase Crashlytics)
- [ ] App loads within 5 seconds on iPhone XS or newer
- [ ] Memory usage stable — no leaks during extended use
- [ ] Tested on minimum supported iOS version (currently iOS 16+)
- [ ] iPad layout tested if not explicitly restricted to iPhone-only

### Business Readiness
- [ ] Customer support email (support@creditstamina.com) monitored and responsive
- [ ] Cancellation flow works end-to-end (Apple requires working cancellation for subscriptions)
- [ ] Subscription shows correctly in iOS Settings → Subscriptions
- [ ] Revenue reporting set up (App Store Connect + Authorize.net dashboard)
- [ ] Press kit / landing page updated to reference App Store link

---

*Roadmap maintained by the Credit Stamina development team.*
*Update this file after each release with actual ship dates and completed items.*
