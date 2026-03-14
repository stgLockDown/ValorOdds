# GLM Sports Analytics API 🏆

AI-powered sports analytics, odds analysis, and content generation — powered by **Groq + Llama 3.3 70B**. Deploy on Railway in minutes.

---

## 🚀 What It Does

Your platform sends sports data → API runs it through AI → Returns ready-to-post summaries, analytics, and odds insights.

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Railway health check |
| `GET` | `/` | API info & available endpoints |
| `POST` | `/analyze` | Analyze sports data, get AI insights |
| `POST` | `/summarize` | Generate ready-to-post content |
| `POST` | `/odds` | Sportsbook odds analysis & value picks |
| `POST` | `/ask` | Ask any sports question |
| `POST` | `/espn` | Process ESPN data into content |
| `POST` | `/batch` | Process up to 20 items at once |

---

## ⚡ Deploy on Railway

### 1. Fork / Clone this repo

### 2. Create a new Railway project
- Go to [railway.app](https://railway.app)
- Click **New Project** → **Deploy from GitHub repo**
- Select `stgLockDown/GLM`

### 3. Set Environment Variables in Railway
```
GROQ_API_KEY=your_groq_api_key        # Required - get free at console.groq.com
SERVICE_API_KEY=your_secret_key        # Optional - protects your endpoints
```

### 4. Deploy
Railway auto-detects the Dockerfile and deploys. Your API will be live at:
```
https://your-project.up.railway.app
```

---

## 📡 API Usage Examples

### Analyze Sports Data
```bash
curl -X POST https://your-app.up.railway.app/analyze \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your_service_key" \
  -d '{
    "data": {
      "game": "Lakers vs Warriors",
      "score": "112-108",
      "lebron_points": 34,
      "curry_points": 28,
      "quarter_scores": [28,25,30,29]
    },
    "context": "NBA Playoffs Game 5",
    "output_format": "summary"
  }'
```

### Generate a Twitter Post
```bash
curl -X POST https://your-app.up.railway.app/summarize \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "game": "Chiefs vs Eagles",
      "final_score": "27-21",
      "mahomes_yards": 320,
      "touchdowns": 3
    },
    "platform": "twitter",
    "tone": "hype",
    "max_length": 280
  }'
```

### Analyze Sportsbook Odds
```bash
curl -X POST https://your-app.up.railway.app/odds \
  -H "Content-Type: application/json" \
  -d '{
    "odds_data": {
      "game": "Celtics vs Heat",
      "spread": {"celtics": -5.5, "heat": +5.5},
      "moneyline": {"celtics": -220, "heat": +185},
      "total": {"over": 214.5, "under": 214.5}
    },
    "sport": "nba",
    "analysis_type": "value"
  }'
```

### Ask a Sports Question
```bash
curl -X POST https://your-app.up.railway.app/ask \
  -H "Content-Type: application/json" \
  -d '{
    "question": "Who has the best ATS record in the NFL this season?",
    "sport": "nfl"
  }'
```

### Process ESPN Data
```bash
curl -X POST https://your-app.up.railway.app/espn \
  -H "Content-Type: application/json" \
  -d '{
    "espn_data": { "...your raw ESPN API response..." },
    "report_type": "recap",
    "platform": "discord"
  }'
```

### Batch Process Multiple Games
```bash
curl -X POST "https://your-app.up.railway.app/batch?analysis_type=summarize&platform=twitter" \
  -H "Content-Type: application/json" \
  -d '[
    {"game": "Lakers vs Warriors", "score": "112-108"},
    {"game": "Celtics vs Heat", "score": "98-95"},
    {"game": "Nuggets vs Suns", "score": "118-102"}
  ]'
```

---

## 🔧 Output Formats

### `/analyze` output_format options
- `summary` — Concise analytical summary
- `bullets` — Key points in bullet format
- `post` — Ready-to-publish social post
- `report` — Full detailed report

### `/summarize` platform options
- `twitter` — Max 280 chars, hashtags
- `instagram` — Longer, emojis, caption style
- `discord` — Markdown formatting
- `general` — Clean, universal format

### `/summarize` tone options
- `informative` — Factual and clear
- `hype` — High energy, fan-focused
- `analytical` — Deep stats focus
- `casual` — Conversational

### `/odds` analysis_type options
- `value` — Find mispriced lines & best value bets
- `prediction` — AI picks with confidence levels
- `comparison` — Compare lines across books
- `movement` — Line movement analysis

### `/espn` report_type options
- `recap` — Post-game recap
- `preview` — Pre-game preview & predictions
- `standings` — Standings analysis
- `stats` — Statistical breakdown

---

## 🛡️ Security

Set `SERVICE_API_KEY` in Railway environment variables to protect your endpoints.
Send it in every request header:
```
X-API-Key: your_secret_service_key
```

---

## 🤖 AI Models Used

| Model | Used For |
|-------|----------|
| `llama-3.3-70b-versatile` | Primary — analysis, summaries, ESPN content |
| `deepseek-r1-distill-llama-70b` | Odds analysis — better math/reasoning |
| `llama-3.1-8b-instant` | Fallback — fast responses when needed |

All models are **free** via [Groq](https://console.groq.com).

---

## 📖 Interactive Docs

Once deployed, visit:
```
https://your-app.up.railway.app/docs
```
Full Swagger UI for testing all endpoints interactively.

---

Built with ❤️ using FastAPI + Groq + Llama 3.3 70B