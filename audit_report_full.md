# Valor Odds — Full-Site QA Audit Report

Prepared for: Admin account holder | Date: August 12, 2026 | Reviewer: Claude (automated QA pass)

This report documents a full walkthrough of valorodds.com, covering public marketing pages, the sports/odds hub, arbitrage tools, market intelligence, learn/glossary content, pricing, account settings, the authenticated dashboard (all tabs), the admin panel, API access & docs, legal pages, and the signup/signin flow. No changes were made to the site, no new subscriptions were created, and no admin actions with production impact (e.g. the "Run sync" button) were executed. One minor, reversible, non-monetary interaction did occur and is disclosed at the end of this report.

---

## Critical Issues

### 1. Duplicate game listing `CRITICAL`
- **Page/Location:** /sports/mlb — Upcoming Games list
- **Issue:** The same MLB matchup appears twice in the upcoming games list.
- **Why it matters:** Duplicated fixtures undermine trust in the data feed and could cause a bettor to think there are two separate games or double-count odds/lines.
- **Recommended fix:** De-duplicate the games feed by a unique game ID before rendering; add a server-side or build-time check that flags duplicate IDs.

### 2. Invalid odds values on Moneyline page `CRITICAL`
- **Page/Location:** /sports/mlb/odds/moneyline — odds table
- **Issue:** At least one row displays a moneyline of "+199900" (an implausible price) and another shows a bare "0", which is not a valid moneyline value.
- **Why it matters:** Odds are the core product of this site. Obviously-wrong numbers destroy user trust instantly and could mislead a user performing arbitrage math, potentially causing real financial harm.
- **Recommended fix:** Add bounds validation on ingest (reject/flag odds outside a realistic range, e.g. -100000 to +100000, and never render "0"). Show "—" or "Odds unavailable" when a book has no live price instead of a raw zero.

### 3. "Risk-free profit" language conflicts with Terms/Disclaimer `CRITICAL`
- **Page/Location:** /arbitrage/mlb (and likely other /arbitrage/&lt;sport&gt; pages)
- **Issue:** Marketing copy describes arbitrage betting as delivering "risk-free profit", while /terms and /disclaimer separately state that the site does not guarantee profits.
- **Why it matters:** This is a direct contradiction between marketing and legal copy. Beyond user confusion, "risk-free profit" claims can carry regulatory/compliance exposure, since arbitrage betting is never truly risk-free (line moves, bet limits, account restrictions, and rounding all introduce risk).
- **Recommended fix:** Remove absolute language like "risk-free" from all marketing copy and replace with accurate, hedged phrasing that matches the legal disclaimers.
- **Suggested wording:** "Arbitrage betting aims to lock in a profit by betting on all outcomes across different sportsbooks — but line movement, bet limits, and timing can reduce or eliminate the edge, so no outcome is guaranteed."

### 4. Admin "Run sync" button has no confirmation step `CRITICAL`
- **Page/Location:** /admin → API Monetization
- **Issue:** A "Run sync" button (which appears to trigger a live Stripe product/price sync) is immediately clickable with no confirmation dialog, "are you sure," and no visible indication of what it will change.
- **Why it matters:** A single accidental click by any admin/staff member could push unintended pricing or product changes to a live payment system, directly affecting billing for real customers.
- **Recommended fix:** Add a confirmation modal summarizing exactly what will sync (which products/prices) before executing, and log a timestamped audit trail of who ran it.

---

## High Severity Issues

### 5. Duplicated word in templated copy `HIGH`
- **Page/Location:** /sports/mlb/odds/live
- **Issue:** Body copy reads: "How live betting works in MLB" and "Compare live MLB betting prices" — duplicated/awkwardly repeated words, almost certainly from a shared page template used across every sport × market combination.
- **Why it matters:** Because this looks templated, the same typo is likely repeated across dozens of sport/market pages sitewide, multiplying a small error into a large, visible credibility problem.
- **Recommended fix:** Fix the underlying template string, then spot-check the equivalent "live odds" page for every other sport to confirm the fix propagated.
- **Suggested wording:** "How live betting works in MLB" / "Compare live MLB betting prices across sportsbooks."

