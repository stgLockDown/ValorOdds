#!/usr/bin/env python3
"""
Update NFL DEF and K projected_points to have differentiation based on vegas_score.
Currently all 32 DEF have projected_points = 5.0, which makes them indistinguishable
in the draft. This script generates differentiated projections.
"""
import os
import psycopg2
import math

DATABASE_URL = os.environ.get('DATABASE_URL')

if not DATABASE_URL:
    # Try loading from .env.local
    env_path = os.path.join(os.path.dirname(__file__), '..', '.env.local')
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, val = line.split('=', 1)
                    os.environ[key.strip()] = val.strip()
        DATABASE_URL = os.environ.get('DATABASE_URL')

if not DATABASE_URL:
    print("ERROR: DATABASE_URL not found")
    exit(1)

conn = psycopg2.connect(DATABASE_URL)
cur = conn.cursor()

# ── Update NFL DEF projected_points ──
# Use vegas_score to differentiate: higher vegas_score = better defense
# Top defenses ~ 8-10 pts, bottom defenses ~ 3-4 pts
# Formula: normalize vegas_score within DEF range, then scale to 3.5-9.5 range

cur.execute("""
    SELECT id, player_name, vegas_score, rank
    FROM dd_player_pool
    WHERE season_year = 2026 AND sport = 'NFL' AND position = 'DEF'
    ORDER BY vegas_score DESC
""")
def_rows = cur.fetchall()

if def_rows:
    scores = [float(r[2]) for r in def_rows if r[2] is not None]
    min_score = min(scores)
    max_score = max(scores)
    score_range = max_score - min_score if max_score > min_score else 1

    print(f"DEF: {len(def_rows)} players, vegas_score range: {min_score:.1f} - {max_score:.1f}")

    for idx, (pid, name, vegas_score, rank) in enumerate(def_rows):
        if vegas_score is None:
            proj = 5.0
        else:
            # Normalize 0-1, then scale to 4.0-9.5
            normalized = (float(vegas_score) - min_score) / score_range
            proj = round(4.0 + normalized * 5.5, 1)

        cur.execute(
            "UPDATE dd_player_pool SET projected_points = %s WHERE id = %s",
            (proj, pid)
        )

    print(f"Updated {len(def_rows)} DEF projected_points")

# ── Update NFL K projected_points ──
# Kickers: top kickers ~ 9-11 pts, bottom ~ 5-6 pts
cur.execute("""
    SELECT id, player_name, vegas_score, rank
    FROM dd_player_pool
    WHERE season_year = 2026 AND sport = 'NFL' AND position = 'K'
    ORDER BY vegas_score DESC
""")
k_rows = cur.fetchall()

if k_rows:
    scores = [float(r[2]) for r in k_rows if r[2] is not None]
    min_score = min(scores)
    max_score = max(scores)
    score_range = max_score - min_score if max_score > min_score else 1

    print(f"K: {len(k_rows)} players, vegas_score range: {min_score:.1f} - {max_score:.1f}")

    for idx, (pid, name, vegas_score, rank) in enumerate(k_rows):
        if vegas_score is None:
            proj = 7.0
        else:
            # Normalize 0-1, then scale to 5.5-10.5
            normalized = (float(vegas_score) - min_score) / score_range
            proj = round(5.5 + normalized * 5.0, 1)

        cur.execute(
            "UPDATE dd_player_pool SET projected_points = %s WHERE id = %s",
            (proj, pid)
        )

    print(f"Updated {len(k_rows)} K projected_points")

# ── Update MLB RP projected_points (similar issue check) ──
cur.execute("""
    SELECT position, COUNT(DISTINCT projected_points) as distinct_vals, COUNT(*) as total
    FROM dd_player_pool
    WHERE season_year = 2026 AND sport = 'MLB'
    GROUP BY position
    ORDER BY position
""")
mlb_check = cur.fetchall()
print("\nMLB projected_points distinctness check:")
for row in mlb_check:
    print(f"  {row[0]}: {row[1]} distinct values out of {row[2]} players")

# ── Verify the updates ──
cur.execute("""
    SELECT position, ROUND(MIN(projected_points)::numeric, 1) as min_pp,
           ROUND(MAX(projected_points)::numeric, 1) as max_pp,
           ROUND(AVG(projected_points)::numeric, 1) as avg_pp
    FROM dd_player_pool
    WHERE season_year = 2026 AND sport = 'NFL' AND position IN ('DEF', 'K')
    GROUP BY position
""")
result = cur.fetchall()
print("\nAfter update:")
for row in result:
    print(f"  {row[0]}: min={row[1]}, max={row[2]}, avg={row[3]}")

conn.commit()
cur.close()
conn.close()
print("\nDone!")
