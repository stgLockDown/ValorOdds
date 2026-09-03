# ESPN Sync Extension — Technical Specification

Status: **Phase B (backend) complete and tested. Phase A (extension) specified, not yet built.**

## 1. What this is

A browser extension that docks a bar into ESPN's fantasy draft room and overlays
live ValorOdds analytics on the draft as it happens: a Value Over Replacement
(VOR) ranked board, positional scarcity, tier-cliff warnings, grades on picks as
they are made, and — for Premium and VIP subscribers — an AI draft assistant
that answers questions with the live draft as context.

This mirrors the product category WalterPicks occupies, built on ValorOdds'
existing projection, scoring and entitlement infrastructure.

## 2. Architecture

```
┌───────────────────────────────────────────────┐
│  ESPN draft room (fantasy.espn.com)           │
│  ┌─────────────────────────────────────────┐  │
│  │  content.js — reads draft state from    │  │
│  │  the DOM, injects and renders the bar   │  │
│  └────────────────┬────────────────────────┘  │
└───────────────────┼───────────────────────────┘
                    │ chrome.runtime.sendMessage
┌───────────────────▼───────────────────────────┐
│  background.js (MV3 service worker)           │
│  Holds the session cookie, performs all       │
│  network calls, so the content script never   │
│  triggers a cross-origin request itself.      │
└───────────────────┬───────────────────────────┘
                    │ fetch(credentials: 'include')
┌───────────────────▼───────────────────────────┐
│  ValorOdds API                                │
│  POST /api/dd/espn-sync        → analytics    │
│  POST /api/dd/espn-sync/chat   → AI (SSE)     │
└───────────────────────────────────────────────┘
```

Routing all traffic through the service worker matters for two reasons: the
session cookie is attached automatically, and the content script is never the
origin of a cross-origin request, which keeps the CORS surface to exactly the
two endpoints below.

## 3. Backend — built and tested

### `lib/dd/vor.ts`

The analytics core. Pure, synchronous and dependency-free so it can be unit
tested without a database and is fast enough to run on every pick.

| Export | Purpose |
|---|---|
| `computeVor(input)` | Scores the pool: VOR board, scarcity, suggestions, runs |
| `gradePick(picked, board, overallPick)` | Letter grade A+…F for a completed pick |
| `summariseDraftContext(result, opts)` | Compact text block for the AI prompt |

**Replacement level is derived from starter demand only.** This is the standard
Value-Based-Drafting definition, and getting it wrong was one of two real bugs
the test suite caught during development. Bench players *are* the replacement
pool; counting bench slots as demand pushed the 12-team NFL RB replacement from
RB28 (138 pts) down to RB40 (66 pts), inflating every VOR figure and flattening
the differences between positions that VOR exists to expose.

**Flex slots are split across eligible positions, not duplicated.** A
FLEX(RB/WR/TE) is one physical roster spot. Counting it in full for each
eligible position would have reported RB demand as 108 instead of 40 in a
12-team league.

**Run detection requires both a ratio test and an absolute excess.** The second
bug the tests caught: a pure ratio test flagged 2 QBs in an 8-pick window as a
"run" (ratio 1.88 against a 1.75 threshold), which is ordinary draft noise.
Requiring a meaningful absolute excess as well suppresses that false positive
while still catching genuine 5–6 pick runs.

### `lib/dd/espn-sync-tiers.ts`

Feature gating, composed from `lib/entitlements.ts` rather than reimplementing
the ladder, so the extension can never drift from the web dashboard.

| Tier | Bar | VOR board | Scarcity / cliffs | Pick grades | AI chat | Rows |
|---|---|---|---|---|---|---|
| free | ✅ | ❌ | ❌ | ❌ | ❌ | 5 |
| basic | ✅ | ✅ | ✅ | ✅ | ❌ | 10 |
| premium | ✅ | ✅ | ✅ | ✅ | ✅ | 200 |
| vip | ✅ | ✅ | ✅ | ✅ | ✅ | 200 |

`canUseAiChat` delegates to the existing `canUseChat()`, so the Premium boundary
is identical to the main web chat by construction.

`redactForTier()` strips paid fields **server-side before the response is
serialised**. Hiding them in the extension UI would be no protection at all —
anything sent over the wire is readable in the network tab. A test asserts the
free-tier board contains zero paid fields.

### Endpoints

**`POST /api/dd/espn-sync`** — draft snapshot in, analytics out. Stateless, no
DB writes. Returns board, scarcity, suggestions, active runs, unfilled starter
slots, an optional grade for the last pick, the caller's feature flags, and an
upgrade prompt when applicable. Prompt copy lives server-side so it can change
without shipping a new extension build.

**`POST /api/dd/espn-sync/chat`** — Premium/VIP only. Computes the same
analytics, compresses them via `summariseDraftContext()`, and streams a reply as
SSE in the exact frame format the existing web chat client already parses
(`data: {"content": "..."}` … `data: [DONE]`).

