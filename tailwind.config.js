/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts}'],
  theme: {
    extend: {
      colors: {
        netrust: {
          ink: '#1e2922',
          muted: '#737c72',
          green: '#275b43',
          coral: '#c7654a',
          paper: '#f5f6f0',
          surface: '#fffefa',
          line: '#e3e7dd',
          blue: '#2459e8',
          'blue-wash': '#edf3ff',
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