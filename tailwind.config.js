/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        d: {
          bg: '#0b1020',
          card: '#141b2d',
          line: '#243049',
          accent: '#22d3ee',
          violet: '#a78bfa',
          pink: '#f472b6',
        },
      },
      boxShadow: {
        glow: '0 0 40px rgba(34, 211, 238, 0.15)',
      },
    },
  },
  plugins: [],
}
