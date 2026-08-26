'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Loader2, AlertCircle, TrendingUp, Shield, Target, Zap, Activity,
  GraduationCap, MapPin, Calendar, Award, AlertTriangle,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Types — mirror the PlayerInfo interface from lib/dd/player-info.ts
// ─────────────────────────────────────────────────────────────────────────────

interface SeasonStat {
  value: string;
  displayName: string;
  perGame?: string;
}

interface SeasonStatLine {
  season: number;
  stats: Record<string, SeasonStat>;
}

interface PlayerInfo {
  poolId: string;
  playerName: string;
  team: string | null;
  position: string | null;
  sport: string;
  seasonYear: number;
  rank: number | null;
  tier: number | null;
  adp: number | null;
  projectedPoints: number | null;
  projection: Record<string, number> | null;
  isRookie: boolean;
  injuryStatus: string | null;
  vegasScore: number | null;
  vegasRank: number | null;
  espnId: string | null;
  headshot: string | null;
  height: string | null;
  weight: string | null;
  age: number | null;
  college: string | null;
  debutYear: number | null;
  experienceYears: number | null;
  birthPlace: string | null;
  jersey: string | null;
  careerStats: SeasonStatLine[];
  dbSeasonStats: {
    season: string;
    gamesPlayed: number;
    avgFantasyScore: number | null;
    totalFantasyScore: number | null;
    avgYards: number | null;
    avgTouchdowns: number | null;
    avgHomeRuns: number | null;
    avgRbis: number | null;
    avgStrikeouts: number | null;
    avgHits: number | null;
  } | null;
  aiAnalytics: string | null;
  aiError: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stat display helpers
// ─────────────────────────────────────────────────────────────────────────────

// Fantasy-relevant stat keys to extract for display
const NFL_STAT_KEYS: Record<string, string> = {
  gamesPlayed: 'GP',
  passingYards: 'Pass Yds',
  passingTouchdowns: 'Pass TD',
  interceptions: 'INT',
  rushingYards: 'Rush Yds',
  rushingTouchdowns: 'Rush TD',
  receptions: 'Rec',
  receivingYards: 'Rec Yds',
  receivingTouchdowns: 'Rec TD',
  passerRating: 'QBR',
  completionPercentage: 'CMP%',
};

const MLB_BATTING_KEYS: Record<string, string> = {
  gamesPlayed: 'GP',
  battingAverage: 'AVG',
  homeRuns: 'HR',
  runsBattedIn: 'RBI',
  hits: 'H',
  doubles: '2B',
  triples: '3B',
  stolenBases: 'SB',
  runs: 'R',
  onBasePercentage: 'OBP',
  sluggingPercentage: 'SLG',
};

const MLB_PITCHING_KEYS: Record<string, string> = {
  gamesPlayed: 'GP',
  era: 'ERA',
  wins: 'W',
  losses: 'L',
  saves: 'SV',
  strikeouts: 'K',
  inningsPitched: 'IP',
  whip: 'WHIP',
  battingAverage: 'AVG',
};

function getStatKeys(sport: string, stats: Record<string, SeasonStat>): Record<string, string> {
  if (sport === 'NFL') return NFL_STAT_KEYS;
  // MLB: determine if batting or pitching based on which stats are present
  const hasPitching = stats['era'] || stats['inningsPitched'] || stats['wins'] || stats['saves'];
  const hasBatting = stats['battingAverage'] || stats['homeRuns'] || stats['hits'] || stats['runsBattedIn'];
  if (hasPitching && !hasBatting) return MLB_PITCHING_KEYS;
  if (hasBatting && !hasPitching) return MLB_BATTING_KEYS;
  // If both or neither, show batting keys (default)
  return MLB_BATTING_KEYS;
}

// Projection stat labels for display
const PROJ_LABELS: Record<string, string> = {
  pass_yd: 'Pass Yds',
  pass_td: 'Pass TD',
  pass_int: 'INT',
  rush_yd: 'Rush Yds',
  rush_td: 'Rush TD',
  rec: 'Rec',
  rec_yd: 'Rec Yds',
  rec_td: 'Rec TD',
  fg: 'FG',
  xp: 'XP',
  H: 'Hits',
  HR: 'HR',
  RBI: 'RBI',
  R: 'Runs',
  SB: 'SB',
  BB: 'BB',
  '2B': '2B',
  '3B': '3B',
  K: 'K',
  IP: 'IP',
  K_p: 'K',
  W: 'W',
  L: 'L',
  SV: 'SV',
  ER: 'ER',
};

// ─────────────────────────────────────────────────────────────────────────────
// PlayerInfoCard component
// ─────────────────────────────────────────────────────────────────────────────

interface PlayerInfoCardProps {
  poolId: string;
  sport: string;
  seasonYear: number;
  playerName: string;
  position: string | null;
  team: string | null;
}

export function PlayerInfoCard({
  poolId,
  sport,
  seasonYear,
  playerName,
  position,
  team,
}: PlayerInfoCardProps) {
  const [info, setInfo] = useState<PlayerInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchedRef = useRef<string | null>(null);

  const fetchInfo = useCallback(async () => {
    // Avoid duplicate fetches for the same player
    if (fetchedRef.current === poolId) return;
    fetchedRef.current = poolId;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/dd/players/${poolId}/info`);
      const data = await res.json();
      if (res.ok) {
        setInfo(data);
      } else {
        setError(data.error || 'Failed to load player info');
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, [poolId]);

  // Reset fetch tracking when poolId changes
  useEffect(() => {
    if (fetchedRef.current !== poolId) {
      setInfo(null);
      setError(null);
    }
  }, [poolId]);

  // Render loading state
  if (loading) {
    return (
      <div className="w-[380px] p-5 bg-brand-surface border border-brand-border rounded-xl shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-full bg-brand-elevated animate-pulse" />
          <div className="flex-1">
            <div className="h-4 bg-brand-elevated rounded animate-pulse mb-2 w-32" />
            <div className="h-3 bg-brand-elevated rounded animate-pulse w-24" />
          </div>
        </div>
        <div className="space-y-2">
          <div className="h-3 bg-brand-elevated rounded animate-pulse" />
          <div className="h-3 bg-brand-elevated rounded animate-pulse w-4/5" />
          <div className="h-3 bg-brand-elevated rounded animate-pulse w-3/5" />
        </div>
        <div className="flex items-center justify-center mt-4 text-brand-muted text-xs">
          <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> Loading player data...
        </div>
      </div>
    );
  }

  // Render error state
  if (error && !info) {
    return (
      <div className="w-[380px] p-4 bg-brand-surface border border-brand-border rounded-xl shadow-2xl">
        <div className="flex items-center gap-2 text-brand-danger text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
        <div className="mt-3 text-sm">
          <div className="font-medium text-brand-text">{playerName}</div>
          <div className="text-xs text-brand-muted">{position} · {team}</div>
        </div>
      </div>
    );
  }

  if (!info) return null;

  const SportIcon = sport === 'NFL' ? Shield : Target;

  return (
    <div className="w-[380px] max-h-[480px] overflow-y-auto bg-brand-surface border border-brand-border rounded-xl shadow-2xl">
      {/* ── Header with headshot + identity ── */}
      <div className="p-4 border-b border-brand-border bg-gradient-card">
        <div className="flex items-start gap-3">
          {/* Headshot */}
          {info.headshot ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={info.headshot}
              alt={info.playerName}
              className="w-14 h-14 rounded-full object-cover border-2 border-brand-border shrink-0 bg-brand-elevated"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <div className="w-14 h-14 rounded-full bg-brand-elevated border-2 border-brand-border flex items-center justify-center shrink-0">
              <SportIcon className="w-6 h-6 text-brand-muted" />
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="font-bold text-brand-text truncate">{info.playerName}</h3>
              {info.jersey && (
                <span className="text-xs text-brand-muted">#{info.jersey}</span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5 text-xs text-brand-muted">
              <span className="px-1.5 py-0.5 rounded bg-brand-primary/20 text-brand-primaryText font-medium">
                {info.position || 'N/A'}
              </span>
              <span>{info.team || 'FA'}</span>
              {info.isRookie && (
                <span className="px-1.5 py-0.5 rounded bg-brand-accent/20 text-brand-accent font-medium">
                  Rookie
                </span>
              )}
            </div>
            {/* Injury status */}
            {info.injuryStatus && (
              <div className="flex items-center gap-1 mt-1 text-xs text-brand-danger">
                <AlertTriangle className="w-3 h-3" />
                <span>{info.injuryStatus}</span>
              </div>
            )}
          </div>

          {/* Rank badge */}
          {info.rank && (
            <div className="text-right shrink-0">
              <div className="text-2xl font-bold text-brand-primaryText">#{info.rank}</div>
              <div className="text-xs text-brand-muted">Tier {info.tier ?? '?'}</div>
            </div>
          )}
          {/* Vegas Rank badge */}
          {info.vegasRank != null && (
            <div className="text-right shrink-0 border-l border-brand-border pl-3 ml-1">
              <div className="text-2xl font-bold text-brand-accent">#{info.vegasRank}</div>
              <div className="text-xs text-brand-muted">Vegas Rank</div>
            </div>
          )}
        </div>

        {/* Quick bio row */}
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 text-xs text-brand-muted">
          {info.height && (
            <span className="flex items-center gap-1">
              <Activity className="w-3 h-3" /> {info.height}
            </span>
          )}
          {info.weight && <span>{info.weight}</span>}
          {info.age != null && (
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" /> {info.age} yrs
            </span>
          )}
          {info.experienceYears != null && !info.isRookie && (
            <span>{info.experienceYears} yr exp</span>
          )}
          {info.college && (
            <span className="flex items-center gap-1">
              <GraduationCap className="w-3 h-3" /> {info.college}
            </span>
          )}
          {info.birthPlace && (
            <span className="flex items-center gap-1">
              <MapPin className="w-3 h-3" /> {info.birthPlace}
            </span>
          )}
        </div>
      </div>

      {/* ── Draft metrics ── */}
      <div className="p-4 border-b border-brand-border">
        <div className="flex items-center gap-1.5 mb-2">
          <TrendingUp className="w-4 h-4 text-brand-primaryText" />
          <h4 className="text-xs font-semibold text-brand-muted uppercase tracking-wide">Draft Outlook</h4>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {info.projectedPoints != null && (
            <div className="bg-brand-elevated/50 rounded-lg p-2 text-center">
              <div className="text-lg font-bold text-brand-text">{info.projectedPoints.toFixed(1)}</div>
              <div className="text-xs text-brand-muted">Proj Pts/Game</div>
            </div>
          )}
          {info.adp != null && (
            <div className="bg-brand-elevated/50 rounded-lg p-2 text-center">
              <div className="text-lg font-bold text-brand-text">{info.adp}</div>
              <div className="text-xs text-brand-muted">Est. ADP</div>
            </div>
          )}
          {info.vegasScore != null && (
            <div className="bg-brand-accent/10 rounded-lg p-2 text-center">
              <div className="text-lg font-bold text-brand-accent">{info.vegasScore.toFixed(1)}</div>
              <div className="text-xs text-brand-muted">Vegas Score</div>
            </div>
          )}
          {info.debutYear && (
            <div className="bg-brand-elevated/50 rounded-lg p-2 text-center">
              <div className="text-lg font-bold text-brand-text">{info.debutYear}</div>
              <div className="text-xs text-brand-muted">Debut</div>
            </div>
          )}
        </div>
        {/* Projection breakdown */}
        {info.projection && Object.keys(info.projection).length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {Object.entries(info.projection)
              .filter(([, v]) => v !== 0)
              .slice(0, 6)
              .map(([key, val]) => (
                <span
                  key={key}
                  className="text-xs bg-brand-elevated/30 px-1.5 py-0.5 rounded text-brand-muted"
                >
                  {PROJ_LABELS[key] || key}: <span className="text-brand-text font-medium">{val}</span>
                </span>
              ))}
          </div>
        )}
      </div>

      {/* ── Recent season stats from ESPN ── */}
      {info.careerStats.length > 0 && (
        <div className="p-4 border-b border-brand-border">
          <div className="flex items-center gap-1.5 mb-2">
            <Award className="w-4 h-4 text-brand-accent" />
            <h4 className="text-xs font-semibold text-brand-muted uppercase tracking-wide">Recent Seasons</h4>
          </div>
          <div className="space-y-2">
            {info.careerStats.map((season) => {
              const statKeys = getStatKeys(info.sport, season.stats);
              const relevantStats = Object.entries(statKeys)
                .filter(([key]) => season.stats[key])
                .slice(0, 6);
              return (
                <div key={season.season}>
                  <div className="text-xs font-medium text-brand-primaryText mb-1">{season.season} Season</div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                    {relevantStats.map(([key, label]) => {
                      const stat = season.stats[key];
                      return (
                        <span key={key} className="text-brand-muted">
                          {label}: <span className="text-brand-text font-medium">{stat.value}</span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── DB season stats (fantasy-specific) ── */}
      {info.dbSeasonStats && (
        <div className="p-4 border-b border-brand-border">
          <div className="flex items-center gap-1.5 mb-2">
            <Zap className="w-4 h-4 text-brand-success" />
            <h4 className="text-xs font-semibold text-brand-muted uppercase tracking-wide">
              Fantasy Stats ({info.dbSeasonStats.season})
            </h4>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex justify-between bg-brand-elevated/30 px-2 py-1 rounded">
              <span className="text-brand-muted">Games</span>
              <span className="text-brand-text font-medium">{info.dbSeasonStats.gamesPlayed}</span>
            </div>
            {info.dbSeasonStats.avgFantasyScore != null && (
              <div className="flex justify-between bg-brand-elevated/30 px-2 py-1 rounded">
                <span className="text-brand-muted">Avg Pts/G</span>
                <span className="text-brand-text font-medium">{info.dbSeasonStats.avgFantasyScore.toFixed(1)}</span>
              </div>
            )}
            {info.dbSeasonStats.totalFantasyScore != null && (
              <div className="flex justify-between bg-brand-elevated/30 px-2 py-1 rounded">
                <span className="text-brand-muted">Total Pts</span>
                <span className="text-brand-text font-medium">{info.dbSeasonStats.totalFantasyScore.toFixed(1)}</span>
              </div>
            )}
            {info.dbSeasonStats.avgYards != null && (
              <div className="flex justify-between bg-brand-elevated/30 px-2 py-1 rounded">
                <span className="text-brand-muted">Avg Yds/G</span>
                <span className="text-brand-text font-medium">{info.dbSeasonStats.avgYards.toFixed(1)}</span>
              </div>
            )}
            {info.dbSeasonStats.avgTouchdowns != null && (
              <div className="flex justify-between bg-brand-elevated/30 px-2 py-1 rounded">
                <span className="text-brand-muted">Avg TD/G</span>
                <span className="text-brand-text font-medium">{info.dbSeasonStats.avgTouchdowns.toFixed(1)}</span>
              </div>
            )}
            {info.dbSeasonStats.avgHomeRuns != null && (
              <div className="flex justify-between bg-brand-elevated/30 px-2 py-1 rounded">
                <span className="text-brand-muted">Avg HR/G</span>
                <span className="text-brand-text font-medium">{info.dbSeasonStats.avgHomeRuns.toFixed(2)}</span>
              </div>
            )}
            {info.dbSeasonStats.avgRbis != null && (
              <div className="flex justify-between bg-brand-elevated/30 px-2 py-1 rounded">
                <span className="text-brand-muted">Avg RBI/G</span>
                <span className="text-brand-text font-medium">{info.dbSeasonStats.avgRbis.toFixed(1)}</span>
              </div>
            )}
            {info.dbSeasonStats.avgStrikeouts != null && (
              <div className="flex justify-between bg-brand-elevated/30 px-2 py-1 rounded">
                <span className="text-brand-muted">Avg K/G</span>
                <span className="text-brand-text font-medium">{info.dbSeasonStats.avgStrikeouts.toFixed(1)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── AI Analytics ── */}
      <div className="p-4">
        <div className="flex items-center gap-1.5 mb-2">
          <Zap className="w-4 h-4 text-brand-primaryText" />
          <h4 className="text-xs font-semibold text-brand-muted uppercase tracking-wide">AI Analytics</h4>
        </div>
        {info.aiAnalytics ? (
          <div className="text-sm text-brand-text/90 leading-relaxed space-y-2">
            {info.aiAnalytics.split('\n').filter((p) => p.trim()).map((para, i) => (
              <p key={i}>{para.trim()}</p>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-brand-muted">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>
              {info.aiError || 'AI analytics unavailable'}
              {info.aiError?.includes('provider') && ' — add OpenAI credits to enable'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