CORS on both: only ESPN origins and extension origins are echoed, never `*`,
because the endpoints are credentialed.

### Test coverage

```
scripts/test-vor.ts          35/35 passing
scripts/test-espn-tiers.ts   32/32 passing
```

The VOR suite verifies the central premise with a fixture built so the answer is
known by construction: QB1 has *more* raw projected points than RB1 (320 vs
300), but because QBs are flat and RBs steep, RB1 must carry the higher VOR.
Also covered: tier-cliff detection, flex/bench demand accounting, greedy starter
slot filling, run detection (including both false-positive and true-positive
cases), pick grading, and edge cases — empty pool, single player, null position,
injury flags, and the defense-only league preset.

## 4. Phase A — extension, to build

### File layout

```
espn-sync-extension/
├── manifest.json          MV3
├── background.js          service worker: auth + all network calls
├── content.js             DOM adapter + bar injection
├── bar.css                shadow-DOM styles
├── selectors.json         bundled fallback selector config
└── icons/
```

### `manifest.json` shape

```jsonc
{
  "manifest_version": 3,
  "permissions": ["storage", "activeTab"],
  "host_permissions": [
    "https://fantasy.espn.com/*",
    "https://valorodds.com/*"
  ],
  "background": { "service_worker": "background.js" },
  "content_scripts": [{
    "matches": ["https://fantasy.espn.com/football/draft*"],
    "js": ["content.js"],
    "css": ["bar.css"],
    "run_at": "document_idle"
  }]
}
```

### Auth flow

1. User signs in at valorodds.com as normal.
2. Service worker calls the API with `credentials: 'include'`; the existing
   session cookie authenticates it. No separate token to manage, and tier is
   read from the same session the website uses.
3. On 401 the bar renders a "Sign in to ValorOdds" state with a deep link.

### DOM adapter — the main engineering risk

ESPN ships obfuscated, hashed CSS class names that change without notice. Three
mitigations, in order of importance:

1. **Anchor on stable semantics, not hashed classes.** Prefer ARIA roles,
   `data-*` attributes and visible text (`"On the Clock"`, position labels)
   over `.jsx-2847193`.
2. **Remote selector config.** Ship `selectors.json` as a bundled fallback but
   fetch an override from the API at load. A breakage then becomes a config
   push, not a Web Store resubmission with days of review latency.
3. **Fail visibly, not silently.** If the adapter cannot find the player board,
   the bar shows "Cannot read the ESPN board" rather than rendering a confident
   empty state. The endpoint already returns 422 for this case.

State to extract per poll: available players (name, position, team, projection,
ADP), the user's roster, recent picks in order, current round/pick, and whether
the user is on the clock.

### Bar UI

Rendered into a **shadow root** so ESPN's stylesheet cannot leak in and ours
cannot leak out. Collapsed to a slim strip by default, expandable.

- Best-available list ranked by VOR, colour-coded by position (reuse
  `lib/dd/position-colors.ts` for consistency with the web draft room)
- Scarcity strip with per-position urgency
- Tier-cliff badge on players sitting above a steep drop
- Grade on the most recent pick
- "On the clock" emphasis state with the top suggestion and its reason
- AI chat panel (Premium/VIP), or the upgrade prompt returned by the endpoint

### Sync strategy

Poll the DOM on a `MutationObserver`, debounced. Only POST when the draft state
has actually changed — pick count, roster, or on-the-clock status. Respect the
`minSyncIntervalMs` the endpoint returns (5s free, 1s paid) so the throttle is
server-controlled rather than hard-coded client-side.

## 5. Known risks

**ESPN DOM brittleness** — the real ongoing maintenance cost. Mitigated by
semantic selectors and remote config, but expect to need occasional fixes. This
is inherent to the category; every competitor lives with it.

**Chrome Web Store review** — days to weeks, and an extension that reads another
site's pages needs a clear privacy justification. Recommendation: ship
load-unpacked to beta users immediately and submit to the store in parallel, so
the review clock runs while real users are already testing.

**ESPN terms of service** — the extension reads a page the user is already
authorised to view and sends no ESPN credentials anywhere. This is the same
posture as the established competitors, and none have been challenged. Worth a
deliberate decision rather than an assumption.

**Projection source** — v1 reads ESPN's own projections off the page, so the
analytics reflect ESPN's numbers. Feeding ValorOdds' `player-pool` projections
instead (or blending both, and showing the disagreement) is a natural v2 and
arguably the stronger differentiator.

## 6. Suggested build order for Phase A

1. Manifest, service worker, and auth round-trip — prove a signed-in call to
   `/api/dd/espn-sync` returns tier-correct data.
2. DOM adapter against a real ESPN mock draft; log extracted state, no UI yet.
   This de-risks the hardest part before any UI work.
3. Bar shell in a shadow root, rendering the board.
4. Scarcity, cliffs, pick grades.
5. AI panel, reusing the SSE parser from the web chat client.
6. Remote selector config and failure states.
7. Package, document load-unpacked, submit to the store.
