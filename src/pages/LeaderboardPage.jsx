import React from 'react';

const MOCK_LEADERS = [
  { rank: 1, name: 'SharpBettor99', tier: 'vip', wins: 142, winRate: 68, profit: 4250 },
  { rank: 2, name: 'ArbKing', tier: 'vip', wins: 128, winRate: 65, profit: 3800 },
  { rank: 3, name: 'DataDriven', tier: 'premium', wins: 115, winRate: 62, profit: 3200 },
  { rank: 4, name: 'PropMaster', tier: 'premium', wins: 98, winRate: 60, profit: 2700 },
  { rank: 5, name: 'ValueHunter', tier: 'premium', wins: 87, winRate: 58, profit: 2100 },
  { rank: 6, name: 'BetAnalyst', tier: 'free', wins: 76, winRate: 55, profit: 1800 },
  { rank: 7, name: 'OddsExplorer', tier: 'free', wins: 65, winRate: 53, profit: 1500 },
  { rank: 8, name: 'SportsCruncher', tier: 'premium', wins: 58, winRate: 52, profit: 1200 },
  { rank: 9, name: 'LineWatcher', tier: 'free', wins: 50, winRate: 50, profit: 900 },
  { rank: 10, name: 'NoviceBettor', tier: 'free', wins: 42, winRate: 48, profit: 600 },
];

export default function LeaderboardPage() {
  const medalIcon = (rank) => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return `#${rank}`;
  };

  const tierColor = (tier) => {
    if (tier === 'vip') return '#9B59B6';
    if (tier === 'premium') return '#5865F2';
    return '#b9bbbe';
  };

  return (
    <div className="dash-page">
      <div className="dash-header">
        <div>
          <h1 className="dash-title">🏅 Leaderboard</h1>
          <p className="dash-subtitle">Top performers in the Valor Odds community</p>
        </div>
      </div>

      <div className="glass-card section-card">
        <div className="section-header">
          <h2><span className="section-icon">🏆</span> Top 10 This Month</h2>
        </div>
        <div className="leaderboard-table">
          <div className="lb-header-row">
            <span className="lb-col-rank">Rank</span>
            <span className="lb-col-name">Player</span>
            <span className="lb-col-tier">Tier</span>
            <span className="lb-col-stat">Wins</span>
            <span className="lb-col-stat">Win %</span>
            <span className="lb-col-stat">Profit</span>
          </div>
          {MOCK_LEADERS.map(leader => (
            <div className={`lb-row ${leader.rank <= 3 ? 'lb-top3' : ''}`} key={leader.rank}>
              <span className="lb-col-rank">{medalIcon(leader.rank)}</span>
              <span className="lb-col-name">{leader.name}</span>
              <span className="lb-col-tier">
                <span className="tier-mini" style={{ color: tierColor(leader.tier) }}>
                  {leader.tier.toUpperCase()}
                </span>
              </span>
              <span className="lb-col-stat">{leader.wins}</span>
              <span className="lb-col-stat" style={{ color: leader.winRate >= 60 ? '#57F287' : '#b9bbbe' }}>
                {leader.winRate}%
              </span>
              <span className="lb-col-stat" style={{ color: '#57F287', fontWeight: 700 }}>
                +${leader.profit.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="glass-card" style={{ textAlign: 'center', padding: '2rem' }}>
        <p className="dash-subtitle">
          🎯 Start tracking your bets to appear on the leaderboard!
        </p>
      </div>
    </div>
  );
}