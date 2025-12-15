/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './index.tsx',
    './App.tsx',
    './components/**/*.{ts,tsx}',
    './contexts/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        main: 'var(--bg-main)',
        secondary: 'var(--bg-secondary)',
        tertiary: 'var(--bg-tertiary)',

        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-tertiary': 'var(--text-tertiary)',

        accent: {
          primary: 'var(--accent-primary)',
          secondary: 'var(--accent-secondary)',
          text: 'var(--accent-text)',
        },

        border: {
          primary: 'var(--border-primary)',
          secondary: 'var(--border-secondary)',
        }
      }
    },
  },
  plugins: [],
};

