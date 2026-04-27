// Smooth scrolling for navigation links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// Navbar background on scroll
window.addEventListener('scroll', () => {
    const navbar = document.querySelector('.navbar');
    if (window.scrollY > 50) {
        navbar.style.background = 'rgba(10, 14, 26, 0.98)';
        navbar.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.3)';
    } else {
        navbar.style.background = 'rgba(10, 14, 26, 0.95)';
        navbar.style.boxShadow = 'none';
    }
});

// Animate elements on scroll
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions);

// Observe all cards and sections
document.querySelectorAll('.feature-card, .example-card, .pricing-card').forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
    el.style.transition = 'opacity 0.6s ease-out, transform 0.6s ease-out';
    observer.observe(el);
});

// Update stats with animation
function animateValue(element, start, end, duration) {
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const value = Math.floor(progress * (end - start) + start);
        element.textContent = value + (element.dataset.suffix || '');
        if (progress < 1) {
            window.requestAnimationFrame(step);
        }
    };
    window.requestAnimationFrame(step);
}

// Animate stats when they come into view
const statsObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting && !entry.target.dataset.animated) {
            const statNumber = entry.target.querySelector('.stat-number');
            const targetValue = parseInt(statNumber.textContent);
            const suffix = statNumber.textContent.replace(/[0-9]/g, '');
            statNumber.dataset.suffix = suffix;
            animateValue(statNumber, 0, targetValue, 2000);
            entry.target.dataset.animated = 'true';
        }
    });
}, { threshold: 0.5 });

document.querySelectorAll('.stat').forEach(stat => {
    statsObserver.observe(stat);
});

// Add hover effect to cards
document.querySelectorAll('.feature-card, .example-card, .pricing-card').forEach(card => {
    card.addEventListener('mouseenter', function() {
        this.style.transform = 'translateY(-8px)';
    });
    
    card.addEventListener('mouseleave', function() {
        this.style.transform = 'translateY(0)';
    });
});

// Dynamic example updates (simulated)
function updateExamples() {
    // This would connect to your actual API in production
    // For now, it's just a placeholder for future implementation
    console.log('Examples would be updated here with real data');
}

// Update examples every 5 minutes
setInterval(updateExamples, 300000);

// Add loading state to Discord buttons
document.querySelectorAll('a[href*="discord"]').forEach(button => {
    button.addEventListener('click', function(e) {
        // Don't prevent default - let the link work
        this.style.opacity = '0.7';
        this.innerHTML = '<span style="display: inline-block; animation: spin 1s linear infinite;">⏳</span> Opening Discord...';
        
        // Reset after 2 seconds
        setTimeout(() => {
            this.style.opacity = '1';
            this.innerHTML = this.dataset.originalText || 'Join Discord Server';
        }, 2000);
    });
    
    // Store original text
    button.dataset.originalText = button.innerHTML;
});

// Add CSS for spin animation
const style = document.createElement('style');
style.textContent = `
    @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }
`;
document.head.appendChild(style);

// Mobile menu toggle (for future implementation)
function createMobileMenu() {
    const nav = document.querySelector('.nav-links');
    const menuButton = document.createElement('button');
    menuButton.className = 'mobile-menu-button';
    menuButton.innerHTML = '☰';
    menuButton.style.cssText = `
        display: none;
        background: none;
        border: none;
        color: white;
        font-size: 1.5rem;
        cursor: pointer;
    `;
    
    // Add mobile menu button on small screens
    if (window.innerWidth <= 768) {
        menuButton.style.display = 'block';
        document.querySelector('.nav-content').appendChild(menuButton);
        
        menuButton.addEventListener('click', () => {
            nav.style.display = nav.style.display === 'flex' ? 'none' : 'flex';
            nav.style.flexDirection = 'column';
            nav.style.position = 'absolute';
            nav.style.top = '60px';
            nav.style.right = '20px';
            nav.style.background = 'var(--surface)';
            nav.style.padding = '1rem';
            nav.style.borderRadius = 'var(--radius-md)';
        });
    }
}

// Initialize mobile menu
window.addEventListener('resize', createMobileMenu);
createMobileMenu();

// Add particle effect to hero section (optional enhancement)
function createParticles() {
    const hero = document.querySelector('.hero');
    const particleCount = 50;
    
    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.cssText = `
            position: absolute;
            width: 2px;
            height: 2px;
            background: rgba(88, 101, 242, 0.5);
            border-radius: 50%;
            left: ${Math.random() * 100}%;
            top: ${Math.random() * 100}%;
            animation: float ${5 + Math.random() * 10}s infinite ease-in-out;
            animation-delay: ${Math.random() * 5}s;
        `;
        hero.appendChild(particle);
    }
    
    // Add float animation
    const particleStyle = document.createElement('style');
    particleStyle.textContent = `
        @keyframes float {
            0%, 100% { transform: translateY(0) translateX(0); opacity: 0; }
            50% { transform: translateY(-100px) translateX(50px); opacity: 1; }
        }
    `;
    document.head.appendChild(particleStyle);
}

// Initialize particles
createParticles();

// Track button clicks for analytics (placeholder)
document.querySelectorAll('.btn-primary, .btn-secondary').forEach(button => {
    button.addEventListener('click', function() {
        const buttonText = this.textContent.trim();
        console.log('Button clicked:', buttonText);
        // In production, send to analytics service
    });
});

// Add copy-to-clipboard for Discord invite (if needed)
function addCopyButton() {
    const discordLinks = document.querySelectorAll('a[href*="discord.gg"]');
    discordLinks.forEach(link => {
        link.addEventListener('contextmenu', function(e) {
            e.preventDefault();
            navigator.clipboard.writeText(this.href);
            
            // Show copied notification
            const notification = document.createElement('div');
            notification.textContent = '✓ Link copied!';
            notification.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 20px;
                background: var(--success);
                color: white;
                padding: 1rem 2rem;
                border-radius: var(--radius-sm);
                z-index: 9999;
                animation: slideIn 0.3s ease-out;
            `;
            document.body.appendChild(notification);
            
            setTimeout(() => {
                notification.remove();
            }, 2000);
        });
    });
}

addCopyButton();

// Add slideIn animation
const slideInStyle = document.createElement('style');
slideInStyle.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
`;
document.head.appendChild(slideInStyle);

console.log('🤖 AI Arbitrage Bot website loaded successfully!');