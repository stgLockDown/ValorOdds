import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/* ── tiny stat card ─────────────────────────────────── */
const Stat = ({ icon, value, label, color }) => (
  <div className="card card-hover" style={{ textAlign: 'center' }}>
    <div style={{ fontSize: 36, marginBottom: 8 }}>{icon}</div>
    <div style={{ fontSize: 28, fontWeight: 800, color }}>{value}</div>
    <div style={{ color: '#b9bbbe', fontSize: 14 }}>{label}</div>
  </div>
);

/* ── feature card ───────────────────────────────────── */
const Feature = ({ icon, title, desc }) => (
  <div className="card card-hover" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 12 }}>
    <div style={{ fontSize: 42 }}>{icon}</div>
    <h3 style={{ fontSize: 18, fontWeight: 700 }}>{title}</h3>
    <p style={{ color: '#b9bbbe', fontSize: 14, lineHeight: 1.6 }}>{desc}</p>
  </div>
);

/* ── live example card ──────────────────────────────── */
const ArbExample = ({ badge, team1, odds1, book1, team2, odds2, book2, profit, risk, confidence, note }) => (
  <div className="card card-hover">
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
      <span className="badge badge-primary">{badge}</span>
      <span className="badge badge-green">{profit} Profit</span>
    </div>
    <h4 style={{ fontSize: 16, marginBottom: 12 }}>{team1} vs {team2}</h4>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
      <div style={rowStyle}><span>🏠 {team1}</span><span style={{ color: '#5865F2', fontWeight: 700 }}>{odds1}</span><span style={{ color: '#b9bbbe', fontSize: 13 }}>{book1}</span></div>
      <div style={rowStyle}><span>✈️ {team2}</span><span style={{ color: '#5865F2', fontWeight: 700 }}>{odds2}</span><span style={{ color: '#b9bbbe', fontSize: 13 }}>{book2}</span></div>
    </div>
    <div style={{ background: 'rgba(88,101,242,0.08)', borderLeft: '3px solid #5865F2', borderRadius: 8, padding: 14 }}>
      <span className="badge badge-primary" style={{ marginBottom: 8 }}>🤖 AI Analysis</span>
      <p style={{ fontSize: 13, color: '#b9bbbe' }}><b style={{ color: '#fff' }}>Risk:</b> {risk} &nbsp;|&nbsp; <b style={{ color: '#fff' }}>Confidence:</b> {confidence}/10</p>
      <p style={{ fontSize: 13, color: '#b9bbbe', marginTop: 4 }}>{note}</p>
    </div>
  </div>
);

const rowStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0a0e1a', padding: '10px 14px', borderRadius: 8 };

/* ══════════════════════════════════════════════════════
   DASHBOARD
   ══════════════════════════════════════════════════════ */