### 6. Raw internal data leaking into the AI Best Bets panel `HIGH`
- **Page/Location:** dashboard → Best Bets (including the expanded "View all" feed)
- **Issue:** One recommendation references a mismatched opponent name ("Bayern Munchen") inside what is otherwise an MLB-focused feed, and a badge on another card displays the raw internal field name "depthAnalysis" instead of a human-readable label.
- **Why it matters:** Cross-sport data bleeding into a single feed suggests an underlying data-pipeline bug, and raw field/key names in the UI look unfinished and unprofessional, undermining confidence in the "AI-powered" positioning of the product.
- **Recommended fix:** Filter the best-bets feed strictly by the selected sport/league, and pass all badge labels through the display-name mapping layer so internal keys are never rendered directly to users.
- **Suggested wording:** Replace "depthAnalysis" badge text with something like "Depth Chart Analysis."

### 7. Raw sportsbook key shown instead of formatted name `HIGH`
- **Page/Location:** dashboard → Live Odds
- **Issue:** A row displays the string "fanduel_us" (an apparent truncated internal identifier) rather than the formatted sportsbook name "FanDuel."
- **Why it matters:** Users may not recognize "fanduel_us" as a real sportsbook, causing confusion about which book the odds belong to, or make them question data quality.
- **Recommended fix:** Ensure every sportsbook key is passed through the same display-name formatter used elsewhere on the site before rendering.

### 8. "0 sportsbooks" stat contradicts the table below it `HIGH`
- **Page/Location:** /market-intelligence
- **Issue:** A summary stat states "0 sportsbooks are being tracked," while the ranking table immediately below lists multiple named sportsbooks.
- **Why it matters:** Visitors evaluating the product's credibility (a key top-of-funnel page) will immediately notice the contradiction, which undercuts the "live market intelligence" value proposition.
- **Recommended fix:** Fix the stat calculation to count distinct sportsbooks actually present in the underlying dataset rather than referencing an unrelated/empty counter.

### 9. Pricing page still prompts an existing VIP subscriber to "Join VIP" `HIGH`
- **Page/Location:** /pricing
- **Issue:** The logged-in account already has an active VIP subscription (confirmed on /account), yet /pricing still shows a "Join VIP" call-to-action rather than indicating the plan is already active.
- **Why it matters:** This could cause an existing subscriber to attempt to re-subscribe or worry they are being charged twice, generating unnecessary support tickets.
- **Recommended fix:** Detect the user's current plan and change the button to "Current Plan" (disabled) or "Manage Plan" (linking to account/billing) for whichever tier is active.

### 10. Signup page reachable while already logged in `HIGH`
- **Page/Location:** /auth/signup
- **Issue:** The signup page loads normally for a user who is already authenticated, and its header/navigation differs from the rest of the logged-in dashboard.
- **Why it matters:** An existing user landing here (e.g. via a bookmark or old link) may attempt to create a second account or become confused about their login status, and the inconsistent nav makes the page feel disconnected from the rest of the product.
- **Recommended fix:** Redirect already-authenticated users away from /auth/signup (and /auth/signin) to the dashboard, and align the nav component with the rest of the site.

---

## Medium Severity Issues

### 11. Support ticket count mismatch `MEDIUM`
- **Page/Location:** /admin → Support Tickets
- **Issue:** The summary stat card's total ticket count does not match the number of rows shown when the "All" filter is selected.
- **Why it matters:** Support staff relying on this count to gauge workload or SLA compliance may under- or over-estimate their queue.
- **Recommended fix:** Ensure that the stat card and the table query use the same underlying dataset/filter state.

### 12. "Last updated" dates on legal pages appear auto-generated `MEDIUM`
- **Page/Location:** /terms and /privacy
- **Issue:** Both pages show a "Last updated" date matching today's date, which is suspicious for two independent legal documents and suggests the date is generated at page-render time rather than reflecting a real edit.
- **Why it matters:** Legal documents rely on accurate effective dates; an auto-generated "today" date is misleading and could matter in a dispute about which policy version applied when.
- **Recommended fix:** Store and display a static last-modified date tied to actual content changes, not the current render date.

