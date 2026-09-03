# ValorOdds Draft Bar — ESPN Fantasy Draft Extension

A Chrome extension that overlays a real-time analytics bar on the ESPN Fantasy Football draft room, giving you live VOR (Value Over Replacement) rankings, pick grades, positional scarcity alerts, and an AI draft assistant — all powered by your ValorOdds subscription.

## How It Works

The extension uses a **dual-authentication model**:

1. **ESPN credentials** — You sign into ESPN at `fantasy.espn.com`. The extension reads your `espn_s2` and `SWID` cookies from the browser's cookie jar (via the `chrome.cookies` API) and uses them to call ESPN's private Fantasy v3 API. This gives us structured draft data (picks, roster settings, full player pool with projections and ADP) — no DOM scraping required. **Your ESPN cookies never leave your browser.**

2. **ValorOdds session** — You sign into your ValorOdds account at `valorodds.com`. The extension sends the draft snapshot to the ValorOdds API using `credentials: 'include'`, which attaches your ValorOdds session cookie. The backend uses this to resolve your subscription tier and gate features accordingly (Free, Basic, Premium, VIP).

### Data Flow

```
ESPN Fantasy API               Chrome Extension                ValorOdds API
─────────────────              ──────────────────              ─────────────
                 ── cookies ──►  background.js
 mDraftDetail  ◄──────────────  (ESPN API calls)
 mSettings                     │
 kona_player_info               ├─ snapshot ──►  /api/dd/espn-sync
 mTeam                          │                    │
                               content.js  ◄──────  analytics (VOR board,
                               (renders bar)         scarcity, grades, AI)
                                  ▲
                                  │ chat chunks
                               background.js  ──►  /api/dd/espn-sync/chat (SSE)
```

## Features by Tier

| Feature | Free | Basic | Premium | VIP |
|---|---|---|---|---|
| Draft bar overlay | ✅ | ✅ | ✅ | ✅ |
| Live pick tracking | ✅ | ✅ | ✅ | ✅ |
| VOR board (top available) | — | ✅ | ✅ | ✅ |
| Positional scarcity alerts | — | ✅ | ✅ | ✅ |
| Dropoff cliffs | — | ✅ | ✅ | ✅ |
| Pick grades (A–F) | — | ✅ | ✅ | ✅ |
| Unfilled starter alerts | — | ✅ | ✅ | ✅ |
| AI Draft Assistant (chat) | — | — | ✅ | ✅ |

## Installation (Developer / Load Unpacked)

Since this extension is not yet on the Chrome Web Store, you install it in developer mode:

1. **Download the extension files** — all files in the `espn-sync-extension/` directory.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Toggle **Developer mode** on (top-right corner).
4. Click **Load unpacked**.
5. Select the `espn-sync-extension/` folder.
6. The ValorOdds Draft Bar icon will appear in your toolbar.

### Setup

