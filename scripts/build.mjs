#!/usr/bin/env node
/**
 * Combined build script - runs CSS build then esbuild
 * Avoids npm echoing commands
 */

import { execSync } from 'child_process';
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Run CSS build silently
execSync('node scripts/build-css.mjs', { cwd: ROOT, stdio: 'inherit' });

// Run esbuild with args passed through
const args = process.argv.slice(2).join(' ');
execSync(`node esbuild.config.mjs ${args}`, { cwd: ROOT, stdio: 'inherit' });

// Package the installable plugin files into dist/kimi-claudian/
const distDir = join(ROOT, 'dist', 'kimi-claudian');
rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });

for (const file of ['main.js', 'manifest.json', 'styles.css']) {
  const source = join(ROOT, file);
  if (existsSync(source)) {
    copyFileSync(source, join(distDir, file));
  } else {
    console.warn(`Warning: ${file} not found in project root`);
  }
}

console.log(`\nPackaged plugin to ${distDir}`);
