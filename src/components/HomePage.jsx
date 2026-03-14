import React from 'react';
import { Link } from 'react-router-dom';
import './HomePage.css';
import OpportunitiesSection from './OpportunitiesSection';

const HomePage = () => {
  return (
    <div className="home-page">
      {/* Navigation */}
      <nav className="hp-navbar">
        <div className="hp-nav-content">
          <Link to="/" className="hp-logo">
            <span className="hp-logo-icon">⚡</span>
            <span>Valor Odds</span>
          </Link>
          <div className="hp-nav-links">
            <a href="#features">Features</a>
            <a href="#opportunities">Live Data</a>
            <a href="#pricing">Pricing</a>
            <Link to="/login" className="hp-btn-primary">Login</Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="hp-hero">
        <div className="hp-container">
          <div className="hp-hero-content">
            <div className="hp-hero-badge">
              <span>✨</span>
              <span>Powered by DeepSeek AI</span>
            </div>
            <h1 className="hp-hero-title">
              Valor Odds - Professional Sports Betting Intelligence
              <span className="hp-gradient-text">Powered by AI</span>
            </h1>
            <p className="hp-hero-subtitle">
              Get real-time arbitrage opportunities and AI-powered player props analysis across 25+ sports.
              Join thousands of smart bettors making data-driven decisions.
            </p>
            <div className="hp-hero-cta">
              <a href="https://discord.gg/MfD933h9jb" target="_blank" rel="noopener noreferrer" className="hp-btn-large primary">
                💬 Join Valor Odds Now
              </a>
              <a href="#opportunities" className="hp-btn-large secondary">
                View Live Data
              </a>
            </div>
            <div className="hp-hero-stats">
              <div className="hp-stat">
                <div className="hp-stat-number">25+</div>
                <div className="hp-stat-label">Sports Covered</div>
              </div>
              <div className="hp-stat">
                <div className="hp-stat-number">1000+</div>
                <div className="hp-stat-label">Daily Opportunities</div>
              </div>
              <div className="hp-stat">
                <div className="hp-stat-number">98%</div>
                <div className="hp-stat-label">AI Accuracy</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="hp-features">
        <div className="hp-container">
          <div className="hp-section-header">
            <h2 className="hp-section-title">Why Choose Our Bot?</h2>
            <p className="hp-section-subtitle">Professional-grade betting intelligence at your fingertips</p>
          </div>
          <div className="hp-features-grid">
            <div className="hp-feature-card">
              <div className="hp-feature-icon">🎯</div>
              <h3>Arbitrage Detection</h3>
              <p>Scan 25+ sports every 20 minutes for guaranteed profit opportunities. Never miss a winning bet.</p>
              <ul className="hp-feature-list">
                <li>✓ Real-time odds monitoring</li>
                <li>✓ Automatic profit calculations</li>
                <li>✓ Multi-sportsbook coverage</li>
              </ul>
            </div>
            <div className="hp-feature-card featured">
              <div className="hp-feature-badge">Most Popular</div>
              <div className="hp-feature-icon">🤖</div>
              <h3>AI-Powered Analysis</h3>
              <p>DeepSeek AI analyzes every opportunity with professional-grade insights and recommendations.</p>
              <ul className="hp-feature-list">
                <li>✓ Risk assessment (Low/Med/High)</li>
                <li>✓ Confidence scores (1-10)</li>
                <li>✓ Actionable recommendations</li>
              </ul>
            </div>
            <div className="hp-feature-card">
              <div className="hp-feature-icon">🏆</div>
              <h3>Player Props</h3>
              <p>AI predictions for top players with ESPN data integration. Make smarter prop bets.</p>
              <ul className="hp-feature-list">
                <li>✓ Over/Under likelihood %</li>
                <li>✓ Performance predictions</li>
                <li>✓ Betting recommendations</li>
              </ul>
            </div>
            <div className="hp-feature-card">
              <div className="hp-feature-icon">⚡</div>
              <h3>Custom Commands</h3>
              <p>Get on-demand AI analysis for any game or player. Your personal betting analyst.</p>
              <ul className="hp-feature-list">
                <li>✓ !analyze any game</li>
                <li>✓ !predict any player</li>
                <li>✓ Instant AI responses</li>
              </ul>
            </div>
            <div className="hp-feature-card">
              <div className="hp-feature-icon">📊</div>
              <h3>Market Intelligence</h3>
              <p>Comprehensive market analysis for each sport. Understand the betting landscape.</p>
              <ul className="hp-feature-list">
                <li>✓ Overall market assessment</li>
                <li>✓ Best opportunities ranked</li>
                <li>✓ Risk factors identified</li>
              </ul>
            </div>
            <div className="hp-feature-card">
              <div className="hp-feature-icon">🔔</div>
              <h3>Real-Time Alerts</h3>
              <p>Get instant Discord notifications for high-value opportunities. Never miss a bet.</p>
              <ul className="hp-feature-list">
                <li>✓ 14 sport-specific channels</li>
                <li>✓ Custom alert preferences</li>
                <li>✓ Mobile notifications</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Live Opportunities Section — pulls real data from the bot's database */}
      <OpportunitiesSection />

      {/* Pricing Section */}
      <section id="pricing" className="hp-pricing">
        <div className="hp-container">
          <div className="hp-section-header">
            <h2 className="hp-section-title">Choose Your Plan</h2>
            <p className="hp-section-subtitle">Join via Discord and manage your subscription with MEE6</p>
          </div>
          <div className="hp-pricing-grid">
            {/* Free Trial */}
            <div className="hp-pricing-card">
              <div className="hp-pricing-header">
                <h3>Free Trial</h3>
                <div className="hp-price">
                  <span className="hp-price-amount">$0</span>
                  <span className="hp-price-period">/7 days</span>
                </div>
              </div>
              <ul className="hp-pricing-features">
                <li>✓ Access to summary channel</li>
                <li>✓ Daily top 5 opportunities</li>
                <li>✓ Basic AI analysis</li>
                <li>✓ Community support</li>
                <li>✗ Full sport channels</li>
                <li>✗ Player props</li>
                <li>✗ Custom AI commands</li>
              </ul>
              <a href="https://discord.gg/MfD933h9jb" target="_blank" rel="noopener noreferrer" className="hp-btn-pricing">Start Free Trial</a>
            </div>

            {/* Premium */}
            <div className="hp-pricing-card featured">
              <div className="hp-pricing-badge">Most Popular</div>
              <div className="hp-pricing-header">
                <h3>Premium</h3>
                <div className="hp-price">
                  <span className="hp-price-amount">$29</span>
                  <span className="hp-price-period">/month</span>
                </div>
              </div>
              <ul className="hp-pricing-features">
                <li>✓ All 14 arbitrage channels</li>
                <li>✓ Unlimited opportunities</li>
                <li>✓ Full AI analysis</li>
                <li>✓ Player props (4 sports)</li>
                <li>✓ Custom AI commands</li>
                <li>✓ Priority support</li>
                <li>✓ Mobile notifications</li>
              </ul>
              <a href="https://discord.gg/MfD933h9jb" target="_blank" rel="noopener noreferrer" className="hp-btn-pricing primary">Join Premium</a>
            </div>

            {/* VIP */}
            <div className="hp-pricing-card">
              <div className="hp-pricing-badge">🌟 Shape the Future</div>
              <div className="hp-pricing-header">
                <h3>VIP</h3>
                <div className="hp-price">
                  <span className="hp-price-amount">$79</span>
                  <span className="hp-price-period">/month</span>
                </div>
              </div>
              <ul className="hp-pricing-features">
                <li>✓ Everything in Premium</li>
                <li>✓ Early access to opportunities</li>
                <li>✓ Exclusive VIP channel</li>
                <li>✓ Direct input on bot functions</li>
                <li>✓ Live meetings with dev team</li>
                <li>✓ Help shape the future of Valor Odds</li>
                <li>✓ Beta access to upcoming mobile app</li>
                <li>✓ Custom alerts &amp; priority support</li>
              </ul>
              <a href="https://discord.gg/MfD933h9jb" target="_blank" rel="noopener noreferrer" className="hp-btn-pricing">Join VIP</a>
            </div>
          </div>
          <div className="hp-pricing-note">
            <p>💳 All payments processed securely through MEE6 Premium in Discord</p>
            <p>🔄 Cancel anytime, no questions asked</p>
            <p>📱 <strong>Coming Soon:</strong> Valor Odds Mobile App - VIP members get exclusive beta access!</p>
          </div>
        </div>
      </section>

      {/* VIP Highlight Section */}
      <section className="hp-vip">
        <div className="hp-container">
          <div className="hp-vip-content">
            <div className="hp-vip-badge">🌟 VIP EXCLUSIVE</div>
            <h2>Be Part of the Valor Odds Journey</h2>
            <p className="hp-vip-subtitle">VIP members don't just use Valor Odds - they help build it.</p>
            <div className="hp-vip-grid">
              <div className="hp-vip-benefit">
                <div className="hp-vip-icon">🎯</div>
                <h3>Direct Bot Input</h3>
                <p>Suggest features, vote on priorities, and see your ideas implemented in real-time.</p>
              </div>
              <div className="hp-vip-benefit">
                <div className="hp-vip-icon">👥</div>
                <h3>Live Dev Meetings</h3>
                <p>Monthly video calls with the development team. Ask questions, share feedback, and collaborate.</p>
              </div>
              <div className="hp-vip-benefit">
                <div className="hp-vip-icon">🚀</div>
                <h3>Shape the Future</h3>
                <p>Help design the upcoming Valor Odds mobile app. Your input matters.</p>
              </div>
              <div className="hp-vip-benefit">
                <div className="hp-vip-icon">📱</div>
                <h3>Mobile App Beta</h3>
                <p>Be the first to test the Valor Odds mobile app before public release. Exclusive VIP access.</p>
              </div>
            </div>
            <a href="https://discord.gg/MfD933h9jb" target="_blank" rel="noopener noreferrer" className="hp-btn-large primary">
              Become a VIP Member
            </a>
          </div>
        </div>
      </section>

      {/* Discord CTA Section */}
      <section className="hp-discord-cta">
        <div className="hp-container">
          <div className="hp-cta-content">
            <div className="hp-cta-icon">💬</div>
            <h2>Ready to Start Winning?</h2>
            <p>Join Valor Odds and Sports Discord community and get instant access to AI-powered betting intelligence</p>
            <a href="https://discord.gg/MfD933h9jb" target="_blank" rel="noopener noreferrer" className="hp-btn-large primary">
              Join Valor Odds and Sports
            </a>
            <div className="hp-cta-features">
              <div className="hp-cta-feature">
                <span className="check">✓</span>
                <span>Instant access</span>
              </div>
              <div className="hp-cta-feature">
                <span className="check">✓</span>
                <span>7-day free trial</span>
              </div>
              <div className="hp-cta-feature">
                <span className="check">✓</span>
                <span>Cancel anytime</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="hp-footer">
        <div className="hp-container">
          <div className="hp-footer-content">
            <div className="hp-footer-section">
              <h4>Valor Odds</h4>
              <p>Professional sports betting intelligence powered by DeepSeek AI. Join Valor Odds and Sports Discord for premium insights and make smarter bets with data-driven analysis.</p>
            </div>
            <div className="hp-footer-section">
              <h4>Quick Links</h4>
              <ul>
                <li><a href="#features">Features</a></li>
                <li><a href="#opportunities">Live Data</a></li>
                <li><a href="#pricing">Pricing</a></li>
                <li><a href="https://discord.gg/MfD933h9jb" target="_blank" rel="noopener noreferrer">Join Server</a></li>
              </ul>
            </div>
            <div className="hp-footer-section">
              <h4>Sports Covered</h4>
              <ul>
                <li>🏈 NFL &amp; College Football</li>
                <li>🏀 NBA &amp; College Basketball</li>
                <li>⚾ MLB</li>
                <li>🏒 NHL</li>
                <li>⚽ Soccer (EPL, La Liga, etc.)</li>
                <li>And 20+ more sports</li>
              </ul>
            </div>
            <div className="hp-footer-section">
              <h4>Legal</h4>
              <ul>
                <li><a href="#terms">Terms of Service</a></li>
                <li><a href="#privacy">Privacy Policy</a></li>
                <li><a href="#disclaimer">Disclaimer</a></li>
              </ul>
              <p className="hp-disclaimer">⚠️ Gambling involves risk. Bet responsibly.</p>
            </div>
          </div>
          <div className="hp-footer-bottom">
            <p>&copy; 2025 Valor Odds. All rights reserved.</p>
            <p>Powered by DeepSeek AI &amp; The Odds API</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default HomePage;