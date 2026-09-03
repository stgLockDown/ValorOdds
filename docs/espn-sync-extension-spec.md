# ESPN Sync Extension — Technical Specification

Status: **Phase B (backend) complete and tested. Phase A (extension) built — ESPN API auth approach.**

## 1. What this is

A browser extension that docks a bar into ESPN's fantasy draft room and overlays
live ValorOdds analytics on the draft as it happens: a Value Over Replacement
(VOR) ranked board, positional scarcity, tier-cliff warnings, grades on picks as
they are made, and — for Premium and VIP subscribers — an AI draft assistant
that answers questions with the live draft as context.

This mirrors the product category WalterPicks occupies, built on ValorOdds'
existing projection, scoring and entitlement infrastructure.

## 2. Architecture

The extension uses a **dual-auth model**: ESPN cookies authenticate against
ESPN's own Fantasy API to pull structured draft data, and the ValorOdds session
cookie authenticates against the ValorOdds API to compute analytics and gate by
tier. No ESPN credentials ever touch ValorOdds servers — the ESPN API calls
happen entirely within the extension's service worker, and only the parsed draft
snapshot is sent to ValorOdds.

```
  ESPN draft room (fantasy.espn.com)
  +----------------------------------------------------+
  |  content.js                                        |
  |  - injects and renders the bar UI (shadow root)    |
  |  - polls draft state via background.js             |
  |  - renders VOR board, scarcity, grades, AI panel   |
  +----------------------+-----------------------------+
                         | chrome.runtime.sendMessage
  +----------------------v-----------------------------+
  |  background.js (MV3 service worker)                |
  |                                                    |
  |  Step 1: read ESPN cookies via chrome.cookies API  |
  |    espn_s2  -> from fantasy.espn.com cookie jar    |
  |    SWID    -> from espnAuth cookie (JSON payload)  |
  |                                                    |
  |  Step 2: call ESPN Fantasy v3 API with cookies     |
  |    GET .../leagues/{id}?view=mDraftDetail          |
  |      -> picks, rounds, autodraft type, draft state |
  |    GET .../leagues/{id}?view=mSettings             |
  |      -> roster slots, num teams, scoring config    |
  |    GET .../players?view=kona_player_info           |
  |      -> full player pool + projections + ADP       |
  |                                                    |
  |  Step 3: send parsed snapshot to ValorOdds API     |
  |    POST /api/dd/espn-sync  (credentials: include)  |
  |      -> session cookie = user tier                 |
  |      -> returns VOR board, scarcity, suggestions   |
  |    POST /api/dd/espn-sync/chat  (SSE stream)       |
  |      -> Premium/VIP only, AI draft assistant       |
  +----------------------------------------------------+
```

Routing all traffic through the service worker matters for three reasons: the
ESPN cookies are read via the `chrome.cookies` API (only available to the
background context), the ValorOdds session cookie is attached automatically, and
the content script is never the origin of a cross-origin request, which keeps the
CORS surface to exactly the two ValorOdds endpoints.

### Why ESPN API instead of DOM scraping

The original spec planned to read the draft state from the ESPN draft room DOM.
Research into the established competitors (FantasyPros, Flock Fantasy, the
open-source dtcarls/ESPNExtension) revealed that they all use ESPN's own
Fantasy v3 API instead, authenticating with the user's `espn_s2` and `SWID`
cookies. This is strictly better for several reasons:

1. **Structured data, not brittle selectors.** ESPN ships obfuscated, hashed CSS
   class names that change without notice. The v3 API returns stable JSON with
   player IDs, positions, projections, ADP, and pick order — no DOM parsing, no
   selector breakage, no remote selector config needed.

2. **Complete player pool.** The `kona_player_info` view returns every draftable
   player with ESPN's projection and ADP in a single call. DOM scraping can only
   see what's currently rendered, which may be paginated or filtered.

3. **Full draft detail.** The `mDraftDetail` view returns the complete pick log
   (round, pick number, team, player, autodraft type) — the same data ESPN uses
   internally to render the draft room.

