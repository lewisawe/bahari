import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative base so the built app works on any static host (GitHub Pages
  // subpath, Netlify, Vercel) and even when opened from the filesystem.
  base: './',
  plugins: [react()],
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.test.js', 'src/**/*.test.jsx'],
  },
});
