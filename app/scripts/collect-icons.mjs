// Build-time: pull official brand SVGs (simple-icons) and country flags into
// public/, so the browser never requests an icon from a third-party host.
// Run: node scripts/collect-icons.mjs
import { readdir, mkdir, copyFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as si from 'simple-icons';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outI = path.join(root, 'public', 'i');
const outFlags = path.join(root, 'public', 'flags');
await mkdir(outI, { recursive: true });
await mkdir(outFlags, { recursive: true });

// local name -> simple-icons export (siPascal). Only brands that are officially
// monochrome (or niche) come from simple-icons; the full-color logos (browsers,
// Google, Gemini, Meta, Instagram, TikTok, YouTube, Reddit, Facebook, LinkedIn,
// DuckDuckGo, Claude, Analytics) are official colored SVGs committed directly
// from browser-logos and svgl, so this script does not touch them.
const MAP = {
  openai: 'siOpenai', anthropic: 'siAnthropic', perplexity: 'siPerplexity', x: 'siX',
  // amazon: removed from simple-icons v16; the committed public/i/amazon.svg stays as-is.
  apple: 'siApple', threads: 'siThreads', stripe: 'siStripe',
  android: 'siAndroid', linux: 'siLinux', ubuntu: 'siUbuntu', bytedance: 'siBytedance',
  ecosia: 'siEcosia', qwant: 'siQwant',
};

const svg = (hex, pathD) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#${hex}"><path d="${pathD}"/></svg>`;

let made = 0;
for (const [name, exp] of Object.entries(MAP)) {
  const icon = si[exp];
  if (!icon) { console.warn('missing', exp); continue; }
  await writeFile(path.join(outI, `${name}.svg`), svg(icon.hex, icon.path));
  made++;
}

// Country flags (3x2 SVGs).
const flagsSrc = path.join(root, 'node_modules', 'country-flag-icons', '3x2');
let flags = 0;
for (const f of await readdir(flagsSrc)) {
  if (f.endsWith('.svg')) { await copyFile(path.join(flagsSrc, f), path.join(outFlags, f)); flags++; }
}
console.log(`icons: ${made} brand svgs, ${flags} flags`);
