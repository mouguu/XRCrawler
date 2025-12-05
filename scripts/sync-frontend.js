#!/usr/bin/env node

/**
 * Copy the Vite build output from frontend/dist into the root public directory
 * so that Express can serve the latest UI bundle.
 */

const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'frontend', 'dist');
const publicDir = path.join(projectRoot, 'public');

if (!fs.existsSync(distDir)) {
  console.error(
    '[sync-frontend] Missing frontend build output. Run "npm run build:frontend" first.',
  );
  process.exit(1);
}

fs.rmSync(publicDir, { recursive: true, force: true });
fs.mkdirSync(publicDir, { recursive: true });
fs.cpSync(distDir, publicDir, { recursive: true });

console.log('[sync-frontend] Copied frontend/dist → public');