### 13. Privacy Policy contradicts the cookie banner `MEDIUM`
- **Page/Location:** /privacy and the site-wide cookie consent banner
- **Issue:** The Privacy Policy states no tracking/analytics cookies are used, while the cookie banner separately asks users to accept or deny analytics cookies.
- **Why it matters:** This is a direct factual contradiction in privacy-related disclosures, which is exactly the kind of inconsistency that can create mistrust and erode user trust.
- **Recommended fix:** Align the Privacy Policy text with the actual cookies set by the site (list categories/purposes accurately).

### 14. Bundle size mismatch in admin copy `MEDIUM`
- **Page/Location:** /admin → API Monetization
- **Issue:** Internal copy references a "26 sports All-Access Bundle," but the live /sports hub only lists 10 sports.
- **Why it matters:** If this bundle is ever surfaced to customers, they would be paying for a scope that doesn't match what's actually available, risking chargebacks/complaints.
- **Recommended fix:** Reconcile the bundle description with the actual number of supported sports, or clarify that more sports are "coming soon."

### 15. Sports and tournaments mixed in the same list `MEDIUM`
- **Page/Location:** /api/scores (or /api-access docs)
- **Issue:** The list of supported "sports" for the API mixes actual sports (e.g. MLB, NFL) with what appear to be individual tournaments/leagues, without a clear category distinction.
- **Why it matters:** Developers evaluating the API need a precise, unambiguous taxonomy to know what data they can query; mixing categories creates integration confusion.
- **Recommended fix:** Split the list into clearly labeled "Sports" and "Leagues/Tournaments" sections.

### 16. Account page navigation differs from the rest of the site `MEDIUM`
- **Page/Location:** /account
- **Issue:** The header/nav on the Account page uses a different layout and set of links than the dashboard and marketing pages.
- **Why it matters:** Inconsistent navigation makes the product feel stitched-together and can make it harder for users to find their way back to the dashboard.
- **Recommended fix:** Reuse a single shared nav component across all authenticated pages.

### 17. "Contact support" is a dead end `MEDIUM`
- **Page/Location:** /account
- **Issue:** The "contact support" reference on the Account page does not lead to a working ticket form, email link, or chat — there's no clear next action.
- **Why it matters:** This is precisely the kind of gap that generates avoidable support tickets: a user who needs help has nowhere to go.
- **Recommended fix:** Link directly to a support form, ticket system, or mailto link with a pre-addressed message.

### 18. Billing portal "unavailable" message gives no next step `MEDIUM`
- **Page/Location:** /account → Subscription/Billing section
- **Issue:** When the billing portal can't load, the message informs the user it's unavailable but doesn't say what to do instead (retry, contact support, etc.).
- **Why it matters:** A billing-related dead end is high-anxiety for users and a common trigger for support contacts.
- **Recommended fix:** Add a clear next step to the error state.
- **Suggested wording:** "We couldn't load your billing details right now. Please try again in a few minutes, or contact support at [link] if the problem continues."

### 19. Truncated text in Injuries feed `MEDIUM`
- **Page/Location:** dashboard → Injuries
- **Issue:** At least one injury report entry is cut off mid-sentence with no "read more" or tooltip to see the full text.
- **Why it matters:** Injury details can materially affect a bettor's decision; truncated information could lead to a worse-informed (and potentially costly) decision.
- **Recommended fix:** Either widen the text container, wrap the text properly, or add an expand/"read more" control.

### 20. Stale data in Trends tab `MEDIUM`
- **Page/Location:** dashboard → Trends
- **Issue:** Timestamps/data shown in this tab appear outdated relative to other live-updating parts of the dashboard.
- **Why it matters:** Users may unknowingly rely on stale trend data when making betting decisions.
- **Recommended fix:** Surface a visible "as of [time]" timestamp on this tab, and confirm the backing data job is refreshing on schedule.

### 21. Off-by-one inconsistency in API documentation example `MEDIUM`
- **Page/Location:** /docs
- **Issue:** An example JSON response's accompanying comment/description doesn't match the actual number of items shown in the example array (an off-by-one discrepancy).
- **Why it matters:** Developers copy documentation examples directly; a mismatched example can cause confusion or subtle bugs in their implementation.
- **Recommended fix:** Regenerate doc examples from real API responses (or add an automated doc-example test) rather than hand-maintaining them.