1. **Sign into ESPN** — Go to [fantasy.espn.com](https://fantasy.espn.com) and sign in. The extension needs your ESPN session cookies to read your draft data.
2. **Sign into ValorOdds** — Go to [valorodds.com](https://valorodds.com) and sign in. This authenticates you for analytics and determines your subscription tier.
3. **Click the extension icon** — The popup will show your connection status. If both ESPN and ValorOdds show "Connected," you're ready.
4. **Select your league** — In the popup, choose your ESPN fantasy league from the dropdown and set the season year. Click **Save & Sync**.
5. **Open your draft room** — Navigate to your ESPN draft room. The ValorOdds bar will appear at the bottom of the page automatically.

## Using the Draft Bar

- **VOR Board** — Shows the top available players by Value Over Replacement. Scroll horizontally to see more.
- **Pick Grade** — After each pick, a letter grade (A–F) appears showing how good the last pick was relative to VOR.
- **Scarcity Alert** — Warns when a position is running low (e.g., "WR: only 3 starters left").
- **Unfilled Starters** — Shows which roster slots you still need to fill.
- **On the Clock** — A pulsing indicator lets you know when it's your turn to pick.
- **Sync button** — Manually trigger a sync. The bar also auto-syncs every 3 seconds during the draft.
- **AI Assistant** — Click the **▲** button to expand the panel. Type a question and the AI will stream a response with draft advice, player comparisons, and strategy tips. *(Premium/VIP only.)*

## File Structure

```
espn-sync-extension/
├── manifest.json       — MV3 manifest (permissions, content scripts, service worker)
├── background.js       — Service worker: message router, ESPN API calls, ValorOdds sync
├── espn-api.js         — ESPN Fantasy v3 API client (cookie auth, draft snapshot builder)
├── valorodds-api.js    — ValorOdds API client (draft sync, AI chat SSE streaming)
├── content.js          — Content script: Shadow DOM bar injection, rendering, polling
├── bar.css             — Bar styles (scoped inside Shadow DOM, ValorOdds brand colors)
├── popup.html          — Extension popup UI (auth status, league selector, settings)
├── popup.js            — Popup logic (auth checks, league loading, config save)
├── icons/              — Extension icons (16, 32, 48, 128 px)
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
└── README.md           — This file
```

## Privacy & Security

- **ESPN cookies stay local.** The extension reads `espn_s2` and `SWID` from the browser cookie jar to make ESPN API calls from the service worker. These cookies are never transmitted to ValorOdds or any third party.
- **ValorOdds only receives the draft snapshot.** The snapshot contains: league roster settings, the list of drafted players (pick order, player names/positions/teams), and your current roster. No ESPN credentials, no personal ESPN account info.
- **No data is stored externally.** Sync state (league ID, last pick count) is stored in `chrome.storage.local` on your device only.
- **No tracking.** The extension does not inject analytics, ads, or tracking pixels.

## Development

### Local Development

To point the extension at a local ValorOdds dev server instead of production:

1. Edit `valorodds-api.js` and change `VALORODDS_API_BASE`:
   ```js
   const VALORODDS_API_BASE = 'http://localhost:3000';
   ```
2. Edit `manifest.json` and ensure `http://localhost:3000/*` is in `host_permissions` (it is by default).
3. Reload the extension in `chrome://extensions/`.

### Backend API

The extension communicates with two ValorOdds endpoints:

- **`POST /api/dd/espn-sync`** — Sends the draft snapshot, returns analytics (VOR board, scarcity, suggestions, pick grades, feature flags).
- **`POST /api/dd/espn-sync/chat`** — Sends a chat message + snapshot, returns an SSE stream with AI draft advice.

Both endpoints validate the input via Zod, resolve the user's subscription tier, and redact premium fields for lower tiers.

### ESPN API Endpoints Used

- **`/seasons/{year}/segments/0/leagues/{leagueId}?view=mDraftDetail`** — Draft picks, rounds, autodraft settings
- **`/seasons/{year}/segments/0/leagues/{leagueId}?view=mSettings`** — Roster slot configuration, scoring, team count
- **`/seasons/{year}/segments/0/leagues/{leagueId}?view=mTeam`** — Team rosters
- **`/seasons/{year}?view=kona_player_info`** — Full player pool with projections and ADP (filtered via `X-Fantasy-Filter` header)

## Troubleshooting

**"Sign in to ESPN"** — Your ESPN session has expired. Go to [fantasy.espn.com](https://fantasy.espn.com) and sign in again, then click **Refresh Status** in the popup.

**"Sign in to ValorOdds"** — You're not authenticated with ValorOdds. Go to [valorodds.com](https://valorodds.com) and sign in. You need at least a Basic subscription to see analytics.

**"No leagues found"** — Make sure you've set the correct season year in the popup. The extension only shows leagues for the selected season.

**Bar not appearing on draft page** — Make sure you're on a URL starting with `https://fantasy.espn.com/football/draft`. Try reloading the page. Check `chrome://extensions/` for errors.

**AI chat is disabled** — AI Draft Assistant is a Premium/VIP feature. Upgrade at [valorodds.com/pricing](https://valorodds.com/pricing).

**Partial ESPN auth (missing SWID)** — Some ESPN accounts set the SWID cookie differently. Try signing out and back in at ESPN. If the issue persists, check that both `espn_s2` and `espnAuth` cookies are present for `fantasy.espn.com` in your browser's cookie settings.

## License

Proprietary — © ValorOdds. All rights reserved.
