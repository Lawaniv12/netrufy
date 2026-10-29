/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts}'],
  theme: {
    extend: {
      colors: {
        slate: {
          50: 'var(--surface-soft)',
          100: '#eef3ef',
          200: 'var(--line)',
          300: '#cbd8cf',
          400: '#8b9a90',
          500: 'var(--muted)',
          600: '#4e5e54',
          700: '#35463b',
          800: '#24352b',
          900: 'var(--ink)',
        },
        netrust: {
          ink: 'var(--ink)',
          muted: 'var(--muted)',
          green: 'var(--green)',
          coral: 'var(--coral)',
          paper: 'var(--paper)',
          surface: 'var(--surface)',
          line: 'var(--line)',
          blue: 'var(--blue)',
          'blue-wash': '#edf2fb',
          lime: '#d7f36a',
        },
      },
      fontFamily: {
        sans: ['Manrope', 'Segoe UI', 'sans-serif'],
        display: ['DM Serif Display', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
};