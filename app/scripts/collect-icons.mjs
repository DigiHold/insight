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

// local name -> simple-icons export (siPascal)
const MAP = {
  google: 'siGoogle', openai: 'siOpenai', anthropic: 'siAnthropic', perplexity: 'siPerplexity',
  x: 'siX', amazon: 'siAmazon', apple: 'siApple', meta: 'siMeta', gemini: 'siGooglegemini',
  chrome: 'siGooglechrome', firefox: 'siFirefoxbrowser', safari: 'siSafari', opera: 'siOpera',
  brave: 'siBrave', samsung: 'siSamsung', android: 'siAndroid', linux: 'siLinux', ubuntu: 'siUbuntu',
  stripe: 'siStripe', googleanalytics: 'siGoogleanalytics', linkedin: 'siLinkedin', facebook: 'siFacebook',
  reddit: 'siReddit', instagram: 'siInstagram', youtube: 'siYoutube', tiktok: 'siTiktok', threads: 'siThreads',
  duckduckgo: 'siDuckduckgo', claude: 'siClaude', bytedance: 'siBytedance', ecosia: 'siEcosia', qwant: 'siQwant',
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
