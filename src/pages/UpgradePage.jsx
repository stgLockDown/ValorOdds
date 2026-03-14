import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';

export default function UpgradePage() {
  const { plan, subscriptionActive, createCheckout, openPortal } = useAuth();
  const [loadingPlan, setLoadingPlan] = useState(null);
  const [msg, setMsg] = useState(null);

  const handleSubscribe = async (planId) => {
    setLoadingPlan(planId);
    const result = await createCheckout(planId);
    if (result.success && result.url) {
      window.location.href = result.url;
    } else {
      setMsg({ type: 'error', text: result.error || 'Failed to start checkout' });
    }
    setLoadingPlan(null);
  };

  const handleManage = async () => {
    const result = await openPortal();
    if (result.success && result.url) window.location.href = result.url;
    else setMsg({ type: 'error', text: result.error || 'Failed to open portal' });
  };

  const plans = [
    {
      id: 'free', title: 'Free Trial', price: '$0', period: '/7 days',
      features: [
        'Access to summary channel',
        'Daily top 5 opportunities',
        'Basic AI analysis',
        'Community support',
      ]
    },
    {
      id: 'premium', title: 'Premium', price: '$29', period: '/month', featured: true,
      features: [
        'All 14 arbitrage channels',
        'Unlimited opportunities',
        'Full AI analysis',
        'Player props (4 sports)',
        'Custom AI commands',
        'Priority support',
        'Mobile notifications',
        'Weather impact analysis',
      ]
    },
    {
      id: 'vip', title: 'VIP', price: '$79', period: '/month',
      features: [
        'Everything in Premium',
        'Early access to opportunities',
        'Exclusive VIP channel',
        'Direct input on bot functions',
        'Live meetings with dev team',
        'Beta access to mobile app',
        'Advanced bet tracking',
        'Personal AI advisor',
      ]
    },
  ];

  const isCurrent = (planId) => plan === planId && (subscriptionActive || planId === 'free');

  return (
    <div className="dash-page">
      <div className="dash-header" style={{ textAlign: 'center' }}>
        <div style={{ width: '100%' }}>
          <h1 className="dash-title">🚀 Upgrade Your Plan</h1>
          <p className="dash-subtitle" style={{ maxWidth: 600, margin: '0 auto' }}>
            {subscriptionActive && plan !== 'free'
              ? `You're on the ${plan.charAt(0).toUpperCase() + plan.slice(1)} plan ✅`
              : 'Unlock the full power of Valor Odds with a premium plan'}
          </p>
        </div>
      </div>

      {msg && (
        <div className={`dash-alert dash-alert-${msg.type}`} style={{ marginBottom: 16 }}>
          <span>{msg.text}</span>
          <button onClick={() => setMsg(null)} className="dash-alert-close">&times;</button>
        </div>
      )}

      <div className="pricing-grid">
        {plans.map(p => (
          <div className={`glass-card pricing-card ${p.featured ? 'pricing-featured' : ''} ${isCurrent(p.id) ? 'pricing-current' : ''}`} key={p.id}>
            {p.featured && <div className="pricing-badge">Most Popular</div>}
            {isCurrent(p.id) && !p.featured && <div className="pricing-badge pricing-badge-green">Current Plan</div>}
            <h3 className="pricing-title">{p.title}</h3>
            <div className="pricing-price">
              <span className="pricing-amount">{p.price}</span>
              <span className="pricing-period">{p.period}</span>
            </div>
            <ul className="pricing-features">
              {p.features.map((f, i) => (
                <li key={i}>✓ {f}</li>
              ))}
            </ul>
            <button
              onClick={() => p.id !== 'free' && !isCurrent(p.id) && handleSubscribe(p.id)}
              disabled={isCurrent(p.id) || p.id === 'free' || loadingPlan === p.id}
              className={`btn-action btn-block ${isCurrent(p.id) ? 'btn-success-action' : p.featured ? 'btn-primary-action' : 'btn-secondary-action'}`}
              style={{ opacity: isCurrent(p.id) || p.id === 'free' ? 0.7 : 1 }}>
              {isCurrent(p.id) ? '✓ Current Plan' : loadingPlan === p.id ? 'Redirecting…' : p.id === 'free' ? 'Free Plan' : `Subscribe to ${p.title}`}
            </button>
          </div>
        ))}
      </div>

      {subscriptionActive && plan !== 'free' && (
        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <button onClick={handleManage} className="btn-action btn-secondary-action">
            ⚙️ Manage Subscription
          </button>
          <p className="dash-subtitle" style={{ marginTop: 8 }}>
            Update payment method, change plan, or cancel
          </p>
        </div>
      )}

      {/* Discord CTA */}
      <div className="glass-card" style={{ textAlign: 'center', padding: '2.5rem', marginTop: 32, background: 'linear-gradient(135deg,rgba(88,101,242,0.12),#1a1f35)', border: '1px solid rgba(88,101,242,0.3)' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>💬</div>
        <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>Join Our Discord Community</h2>
        <p className="dash-subtitle" style={{ marginBottom: 20, maxWidth: 460, margin: '0 auto 20px' }}>
          Get instant access to AI-powered betting intelligence and connect with other members.
        </p>
        <a href="https://discord.gg/MfD933h9jb" target="_blank" rel="noreferrer"
          className="btn-action btn-primary-action" style={{ display: 'inline-block', textDecoration: 'none' }}>
          Join Valor Odds Discord
        </a>
      </div>
    </div>
  );
}