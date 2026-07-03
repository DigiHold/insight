#!/usr/bin/env node
// Insight CLI — read your analytics from the terminal (and let an assistant query it).
//
// Setup (one time), pick either env vars or a config file:
//   export INSIGHT_URL="https://insight.example.com"
//   export INSIGHT_TOKEN="<the INSIGHT_API_TOKEN you set on the server>"
// or write ~/.config/insight/config.json  ->  { "url": "...", "token": "..." }
//
// Usage:
//   insight sites                         list your sites (id, name, url)
//   insight stats [period] [--site X]     a full report for a period
//   insight report [period] [--site X]    alias of stats
//   period: today | 7d | 30d | 90d        (default 30d)
//   custom range: insight stats --from 2026-06-01 --to 2026-06-30
//   --site accepts a site id, a name, or a domain; default is all sites
//   --json prints the raw API response instead of a formatted report
//
// The token is read-only: it can read stats and list sites, nothing else.

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

function loadConfig() {
  let url = process.env.INSIGHT_URL || '';
  let token = process.env.INSIGHT_TOKEN || '';
  if (!url || !token) {
    try {
      const p = join(homedir(), '.config', 'insight', 'config.json');
      const c = JSON.parse(readFileSync(p, 'utf8'));
      url = url || c.url || '';
      token = token || c.token || '';
    } catch { /* no config file, rely on env */ }
  }
  if (!url || !token) {
    fail('Not configured. Set INSIGHT_URL and INSIGHT_TOKEN (env or ~/.config/insight/config.json).');
  }
  return { url: url.replace(/\/+$/, ''), token };
}

function fail(msg) { console.error(`insight: ${msg}`); process.exit(1); }

function parseArgs(argv) {
  const flags = {}; const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) { flags[key] = true; }
      else { flags[key] = next; i++; }
    } else positional.push(a);
  }
  return { flags, positional };
}

async function apiGet(cfg, path) {
  let res;
  try {
    res = await fetch(`${cfg.url}${path}`, { headers: { Authorization: `Bearer ${cfg.token}` } });
  } catch (e) {
    fail(`cannot reach ${cfg.url} (${e.message})`);
  }
  if (res.status === 401) fail('unauthorized — check INSIGHT_TOKEN matches the server INSIGHT_API_TOKEN.');
  if (!res.ok) fail(`API ${res.status} on ${path}`);
  return res.json();
}

const PERIODS = new Set(['today', '7d', '30d', '90d']);
function normPeriod(p) {
  if (!p) return '30d';
  const raw = String(p).toLowerCase();
  if (raw === 'today' || raw === '1d') return 'today';
  const s = raw.replace(/\s*days?$/, 'd');
  if (PERIODS.has(s)) return s;
  if (s === '7' || s === '30' || s === '90') return `${s}d`;
  fail(`unknown period "${p}" (use today, 7d, 30d, 90d, or --from/--to)`);
}

const PERIOD_LABEL = { today: 'today', '7d': 'last 7 days', '30d': 'last 30 days', '90d': 'last 90 days' };