### 22. Ambiguous "No upcoming NFL games" empty state `MEDIUM`
- **Page/Location:** /sports/nfl
- **Issue:** The page simply states there are no upcoming games, without clarifying whether this is because the NFL is out of season, data hasn't loaded, or the sport isn't fully supported yet.
- **Why it matters:** Users can't tell whether to check back later, whether something is broken, or whether NFL is supported at all.
- **Recommended fix:** Add context to the empty state.
- **Suggested wording:** "No upcoming NFL games right now — check back closer to the next NFL season, or browse other sports below."

---

## Low Severity / Suggestions

### 23. Inconsistent capitalization in Preferences `LOW`
- **Page/Location:** /dashboard → Preferences
- **Issue:** Option labels mix Title Case, sentence case, and all-lowercase inconsistently.
- **Recommended fix:** Standardize on one capitalization style (sentence case is recommended) across all form labels.

### 24. Inconsistent team abbreviations vs. full names `LOW`
- **Page/Location:** /sports/mlb/odds/moneyline
- **Issue:** Some rows show full team names while others show abbreviations, with no consistent rule.
- **Recommended fix:** Pick one format (e.g. always full name, with abbreviation as a secondary/smaller label) and apply it uniformly.

### 25. Thin content on About page `SUGGESTION`
- **Page/Location:** /about
- **Issue:** The page is quite short and doesn't say much about the team, company history, or credentials.
- **Recommended fix:** Add a short founder/team section and any relevant credentials to build trust with new visitors evaluating a betting-adjacent product.

### 26. Unbranded 404 page `LOW`
- **Page/Location:** Any invalid URL, e.g. an unlinked /auth/login path
- **Issue:** The 404 error page has no header, navigation, or branding, leaving a visitor with no way back to the site other than the browser back button. Note: this specific path isn't linked from anywhere in the site's own navigation — it was reached by manually guessing a URL — but the same bare error page would appear for any typo'd or outdated link.
- **Recommended fix:** Add the standard site header/nav and a "Back to homepage" link to the 404 template.

### 27. Community poll allows unlimited vote-switching `SUGGESTION`
- **Page/Location:** Homepage — Community Poll widget
- **Issue:** A user can switch their vote repeatedly with no visible cap, which could allow skewing of results (intentionally or accidentally).
- **Recommended fix:** Consider locking a vote once cast, or clearly showing "you voted for X, change vote" state.

### 28. Overlapping VIP messaging between Home and Pricing `SUGGESTION`
- **Page/Location:** Homepage VIP section and /pricing
- **Issue:** Both sections describe VIP benefits with very similar wording, which is repetitive for a visitor who reads both.
- **Recommended fix:** Keep the homepage teaser short and reserve full benefit details for the Pricing page.

---

## Areas That Worked Well
- The dashboard Arbitrage calculator produced correct, sensible output when tested with its default bankroll value.
- Heading structure (H1 → H2 → H3) is well-formed sitewide, which is good for screen-reader navigation.
- The site uses very few raster images (icons/graphics are largely CSS/SVG-based), so there was minimal risk of missing alt-text found during this pass.
- The cookie consent banner correctly respected a "Deny" choice and only reappeared when explicitly reopened via the footer "Cookie settings" link.
- The primary content hierarchy (Sports hub → individual sport → specific market) is logical and easy to follow.
- The pre-filled email/password observed on the sign-in page was confirmed, via inspection, to be local browser password-manager autofill rather than a server-side data leak — a good sign, not a site bug.

---

## Summary

