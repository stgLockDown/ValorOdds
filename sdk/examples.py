"""
GLM Sports Analytics SDK — Usage Examples
Shows exactly how your platform can use the SDK to call the API
"""

import os
from glm_sports import GLMSportsClient

# ── Initialize the client ─────────────────────────────────────────────────────
# Option 1: Pass directly
client = GLMSportsClient(
    base_url="https://your-app.up.railway.app",
    api_key="your_service_api_key"   # optional if SERVICE_API_KEY not set
)

# Option 2: Use environment variables (recommended for production)
# export GLM_BASE_URL=https://your-app.up.railway.app
# export GLM_API_KEY=your_service_api_key
# client = GLMSportsClient()

# Option 3: Context manager
# with GLMSportsClient(base_url="https://your-app.up.railway.app") as client:
#     result = client.ask("Who won the NBA Finals?")


# ── 1. Health Check ────────────────────────────────────────────────────────────
print("=== Health Check ===")
if client.is_alive():
    print("✅ API is running")
else:
    print("❌ API is down")


# ── 2. Analyze a Game ─────────────────────────────────────────────────────────
print("\n=== Analyze Game Data ===")
game_data = {
    "game": "Lakers vs Warriors",
    "date": "2024-01-15",
    "final_score": {"lakers": 112, "warriors": 108},
    "stats": {
        "lebron": {"points": 34, "assists": 11, "rebounds": 8},
        "curry": {"points": 28, "assists": 6, "threes": 5},
        "ad":    {"points": 22, "rebounds": 14, "blocks": 3}
    },
    "quarter_scores": [28, 25, 30, 29]
}

analysis = client.analyze(
    data=game_data,
    context="NBA Regular Season",
    output_format="summary"
)
print(analysis.result)
print(f"Model: {analysis.model_used} | Tokens: {analysis.tokens_used}")


# ── 3. Generate a Tweet ───────────────────────────────────────────────────────
print("\n=== Generate Tweet ===")
tweet_text = client.tweet(game_data, tone="hype")
print(f"Tweet ({len(tweet_text)} chars): {tweet_text}")

# Or with full control:
tweet = client.summarize(
    data=game_data,
    platform="twitter",
    tone="hype",
    max_length=280
)
print(f"Tweet: {tweet.result}")
print(f"Character count: {tweet.character_count}")


# ── 4. Generate an Instagram Caption ─────────────────────────────────────────
print("\n=== Instagram Caption ===")
caption = client.instagram_caption(game_data, tone="hype")
print(caption)


# ── 5. Discord Post ───────────────────────────────────────────────────────────
print("\n=== Discord Post ===")
discord_msg = client.discord_post(game_data, tone="analytical")
print(discord_msg)


# ── 6. Analyze Sportsbook Odds ────────────────────────────────────────────────
print("\n=== Odds Analysis ===")
odds_data = {
    "game": "Celtics vs Heat",
    "date": "2024-01-16",
    "spread": {
        "celtics": {"line": -5.5, "juice": -110},
        "heat":    {"line": +5.5, "juice": -110}
    },
    "moneyline": {
        "celtics": -220,
        "heat":    +185
    },
    "total": {
        "line": 214.5,
        "over_juice": -112,
        "under_juice": -108
    },
    "books": {
        "draftkings": {"celtics_ml": -215, "heat_ml": +180},
        "fanduel":    {"celtics_ml": -225, "heat_ml": +190},
        "betmgm":     {"celtics_ml": -210, "heat_ml": +175}
    }
}

# Find value bets
value_picks = client.best_bets(odds_data, sport="nba")
print("Value Picks:")
print(value_picks)

# Get predictions
predictions = client.predictions(odds_data, sport="nba")
print("\nPredictions:")
print(predictions)

# Full odds analysis with comparison
comparison = client.odds(
    odds_data=odds_data,
    sport="nba",
    analysis_type="comparison"
)
print("\nBook Comparison:")
print(comparison.result)


# ── 7. Ask a Sports Question ──────────────────────────────────────────────────
print("\n=== Ask Questions ===")

# Simple question
answer = client.ask(
    question="What are the key factors to look for when betting on NBA totals?",
    sport="nba"
)
print(answer.result)