4. **League settings.** The `mSettings` view returns roster slots, number of
   teams, scoring config, and draft type — exactly what the VOR engine needs to
   compute replacement levels and scarcity, without the user having to manually
   configure anything.

5. **Same posture as competitors.** FantasyPros has been shipping this pattern
   since July 2020 with no ESPN enforcement action. The extension reads data the
   user is already authorised to see and sends no ESPN credentials to any third
   party.

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

## 4. ESPN Fantasy v3 API — the data source

### Authentication: ESPN cookies

When a user logs into ESPN (via the website or the ESPN app), two cookies are
set on `fantasy.espn.com` that serve as the authentication tokens for the
private Fantasy API:

| Cookie | Location | Format | Purpose |
|---|---|---|---|
| `espn_s2` | `fantasy.espn.com` | ~250-char opaque string | Primary session token |
| `espnAuth` | `fantasy.espn.com` | JSON containing `swid` field | SWID (software ID) identifier |

The extension reads these via the `chrome.cookies.get()` API (requires the
`cookies` permission and `*://*.espn.com/` host permission in the manifest).
The `SWID` value is extracted from the `espnAuth` cookie's JSON payload
(`JSON.parse(cookie.value).swid`), matching the pattern used by the open-source
dtcarls/ESPNExtension reference implementation.

These cookies persist across sessions — they do not change on each login — so
once the user is signed in to ESPN, the extension can read them without any
additional login step. The popup UI shows ESPN sign-in status and directs the
user to `fantasy.espn.com` if they are not yet authenticated.

### ESPN v3 API endpoints

The base URL (as of April 2024) is:

```
https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/{YEAR}/segments/0/leagues/{LEAGUE_ID}
```

All requests include the two cookies as `Cookie: espn_s2={...}; SWID={...}`
headers. The extension makes three calls per sync cycle:

**1. League settings + draft detail** (single call, multiple views):

```
GET .../leagues/{LEAGUE_ID}?view=mSettings&view=mDraftDetail&view=mTeam
```

The `mSettings` view returns `settings.rosterSettings.lineupSlotCounts` (the
roster slots and counts — e.g. `{"0": 1, "2": 2, "4": 1, "6": 1, "16": 1, "20": 6, "23": 1}`
where the keys are ESPN position IDs), `draftDetail.draftType` (snake/auction),
and the number of teams.

The `mDraftDetail` view returns `draftDetail.picks`, an array of all completed
picks in order, each containing:
- `roundId`, `roundPickNumber`, `overallPickNumber`
- `teamId` (which fantasy team made the pick)
- `playerId` (ESPN athlete ID)
- `autodraftType` (0=manual, 1=autopick, etc.)

The `mTeam` view returns each team's current roster, so the extension can
determine which players are already drafted and which are still available.

**2. Player pool** (separate call, large payload):

```
GET .../seasons/{YEAR}/players?view=kona_player_info&scoringPeriodId=0
```

With the `X-Fantasy-Filter` header to control sorting and limits:

```json
{"players":{"limit":2000,"sortPercOwned":{"sortPriority":4,"sortAsc":false}}}
```

This returns every draftable player with:
- `id` (ESPN athlete ID — cross-references `playerId` in draft picks)
- `fullName`, `defaultPositionId` / `defaultPosition` (position)
- `proTeamId` / `proTeam` (NFL team)
- `ratings` (ADP data: `0.averageDraftPosition`)
- `stats` (projected points for the current season, at index 0 with
  `scoringPeriodId=0` = preseason projections)
- `injuryStatus` (when applicable)

**3. League teams** (from the same `mTeam` call above):

