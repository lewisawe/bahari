/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Dovetail design system (see DESIGN.md): dark command-center.
        // Single chromatic accent = cornflower. Everything else is tonal.
        ink: '#0a0a0a', // page canvas
        section: '#141414', // alternate/section surface
        card: '#1e1e1e', // card + button surface
        steel: '#313131', // hairline borders / image frames
        graphite: '#454545', // outlined-button / input borders
        fog: '#7c7c7c', // disabled text
        ash: '#a7a7a7', // secondary text / icon strokes
        snow: '#ffffff', // primary text / primary button fill
        accent: '#6798ff', // THE accent: icons, active states, data strokes only
        // Functional health-status colors (data highlights, allowed by the
        // system as "data highlight strokes"). Tuned to read on dark surfaces.
        health: {
          good: '#3ecf8e', // natural / good
          fair: '#f5c451', // fair
          poor: '#ff9d5c', // poor
          bad: '#ff6b6b', // very poor
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      letterSpacing: {
        tightest: '-0.036em',
        tighter: '-0.021em',
        tight: '-0.012em',
        code: '0.06em',
      },
      borderRadius: {
        tag: '4px',
        DEFAULT: '8px',
        lg: '8px',
      },
      boxShadow: {
        none: 'none', // system uses zero shadows; tone shifts only
      },
    },
  },
  plugins: [],
};
