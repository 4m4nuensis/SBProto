import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';

// Multi-page: include every .html at project root as an entry so vite build & dev resolve them.
const root = __dirname;
const htmlFiles = fs.readdirSync(root).filter(f => f.endsWith('.html'));
const input = Object.fromEntries(
  htmlFiles.map(f => [f.replace(/\.html$/, ''), path.resolve(root, f)])
);

export default defineConfig({
  root: '.',
  server: {
    host: true,
    port: 8080,
    strictPort: true,
    allowedHosts: true,
  },
  preview: {
    host: true,
    port: 8080,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: { input },
  },
});
