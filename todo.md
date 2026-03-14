# Today's Opportunities - Live Data from Bot DB

## Backend API Routes
- [ ] Create server/routes/opportunities.js with endpoints:
  - GET /api/opportunities/arbitrage (recent arb opportunities from arbitrage_opportunities table)
  - GET /api/opportunities/player-props (player stats from player_stats table)  
  - GET /api/opportunities/ai-analysis (AI analysis from ai_analysis table)
  - GET /api/opportunities/games (today's games from games table)
- [ ] Register routes in server/index.js

## Frontend Components
- [ ] Create OpportunitiesSection React component that fetches live data
- [ ] Update HomePage.jsx to use live OpportunitiesSection instead of hardcoded examples
- [ ] Add loading states and empty-state fallbacks
- [ ] Style to match existing design

## Build & Deploy
- [ ] Build React app
- [ ] Commit and push to react-app branch