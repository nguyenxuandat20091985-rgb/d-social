/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        d: {
          bg: 'var(--d-bg)',
          surface: 'var(--d-surface)',
          text: 'var(--d-text)',
          muted: 'var(--d-muted)',
          border: 'var(--d-border)',
          primary: 'var(--d-primary)',
          success: 'var(--d-success)',
          warning: 'var(--d-warning)',
          danger: 'var(--d-danger)',
        },
      },
      boxShadow: {
        card: 'var(--d-shadow)',
        'card-md': 'var(--d-shadow-md)',
      },
      minHeight: {
        touch: '44px',
      },
    },
  },
  plugins: [],
}