The `teams` array in the `mTeam` response gives each fantasy team's roster,
which the extension uses to determine "my roster" (the user's team) and which
players are no longer available.

### ESPN position ID mapping

ESPN uses numeric position IDs in roster settings and player data:

```
 1 = QB       2 = RB       3 = WR       4 = TE
 5 = K        7 = IR       16 = D/ST    20 = BN (Bench)
23 = FLEX    12 = FLEX (WR/TE only, rare)
```

The extension maps these to ValorOdds position strings (`QB`, `RB`, `WR`, `TE`,
`K`, `DST`, `FLEX`) before sending the snapshot to the ValorOdds API.

### Draft state detection

The `mDraftDetail` response includes `draftDetail.draftedPlayerIds` (or the
`picks` array length) which tells the extension how many picks have been made.
The extension polls this every few seconds and only sends a new snapshot to
ValorOdds when the pick count has changed, avoiding unnecessary API calls.

The current on-the-clock team is determined by: `overallPickNumber = picks.length + 1`,
then finding which team owns that pick based on the draft order and snake/snake
round logic. ESPN's `mDraftDetail` may also include a `currentPick` or
`onClockTeamId` field in newer API versions.

## 5. Phase A — extension, built

### File layout

```
espn-sync-extension/
├── manifest.json          MV3 — cookies + storage perms, espn.com host perms
├── background.js          service worker: read ESPN cookies, call ESPN API, call ValorOdds API
├── espn-api.js            ESPN v3 API client: fetch draft detail, player pool, league settings
├── valorodds-api.js       ValorOdds API client: send snapshot, parse analytics, stream chat SSE
├── content.js             inject bar UI into ESPN draft room, poll draft state, render analytics
├── bar.css                shadow-DOM styles (ValorOdds brand colors)
├── popup.html             extension popup: ESPN sign-in status, ValorOdds account link
├── popup.js               popup logic: check ESPN cookie status, open ESPN login
├── icons/
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
└── README.md              install instructions, load-unpacked guide, troubleshooting
```

### `manifest.json`

```jsonc
{
  "manifest_version": 3,
  "name": "ValorOdds Draft Bar",
  "version": "1.0.0",
  "description": "Live VOR analytics and AI draft assistant for ESPN fantasy drafts",
  "permissions": ["cookies", "storage", "activeTab"],
  "host_permissions": [
    "*://*.espn.com/*",
    "https://valorodds.com/*"
  ],
  "background": { "service_worker": "background.js" },
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "32": "icons/icon32.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "content_scripts": [{
    "matches": ["https://fantasy.espn.com/football/draft*"],
    "js": ["content.js"],
    "css": ["bar.css"],
    "run_at": "document_idle"
  }],
  "icons": {
    "16": "icons/icon16.png",
    "32": "icons/icon32.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

### Auth flow — dual model

**ESPN side (draft data):**

1. User signs into ESPN at `fantasy.espn.com` (in the same browser profile
   where the extension is installed). This sets the `espn_s2` and `espnAuth`
   cookies.
2. The extension's popup shows "ESPN: Connected ✓" if the cookies are present,
   or "ESPN: Not signed in" with a button to open `fantasy.espn.com`.
3. The background service worker reads the cookies via `chrome.cookies.get()`
   on every sync cycle. If the cookies are missing or expired, it sends a
   "re-auth" message to the content script, which renders a sign-in prompt in
   the bar.

**ValorOdds side (analytics + tier):**

1. User signs into ValorOdds at `valorodds.com` as normal (in the same browser
   profile). This sets the session cookie.
2. The service worker calls `/api/dd/espn-sync` with `credentials: 'include'`;
   the session cookie authenticates it and the backend resolves the user's tier
   from the same session the website uses.
3. On 401 the bar renders a "Sign in to ValorOdds" state with a deep link.

No ESPN credentials (`espn_s2`, `SWID`) are ever sent to ValorOdds servers.
Only the parsed draft snapshot (player names, positions, projections, picks,
roster) is transmitted — the same information visible on the ESPN draft page.

### Bar UI

Rendered into a **shadow root** so ESPN's stylesheet cannot leak in and ours
cannot leak out. Collapsed to a slim strip by default, expandable.

- Best-available list ranked by VOR, colour-coded by position (the extension
  carries its own position→colour map matching `lib/dd/position-colors.ts`)
- Scarcity strip with per-position urgency
- Tier-cliff badge on players sitting above a steep drop
- Grade on the most recent pick (A+…F with colour coding)
- "On the clock" emphasis state with the top suggestion and its reason
- AI chat panel (Premium/VIP), or the upgrade prompt returned by the endpoint
- ESPN connection status indicator (green dot when cookies are valid)

### Sync strategy

The content script triggers a sync every 5 seconds (free tier) or 1 second
(paid tier — the interval is returned by the ValorOdds API as
`minSyncIntervalMs`). On each cycle:

1. Content script sends `{ type: 'SYNC', leagueId, seasonId, myTeamId }` to the
   background service worker.
2. Background reads ESPN cookies, calls ESPN API for draft detail + player pool.
3. Background parses the ESPN response into a `DraftSnapshot` (available players,
   picks, rosters, roster slots, num teams).
4. Background sends the snapshot to `POST /api/dd/espn-sync` with ValorOdds
   credentials.
5. Background returns the VOR analytics to the content script.
6. Content script renders the bar UI.

If the pick count hasn't changed since the last sync, steps 3–6 are skipped (the
analytics are already current for the same pool). This keeps the ESPN API call
frequency low — typically once every few seconds during an active draft, and
never when no pick has been made.

## 6. Known risks

**ESPN cookie expiry** — the `espn_s2` and `SWID` cookies persist across
sessions but can expire (typically after weeks/months). The extension detects
this when ESPN API calls return 401/403 and prompts the user to re-sign-in at
ESPN. This is the same experience FantasyPros users have.

**ESPN API rate limits** — ESPN does not publish rate limits for the Fantasy API,
but the extension's sync strategy (only call when pick count changes, minimum
1s interval) keeps request volume well within what a normal user browsing their
draft room would generate. Competitors have not reported issues.

**Chrome Web Store review** — days to weeks, and an extension that reads cookies
from another site needs a clear privacy justification. The privacy policy must
state that ESPN cookies are read locally in the browser, used only to call
ESPN's own API, and never transmitted to any third party. Recommendation: ship
load-unpacked to beta users immediately and submit to the store in parallel.

**ESPN terms of service** — the extension reads data the user is already
authorised to view and sends no ESPN credentials anywhere. This is the same
posture as the established competitors (FantasyPros since 2020, Flock Fantasy,
TFN Connect), and none have been challenged. Worth a deliberate decision rather
than an assumption.

**ESPN API changes** — ESPN has changed the base URL twice (from
`fantasy.espn.com/apis/v3` to `lm-api-reads.fantasy.espn.com/apis/v3` in April
2024). The extension's ESPN API client is isolated in `espn-api.js` so a URL
change is a one-file fix that can be pushed as a config update without touching
the analytics or UI code.

**Projection source** — v1 uses ESPN's own projections (from the `kona_player_info`
stats field), so the analytics reflect ESPN's numbers. Feeding ValorOdds'
`player-pool` projections instead (or blending both, and showing the
disagreement) is a natural v2 and arguably the stronger differentiator.

## 7. Privacy and security

**What the extension reads:**
- ESPN cookies (`espn_s2`, `espnAuth`) from the browser's cookie jar for
  `fantasy.espn.com` — used solely to authenticate ESPN API calls.
- ESPN Fantasy API responses (league settings, draft picks, player pool) —
  the same data visible on the ESPN draft page.

**What the extension sends to ValorOdds:**
- A parsed draft snapshot: player names, positions, teams, projected points,
  ADP, the pick log, and the user's roster. No ESPN credentials, no ESPN
  cookies, no personally identifying information from ESPN.
- The ValorOdds session cookie (automatically, via `credentials: 'include'`)
  — this authenticates the user and resolves their subscription tier.

**What the extension never does:**
- Transmits `espn_s2` or `SWID` to ValorOdds or any third party.
- Writes to the ESPN cookies (read-only access).
- Makes any POST/PUT/DELETE calls to ESPN's API (read-only GET).
- Stores ESPN credentials beyond the browser's own cookie jar.

This is the same privacy posture that has allowed FantasyPros, Flock Fantasy,
and other competitors to operate Chrome Web Store extensions for years.
