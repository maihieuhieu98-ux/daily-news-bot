import { execSync } from 'node:child_process';
import fs from 'node:fs';

console.log('🚀 [INIT] Initializing Remotion Cloud Video Engine...');

// 1. Check and install dependencies if missing
if (!fs.existsSync('node_modules/@google/genai') || !fs.existsSync('node_modules/remotion') || !fs.existsSync('node_modules/@remotion/cli')) {
  console.log('📦 [DEPENDENCIES] Installing npm dependencies (remotion, react, @google/genai)...');
  execSync('npm install --no-audit --prefer-offline', { stdio: 'inherit' });
  console.log('✅ [DEPENDENCIES] Installed successfully!');
}

// 2. Ensure Remotion headless browser is available
try {
  console.log('🌐 [BROWSER] Ensuring Remotion headless browser...');
  execSync('npx remotion browser ensure', { stdio: 'inherit' });
} catch (e) {
  console.warn('⚠️ [BROWSER] Note:', e.message);
}

// 3. Launch cloud render pipeline
await import('./scripts/cloud-render-video.mjs');
