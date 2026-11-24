import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  // relative paths so the build works under andrewmacheret.com/projects/i5/
  base: './',
  test: {
    include: ['test/**/*.test.ts'],
  },
});