function num(n) { return Number(n || 0).toLocaleString('en-US'); }
// avgDuration is milliseconds everywhere in the API (tracker and GA4 alike).
function dur(ms) {
  const s = Math.round(Number(ms || 0) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

function table(rows, opts = {}) {
  const top = (rows || []).slice(0, opts.limit || 10);
  if (top.length === 0) return '  (none)';
  const max = Math.max(...top.map((r) => Number(r.count || 0)), 1);
  const wName = Math.min(38, Math.max(...top.map((r) => (r.name || '').length), 4));
  return top.map((r) => {
    const name = (r.name || '(direct)').slice(0, wName).padEnd(wName);
    const count = String(num(r.count)).padStart(8);
    const pct = Math.round((Number(r.count || 0) / max) * 100);
    const bar = '█'.repeat(Math.round(pct / 8));
    return `  ${name}  ${count}  ${bar}`;
  }).join('\n');
}

async function resolveSite(cfg, wanted) {
  if (!wanted || wanted === 'all') return { id: 'all', label: 'all sites' };
  const { sites } = await apiGet(cfg, '/api/sites');
  const w = String(wanted).toLowerCase();
  const hit = sites.find((s) =>
    s.id === wanted ||
    (s.name || '').toLowerCase() === w ||
    (s.url || '').toLowerCase().includes(w));
  if (!hit) fail(`no site matching "${wanted}". Run "insight sites" to see them.`);
  return { id: hit.id, label: hit.name || hit.url || hit.id };
}

async function cmdSites(cfg) {
  const { sites } = await apiGet(cfg, '/api/sites');
  if (!sites.length) { console.log('No sites yet.'); return; }
  const wName = Math.max(...sites.map((s) => (s.name || '').length), 4);
  console.log(`${'NAME'.padEnd(wName)}  ${'URL'.padEnd(28)}  ID`);
  for (const s of sites) {
    console.log(`${(s.name || '').padEnd(wName)}  ${(s.url || '').padEnd(28)}  ${s.id}`);
  }
}

async function cmdStats(cfg, positional, flags) {
  const site = await resolveSite(cfg, flags.site);
  let query;
  let periodLabel;
  if (flags.from && flags.to) {
    query = `period=custom&from=${encodeURIComponent(flags.from)}&to=${encodeURIComponent(flags.to)}`;
    periodLabel = `${flags.from} → ${flags.to}`;
  } else {
    const period = normPeriod(positional[0]);
    query = `period=${period}`;
    periodLabel = PERIOD_LABEL[period];
  }
  const siteParam = site.id === 'all' ? 'all' : encodeURIComponent(site.id);
  const data = await apiGet(cfg, `/api/stats?site=${siteParam}&${query}`);

  if (flags.json) { console.log(JSON.stringify(data, null, 2)); return; }

  const t = data.today || {};
  const rev = data.revenue;
  console.log(`\nInsight — ${site.label} — ${periodLabel}\n`);
  const line = [
    `Visitors: ${num(t.visitors)}`,
    `Pageviews: ${num(t.pageviews)}`,
    `Bounce: ${Math.round(Number(t.bounceRate || 0))}%`,
    `Avg time: ${dur(t.avgDuration)}`,
  ];
  if (rev && (rev.today || rev.count)) line.push(`Revenue: ${rev.currency || '$'}${num(rev.today)} (${num(rev.count)} sales)`);
  console.log(line.join('   '));

  const split = data.visitorSplit;
  if (split && (split.newV || split.returning)) {
    console.log(`New vs returning: ${num(split.newV)} new · ${num(split.returning)} returning`);
  }

  console.log('\nTop pages'); console.log(table(data.pages));
  console.log('\nTraffic sources'); console.log(table(data.channels));
  if (data.referrers && data.referrers.length) { console.log('\nTop referrers'); console.log(table(data.referrers)); }
  console.log('\nTop countries'); console.log(table(data.countries));
  console.log('\nDevices'); console.log(table(data.devices, { limit: 5 }));
  console.log('\nBrowsers'); console.log(table(data.browsers, { limit: 6 }));
  console.log('');
}

function usage() {
  console.log(`Insight CLI

  insight sites                     list your sites (id, name, url)
  insight stats [period]            report for a period (default 30d)
  insight report [period]           alias of stats
  insight stats --from D --to D     custom date range (YYYY-MM-DD)

Options
  --site <id|name|domain>           one site; omit for all sites
  --json                            raw API JSON instead of a report

Periods: today, 7d, 30d, 90d
Config:  INSIGHT_URL + INSIGHT_TOKEN (env), or ~/.config/insight/config.json`);
}

async function main() {
  const { flags, positional } = parseArgs(process.argv.slice(2));
  const cmd = positional.shift() || 'stats';
  if (cmd === 'help' || flags.help) { usage(); return; }
  const cfg = loadConfig();
  if (cmd === 'sites') return cmdSites(cfg);
  if (cmd === 'stats' || cmd === 'report') return cmdStats(cfg, positional, flags);
  fail(`unknown command "${cmd}" (try: sites, stats, report, help)`);
}

main().catch((e) => fail(e.message));
