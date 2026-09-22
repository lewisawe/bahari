/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Bahari palette — water/health
        bahari: {
          deep: '#0b3d4f',
          mid: '#127a8a',
          bright: '#19a7b5',
          pale: '#e7f4f6',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