**All issues to fix (28 total):**
- **Critical (4):** duplicate MLB game listing; invalid odds values (+199900 / "0") on Moneyline; "risk-free profit" language contradicting Terms/Disclaimer; unconfirmed admin "Run sync" button.
- **High (6):** duplicated-word templated copy on live odds pages; garbled/mismatched AI Best Bets data with raw "depthAnalysis" badge; raw "fanduel_us" sportsbook key shown in Live Odds; contradicting "0 sportsbooks" stat on Market Intelligence; stale "Join VIP" CTA for an existing VIP subscriber; signup page reachable (with inconsistent nav) while already logged in.
- **Medium (12):** support ticket count mismatch; auto-generated-looking "Last updated" dates on legal pages; Privacy Policy contradicting the cookie banner; bundle-size mismatch (26 vs 10 sports); mixed sports/tournaments taxonomy on api-access; inconsistent Account page navigation; dead-end "contact support" reference; unhelpful billing-portal error state; truncated Injuries entry; stale Trends data; off-by-one docs example; ambiguous NFL empty state.
- **Low/Suggestion (6):** inconsistent capitalization in Preferences; inconsistent team abbreviations; thin About page; unbranded 404 page; unlimited poll vote-switching; repetitive VIP messaging between Home and Pricing.

**Site-wide consistency problems:**
- Terminology drift: sports vs. tournaments/leagues are not consistently distinguished (api-access), and team names alternate between abbreviations and full names (Moneyline table).
- Legal vs. marketing contradiction: "risk-free profit" language on marketing pages directly conflicts with the no-guarantee language in Terms, Privacy, and the Disclaimer.
- Raw backend values (internal field names, truncated sportsbook keys) occasionally leak into user-facing UI instead of being passed through a display-formatting layer.
- Navigation/header layout is not fully shared across all authenticated pages (Account page differs from Dashboard and marketing pages).
- "Last updated" dates on legal documents appear to reflect page-render time rather than true content-edit history, across at least two separate documents.

**Workflow improvements:**
- Redirect already-authenticated users away from /auth/signup and /auth/signin.
- Make the Pricing page plan-aware so an existing subscriber sees "Current Plan" instead of "Join VIP."
- Give the Account page's "contact support" reference and the billing-portal error state real, actionable next steps.
- Add a confirmation step (with an audit log) before the admin "Run sync" action executes.
- Reconcile the "26 sports" bundle description in admin copy with the 10 sports actually live on the site.

**Quick wins:**
- Fix the "betting betting" / "live live" duplicated-word template text.
- De-duplicate the MLB upcoming-games list.
- Replace the invalid "+199900" and "0" odds values with proper validation/fallback text.
- Reconcile the Support Tickets stat card with the actual filtered ticket count.
- Format the "fanduel_us" key as "FanDuel," and relabel the "depthAnalysis" badge with a human-readable name.
- Add a header/nav and "Back to homepage" link to the 404 page template.

**Areas that should receive additional manual testing:**
- Mobile/responsive layout across all major page types — this automated pass could not reliably force a true mobile viewport, so a hands-on check on actual phone/tablet screen sizes is recommended.
- Full keyboard-only navigation and screen-reader pass across the Dashboard's many tabs (Overview, Best Bets, Live Odds, Arbitrage, Steam Moves, Injuries, Player Stats, Trends, Sportsbooks, AI Chat, Preferences), since only visual/DOM-structure checks were performed.
- Formal color-contrast auditing with dedicated tooling (e.g. axe or WAVE), beyond the visual spot checks done here.
- The AI Chat feature's actual behavior when a real question is submitted — only the empty state was reviewed.
- The arbitrage calculator's math accuracy across a range of non-default stakes/odds combinations, beyond the single default-value check performed.
- The "Forgot password" flow on the sign-in page (link was seen but not exercised).
- The "DiamondDraft" section visible in the dashboard sidebar, which was only reviewed via the docs and not actually exercised.
- API key regeneration and webhook delivery, which were only reviewed via the docs and not actually exercised.
- Full scroll-through of long, paginated data feeds (Injuries, Player Stats, Sportsbooks rankings, Steam Moves, Trends) beyond the sampled top entries.
- The Discord linking/joining flow, which is external to the site and was not tested.
- The live checkout/subscription flow, intentionally left untested per the instruction not to create any new subscriptions.

**Disclosure:** During testing, the homepage Community Poll's "Vote" control was clicked twice to observe the voting workflow (once for Minnesota Twins, then switched to Baltimore Orioles). This is a minor, non-monetary, reversible change to live poll state — the only state change made anywhere on the site during this audit. Everything else was read-only navigation and observation; no purchases, subscriptions, admin syncs, or form submissions were made.

---
*End of report — Valor Odds Full-Site QA Audit — generated August 12, 2026*
