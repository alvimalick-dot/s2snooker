/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Main surfaces — dark theme
        surface: {
          DEFAULT: '#0f172a',  // slate-900 — main background
          card: '#1e293b',     // slate-800 — cards / panels
          dark: '#020617',     // slate-950 — deep wells / inputs
          border: '#334155',   // slate-700 — borders
        },
        // Status — vivid 600-level fills (safe with white text) + dark 950-level chips
        occupied: {
          DEFAULT: '#dc2626',   // red-600 — button fills
          light: '#fca5a5',     // red-300 — accent text on dark
          bg: '#450a0a',        // red-950
        },
        available: {
          DEFAULT: '#16a34a',   // green-600
          light: '#86efac',     // green-300
          bg: '#052e16',        // green-950
        },
        reserved: {
          DEFAULT: '#d97706',   // amber-600
          light: '#fcd34d',     // amber-300
          bg: '#451a03',        // amber-950
        },
        // Accent
        brass: {
          DEFAULT: '#ca8a04',   // yellow-600
          light: '#facc15',     // yellow-400
          bg: '#422006',        // yellow-950
        },
        // Text — light on dark
        ink: '#f8fafc',        // slate-50 — primary text
        chalk: '#cbd5e1',      // slate-300 — secondary text
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      fontSize: {
        // Bigger defaults for older users
        'xs': ['0.875rem', { lineHeight: '1.25rem' }],   // was 0.75rem
        'sm': ['1rem', { lineHeight: '1.5rem' }],         // was 0.875rem
        'base': ['1.125rem', { lineHeight: '1.75rem' }],  // was 1rem
        'lg': ['1.25rem', { lineHeight: '1.75rem' }],
        'xl': ['1.5rem', { lineHeight: '2rem' }],
        '2xl': ['1.875rem', { lineHeight: '2.25rem' }],
        '3xl': ['2.25rem', { lineHeight: '2.5rem' }],
      },
      borderRadius: {
        'xl': '0.75rem',
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      boxShadow: {
        'card': '0 2px 10px rgba(0,0,0,0.45)',
        'card-hover': '0 10px 28px rgba(0,0,0,0.6)',
        'glow-green': '0 0 24px rgba(22, 163, 74, 0.45)',
        'glow-red': '0 0 24px rgba(220, 38, 38, 0.45)',
        'glow-amber': '0 0 24px rgba(217, 119, 6, 0.45)',
      },
    },
  },
  plugins: [],
};