# Question with data context
player_stats = {
    "players": [
        {"name": "Luka Doncic",   "ppg": 34.2, "rpg": 9.8,  "apg": 9.1},
        {"name": "SGA",           "ppg": 31.8, "rpg": 5.5,  "apg": 6.2},
        {"name": "Jayson Tatum",  "ppg": 27.4, "rpg": 8.3,  "apg": 4.9},
        {"name": "Giannis",       "ppg": 30.1, "rpg": 11.5, "apg": 6.0},
    ]
}
mvp_take = client.ask(
    question="Based on these stats, who is the strongest MVP candidate and why?",
    context=player_stats,
    sport="nba"
)
print(mvp_take.result)


# ── 8. Process ESPN Data ──────────────────────────────────────────────────────
print("\n=== ESPN Data Processing ===")

# Simulated ESPN API response
espn_data = {
    "header": {
        "competitions": [{
            "competitors": [
                {"team": {"displayName": "Kansas City Chiefs"}, "score": "27", "homeAway": "home"},
                {"team": {"displayName": "Philadelphia Eagles"}, "score": "21", "homeAway": "away"}
            ],
            "status": {"type": {"completed": True}},
            "date": "2024-01-21"
        }]
    },
    "boxscore": {
        "players": [
            {
                "team": {"displayName": "Chiefs"},
                "statistics": [{
                    "athletes": [
                        {"athlete": {"displayName": "Patrick Mahomes"},
                         "stats": ["320", "3", "1", "28/42"]}
                    ]
                }]
            }
        ]
    }
}

# Game recap
recap = client.game_recap(espn_data, platform="discord")
print("Game Recap:")
print(recap)

# Game preview style
preview = client.espn(
    espn_data=espn_data,
    report_type="preview",
    platform="twitter"
)
print("\nPreview Post:")
print(preview.result)


# ── 9. NFL Odds Example ───────────────────────────────────────────────────────
print("\n=== NFL Odds ===")
nfl_odds = {
    "week": 18,
    "games": [
        {
            "matchup": "Chiefs vs Raiders",
            "spread": {"chiefs": -7.5, "raiders": +7.5},
            "moneyline": {"chiefs": -320, "raiders": +260},
            "total": 47.5
        },
        {
            "matchup": "Cowboys vs Eagles",
            "spread": {"cowboys": -3, "eagles": +3},
            "moneyline": {"cowboys": -165, "eagles": +140},
            "total": 44.5
        },
        {
            "matchup": "49ers vs Rams",
            "spread": {"49ers": -6, "rams": +6},
            "moneyline": {"49ers": -250, "rams": +205},
            "total": 46.0
        }
    ]
}

nfl_picks = client.best_bets(nfl_odds, sport="nfl")
print(nfl_picks)


# ── 10. Batch Process Multiple Games ─────────────────────────────────────────
print("\n=== Batch Processing ===")
games_today = [
    {"game": "Lakers vs Warriors",  "score": "112-108", "sport": "NBA"},
    {"game": "Celtics vs Heat",     "score": "98-95",   "sport": "NBA"},
    {"game": "Nuggets vs Suns",     "score": "118-102", "sport": "NBA"},
    {"game": "Chiefs vs Raiders",   "score": "31-17",   "sport": "NFL"},
    {"game": "Cowboys vs Eagles",   "score": "24-20",   "sport": "NFL"},
]

batch_results = client.batch(
    items=games_today,
    analysis_type="summarize",
    platform="twitter"
)

print(f"Processed {len(batch_results)} games:")
for item in batch_results.results:
    print(f"\n[Game {item['index'] + 1}]")
    print(item['output'].get('result', 'N/A'))


# ── 11. Real-world Platform Integration ──────────────────────────────────────
print("\n=== Platform Integration Pattern ===")

def process_and_post(game_data: dict, platforms: list):
    """
    Example: How your platform would process game data and post to multiple platforms
    """
    results = {}

    for platform in platforms:
        try:
            if platform == "twitter":
                results["twitter"] = client.tweet(game_data, tone="hype")
            elif platform == "instagram":
                results["instagram"] = client.instagram_caption(game_data, tone="hype")
            elif platform == "discord":
                results["discord"] = client.discord_post(game_data, tone="informative")
            else:
                summary = client.summarize(game_data, platform=platform)
                results[platform] = summary.result
        except Exception as e:
            results[platform] = f"Error: {e}"

    return results

# Usage
posts = process_and_post(
    game_data={"game": "Lakers vs Warriors", "score": "112-108", "mvp": "LeBron James 34pts"},
    platforms=["twitter", "instagram", "discord"]
)

for platform, content in posts.items():
    print(f"\n--- {platform.upper()} ---")
    print(content)