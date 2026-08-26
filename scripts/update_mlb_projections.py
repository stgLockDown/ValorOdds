#!/usr/bin/env python3
"""
Update MLB projected_points to have better differentiation based on vegas_score.
Many positions have very few distinct projected_points values, making players
indistinguishable in the draft.
"""
import os
import psycopg2

DATABASE_URL = os.environ.get('DATABASE_URL')

if not DATABASE_URL:
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

# Position-specific projection ranges based on typical fantasy baseball scoring
# Hitters: projected points per game, top hitters ~ 8-12, average ~ 5-7, bench ~ 3-5
# SP: top aces ~ 12-18, mid ~ 7-10, back-end ~ 4-6
# RP: top closers ~ 7-10, middle ~ 5-7, bottom ~ 3-5
position_ranges = {
    'C':   (3.0, 10.0),
    '1B':  (4.0, 12.0),
    '2B':  (4.0, 11.0),
    '3B':  (4.0, 11.0),
    'SS':  (4.0, 12.0),
    'OF':  (3.5, 11.0),
    'DH':  (3.5, 10.0),
    'SP':  (4.0, 16.0),
    'RP':  (3.0, 9.0),
}

for position, (min_proj, max_proj) in position_ranges.items():
    cur.execute("""
        SELECT id, player_name, vegas_score, rank
        FROM dd_player_pool
        WHERE season_year = 2026 AND sport = 'MLB' AND position = %s
        ORDER BY vegas_score DESC
    """, (position,))
    rows = cur.fetchall()

    if not rows:
        continue

    scores = [float(r[2]) for r in rows if r[2] is not None]
    if not scores:
        continue
    min_score = min(scores)
    max_score = max(scores)
    score_range = max_score - min_score if max_score > min_score else 1

    updated = 0
    for pid, name, vegas_score, rank in rows:
        if vegas_score is None:
            proj = (min_proj + max_proj) / 2
        else:
            normalized = (float(vegas_score) - min_score) / score_range
            proj = round(min_proj + normalized * (max_proj - min_proj), 1)

        cur.execute(
            "UPDATE dd_player_pool SET projected_points = %s WHERE id = %s",
            (proj, pid)
        )
        updated += 1

    distinct_before = len(set(scores))
    print(f"{position}: updated {updated} players, vegas range {min_score:.1f}-{max_score:.1f}, proj range {min_proj}-{max_proj}")

conn.commit()

# Verify
cur.execute("""
    SELECT position, COUNT(DISTINCT projected_points) as distinct_vals,
           COUNT(*) as total, ROUND(MIN(projected_points)::numeric, 1) as min_pp,
           ROUND(MAX(projected_points)::numeric, 1) as max_pp
    FROM dd_player_pool
    WHERE season_year = 2026 AND sport = 'MLB'
    GROUP BY position ORDER BY position
""")
print("\nAfter update - MLB projected_points:")
for row in cur.fetchall():
    print(f"  {row[0]}: {row[1]} distinct / {row[2]} total, range {row[3]}-{row[4]}")

cur.close()
conn.close()
print("\nDone!")
