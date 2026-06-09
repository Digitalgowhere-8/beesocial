/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          50:  '#F5F4F0',
          100: '#E8E6DF',
          200: '#CBC8BC',
          300: '#9A958A',
          400: '#5E5A52',
          500: '#3A3832',
          600: '#23211E',
          700: '#181715',
          800: '#0F0E0D',
          900: '#0A0908'
        },
        navy: {
          50:  '#F0F4F8',
          100: '#D9E2EC',
          200: '#BCCCDC',
          300: '#9FB3C8',
          400: '#627D98',
          500: '#334E68',
          600: '#243B53',
          700: '#102A43',
          800: '#0B1F36',
          900: '#0E1B2C'
        },
        brass: {
          50:  '#FBF7EE',
          100: '#F4EAD0',
          200: '#E8D5A0',
          300: '#D9BB71',
          400: '#C9A961',
          500: '#B69148',
          600: '#967636',
          700: '#705828',
          800: '#4A3B1B'
        },
        brand: {
          crimson: '#D11243',
          darkred: '#8F0B2F',
          pink: '#FAF0F2',
          lightpink: '#FFF5F6',
          hoverred: '#BE0F3C'
        },
        canvas: '#FAF9F6'   // page background
      },
      fontFamily: {
        display: ['"Fraunces"', 'Georgia', 'serif'],
        sans: ['"DM Sans"', '"Helvetica Neue"', 'Arial', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace']
      },
      boxShadow: {
        card: '0 1px 0 rgba(0,0,0,0.04), 0 1px 2px rgba(15,23,42,0.04)',
        lift: '0 12px 32px -16px rgba(14,27,44,0.18)',
        inset: 'inset 0 0 0 1px rgba(14,27,44,0.06)'
      },
      letterSpacing: {
        tightest: '-0.04em'
      }
    }
  },
  plugins: []
};