export default function Dashboard() {
  const { user, logout, isAdmin, plan, subscriptionActive, createCheckout, openPortal, refreshSubscription } = useAuth();
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const [checkoutMsg, setCheckoutMsg] = useState(null);
  const [loadingPlan, setLoadingPlan] = useState(null);

  // Check for checkout result in URL params
  useEffect(() => {
    const checkout = searchParams.get('checkout');
    const planParam = searchParams.get('plan');
    if (checkout === 'success') {
      setCheckoutMsg({ type: 'success', text: `🎉 Welcome to ${planParam || 'your new plan'}! Your subscription is now active.` });
      refreshSubscription();
      // Clean URL
      window.history.replaceState({}, '', '/dashboard');
    } else if (checkout === 'cancelled') {
      setCheckoutMsg({ type: 'info', text: 'Checkout was cancelled. You can try again anytime.' });
      window.history.replaceState({}, '', '/dashboard');
    }
  }, [searchParams, refreshSubscription]);

  const handleSubscribe = async (planId) => {
    setLoadingPlan(planId);
    const result = await createCheckout(planId);
    if (result.success && result.url) {
      window.location.href = result.url;
    } else {
      setCheckoutMsg({ type: 'error', text: result.error || 'Failed to start checkout' });
    }
    setLoadingPlan(null);
  };

  const handleManageSubscription = async () => {
    const result = await openPortal();
    if (result.success && result.url) {
      window.location.href = result.url;
    } else {
      setCheckoutMsg({ type: 'error', text: result.error || 'Failed to open subscription portal' });
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0a0e1a' }}>
      {/* ── NAV ─────────────────────────────────────── */}
      <nav style={navStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 28 }}>⚡</span>
          <span style={{ fontSize: 20, fontWeight: 800 }}>Valor Odds</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ color: '#b9bbbe', fontSize: 14 }} className="hide-mobile">
            {user?.name || user?.email}
          </span>
          {plan !== 'free' && (
            <span className="badge badge-green" style={{ fontSize: 11, textTransform: 'uppercase' }}>
              {plan}
            </span>
          )}
          {isAdmin && (
            <Link to="/admin/marketing-agent" className="btn btn-orange btn-sm">
              🤖 Marketing Agent
            </Link>
          )}
          <button className="btn btn-secondary btn-sm" onClick={() => { logout(); nav('/'); }}>
            Logout
          </button>
        </div>
      </nav>

      {/* ── CONTENT ─────────────────────────────────── */}
      <div className="container fade-in" style={{ paddingTop: 100, paddingBottom: 60 }}>

        {/* Checkout message */}
        {checkoutMsg && (
          <div style={{
            padding: '16px 24px', borderRadius: 12, marginBottom: 24,
            background: checkoutMsg.type === 'success' ? 'rgba(87,242,135,0.1)' :
                        checkoutMsg.type === 'error' ? 'rgba(237,66,69,0.1)' : 'rgba(88,101,242,0.1)',
            border: `1px solid ${checkoutMsg.type === 'success' ? '#57F287' : checkoutMsg.type === 'error' ? '#ED4245' : '#5865F2'}`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span>{checkoutMsg.text}</span>
            <button onClick={() => setCheckoutMsg(null)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 18 }}>×</button>
          </div>
        )}

        {/* Hero */}
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div className="badge badge-primary" style={{ marginBottom: 16, fontSize: 13 }}>
            ✨ Powered by DeepSeek AI
          </div>
          <h1 style={{ fontSize: 'clamp(2rem,5vw,3.2rem)', fontWeight: 800, lineHeight: 1.15, marginBottom: 16 }}>
            Professional Sports Betting<br />
            <span style={{ background: 'var(--grad-pri)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Intelligence Dashboard
            </span>
          </h1>
          <p style={{ color: '#b9bbbe', fontSize: 16, maxWidth: 640, margin: '0 auto' }}>
            Real-time arbitrage opportunities and AI-powered player props analysis across 25+ sports.
          </p>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 16, marginBottom: 48 }}>
          <Stat icon="🏈" value="25+" label="Sports Covered" color="#5865F2" />
          <Stat icon="📊" value="1,000+" label="Daily Opportunities" color="#57F287" />
          <Stat icon="🤖" value="98%" label="AI Accuracy" color="#E8820C" />
          <Stat icon="👥" value="500+" label="Active Members" color="#9B59B6" />
        </div>

        {/* Features */}
        <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 20, textAlign: 'center' }}>
          Platform Features
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 16, marginBottom: 56 }}>
          <Feature icon="🎯" title="Arbitrage Detection" desc="Scan 25+ sports every 20 minutes for guaranteed profit opportunities. Never miss a winning bet." />
          <Feature icon="🤖" title="AI-Powered Analysis" desc="DeepSeek AI analyzes every opportunity with risk assessment, confidence scores, and actionable recommendations." />
          <Feature icon="⭐" title="Player Props" desc="AI predictions for top players with ESPN data integration. Over/Under likelihood and performance predictions." />
          <Feature icon="⚡" title="Custom Commands" desc="Get on-demand AI analysis for any game or player. Your personal betting analyst available 24/7." />
          <Feature icon="📈" title="Market Intelligence" desc="Comprehensive market analysis with overall assessments, best opportunities ranked, and risk factors." />
          <Feature icon="🔔" title="Real-Time Alerts" desc="Instant notifications across 14 sport-specific channels. Custom alert preferences and mobile notifications." />
        </div>

        {/* Live Examples */}
        <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8, textAlign: 'center' }}>
          🎯 Today's Top Opportunities
        </h2>
        <p style={{ color: '#b9bbbe', textAlign: 'center', marginBottom: 24 }}>Real examples from the platform</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))', gap: 16, marginBottom: 56 }}>
          <ArbExample badge="🏈 NFL" team1="Kansas City Chiefs" team2="Buffalo Bills"
            odds1="-110" book1="DraftKings" odds2="+120" book2="FanDuel"
            profit="2.8%" risk="LOW" confidence="8"
            note="High-quality arbitrage with minimal risk. Both sportsbooks are reputable with fast payouts." />
          <ArbExample badge="🏀 NBA" team1="Los Angeles Lakers" team2="Golden State Warriors"
            odds1="-105" book1="BetMGM" odds2="+115" book2="Caesars"
            profit="2.1%" risk="MEDIUM" confidence="7"
            note="Solid opportunity with moderate risk. Lakers' home advantage is significant." />
          <ArbExample badge="⚽ Soccer" team1="Manchester United" team2="Liverpool"
            odds1="+180" book1="Bet365" odds2="-150" book2="Unibet"
            profit="3.2%" risk="LOW" confidence="9"
            note="Excellent arbitrage. Odds discrepancy creates guaranteed profit. High confidence." />
        </div>

        {/* Pricing */}
        <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8, textAlign: 'center' }}>
          Choose Your Plan
        </h2>
        <p style={{ color: '#b9bbbe', textAlign: 'center', marginBottom: 24 }}>
          {subscriptionActive && plan !== 'free'
            ? `You're on the ${plan.charAt(0).toUpperCase() + plan.slice(1)} plan ✅`
            : 'Upgrade your account to unlock all features'}
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 16, marginBottom: 24 }}>
          <PricingCard title="Free Trial" planId="free" price="$0" period="/7 days" currentPlan={plan}
            features={['Access to summary channel', 'Daily top 5 opportunities', 'Basic AI analysis', 'Community support']}
            onSubscribe={handleSubscribe} loadingPlan={loadingPlan} subscriptionActive={subscriptionActive} />
          <PricingCard title="Premium" planId="premium" price="$29" period="/month" featured currentPlan={plan}
            features={['All 14 arbitrage channels', 'Unlimited opportunities', 'Full AI analysis', 'Player props (4 sports)', 'Custom AI commands', 'Priority support', 'Mobile notifications']}
            onSubscribe={handleSubscribe} loadingPlan={loadingPlan} subscriptionActive={subscriptionActive} />
          <PricingCard title="VIP" planId="vip" price="$79" period="/month" currentPlan={plan}
            features={['Everything in Premium', 'Early access to opportunities', 'Exclusive VIP channel', 'Direct input on bot functions', 'Live meetings with dev team', 'Beta access to mobile app']}
            onSubscribe={handleSubscribe} loadingPlan={loadingPlan} subscriptionActive={subscriptionActive} />
        </div>

        {/* Manage subscription button */}
        {subscriptionActive && plan !== 'free' && (
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <button className="btn btn-secondary" onClick={handleManageSubscription}>
              ⚙️ Manage Subscription
            </button>
            <p style={{ color: '#b9bbbe', fontSize: 13, marginTop: 8 }}>
              Update payment method, change plan, or cancel
            </p>
          </div>
        )}

        {/* Discord CTA */}
        <div className="card" style={{ textAlign: 'center', padding: '3rem 2rem', background: 'linear-gradient(135deg,rgba(88,101,242,0.12),#1a1f35)', border: '1px solid rgba(88,101,242,0.3)' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>💬</div>
          <h2 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Ready to Start Winning?</h2>
          <p style={{ color: '#b9bbbe', marginBottom: 24, maxWidth: 460, margin: '0 auto 24px' }}>
            Join Valor Odds and Sports Discord community and get instant access to AI-powered betting intelligence.
          </p>
          <a href="https://discord.gg/MfD933h9jb" target="_blank" rel="noreferrer"
            className="btn btn-primary btn-lg">
            Join Valor Odds and Sports
          </a>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 20, flexWrap: 'wrap' }}>
            <span style={{ color: '#57F287', fontSize: 14 }}>✓ Instant access</span>
            <span style={{ color: '#57F287', fontSize: 14 }}>✓ 7-day free trial</span>
            <span style={{ color: '#57F287', fontSize: 14 }}>✓ Cancel anytime</span>
          </div>
        </div>
      </div>

      {/* ── FOOTER ────────────────────────────────── */}
      <footer style={{ background: '#1a1f35', borderTop: '1px solid #2d3350', padding: '40px 0 24px', marginTop: 40 }}>
        <div className="container" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 32, marginBottom: 32 }}>
          <div>
            <h4 style={{ marginBottom: 12 }}>Valor Odds</h4>
            <p style={{ color: '#b9bbbe', fontSize: 13, lineHeight: 1.6 }}>Professional sports betting intelligence powered by DeepSeek AI.</p>
          </div>
          <div>
            <h4 style={{ marginBottom: 12 }}>Sports Covered</h4>
            <p style={{ color: '#b9bbbe', fontSize: 13, lineHeight: 2 }}>
              🏈 NFL & College Football<br />🏀 NBA & College Basketball<br />⚾ MLB<br />🏒 NHL<br />⚽ Soccer<br />And 20+ more
            </p>
          </div>
          <div>
            <h4 style={{ marginBottom: 12 }}>Legal</h4>
            <p style={{ color: '#b9bbbe', fontSize: 13, lineHeight: 2 }}>
              Terms of Service<br />Privacy Policy<br />Disclaimer
            </p>
            <p style={{ color: '#ED4245', fontSize: 12, marginTop: 8, padding: '8px 12px', background: 'rgba(237,66,69,0.08)', borderLeft: '3px solid #ED4245', borderRadius: 4 }}>
              ⚠️ Gambling involves risk. Bet responsibly.
            </p>
          </div>
        </div>
        <div style={{ textAlign: 'center', borderTop: '1px solid #2d3350', paddingTop: 20 }}>
          <p style={{ color: '#b9bbbe', fontSize: 13 }}>© 2025 Valor Odds. Powered by DeepSeek AI & The Odds API</p>
        </div>
      </footer>
    </div>
  );
}

