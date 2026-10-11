/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          dark: '#181818',
          panel: '#202020',
          input: '#282828',
          hover: '#333333',
        },
        border: {
          subtle: '#303030',
          focus: '#3b82f6',
        },
        fg: {
          primary: '#e4e4e7',
          secondary: '#9ca3af',
          muted: '#6b7280',
        }
      },
      fontFamily: {
        sans: [
          '"Cascadia Mono"',
          '"Cascadia Code"',
          'Consolas',
          '"Segoe UI Mono"',
          'ui-monospace',
          'system-ui',
          'sans-serif',
        ],
        mono: [
          '"Cascadia Mono"',
          '"Cascadia Code"',
          'Consolas',
          '"Segoe UI Mono"',
          'ui-monospace',
          'monospace',
        ],
      },
      letterSpacing: {
        tightest: '-0.025em',
        tighter: '-0.015em',
        section: '0.08em',
      },
    },
  },
  plugins: [],
}
