import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          bg: '#0a0e1a',
          surface: '#111827',
          elevated: '#1f2937',
          border: '#374151',
          // Darkened from #6366f1 so white text on a primary button meets
          // WCAG AA (now ~5.9:1, was 4.46:1).
          primary: '#4f46e5',
          primaryHover: '#4338ca',
          // Lighter indigo for primary-colored TEXT on dark surfaces, which
          // needs a higher-luminance value to clear AA (#818cf8 ~ 5.9:1 on
          // #1f2937). Use `text-brand-primaryText` for small indigo labels.
          primaryText: '#a5b4fc',
          accent: '#f59e0b',
          success: '#10b981',
          danger: '#ef4444',
          text: '#f9fafb',
          muted: '#9ca3af',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'gradient-hero': 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #ec4899 100%)',
        'gradient-card': 'linear-gradient(135deg, rgba(99,102,241,0.1) 0%, rgba(139,92,246,0.05) 100%)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.5s ease-in-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;