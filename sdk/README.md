# GLM Sports Analytics SDK 🏆

Python client SDK for the GLM Sports Analytics API. Call AI-powered sports analytics, odds analysis, and content generation from your platform with a single line of code.

---

## 📦 Install

```bash
# From the sdk directory
pip install -e .

# Or install just the dependency
pip install httpx
```

---

## ⚡ Quick Start

```python
from glm_sports import GLMSportsClient

client = GLMSportsClient(
    base_url="https://your-app.up.railway.app",
    api_key="your_service_api_key"  # optional
)

# Check API is alive
print(client.is_alive())  # True

# Generate a tweet from game data
tweet = client.tweet({"game": "Lakers vs Warriors", "score": "112-108"})
print(tweet)  # Ready-to-post tweet text

# Get value bets from odds
picks = client.best_bets(odds_data, sport="nba")
print(picks)

# Ask a sports question
answer = client.ask("Who has the best ATS record in the NFL?", sport="nfl")
print(answer.result)
```

---

## 🔧 Environment Variables (Recommended)

```bash
export GLM_BASE_URL=https://your-app.up.railway.app
export GLM_API_KEY=your_service_api_key
```

Then initialize with no arguments:
```python
client = GLMSportsClient()
```

---

## 📡 Full API Reference

### `client.analyze(data, context, output_format)`
Analyze sports data and get AI insights.

```python
result = client.analyze(
    data={"game": "Lakers vs Warriors", "score": "112-108", "lebron_pts": 34},
    context="NBA Playoffs",
    output_format="summary"   # summary | bullets | post | report
)
print(result.result)
print(result.model_used)
print(result.tokens_used)
```

---

### `client.summarize(data, platform, tone, max_length)`
Generate ready-to-post content.

```python
post = client.summarize(
    data=game_data,
    platform="twitter",      # twitter | instagram | discord | general
    tone="hype",             # informative | hype | analytical | casual
    max_length=280
)
print(post.result)
print(post.character_count)  # Auto-calculated
```

---

### `client.odds(odds_data, sport, analysis_type)`
Analyze sportsbook odds.

```python
analysis = client.odds(
    odds_data={"game": "Celtics vs Heat", "moneyline": {"cel": -220, "heat": +185}},
    sport="nba",
    analysis_type="value"    # value | prediction | comparison | movement
)
print(analysis.result)
```

---

### `client.ask(question, context, sport)`
Ask any sports question.

```python
answer = client.ask(
    question="Who is the MVP frontrunner?",
    context={"stats": [...]},  # optional data
    sport="nba"
)
print(answer.result)
```

---

### `client.espn(espn_data, report_type, platform)`
Process ESPN API data into publishable content.

```python
recap = client.espn(
    espn_data=espn_api_response,
    report_type="recap",     # recap | preview | standings | stats
    platform="discord"
)
print(recap.result)
```

---

### `client.batch(items, analysis_type, platform)`
Process up to 20 items at once.

```python
results = client.batch(
    items=[game1, game2, game3],
    analysis_type="summarize",  # summarize | analyze | odds
    platform="twitter"
)
for item in results:
    print(item)
```

---

## ⚡ Shortcut Methods

One-liners that return just the text string — no need to access `.result`:

```python
# Social media
tweet     = client.tweet(data, tone="hype")               # Twitter post
caption   = client.instagram_caption(data, tone="hype")   # Instagram caption
discord   = client.discord_post(data, tone="informative") # Discord message

# Sports content
recap     = client.game_recap(espn_data, platform="general")

# Betting
picks     = client.best_bets(odds_data, sport="nba")
preds     = client.predictions(odds_data, sport="nfl")
```

---

## 🔁 Context Manager

```python
with GLMSportsClient(base_url="https://your-app.up.railway.app") as client:
    tweet = client.tweet(game_data)
    print(tweet)
```

---

## 🛡️ Error Handling

```python
from glm_sports import GLMSportsClient, GLMAuthError, GLMRateLimitError, GLMAPIError

try:
    result = client.analyze(data)
except GLMAuthError:
    print("Check your SERVICE_API_KEY")
except GLMRateLimitError:
    print("Rate limited — wait and retry")
except GLMAPIError as e:
    print(f"API error {e.status_code}: {e.message}")
```

---

## 🔄 Retry Logic

The SDK automatically retries failed requests:

```python
client = GLMSportsClient(
    base_url="https://your-app.up.railway.app",
    timeout=60,         # Seconds before timeout
    max_retries=3,      # Number of retry attempts
    retry_delay=1.0     # Seconds between retries (multiplied by attempt number)
)
```

---

## 🏗️ Platform Integration Pattern

```python
def process_game_for_all_platforms(game_data: dict):
    client = GLMSportsClient()
    return {
        "twitter":   client.tweet(game_data, tone="hype"),
        "instagram": client.instagram_caption(game_data, tone="hype"),
        "discord":   client.discord_post(game_data, tone="informative"),
        "analysis":  client.analyze(game_data, output_format="report").result
    }
```