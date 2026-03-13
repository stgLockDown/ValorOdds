# Valor Odds React App - Build & Deploy

## [x] Setup
- [x] Clone stgLockDown/ValorOdds repo
- [x] Create react-app branch
- [x] Remove old static files

## [x] Backend (Express + PostgreSQL)
- [x] server/package.json with dependencies
- [x] server/index.js - Express server serving React build + API
- [x] server/config/db.js - PostgreSQL with auto-init tables + admin
- [x] server/middleware/auth.js - JWT + admin middleware
- [x] server/routes/auth.js - register/login/me endpoints

## [x] Frontend (React 18)
- [x] public/index.html - React shell with fonts
- [x] src/index.js + src/index.css - Entry point + global styles
- [x] src/context/AuthContext.js - Auth provider
- [x] src/App.js - Router with protected routes
- [x] src/components/Login.jsx
- [x] src/components/Signup.jsx
- [x] src/components/Dashboard.jsx - Full dashboard with branding
- [x] src/components/ValorMarketingAgent.jsx - Admin-only 7-tab tool

## [x] Railway Deployment Config
- [x] nixpacks.toml - Build config
- [x] railway.json - Deploy config with health check
- [x] .env.example - Environment variable docs
- [x] .gitignore

## [x] Build & Push
- [x] Install npm dependencies (root + server)
- [x] Fix JSX syntax errors (quote escaping)
- [x] Build React app successfully
- [x] Commit and push react-app branch to GitHub