# Valor Odds - Marketing Agent Update

## Phase 1: Backend Proxy for Claude API
- [x] Create `/api/ai/chat` proxy route that calls Anthropic API server-side
- [x] Register route in server/index.js
- [x] Use ANTHROPIC_API_KEY env var

## Phase 2: Update ValorMarketingAgent Component
- [x] Rename export from `App` to `ValorMarketingAgent`
- [x] Strip outer full-page wrapper, header, and sidebar
- [x] Add horizontal tab bar that works inside DashboardLayout
- [x] Update `callClaude` to use backend proxy instead of direct API call
- [x] Build and verify compilation

## Phase 3: Commit & Push
- [ ] Commit all changes
- [ ] Push to react-app branch