/* ── Pricing Card sub-component ─────────────────────── */
function PricingCard({ title, planId, price, period, features, featured, currentPlan, onSubscribe, loadingPlan, subscriptionActive }) {
  const isCurrent = currentPlan === planId && (subscriptionActive || planId === 'free');
  const isLoading = loadingPlan === planId;

  const getButtonText = () => {
    if (isCurrent) return '✓ Current Plan';
    if (isLoading) return 'Redirecting…';
    if (planId === 'free') return 'Free Plan';
    return `Subscribe to ${title}`;
  };

  const handleClick = () => {
    if (isCurrent || planId === 'free' || isLoading) return;
    onSubscribe(planId);
  };

  return (
    <div className="card" style={{
      position: 'relative', textAlign: 'center',
      border: featured ? '2px solid #5865F2' : isCurrent ? '2px solid #57F287' : '1px solid #2d3350',
      background: featured ? 'linear-gradient(135deg,rgba(88,101,242,0.08),#1a1f35)' : undefined,
    }}>
      {featured && (
        <div style={{
          position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--grad-pri)', padding: '4px 16px', borderRadius: 20,
          fontSize: 12, fontWeight: 700
        }}>
          Most Popular
        </div>
      )}
      {isCurrent && !featured && (
        <div style={{
          position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)',
          background: 'linear-gradient(135deg, #57F287, #43B581)', padding: '4px 16px', borderRadius: 20,
          fontSize: 12, fontWeight: 700, color: '#0a0e1a'
        }}>
          Current Plan
        </div>
      )}
      <h3 style={{ fontSize: 22, marginBottom: 4, marginTop: (featured || isCurrent) ? 8 : 0 }}>{title}</h3>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 2, marginBottom: 20 }}>
        <span style={{
          fontSize: 40, fontWeight: 800,
          background: 'var(--grad-pri)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
        }}>{price}</span>
        <span style={{ color: '#b9bbbe' }}>{period}</span>
      </div>
      <ul style={{ listStyle: 'none', marginBottom: 20, textAlign: 'left' }}>
        {features.map((f, i) => (
          <li key={i} style={{ padding: '8px 0', borderBottom: '1px solid #2d3350', color: '#b9bbbe', fontSize: 14 }}>
            ✓ {f}
          </li>
        ))}
      </ul>
      <button
        onClick={handleClick}
        disabled={isCurrent || isLoading || planId === 'free'}
        className={`btn btn-block ${isCurrent ? 'btn-success' : featured ? 'btn-primary' : 'btn-secondary'}`}
        style={{
          opacity: isCurrent || planId === 'free' ? 0.7 : 1,
          cursor: isCurrent || planId === 'free' ? 'default' : 'pointer',
        }}
      >
        {getButtonText()}
      </button>
    </div>
  );
}

const navStyle = {
  position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000,
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  padding: '12px 24px',
  background: 'rgba(10,14,26,0.92)', backdropFilter: 'blur(12px)',
  borderBottom: '1px solid #2d3350',
};