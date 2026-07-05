'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode, type SyntheticEvent } from 'react';
import { createPortal } from 'react-dom';
import { Area, Bar, CartesianGrid, Cell, ComposedChart, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import dynamic from 'next/dynamic';
import { DndContext, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const GlobeModal = dynamic(() => import('./globe'), { ssr: false });

interface SiteItem { id: string; name: string; createdAt: number; url: string; favicon: boolean; stripe: boolean; ga4: boolean }
interface Row { name: string; count: number }
interface Keyword { query: string; clicks: number; impressions: number; ctr: number; position: number }
interface Stats {
  online: number;
  today: { visitors: number; pageviews: number; avgDuration: number; bounceRate: number };
  prev?: { visitors: number; pageviews: number; avgDuration: number; bounceRate: number } | null;
  revenue: { currency: string; today: number; changePct: number | null; count: number; gross: number; refunds: number; prevSum: number; prevCount: number } | null;
  channels: { name: string; type: string; count: number }[];
  referrers: Row[];
  campaigns: Row[];
  pages: Row[];
  countries: Row[];
  devices: Row[];
  browsers: Row[];
  os: Row[];
  series: { t: string; count: number; revenue?: number; refunds?: number }[];
  ai: AiBot[];
  aiSeries?: Record<string, number | string>[];
  aiBots?: string[];
  landing?: Row[];
  exits?: Row[];
  outbound?: Row[];
  utmMedium?: Row[];
  utmTerm?: Row[];
  utmContent?: Row[];
  languages?: Row[];
  cities?: Row[];
  regions?: Row[];
  visitorSplit?: { newV: number; returning: number };
  heatmap?: { d: number; h: number; c: number }[];
  retention?: { cohort: string; offset: number; n: number }[];
  revAttrib?: { source: { name: string; amount: number }[]; campaign: { name: string; amount: number }[] };
  funnel?: { steps: string[]; counts: number[] } | null;
}
interface AiBot { name: string; vendor: string; category: string; count: number; last: string; pages: { name: string; count: number }[] }

const ACCENT = '#ffa950';
const SOURCE_LABEL: Record<string, string> = {
  google: 'Google', bing: 'Bing', duckduckgo: 'DuckDuckGo', brave: 'Brave', ecosia: 'Ecosia', qwant: 'Qwant', yahoo: 'Yahoo',
  chatgpt: 'ChatGPT', perplexity: 'Perplexity', claude: 'Claude', gemini: 'Gemini', grok: 'Grok', copilot: 'Copilot',
  x: 'X', linkedin: 'LinkedIn', facebook: 'Facebook', reddit: 'Reddit', instagram: 'Instagram', youtube: 'YouTube', tiktok: 'TikTok', threads: 'Threads',
  direct: 'Direct',
};
const TYPE_COLOR: Record<string, string> = { search: '#ffa950', social: '#10b981', ai: '#ec4899', referral: '#3b82f6', direct: '#94a3b8' };
const CHANNEL_LABEL: Record<string, string> = { search: 'Organic search', social: 'Organic social', ai: 'AI', referral: 'Referral', direct: 'Direct' };
// AI/crawler vendor -> local official SVG in /public/i (missing ones fall back to a globe).
const VENDOR_ICON: Record<string, string> = {
  openai: 'openai', anthropic: 'anthropic', perplexity: 'perplexity', google: 'google', gemini: 'gemini',
  xai: 'x', bytedance: 'bytedance', amazon: 'amazon', apple: 'apple', meta: 'meta', duckduckgo: 'duckduckgo',
  microsoft: 'bing', cohere: 'cohere', commoncrawl: 'commoncrawl', timpi: 'timpi', you: 'you',
};
// Known referrer hostnames -> local official SVG. Unknown hosts use the proxy.
const DOMAIN_ICON: Record<string, string> = {
  'google.com': 'google', 'www.google.com': 'google', 'news.google.com': 'google',
  'duckduckgo.com': 'duckduckgo', 'brave.com': 'brave', 'search.brave.com': 'brave',
  'ecosia.org': 'ecosia', 'www.ecosia.org': 'ecosia', 'qwant.com': 'qwant',
  'linkedin.com': 'linkedin', 'www.linkedin.com': 'linkedin', 'lnkd.in': 'linkedin',
  'x.com': 'x', 'twitter.com': 'x', 't.co': 'x',
  'facebook.com': 'facebook', 'www.facebook.com': 'facebook', 'm.facebook.com': 'facebook', 'l.facebook.com': 'facebook',
  'reddit.com': 'reddit', 'www.reddit.com': 'reddit', 'out.reddit.com': 'reddit',
  'instagram.com': 'instagram', 'l.instagram.com': 'instagram',
  'youtube.com': 'youtube', 'www.youtube.com': 'youtube', 'youtu.be': 'youtube',
  'tiktok.com': 'tiktok', 'www.tiktok.com': 'tiktok', 'threads.net': 'threads', 'www.threads.net': 'threads',
  'openai.com': 'openai', 'chatgpt.com': 'openai', 'chat.openai.com': 'openai',
  'perplexity.ai': 'perplexity', 'www.perplexity.ai': 'perplexity',
  'claude.ai': 'anthropic', 'anthropic.com': 'anthropic', 'gemini.google.com': 'gemini',
  'amazon.com': 'amazon', 'apple.com': 'apple', 'meta.com': 'meta',
  'bing.com': 'bing', 'www.bing.com': 'bing', 'cn.bing.com': 'bing',
  'yahoo.com': 'yahoo', 'www.yahoo.com': 'yahoo', 'search.yahoo.com': 'yahoo', 'r.search.yahoo.com': 'yahoo',
  'copilot.microsoft.com': 'copilot', 'you.com': 'you',
  'sendinblue.com': 'brevo', 'brevo.com': 'brevo', 'sibautomation.com': 'brevo',
};
// Pale background per vendor for the crawler icon square (each brand has its own tint).
const VENDOR_TINT: Record<string, string> = {
  openai: 'bg-emerald-100 dark:bg-emerald-500/20',
  google: 'bg-blue-100 dark:bg-blue-500/20',
  anthropic: 'bg-orange-100 dark:bg-orange-500/20',
  perplexity: 'bg-teal-100 dark:bg-teal-500/20',
  xai: 'bg-zinc-200 dark:bg-zinc-700/60',
  bytedance: 'bg-sky-100 dark:bg-sky-500/20',
  amazon: 'bg-amber-100 dark:bg-amber-500/20',
  apple: 'bg-zinc-200 dark:bg-zinc-700/60',
  commoncrawl: 'bg-slate-200 dark:bg-slate-500/20',
  meta: 'bg-indigo-100 dark:bg-indigo-500/20',
};
const vendorTint = (v: string): string => VENDOR_TINT[v] ?? 'bg-zinc-100 dark:bg-zinc-800';
const OS_SLUG: Record<string, string> = { macos: 'apple', macintosh: 'apple', ios: 'apple', android: 'android', linux: 'linux', ubuntu: 'ubuntu', 'chrome os': 'chrome', chromeos: 'chrome' };
const BROWSER_LOGO: Record<string, string> = { chrome: 'chrome', safari: 'safari', 'safari (in-app)': 'safari', 'mobile safari': 'safari', firefox: 'firefox', edge: 'edge', 'microsoft edge': 'edge', opera: 'opera', brave: 'brave', 'samsung internet': 'samsung', 'android webview': 'chrome' };

const cap = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
let regionNames: Intl.DisplayNames | null = null;
try { regionNames = new Intl.DisplayNames(['en'], { type: 'region' }); } catch { regionNames = null; }
const countryName = (c: string): string => { try { return regionNames?.of(c.toUpperCase()) ?? c; } catch { return c; } };
let langNames: Intl.DisplayNames | null = null;
try { langNames = new Intl.DisplayNames(['en'], { type: 'language' }); } catch { langNames = null; }
// Tracker sends 2-letter codes; GA4 sends full names already.
const langLabel = (v: string): string => { if (v.length > 3) return v; try { return langNames?.of(v) ?? v; } catch { return v; } };
const timeAgo = (sec: number): string => {
  const d = Math.max(0, Math.floor(Date.now() / 1000) - sec);
  if (d < 60) return `${d}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  return `${Math.floor(d / 3600)}h ago`;
};
function osLabel(v: string): string {
  const s = v.toLowerCase();
  if (s === 'macos' || s === 'macintosh' || s === 'mac os') return 'Mac OS';
  if (s === 'ios') return 'iOS';
  if (s === 'chrome os' || s === 'chromeos') return 'Chrome OS';
  if (s === 'windows') return 'Windows';
  if (s === 'android') return 'Android';
  if (s === 'linux') return 'Linux';
  return cap(v);
}
const fmt = (v: number): string => v.toLocaleString('en-US');
function fmtDur(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s <= 0) return '0s';
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}
function fmtMoney(amount: number, currency: string, digits = 0): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase(), maximumFractionDigits: digits }).format(amount);
  } catch {
    return `$${amount.toFixed(digits)}`;
  }
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const parseKey = (t: string): Date | null => { if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null; const [y, m, d] = t.split('-').map(Number); return new Date(y, m - 1, d); };
const axisLabel = (t: string): string => { const d = parseKey(t); return d ? `${d.getDate()} ${MONTHS[d.getMonth()]}` : t.replace(/:00$/, 'h'); };
const fullDate = (t: string): string => { const d = parseKey(t); return d ? `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS_FULL[d.getMonth()]}` : t.replace(/:00$/, 'h'); };
function relDays(t: string): string | null {
  const d = parseKey(t);
  if (!d) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - d.getTime()) / 86400000);
  return diff <= 0 ? 'Today' : diff === 1 ? 'Yesterday' : `${diff} days ago`;
}

interface RevenueBreakdown { currency: string; total: number; gross: number; refunds: number }
interface MetricDef { label: string; value: string; change?: number | null; live?: boolean; inverse?: boolean; revenue?: RevenueBreakdown }
// Percentage change between the current period and the previous one. null when there is no comparison base.
const pctChange = (cur: number, prev: number | undefined): number | null =>
  prev && prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null;

function buildMetrics(data: Stats | null): MetricDef[] {
  const t = data?.today;
  const p = data?.prev ?? null;
  const rev = data?.revenue;
  const visitors = t?.visitors ?? 0;
  const list: MetricDef[] = [
    { label: 'Visitors', value: fmt(visitors), change: pctChange(visitors, p?.visitors) },
    { label: 'Page views', value: fmt(t?.pageviews ?? 0), change: pctChange(t?.pageviews ?? 0, p?.pageviews) },
  ];
  if (rev) {
    const curConv = visitors > 0 ? (rev.count / visitors) * 100 : 0;
    const prevConv = p && p.visitors > 0 ? (rev.prevCount / p.visitors) * 100 : 0;
    const curRpv = visitors > 0 ? rev.today / visitors : 0;
    const prevRpv = p && p.visitors > 0 ? rev.prevSum / p.visitors : 0;
    list.push({ label: 'Revenue', value: fmtMoney(rev.today, rev.currency), change: rev.changePct, revenue: { currency: rev.currency, total: rev.today, gross: rev.gross, refunds: rev.refunds } });
    list.push({ label: 'Conversion', value: `${curConv.toFixed(2)}%`, change: pctChange(curConv, prevConv) });
    list.push({ label: 'Revenue/visitor', value: fmtMoney(curRpv, rev.currency, 2), change: pctChange(curRpv, prevRpv) });
  }
  list.push({ label: 'Bounce rate', value: `${t?.bounceRate ?? 0}%`, change: pctChange(t?.bounceRate ?? 0, p?.bounceRate), inverse: true });
  list.push({ label: 'Avg. time', value: fmtDur(t?.avgDuration ?? 0), change: pctChange(t?.avgDuration ?? 0, p?.avgDuration) });
  list.push({ label: 'Online', value: fmt(data?.online ?? 0), live: true });
  return list;
}

interface Item { key: string; left: ReactNode; value: number; color: string }
type Align = 'left' | 'center' | 'right';
interface DetailTable { columns: string[]; rows: ReactNode[][]; align?: Align[]; filter?: string[]; widths?: string[]; logo?: ReactNode }

const ordSuffix = (n: number): string => { const v = n % 100; return v >= 11 && v <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'); };
// GSC position as an ordinal, with a medal for the top 3 (explicitly requested by the user).
function posLabel(p: number): string {
  const r = Math.max(1, Math.round(p));
  return r === 1 ? '🥇 1st' : r === 2 ? '🥈 2nd' : r === 3 ? '🥉 3rd' : `${r}${ordSuffix(r)}`;
}
const GscLogo = () => (
  <svg viewBox="0 0 278 40" fill="none" className="h-5 w-auto" aria-hidden>
    <path d="M11.081 30.527l-4.72 4.721a.933.933 0 0 1-1.317 0l-.292-.292a.933.933 0 0 1 0-1.316l4.72-4.721a.933.933 0 0 1 1.318 0l.291.291a.93.93 0 0 1 0 1.317z" fill="#FBBC04" /><path d="M23.75 32.5h6.042a6.04 6.04 0 0 0 6.041-6.042v-16.25a6.04 6.04 0 0 0-6.041-6.041 6.04 6.04 0 0 0-6.042 6.041V32.5z" fill="#4285F4" /><path d="M13.75 32.5a6.04 6.04 0 0 0 6.042-6.042 6.04 6.04 0 0 0-6.042-6.041 6.04 6.04 0 0 0-6.042 6.041A6.04 6.04 0 0 0 13.75 32.5z" fill="#FBBC04" /><path d="M27.97 32.5h-5.887a6.04 6.04 0 0 1-6.041-6.042v-7.916a6.04 6.04 0 0 1 6.041-6.042 6.04 6.04 0 0 1 6.042 6.042v13.804a.154.154 0 0 1-.154.154z" fill="#34A853" /><path d="M28.125 32.346V18.542a6.042 6.042 0 0 0-4.375-5.807V32.5h4.22a.154.154 0 0 0 .155-.154z" fill="#1967D2" /><path d="M19.792 26.575a6.04 6.04 0 0 0-3.75-5.59v5.59c0 1.72.72 3.273 1.875 4.373a6.024 6.024 0 0 0 1.875-4.373z" fill="#EA4335" /><path d="M136.949 24.423c0 1.404-.515 2.533-1.543 3.385-1.044.837-2.311 1.255-3.802 1.255-1.327 0-2.497-.388-3.511-1.163-1.014-.775-1.714-1.834-2.102-3.176l1.968-.805c.134.478.32.91.559 1.297.238.388.518.72.839.995.32.276.674.492 1.062.649.388.156.798.235 1.23.235.939 0 1.707-.243 2.304-.727.596-.485.894-1.13.894-1.934 0-.671-.246-1.245-.738-1.722-.462-.462-1.327-.91-2.594-1.342-1.282-.462-2.08-.775-2.393-.94-1.699-.864-2.549-2.138-2.549-3.823 0-1.178.47-2.184 1.409-3.02.954-.834 2.124-1.252 3.511-1.252 1.222 0 2.281.313 3.175.94.895.611 1.491 1.379 1.789 2.303l-1.923.805a2.844 2.844 0 0 0-1.062-1.487c-.53-.395-1.174-.592-1.935-.592-.805 0-1.483.223-2.035.668-.551.416-.827.957-.827 1.625 0 .55.216 1.025.649 1.425.476.401 1.512.876 3.108 1.425 1.625.553 2.784 1.23 3.477 2.029.694.8 1.041 1.781 1.041 2.947h-.001zM143.635 29.062c-1.61 0-2.937-.551-3.981-1.655-1.043-1.103-1.565-2.496-1.565-4.181s.507-3.06 1.521-4.17c1.013-1.111 2.31-1.666 3.891-1.666 1.58 0 2.918.525 3.88 1.576.962 1.05 1.442 2.523 1.442 4.416l-.022.224h-8.61c.03 1.073.388 1.938 1.074 2.594a3.43 3.43 0 0 0 2.459.984c1.312 0 2.341-.656 3.086-1.968l1.834.894a5.464 5.464 0 0 1-2.046 2.17c-.872.521-1.859.782-2.963.782zm-3.287-7.156h6.284a2.731 2.731 0 0 0-.928-1.89c-.559-.499-1.309-.748-2.248-.748-.775 0-1.443.238-2.002.715-.559.477-.927 1.118-1.106 1.923zM154.398 17.389c1.52 0 2.72.406 3.6 1.219.879.813 1.319 1.927 1.319 3.343v6.753h-1.967v-1.52h-.09c-.85 1.252-1.983 1.878-3.399 1.878-1.208 0-2.218-.358-3.03-1.073-.813-.716-1.219-1.61-1.219-2.684 0-1.132.428-2.035 1.285-2.706.857-.67 2.002-1.006 3.433-1.006 1.222 0 2.229.224 3.019.671v-.47c0-.715-.283-1.323-.85-1.822-.567-.5-1.23-.75-1.99-.75-1.148 0-2.057.485-2.728 1.454l-1.812-1.14c.999-1.431 2.475-2.147 4.428-2.147h.001zm-2.661 7.961c0 .537.227.984.682 1.342.454.358.987.537 1.599.537.864 0 1.636-.32 2.314-.962.678-.64 1.018-1.394 1.018-2.259-.642-.506-1.536-.76-2.684-.76-.835 0-1.532.201-2.091.604-.559.402-.839.902-.839 1.498h.001zM163.331 28.704h-2.057V17.747h1.968v1.789h.089c.209-.582.638-1.077 1.286-1.487.649-.41 1.286-.615 1.912-.615.626 0 1.103.09 1.521.268l-.626 1.99c-.254-.104-.657-.156-1.208-.156-.775 0-1.45.313-2.024.94a3.141 3.141 0 0 0-.861 2.19v6.038zM173.569 29.062c-1.625 0-2.975-.551-4.048-1.655-1.059-1.132-1.588-2.527-1.588-4.181 0-1.655.529-3.079 1.588-4.182 1.073-1.103 2.423-1.655 4.048-1.655 1.118 0 2.094.28 2.929.839.835.559 1.461 1.33 1.879 2.314l-1.879.783c-.581-1.372-1.603-2.058-3.063-2.058-.94 0-1.753.38-2.438 1.141-.671.76-1.006 1.7-1.006 2.818s.335 2.057 1.006 2.817c.685.76 1.498 1.14 2.438 1.14 1.505 0 2.563-.685 3.175-2.057l1.834.783c-.403.984-1.033 1.755-1.89 2.314-.857.56-1.852.84-2.985.84zM179.7 12.693h2.057v5.054l-.089 1.52h.089c.313-.536.795-.983 1.443-1.341a4.136 4.136 0 0 1 2.024-.537c1.341 0 2.374.384 3.097 1.152.723.768 1.084 1.86 1.084 3.276v6.887h-2.057V22.22c0-1.968-.872-2.952-2.616-2.952-.836 0-1.54.347-2.114 1.04-.574.693-.861 1.503-.861 2.427v5.97H179.7V12.693zM204.634 29.062c-2.371 0-4.354-.797-5.949-2.393-1.58-1.595-2.37-3.585-2.37-5.97 0-2.386.79-4.368 2.37-5.949 1.58-1.61 3.563-2.415 5.949-2.415 2.385 0 4.375.872 5.881 2.616l-1.476 1.432c-1.148-1.387-2.616-2.08-4.405-2.08-1.789 0-3.258.596-4.45 1.789-1.178 1.178-1.767 2.714-1.767 4.607 0 1.893.589 3.429 1.767 4.606 1.192 1.193 2.675 1.79 4.45 1.79 1.863 0 3.481-.783 4.852-2.349l1.499 1.454a7.774 7.774 0 0 1-2.796 2.113 8.52 8.52 0 0 1-3.555.75zM211.778 23.226c0-1.685.529-3.079 1.588-4.182 1.073-1.103 2.422-1.655 4.048-1.655 1.625 0 2.966.552 4.025 1.655 1.073 1.103 1.61 2.497 1.61 4.182 0 1.684-.537 3.093-1.61 4.181-1.059 1.104-2.401 1.655-4.025 1.655-1.625 0-2.975-.551-4.048-1.655-1.059-1.103-1.588-2.496-1.588-4.181zm2.058 0c0 1.178.342 2.132 1.028 2.862.686.73 1.536 1.096 2.55 1.096 1.014 0 1.863-.365 2.549-1.096.685-.73 1.029-1.684 1.029-2.862 0-1.178-.344-2.11-1.029-2.84-.701-.746-1.551-1.119-2.549-1.119-.999 0-1.849.373-2.55 1.119-.686.73-1.028 1.677-1.028 2.84zM224.509 17.747h1.968v1.52h.09c.313-.536.794-.983 1.442-1.341a4.136 4.136 0 0 1 2.024-.537c1.342 0 2.374.384 3.097 1.152.723.768 1.085 1.86 1.085 3.276v6.887h-2.058v-6.753c-.044-1.789-.947-2.684-2.706-2.684-.82 0-1.506.332-2.057.995-.552.664-.827 1.458-.827 2.382v6.06h-2.058V17.746zM244.519 25.663c0 .954-.417 1.76-1.252 2.415-.835.656-1.886.984-3.153.984-1.104 0-2.073-.287-2.907-.86a4.734 4.734 0 0 1-1.789-2.27l1.833-.783c.269.656.66 1.166 1.174 1.532a2.851 2.851 0 0 0 1.689.547c.656 0 1.204-.14 1.643-.424.44-.283.66-.619.66-1.007 0-.7-.537-1.215-1.61-1.543l-1.878-.47c-2.133-.536-3.198-1.565-3.198-3.085 0-.999.406-1.8 1.219-2.404.812-.604 1.852-.905 3.119-.905.969 0 1.845.23 2.628.693.783.462 1.331 1.08 1.643 1.856l-1.833.76a2.309 2.309 0 0 0-1.018-1.084 3.191 3.191 0 0 0-1.576-.392c-.537 0-1.017.134-1.443.403-.425.268-.637.596-.637.984 0 .626.589 1.073 1.767 1.341l1.655.425c2.176.537 3.265 1.633 3.265 3.288h-.001zM245.292 23.226c0-1.685.529-3.079 1.588-4.182 1.073-1.103 2.422-1.655 4.048-1.655 1.625 0 2.966.552 4.025 1.655 1.073 1.103 1.61 2.497 1.61 4.182 0 1.684-.537 3.093-1.61 4.181-1.059 1.104-2.401 1.655-4.025 1.655-1.625 0-2.975-.551-4.048-1.655-1.059-1.103-1.588-2.496-1.588-4.181zm2.058 0c0 1.178.342 2.132 1.028 2.862.686.73 1.536 1.096 2.55 1.096 1.014 0 1.863-.365 2.549-1.096.685-.73 1.029-1.684 1.029-2.862 0-1.178-.344-2.11-1.029-2.84-.701-.746-1.551-1.119-2.549-1.119-.999 0-1.849.373-2.55 1.119-.686.73-1.028 1.677-1.028 2.84zM260.108 12.693v16.011h-2.058V12.693h2.058zM267.14 29.062c-1.61 0-2.937-.551-3.98-1.655-1.044-1.103-1.566-2.496-1.566-4.181s.507-3.06 1.521-4.17c1.014-1.111 2.311-1.666 3.891-1.666 1.581 0 2.919.525 3.88 1.576.962 1.05 1.442 2.523 1.442 4.416l-.022.224h-8.609c.029 1.073.387 1.938 1.073 2.594a3.43 3.43 0 0 0 2.46.984c1.311 0 2.34-.656 3.086-1.968l1.834.894a5.464 5.464 0 0 1-2.046 2.17c-.873.521-1.86.782-2.963.782h-.001zm-3.287-7.156h6.284a2.731 2.731 0 0 0-.928-1.89c-.559-.499-1.308-.748-2.248-.748-.775 0-1.442.238-2.001.715-.559.477-.928 1.118-1.107 1.923zM57.577 21.682v-2.476h8.287c.084.437.134.956.134 1.518 0 1.857-.508 4.156-2.144 5.792-1.59 1.658-3.624 2.542-6.32 2.542-4.995 0-9.194-4.067-9.194-9.064 0-4.995 4.2-9.063 9.194-9.063 2.762 0 4.73 1.083 6.21 2.498l-1.746 1.747c-1.061-.995-2.497-1.769-4.464-1.769-3.647 0-6.498 2.94-6.498 6.588s2.851 6.588 6.498 6.588c2.365 0 3.713-.95 4.575-1.813.702-.702 1.164-1.71 1.344-3.087h-5.876zM78.626 23.223c0 3.36-2.63 5.836-5.856 5.836-3.227 0-5.857-2.476-5.857-5.837 0-3.36 2.63-5.836 5.857-5.836 3.226 0 5.856 2.454 5.856 5.837zm-2.563 0c0-2.1-1.525-3.537-3.293-3.537-1.768 0-3.293 1.436-3.293 3.537 0 2.1 1.525 3.536 3.293 3.536 1.769 0 3.293-1.459 3.293-3.537zM91.403 23.223c0 3.36-2.63 5.836-5.857 5.836-3.227 0-5.857-2.476-5.857-5.837 0-3.36 2.63-5.836 5.857-5.836 3.227 0 5.857 2.454 5.857 5.837zm-2.564 0c0-2.1-1.524-3.537-3.292-3.537-1.768 0-3.294 1.436-3.294 3.537 0 2.1 1.525 3.536 3.294 3.536 1.768 0 3.292-1.459 3.292-3.537zM103.649 17.74v10.478c0 4.31-2.541 6.08-5.547 6.08-2.83 0-4.53-1.902-5.172-3.449l2.232-.929c.398.95 1.37 2.078 2.94 2.078 1.923 0 3.116-1.194 3.116-3.426v-.84h-.088c-.575.707-1.68 1.326-3.072 1.326-2.918 0-5.592-2.542-5.592-5.814 0-3.272 2.674-5.858 5.592-5.858 1.392 0 2.497.619 3.072 1.304h.088v-.95h2.431zm-2.254 5.504c0-2.056-1.37-3.559-3.117-3.559-1.746 0-3.248 1.503-3.248 3.56 0 2.055 1.48 3.514 3.248 3.514 1.769 0 3.117-1.48 3.117-3.515zM107.991 11.608v17.097h-2.563V11.608h2.563zM117.891 25.145l1.989 1.326c-.641.951-2.188 2.587-4.862 2.587-3.315 0-5.791-2.565-5.791-5.836 0-3.471 2.498-5.837 5.503-5.837 3.006 0 4.509 2.41 4.995 3.714l.265.663-7.802 3.228c.597 1.172 1.526 1.769 2.829 1.769 1.304 0 2.211-.642 2.874-1.614zm-6.122-2.1l5.215-2.166c-.287-.73-1.149-1.238-2.165-1.238-1.304 0-3.117 1.15-3.05 3.405z" className="fill-zinc-900 dark:fill-zinc-50" />
  </svg>
);
interface Tab { label: string; icon?: ReactNode; items: Item[]; donut?: boolean; detail?: DetailTable; emptyNote?: string; metric?: string }
const plainItems = (rows: Row[], color: string, transform?: (s: string) => string): Item[] =>
  rows.map((r) => ({ key: r.name || '—', left: <span className="truncate">{(transform ?? ((s) => s || '/'))(r.name)}</span>, value: r.count, color }));

type Modal = null | { type: 'add' } | { type: 'script'; site: SiteItem } | { type: 'stripe'; site: SiteItem } | { type: 'ga4'; site: SiteItem } | { type: 'url'; site: SiteItem } | { type: 'delete'; site: SiteItem };
type Period = 'today' | '7d' | '30d' | '90d' | 'custom';


const PERIODS: Period[] = ['today', '7d', '30d', '90d', 'custom'];

// Customizable dashboard cards (order + hide are saved locally). Two-column
// cards (revenue, ai) span the full width. The KPI/chart hero stays fixed.
type CardId = 'sources' | 'pages' | 'technology' | 'locations' | 'feed' | 'heatmap' | 'funnel' | 'retention' | 'revenue' | 'ai';
const DEFAULT_CARDS: CardId[] = ['sources', 'pages', 'technology', 'locations', 'feed', 'heatmap', 'funnel', 'retention', 'revenue', 'ai'];
const WIDE_CARDS = new Set<CardId>(['revenue', 'ai']);
const CARD_LABEL: Record<CardId, string> = {
  sources: 'Sources', pages: 'Pages', technology: 'Technology', locations: 'Locations',
  feed: 'Live feed', heatmap: 'Busy hours', funnel: 'Funnel', retention: 'Retention',
  revenue: 'Revenue attribution', ai: 'AI & crawlers',
};
const readIds = (key: string, fallback: CardId[]): CardId[] => {
  if (typeof window === 'undefined') return fallback;
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? '[]') as CardId[];
    const known = saved.filter((id) => (DEFAULT_CARDS as string[]).includes(id));
    // Append any card added in a newer version so it is never lost.
    return key.includes('order') ? [...known, ...DEFAULT_CARDS.filter((id) => !known.includes(id))] : known;
  } catch {
    return fallback;
  }
};

// A dashboard card wrapped for drag-and-drop. In edit mode the whole card is a
// drag handle, its content is inert, and a hide button appears.
function SortableCard({ id, wide, edit, onHide, children }: { id: CardId; wide: boolean; edit: boolean; onHide: () => void; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: !edit });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative h-full min-w-0 ${wide ? 'md:col-span-2' : ''} ${isDragging ? 'z-30 opacity-90' : ''} ${edit ? 'cursor-grab active:cursor-grabbing' : ''}`}
      {...(edit ? { ...attributes, ...listeners } : {})}
    >
      {edit && (
        <>
          <div className="pointer-events-none absolute inset-0 z-10 rounded-[1.25rem] ring-2 ring-dashed ring-[#ffa950]/50" />
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onHide}
            aria-label={`Hide ${CARD_LABEL[id]}`}
            className="absolute -right-2 -top-2 z-20 flex size-7 items-center justify-center rounded-full bg-rose-600 text-white shadow-lg transition-transform hover:scale-110"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden><path d="M4 8h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          </button>
        </>
      )}
      <div className={`h-full ${edit ? 'jiggle pointer-events-none select-none' : ''}`}>{children}</div>
    </div>
  );
}

const GripIcon = () => <Ico><circle cx="9" cy="6" r="1" /><circle cx="9" cy="12" r="1" /><circle cx="9" cy="18" r="1" /><circle cx="15" cy="6" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="15" cy="18" r="1" /></Ico>;

export default function Dashboard({ demoSite }: { demoSite?: SiteItem } = {}) {
  // Read-only public demo: one fixed site, no mutations, no account chrome.
  const demo = !!demoSite;
  const [sites, setSites] = useState<SiteItem[]>(demoSite ? [demoSite] : []);
  const [siteId, setSiteId] = useState<string>(demoSite ? demoSite.id : '');
  const [data, setData] = useState<Stats | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [globeOpen, setGlobeOpen] = useState(false);
  const [period, setPeriod] = useState<Period>('today');
  const site = sites.find((s) => s.id === siteId);

  // Custom date range (used when period === 'custom'), persisted locally.
  const [range, setRange] = useState<{ from: string; to: string }>(() => {
    const to = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const from = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
    return { from, to };
  });
  const [rangeOpen, setRangeOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState<{ date: string; text: string }[]>([]);
  const [noteOpen, setNoteOpen] = useState(false);
  const loadNotes = useCallback(() => {
    if (!siteId) { setNotes([]); return; }
    fetch(`/api/notes?site=${encodeURIComponent(siteId)}`, { cache: 'no-store' })
      .then((r) => r.json()).then((j) => setNotes(j.notes ?? [])).catch(() => setNotes([]));
  }, [siteId]);
  useEffect(() => { loadNotes(); }, [loadNotes]);

  // Dashboard customization: card order + hidden set, edit mode, drag sensors.
  const [editCards, setEditCards] = useState(false);
  const [cardOrder, setCardOrder] = useState<CardId[]>(DEFAULT_CARDS);
  const [hiddenCards, setHiddenCards] = useState<CardId[]>([]);
  // The server always renders the defaults; saved preferences (site, period,
  // range, card layout) are applied after mount so hydration stays clean.
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  useEffect(() => {
    try {
      if (!demoSite) { const sid = localStorage.getItem('insight_site'); if (sid) setSiteId(sid); }
      const p = localStorage.getItem('insight_period');
      if (p && (PERIODS as string[]).includes(p)) setPeriod(p as Period);
      const r = JSON.parse(localStorage.getItem('insight_range') ?? 'null') as { from?: string; to?: string } | null;
      if (r?.from && r?.to) setRange({ from: r.from, to: r.to });
      setCardOrder(readIds('insight_card_order', DEFAULT_CARDS));
      setHiddenCards(readIds('insight_card_hidden', []));
    } catch { /* first visit or blocked storage: keep defaults */ }
    setPrefsLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (prefsLoaded) localStorage.setItem('insight_card_order', JSON.stringify(cardOrder)); }, [cardOrder, prefsLoaded]);
  useEffect(() => { if (prefsLoaded) localStorage.setItem('insight_card_hidden', JSON.stringify(hiddenCards)); }, [hiddenCards, prefsLoaded]);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  );
  const onCardDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (over && active.id !== over.id) {
      setCardOrder((o) => arrayMove(o, o.indexOf(active.id as CardId), o.indexOf(over.id as CardId)));
    }
  };
  const hideCard = (id: CardId) => setHiddenCards((h) => (h.includes(id) ? h : [...h, id]));
  const showCard = (id: CardId) => setHiddenCards((h) => h.filter((x) => x !== id));
  const resetCards = () => { setCardOrder(DEFAULT_CARDS); setHiddenCards([]); };

  useEffect(() => { if (siteId) localStorage.setItem('insight_site', siteId); }, [siteId]);
  useEffect(() => { localStorage.setItem('insight_period', period); }, [period]);
  useEffect(() => { localStorage.setItem('insight_range', JSON.stringify(range)); }, [range]);

  const loadSites = useCallback(async () => {
    if (demo) return;
    const res = await fetch('/api/sites', { cache: 'no-store' });
    if (!res.ok) return;
    const list = ((await res.json()).sites ?? []) as SiteItem[];
    setSites(list);
    setSiteId((cur) => (cur && list.some((s) => s.id === cur) ? cur : list[0]?.id ?? ''));
  }, []);

  const rangeQS = period === 'custom' ? `&from=${range.from}&to=${range.to}` : '';
  const loadStats = useCallback(async (id: string) => {
    if (!id) { setData(null); return; }
    try {
      const res = await fetch(`/api/stats?site=${encodeURIComponent(id)}&period=${period}${rangeQS}`, { cache: 'no-store' });
      if (res.ok) setData((await res.json()) as Stats);
    } catch { /* ignore */ }
  }, [period, rangeQS]);

  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [keywordError, setKeywordError] = useState<string | null>(null);
  const [keywordTried, setKeywordTried] = useState<string[]>([]);
  const [chartHover, setChartHover] = useState(false);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  useEffect(() => { loadSites(); }, [loadSites]);
  useEffect(() => {
    setLoading(true);
    loadStats(siteId).finally(() => setLoading(false));
    const t = setInterval(() => loadStats(siteId), 5000);
    return () => clearInterval(t);
  }, [siteId, loadStats]);
  useEffect(() => {
    if (!siteId) { setKeywords([]); return; }
    let active = true;
    fetch(`/api/gsc?site=${encodeURIComponent(siteId)}&period=${period}${period === 'custom' ? `&from=${range.from}&to=${range.to}` : ''}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { keywords: [], error: null, tried: [] }))
      .then((j) => { if (active) { setKeywords((j.keywords ?? []) as Keyword[]); setKeywordError(j.error ?? null); setKeywordTried((j.tried ?? []) as string[]); } })
      .catch(() => { if (active) { setKeywords([]); setKeywordError(null); setKeywordTried([]); } });
    return () => { active = false; };
  }, [siteId, period, range]);

  const chartData = (data?.series ?? []).map((p) => ({ h: p.t, v: p.count, r: p.revenue ?? 0, rf: p.refunds ?? 0 }));
  const hasRevenue = chartData.some((d) => d.r > 0 || d.rf > 0);
  const currency = data?.revenue?.currency ?? 'usd';
  const metrics = buildMetrics(data);
  // The hero shows Visitors huge; the other metrics become compact chips.
  // Online lives in the topbar as the live chip (click opens the globe).
  const hero = metrics.find((m) => m.label === 'Visitors');
  const chips = metrics.filter((m) => !m.live && m.label !== 'Visitors');
  const online = data?.online ?? 0;
  const fmtDay = (d: string): string => { const p = parseKey(d); return p ? `${p.getDate()} ${MONTHS[p.getMonth()]}` : d; };
  const periodTag = period === 'today' ? 'Today'
    : period === '7d' ? 'Last 7 days'
    : period === '30d' ? 'Last 30 days'
    : period === '90d' ? 'Last 90 days'
    : `${fmtDay(range.from)} – ${fmtDay(range.to)}`;

  const channelItems: Item[] = (data?.channels ?? []).map((s) => ({
    key: s.name,
    left: <span className="flex min-w-0 items-center gap-2"><span className="size-2 shrink-0 rounded-full" style={{ background: TYPE_COLOR[s.type] ?? '#94a3b8' }} /><span className="truncate">{CHANNEL_LABEL[s.name] ?? cap(s.name)}</span></span>,
    value: s.count,
    color: TYPE_COLOR[s.type] ?? '#94a3b8',
  }));
  const referrerItems: Item[] = (data?.referrers ?? []).map((r) => ({
    key: r.name, left: <Favicon domain={r.name} label={r.name} />, value: r.count, color: ACCENT,
  }));
  const countryItems: Item[] = (data?.countries ?? []).map((c) => ({
    key: c.name, left: <Flag code={c.name} />, value: c.count, color: '#10b981',
  }));
  const deviceItems: Item[] = (data?.devices ?? []).map((r) => ({
    key: r.name, left: <span className="flex min-w-0 items-center gap-2">{deviceIcon(r.name)}<span className="truncate">{cap(r.name)}</span></span>, value: r.count, color: '#3b82f6',
  }));
  const browserItems: Item[] = (data?.browsers ?? []).map((r) => ({
    key: r.name, left: <span className="flex min-w-0 items-center gap-2">{browserIcon(r.name)}<span className="truncate">{cap(r.name)}</span></span>, value: r.count, color: '#3b82f6',
  }));
  const osItems: Item[] = (data?.os ?? []).map((r) => ({
    key: r.name, left: <span className="flex min-w-0 items-center gap-2">{osIcon(r.name)}<span className="truncate">{osLabel(r.name)}</span></span>, value: r.count, color: '#3b82f6',
  }));

  const keywordNote = keywordError === 'api_disabled'
    ? 'Enable the "Google Search Console API" in your Google Cloud project, then wait a minute.'
    : keywordError === 'no_access'
      ? 'Add the Insight service account email as a user of this site in Search Console.'
      : keywordError === 'not_found'
        ? 'This site is not a verified property in Search Console (check it is added, domain or URL-prefix).'
        : `No keywords for this range yet.${keywordTried.length ? ` Checked: ${keywordTried.join(' · ')}` : ''}`;
  const keywordItems: Item[] = keywords.map((k) => ({
    key: k.query, left: <Favicon domain="google.com" label={k.query} />, value: k.clicks, color: ACCENT,
  }));
  const keywordDetail: DetailTable = {
    columns: ['Search term', 'Position', 'Impressions', 'Visitors', 'CTR'],
    align: ['left', 'center', 'center', 'center', 'center'],
    widths: ['44%', '14%', '14%', '14%', '14%'],
    filter: keywords.map((k) => k.query),
    logo: <GscLogo />,
    rows: keywords.map((k) => [
      <span key="q" className="flex min-w-0 items-center gap-2"><img src="/i/google.svg" alt="" width={16} height={16} className="size-4 shrink-0" /><span className="truncate" title={k.query}>{k.query}</span></span>,
      posLabel(k.position),
      fmt(k.impressions),
      fmt(k.clicks),
      `${(k.ctr * 100).toFixed(1)}%`,
    ]),
  };

  const logout = async () => { await fetch('/api/auth/logout', { method: 'POST' }); window.location.href = '/login'; };

  // Site actions menu, shared by the mobile and desktop headers.
  const siteMenu = site && (
    <Menu align="right" buttonClass="flex size-9 items-center justify-center rounded-xl text-zinc-400 transition-colors hover:bg-black/[0.05] hover:text-zinc-700 dark:hover:bg-white/[0.07] dark:hover:text-zinc-200" button={<DotsIcon />}>
      {(close) => (
        <>
          <MenuItem icon={<GripIcon />} onClick={() => { setEditCards(true); close(); }}>Customize dashboard</MenuItem>
          <MenuItem icon={<CodeIcon />} onClick={() => { setModal({ type: 'script', site }); close(); }}>Show tracking script</MenuItem>
          <MenuItem icon={<LinkIcon />} onClick={() => { setModal({ type: 'url', site }); close(); }}>Set website URL</MenuItem>
          {site.stripe
            ? <MenuItem icon={<StripeIcon />} onClick={async () => { await fetch(`/api/sites/stripe?siteId=${site.id}`, { method: 'DELETE' }); loadSites(); close(); }}>Disconnect Stripe</MenuItem>
            : <MenuItem icon={<StripeIcon />} onClick={() => { setModal({ type: 'stripe', site }); close(); }}>Connect Stripe</MenuItem>}
          {site.ga4
            ? <MenuItem icon={<GaIcon />} onClick={async () => { await fetch(`/api/sites/ga4?siteId=${site.id}`, { method: 'DELETE' }); loadSites(); close(); }}>Disconnect GA4</MenuItem>
            : <MenuItem icon={<GaIcon />} onClick={() => { setModal({ type: 'ga4', site }); close(); }}>Connect GA4</MenuItem>}
          <MenuItem danger icon={<TrashIcon />} onClick={() => { setModal({ type: 'delete', site }); close(); }}>Delete site</MenuItem>
        </>
      )}
    </Menu>
  );

  const liveChip = sites.length > 0 && (
    <button
      onClick={() => setGlobeOpen(true)}
      title="Open the live map"
      className="flex shrink-0 items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/[0.08] py-1.5 pl-2.5 pr-3 text-xs font-semibold text-emerald-700 transition-colors hover:border-emerald-500/50 dark:text-emerald-400"
    >
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-70" />
        <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
      </span>
      <span className="tabular-nums">{fmt(online)}</span> live
    </button>
  );

  const siteDropdown = (wide: boolean) => demo ? (
    <span className="inline-flex items-center gap-2 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] px-3 py-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
      {demoSite!.favicon && <img src={`/api/favicon/${demoSite!.id}`} alt="" width={16} height={16} className="size-4 rounded" />}
      {demoSite!.name}
      <span className="rounded-full bg-[#ffa950]/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#f5991f]">Live demo</span>
    </span>
  ) : sites.length > 0 && (
    <Dropdown
      wide={wide}
      value={siteId}
      onChange={setSiteId}
      options={sites.map((s) => ({
        value: s.id,
        label: s.name,
        icon: <SiteFavicon id={s.id} url={s.url} />,
      }))}
    />
  );

  const periodPills = (grow: boolean) => sites.length > 0 && (
    <div className={`${grow ? 'grid w-full grid-cols-5' : 'flex'} rounded-full border border-[var(--card-border)] bg-[var(--card-bg)] p-1`}>
      {(['today', '7d', '30d', '90d', 'custom'] as Period[]).map((p) => (
        <button
          key={p}
          onClick={() => { if (p === 'custom') { setPeriod('custom'); setRangeOpen(true); } else setPeriod(p); }}
          className={`rounded-full px-2.5 py-1.5 text-xs font-semibold transition-all sm:px-3 ${period === p ? 'bg-[#ffa950] text-[#573310] shadow-sm' : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'}`}
        >
          {p === 'today' ? 'Today' : p === 'custom' ? <span className="inline-flex items-center justify-center gap-1"><CalIcon /><span className="hidden sm:inline">Custom</span></span> : p.toUpperCase()}
        </button>
      ))}
    </div>
  );

  return (
    <div className="flex min-h-[100svh] flex-col">
      {loading && (
        <div className="pointer-events-none fixed inset-x-0 top-0 z-[70] h-0.5 overflow-hidden">
          <div className="load-bar h-full w-1/3 rounded-full bg-[#ffa950]" />
        </div>
      )}
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-5 sm:px-6">
          <header className="fade-up relative z-40 mb-6">
            {/* Mobile: three stacked rows — identity, site tools, period. */}
            <div className="flex flex-col gap-2.5 md:hidden">
              <div className="flex items-center justify-between">
                <Logo />
                <div className="flex items-center gap-1.5">
                  {liveChip}
                  {!demo && <button  onClick={logout} aria-label="Log out" title="Log out" className="flex size-9 items-center justify-center rounded-xl text-rose-500 transition-colors hover:bg-rose-500/10"><PowerIcon /></button>}
                </div>
              </div>
              {sites.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <div className="min-w-0">{siteDropdown(false)}</div>
                  {!demo && siteMenu}
                  {!demo && <button onClick={() => setModal({ type: 'add' })} aria-label="Add site" className="btn-primary ml-auto shrink-0 px-3"><PlusIcon /></button>}
                </div>
              )}
              {periodPills(true)}
            </div>

            {/* Desktop: one row. */}
            <div className="hidden md:flex md:flex-wrap md:items-center md:justify-between md:gap-3">
              <div className="flex min-w-0 flex-wrap items-center gap-2.5">
                <Logo />
                {siteDropdown(false)}
                {!demo && siteMenu}
                {liveChip}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {periodPills(false)}
                {demo ? <a className="btn-primary" href="https://github.com/DigiHold/insight" target="_blank" rel="noopener noreferrer">Get Insight free</a> : <button onClick={() => setModal({ type: 'add' })} className="btn-primary"><PlusIcon />Add site</button>}
                {!demo && <button  onClick={logout} aria-label="Log out" title="Log out" className="flex size-9 items-center justify-center rounded-xl text-rose-500 transition-colors hover:bg-rose-500/10"><PowerIcon /></button>}
              </div>
            </div>
          </header>

        {sites.length === 0 ? (
          <Onboarding onAdd={() => setModal({ type: 'add' })} />
        ) : (
          <div className={`transition-opacity duration-300 ${loading ? 'pointer-events-none opacity-50' : ''}`}>
            <section className="fade-up mb-4 grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]" style={{ animationDelay: '80ms' }}>
              <div className="card relative z-10 flex min-w-0 flex-col p-6">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-500">{periodTag}</p>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="head text-5xl font-bold tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50">
                    <span key={hero?.value} className="num-roll">{hero?.value ?? '0'}</span>
                  </span>
                  {hero?.change !== undefined && hero?.change !== null && (
                    <Delta change={hero.change} inverse={hero.inverse} />
                  )}
                </div>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">visitors</p>
                <div className="mt-6 grid flex-1 grid-cols-2 content-start gap-x-5 gap-y-4 border-t border-[var(--card-border)] pt-5">
                  {chips.map((m) => <StatChip key={m.label} {...m} />)}
                </div>
                {data?.visitorSplit && (data.visitorSplit.newV + data.visitorSplit.returning) > 0 && (
                  <SplitBar newV={data.visitorSplit.newV} returning={data.visitorSplit.returning} />
                )}
              </div>

              <div className="card flex min-w-0 flex-col p-2.5 sm:p-5">
                <div className="mb-1 flex justify-end">
                  {!demo && (<button onClick={() => setNoteOpen(true)} title="Add a note on the chart" className="rounded-lg px-2 py-1 text-[11px] font-semibold text-zinc-400 transition-colors hover:bg-black/[0.05] hover:text-zinc-800 dark:hover:bg-white/[0.07] dark:hover:text-zinc-100">+ Note</button>)}
                </div>
                <div className="h-64 w-full sm:h-72 lg:h-[22rem]">
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                      data={chartData}
                      barCategoryGap="28%"
                      margin={{ top: 10, right: 8, bottom: 0, left: 6 }}
                      onMouseMove={(s) => { setChartHover(!!s?.isTooltipActive); const i = s?.activeTooltipIndex; setActiveIdx(typeof i === 'number' ? i : typeof i === 'string' && i !== '' && !Number.isNaN(Number(i)) ? Number(i) : null); }}
                      onMouseLeave={() => { setChartHover(false); setActiveIdx(null); }}
                    >
                      <defs>
                        <linearGradient id="fillv" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(130,130,140,.18)" />
                      <XAxis dataKey="h" tickLine={false} axisLine={{ stroke: 'rgba(130,130,140,.35)' }} tick={{ fill: '#a1a1aa', fontSize: 11 }} tickMargin={8} minTickGap={28} tickFormatter={axisLabel} />
                      <YAxis yAxisId="v" tickLine={false} axisLine={false} tick={{ fill: '#a1a1aa', fontSize: 11 }} width={38} allowDecimals={false} />
                      {hasRevenue && <YAxis yAxisId="r" orientation="right" tickLine={false} axisLine={false} tick={{ fill: '#a1a1aa', fontSize: 11 }} width={54} tickFormatter={(v: number) => fmtMoney(v, currency)} />}
                      <Tooltip cursor={{ stroke: 'rgba(130,130,140,.55)', strokeWidth: 1 }} content={<ChartTooltip currency={currency} hasRevenue={hasRevenue} />} />
                      {hasRevenue && (
                        <Bar yAxisId="r" dataKey="r" stackId="rev" radius={[3, 3, 0, 0]} maxBarSize={36} isAnimationActive={false}>
                          {chartData.map((_, i) => <Cell key={i} fill="#ffa950" fillOpacity={activeIdx === null ? 0.92 : i === activeIdx ? 1 : 0.3} />)}
                        </Bar>
                      )}
                      {hasRevenue && (
                        <Bar yAxisId="r" dataKey="rf" stackId="rev" radius={[3, 3, 0, 0]} maxBarSize={36} isAnimationActive={false} fill="#ffa950" fillOpacity={0.18} stroke="#ffa950" strokeWidth={1} strokeDasharray="3 3" strokeOpacity={0.7} />
                      )}
                      {period !== 'today' && notes.filter((nt) => chartData.some((c) => c.h === nt.date)).map((nt) => (
                        <ReferenceLine key={`${nt.date}-${nt.text}`} yAxisId="v" x={nt.date} stroke="#a855f7" strokeDasharray="4 4" label={{ value: nt.text.length > 14 ? `${nt.text.slice(0, 14)}…` : nt.text, position: 'insideTopLeft', fill: '#a855f7', fontSize: 10 }} />
                      ))}
                      <Area yAxisId="v" type="monotone" dataKey="v" stroke="#3b82f6" strokeWidth={2.5} fill="url(#fillv)" isAnimationActive={false} fillOpacity={chartHover ? 0.5 : 1} activeDot={{ r: 5, fill: '#3b82f6', stroke: '#fff', strokeWidth: 2 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-zinc-400 dark:text-zinc-600">No data for this period yet.</div>
                )}
                </div>
              </div>
            </section>

            {(() => {
              const cardNode: Record<CardId, ReactNode> = {
                sources: <TabbedCard title="Sources" icon={<SignalIcon />} tabs={[
                  { label: 'Channel', items: channelItems, donut: true },
                  { label: 'Referrer', items: referrerItems },
                  { label: 'Campaign', items: plainItems(data?.campaigns ?? [], ACCENT) },
                  { label: 'Medium', items: plainItems(data?.utmMedium ?? [], ACCENT), emptyNote: 'No utm_medium tags in this period.' },
                  { label: 'Term', items: plainItems(data?.utmTerm ?? [], ACCENT), emptyNote: 'No utm_term tags in this period.' },
                  { label: 'Content', items: plainItems(data?.utmContent ?? [], ACCENT), emptyNote: 'No utm_content tags in this period.' },
                  { label: 'Keyword', items: keywordItems, detail: keywordDetail, emptyNote: keywordNote },
                ]} />,
                pages: <TabbedCard title="Pages" icon={<FileIcon />} metric="Views" tabs={[
                  { label: 'Top pages', items: plainItems(data?.pages ?? [], ACCENT) },
                  { label: 'Landing', metric: 'Visitors', items: plainItems(data?.landing ?? [], '#10b981'), emptyNote: 'First page of each visit shows here.' },
                  { label: 'Exit', metric: 'Visitors', items: plainItems(data?.exits ?? [], '#f43f5e'), emptyNote: 'Last page of each visit shows here.' },
                  { label: 'Outbound', metric: 'Clicks', items: plainItems(data?.outbound ?? [], '#3b82f6', (u) => u.replace(/^https?:\/\//, '')), emptyNote: 'Clicks to external links show here.' },
                ]} />,
                technology: <TabbedCard title="Technology" icon={<ChipIcon />} tabs={[
                  { label: 'Browser', items: browserItems },
                  { label: 'OS', items: osItems },
                  { label: 'Device', items: deviceItems },
                ]} />,
                locations: <TabbedCard title="Locations" icon={<GlobeSmall />} tabs={[
                  { label: 'Countries', items: countryItems },
                  { label: 'Regions', items: plainItems(data?.regions ?? [], '#10b981'), emptyNote: 'Needs GA4, or the Cloudflare "visitor location headers" transform.' },
                  { label: 'Cities', items: plainItems(data?.cities ?? [], '#10b981'), emptyNote: 'Needs GA4, or the Cloudflare "visitor location headers" transform.' },
                  { label: 'Languages', items: plainItems(data?.languages ?? [], '#a855f7', langLabel) },
                ]} />,
                feed: <FeedCard siteId={siteId} />,
                heatmap: <HeatmapCard cells={data?.heatmap ?? []} />,
                funnel: <FunnelCard siteId={siteId} funnel={data?.funnel ?? null} readonly={demo} onSaved={() => loadStats(siteId)} />,
                retention: <RetentionCard rows={data?.retention ?? []} />,
                revenue: <RevenueAttribCard data={data?.revAttrib} currency={currency} siteId={siteId} />,
                ai: <AiCard data={data} period={period} />,
              };
              const visible = cardOrder.filter((id) => !hiddenCards.includes(id));
              const hidden = DEFAULT_CARDS.filter((id) => hiddenCards.includes(id));
              return (
                <>
                  {editCards && (
                    <div className="fade-up mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#ffa950]/40 bg-[#ffa950]/10 px-4 py-3">
                      <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">Drag cards to reorder. Tap the red button to hide one.</p>
                      <div className="flex items-center gap-2">
                        <button onClick={resetCards} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-zinc-500 transition-colors hover:text-zinc-900 dark:hover:text-zinc-100">Reset</button>
                        <button onClick={() => setEditCards(false)} className="btn-primary px-4 py-1.5 text-xs">Done</button>
                      </div>
                    </div>
                  )}
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onCardDragEnd}>
                    <SortableContext items={visible} strategy={rectSortingStrategy}>
                      <section className="grid gap-4 md:grid-cols-2">
                        {visible.map((id) => (
                          <SortableCard key={id} id={id} wide={WIDE_CARDS.has(id)} edit={editCards} onHide={() => hideCard(id)}>
                            {cardNode[id]}
                          </SortableCard>
                        ))}
                      </section>
                    </SortableContext>
                  </DndContext>
                  {editCards && hidden.length > 0 && (
                    <div className="mt-4 rounded-2xl border border-dashed border-[var(--card-border)] p-4">
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">Hidden cards</p>
                      <div className="flex flex-wrap gap-2">
                        {hidden.map((id) => (
                          <button key={id} onClick={() => showCard(id)} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--card-border)] px-3 py-1.5 text-xs font-semibold text-zinc-600 transition-colors hover:border-[#ffa950]/60 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-50">
                            <PlusIcon /> {CARD_LABEL[id]}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}

        <footer className="mt-auto flex flex-col items-center gap-0.5 pt-10 text-center text-xs text-zinc-400 dark:text-zinc-600">
          <span>Insight, private real-time analytics. Updates every 5 seconds.</span>
          <span className="font-[family-name:var(--font-sign)] text-base italic">by <a href="https://nicolaslecocq.com" target="_blank" rel="noopener noreferrer" className="text-zinc-500 underline-offset-2 transition-colors hover:text-[#ffa950] hover:underline dark:text-zinc-400">Nicolas&nbsp;Lecocq</a></span>
        </footer>
      </div>

      {modal?.type === 'add' && <AddSiteModal onClose={() => setModal(null)} onCreated={(s) => { loadSites(); setSiteId(s.id); setModal({ type: 'script', site: s }); }} />}
      {modal?.type === 'script' && <ScriptModal site={modal.site} onClose={() => setModal(null)} />}
      {modal?.type === 'stripe' && <StripeModal site={modal.site} onClose={() => setModal(null)} onDone={() => { loadSites(); setModal(null); }} />}
      {modal?.type === 'ga4' && <Ga4Modal site={modal.site} onClose={() => setModal(null)} onDone={() => { loadSites(); setModal(null); }} />}
      {modal?.type === 'url' && <UrlModal site={modal.site} onClose={() => setModal(null)} onDone={() => { loadSites(); setModal(null); }} />}
      {modal?.type === 'delete' && (
        <Overlay onClose={() => setModal(null)}>
          <h3 className="head mb-2 text-lg font-bold text-zinc-900 dark:text-zinc-50">Delete {modal.site.name}?</h3>
          <p className="mb-5 text-sm text-zinc-500 dark:text-zinc-400">This permanently removes the site, all its Insight and GA4 data, and its favicon. This cannot be undone.</p>
          <div className="flex justify-end gap-2">
            <button onClick={() => setModal(null)} className="rounded-xl px-3 py-2 text-sm text-zinc-500 transition-colors hover:text-zinc-900 dark:hover:text-zinc-100">Cancel</button>
            <button
              onClick={async () => { await fetch(`/api/sites?id=${modal.site.id}`, { method: 'DELETE' }); setModal(null); loadSites(); }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-rose-700 active:scale-[0.98]"
            >
              <TrashIcon /> Delete site
            </button>
          </div>
        </Overlay>
      )}
      {noteOpen && <NoteModal siteId={siteId} notes={notes} onClose={() => setNoteOpen(false)} onChanged={loadNotes} />}
      {rangeOpen && (
        <RangeModal
          initial={range}
          onClose={() => setRangeOpen(false)}
          onApply={(r) => { setRange(r); setPeriod('custom'); setRangeOpen(false); }}
        />
      )}
      {globeOpen && <GlobeModal site={siteId} onClose={() => setGlobeOpen(false)} />}
    </div>
  );
}

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden>
        <rect width="32" height="32" rx="9" fill="#ffa950" />
        <rect x="8" y="20" width="4" height="5" rx="2" fill="#fff" fillOpacity={0.4} />
        <rect x="14" y="12" width="4" height="13" rx="2" fill="#fff" fillOpacity={0.7} />
        <rect x="20" y="7" width="4" height="18" rx="2" fill="#fff" />
      </svg>
      <div className="flex flex-col leading-none">
        <span className="head text-base font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Insight</span>
        <span className="-mt-1 ml-[0.5rem] font-[family-name:var(--font-sign)] text-sm italic leading-none text-zinc-400 dark:text-zinc-500">
          by <a href="https://nicolaslecocq.com" target="_blank" rel="noopener noreferrer" className="text-zinc-500 transition-colors hover:text-[#ffa950] dark:text-zinc-400">Nicolas&nbsp;Lecocq</a>
        </span>
      </div>
    </div>
  );
}

interface RTipItem { dataKey?: string | number; name?: string | number; value?: number | string; color?: string }
function ChartTooltip({ active, payload, label, currency, hasRevenue }: { active?: boolean; payload?: RTipItem[]; label?: string | number; currency: string; hasRevenue: boolean }) {
  if (!active || !payload || !payload.length) return null;
  const v = Number(payload.find((p) => p.dataKey === 'v')?.value ?? 0);
  const r = Number(payload.find((p) => p.dataKey === 'r')?.value ?? 0);
  const rf = Number(payload.find((p) => p.dataKey === 'rf')?.value ?? 0);
  const key = String(label ?? '');
  const rel = relDays(key);
  return (
    <div className="min-w-[200px] rounded-xl border border-white/10 bg-zinc-900/95 px-3.5 py-2.5 text-xs shadow-2xl backdrop-blur">
      <div className="mb-2 flex items-baseline justify-between gap-4 border-b border-white/10 pb-1.5">
        <span className="text-[13px] font-semibold text-zinc-100">{fullDate(key)}</span>
        {rel && <span className="shrink-0 text-[11px] text-zinc-500">{rel}</span>}
      </div>
      <div className="flex items-center justify-between gap-8"><span className="flex items-center gap-1.5 text-zinc-400"><span className="size-2 rounded-full bg-[#3b82f6]" />Visitors</span><span className="font-semibold tabular-nums text-zinc-50">{fmt(v)}</span></div>
      {hasRevenue && <div className="mt-1 flex items-center justify-between gap-8"><span className="flex items-center gap-1.5 text-zinc-400"><span className="size-2 rounded-full bg-[#ffa950]" />Revenue</span><span className="font-semibold tabular-nums text-[#ffa950]">{fmtMoney(r, currency, 2)}</span></div>}
      {rf > 0 && <div className="mt-1 flex items-center justify-between gap-8"><span className="flex items-center gap-1.5 text-zinc-400"><span className="size-2 rounded-sm border border-dashed border-[#ffa950] bg-[#ffa950]/20" />Refunds</span><span className="font-semibold tabular-nums text-zinc-300">−{fmtMoney(rf, currency, 2)}</span></div>}
    </div>
  );
}

function Delta({ change, inverse }: { change: number; inverse?: boolean }) {
  const flat = change === 0;
  const rose = !flat && (inverse ? change > 0 : change < 0);
  const cls = flat
    ? 'bg-zinc-500/10 text-zinc-500 dark:text-zinc-400'
    : rose
      ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
      : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${cls}`}>
      {flat ? '→' : change > 0 ? '↑' : '↓'} {Math.abs(change)}%
    </span>
  );
}

// Compact metric chip in the hero column: label, value, delta, and the
// revenue breakdown tooltip when Stripe data is attached.
function StatChip({ label, value, change, inverse, revenue }: MetricDef) {
  return (
    <div className="group relative min-w-0">
      <p className="truncate text-[11px] font-medium text-zinc-400 dark:text-zinc-500">{label}</p>
      <div className="mt-0.5 flex flex-wrap items-baseline gap-1.5">
        <span className="head text-lg font-bold tabular-nums text-zinc-900 dark:text-zinc-50">
          <span key={value} className="num-roll">{value}</span>
        </span>
        {change !== undefined && change !== null && <Delta change={change} inverse={inverse} />}
      </div>
      {revenue && <RevenueTip {...revenue} />}
    </div>
  );
}

// Revenue breakdown on hover: net total, new (gross) and refunds.
function RevenueTip({ currency, total, gross, refunds }: RevenueBreakdown) {
  return (
    <div className="pointer-events-none absolute left-0 top-full z-30 mt-1 hidden min-w-[11rem] rounded-xl border border-zinc-700 bg-zinc-900 p-3 text-xs shadow-2xl group-hover:block">
      <div className="mb-1.5 flex items-center justify-between gap-6 border-b border-white/10 pb-1.5">
        <span className="font-semibold text-zinc-300">Revenue</span>
        <span className="font-bold tabular-nums text-zinc-50">{fmtMoney(total, currency)}</span>
      </div>
      <div className="flex items-center justify-between gap-6">
        <span className="flex items-center gap-1.5 text-zinc-400"><span className="size-2 rounded-full bg-[#ffa950]" />New</span>
        <span className="font-semibold tabular-nums text-zinc-100">{fmtMoney(gross, currency)}</span>
      </div>
      <div className="mt-0.5 flex items-center justify-between gap-6">
        <span className="flex items-center gap-1.5 text-zinc-400"><span className="size-2 rounded-full bg-zinc-500" />Refunds</span>
        <span className="font-semibold tabular-nums text-zinc-100">{refunds > 0 ? '−' : ''}{fmtMoney(refunds, currency)}</span>
      </div>
    </div>
  );
}


function TabbedCard({ title, icon, tabs, emptyNote, metric = 'Visitors' }: { title: string; icon?: ReactNode; tabs: Tab[]; emptyNote?: string; metric?: string }) {
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const idx = Math.min(active, tabs.length - 1);
  const tab = tabs[idx];
  const total = tab.items.reduce((a, b) => a + b.value, 0);
  const max = tab.items[0]?.value ?? 1;
  const shown = tab.items.slice(0, 10);
  const note = tab.emptyNote ?? emptyNote;
  const hasData = tab.detail ? tab.detail.rows.length > 0 : tab.items.length > 0;
  return (
    <div className="card flex h-full flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {icon && <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#ffa950]/15 text-[#b06a1f] dark:bg-[#ffa950]/10 dark:text-[#ffa950]">{icon}</span>}
          <div className="min-w-0">
            <h3 className="head truncate text-sm font-bold text-zinc-900 dark:text-zinc-50">{title}</h3>
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500">{(tab.metric ?? metric).toLowerCase()}{tabs.length > 1 ? ` · by ${tab.label.toLowerCase()}` : ''}</p>
          </div>
        </div>
        {hasData && (
          <button onClick={() => setOpen(true)} aria-label={`${title} details`} title="Details" className="flex size-8 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-black/[0.05] hover:text-zinc-800 dark:hover:bg-white/[0.07] dark:hover:text-zinc-100">
            <ExpandIcon />
          </button>
        )}
      </div>

      {tabs.length > 1 && (
        <div className="mt-3 flex items-center justify-between gap-3 border-b border-[var(--card-border)]">
          <div className="tabs-scroll flex min-w-0 flex-1 gap-4 overflow-x-auto">
            {tabs.map((t, i) => (
              <button
                key={t.label}
                onClick={() => setActive(i)}
                className={`-mb-px shrink-0 border-b-2 pb-2 text-xs font-semibold transition-colors ${i === idx ? 'border-[#ffa950] text-zinc-900 dark:text-zinc-50' : 'border-transparent text-zinc-400 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-200'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <span className="shrink-0 pb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">{tab.metric ?? metric}</span>
        </div>
      )}

      <div className="mt-4 flex-1">
        {tab.donut && tab.items.length > 0 ? (
          <RaceBar items={tab.items} total={total} />
        ) : (
          <div>
            {shown.map((it) => <TrackRow key={it.key} left={it.left} value={it.value} max={max} color={it.color} />)}
            {tab.items.length === 0 && <p className="px-2 py-8 text-center text-sm text-zinc-400 dark:text-zinc-600">{note ?? 'No data yet.'}</p>}
          </div>
        )}
      </div>
      {open && <DetailsModal title={tabs.length > 1 ? `${title} · ${tab.label}` : title} tab={tab} metric={metric} onClose={() => setOpen(false)} />}
    </div>
  );
}

// One list row: label and count on top, a thin gradient progress track below
// (width relative to the top item, so ranking reads at a glance).
function TrackRow({ left, value, max, color }: { left: ReactNode; value: number; max: number; color: string }) {
  const pct = Math.max(2, Math.round((value / Math.max(1, max)) * 100));
  return (
    <div className="py-[7px]">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="min-w-0 truncate text-zinc-700 dark:text-zinc-200">{left}</span>
        <span className="shrink-0 tabular-nums font-semibold text-zinc-900 dark:text-zinc-100">{fmt(value)}</span>
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.08]">
        <span className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}, color-mix(in srgb, ${color} 40%, transparent))` }} />
      </div>
    </div>
  );
}

// New vs returning visitors: one clear two-color split bar.
function SplitBar({ newV, returning }: { newV: number; returning: number }) {
  const total = newV + returning;
  const pctNew = total > 0 ? Math.round((newV / total) * 100) : 0;
  return (
    <div className="mt-5 border-t border-[var(--card-border)] pt-4">
      <div className="flex h-2.5 w-full gap-[3px] overflow-hidden rounded-full">
        <span className="h-full rounded-full bg-[#3b82f6]" style={{ width: `${Math.max(2, pctNew)}%` }} />
        <span className="h-full rounded-full bg-[#10b981]" style={{ width: `${Math.max(2, 100 - pctNew)}%` }} />
      </div>
      <div className="mt-2.5 flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400"><span className="size-2 rounded-full bg-[#3b82f6]" />New <span className="font-semibold tabular-nums text-zinc-800 dark:text-zinc-100">{fmt(newV)}</span></span>
        <span className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400"><span className="size-2 rounded-full bg-[#10b981]" />Returning <span className="font-semibold tabular-nums text-zinc-800 dark:text-zinc-100">{fmt(returning)}</span></span>
      </div>
    </div>
  );
}

// Live feed: the latest pageviews, refreshed every 5 seconds.
function FeedCard({ siteId }: { siteId: string }) {
  const [feed, setFeed] = useState<{ ts: number; path: string; country: string; source: string; type: string; device: string }[]>([]);
  useEffect(() => {
    if (!siteId) return;
    let active = true;
    const load = () => fetch(`/api/feed?site=${encodeURIComponent(siteId)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => { if (active) setFeed(j.feed ?? []); })
      .catch(() => { /* keep the last list */ });
    load();
    const t = setInterval(load, 5000);
    return () => { active = false; clearInterval(t); };
  }, [siteId]);
  return (
    <div className="card flex h-full flex-col p-5">
      <div className="flex items-center gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#ffa950]/15 text-[#b06a1f] dark:bg-[#ffa950]/10 dark:text-[#ffa950]"><PulseIcon /></span>
        <div className="min-w-0">
          <h3 className="head text-sm font-bold text-zinc-900 dark:text-zinc-50">Live feed</h3>
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500">latest pageviews, as they happen</p>
        </div>
      </div>
      <div className="mt-3 max-h-80 flex-1 overflow-y-auto">
        {feed.map((f, i) => (
          <div key={`${f.ts}-${i}`} className="flex items-center gap-2.5 border-b border-[var(--card-border)] py-2 text-sm last:border-0">
            {f.country
              ? <img src={`/flags/${f.country.toUpperCase()}.svg`} alt="" width={18} height={13} className="h-[13px] w-[18px] shrink-0 rounded-[2px] object-cover" onError={hideBroken} />
              : <span className="w-[18px] shrink-0" />}
            <span className="min-w-0 flex-1 truncate font-mono text-xs text-zinc-700 dark:text-zinc-200" title={f.path}>{f.path}</span>
            <span className="shrink-0 truncate text-[11px] text-zinc-400 dark:text-zinc-500">{SOURCE_LABEL[f.source] ?? cap(f.source)}</span>
            <span className="shrink-0 tabular-nums text-[11px] text-zinc-400 dark:text-zinc-500">{timeAgo(f.ts)}</span>
          </div>
        ))}
        {feed.length === 0 && <p className="py-10 text-center text-sm text-zinc-400 dark:text-zinc-600">No pageviews in the last 24 hours.</p>}
      </div>
    </div>
  );
}

// Hourly heatmap: when your audience is on the site (last 4 weeks).
function HeatmapCard({ cells }: { cells: { d: number; h: number; c: number }[] }) {
  const max = cells.reduce((a, b) => Math.max(a, b.c), 0);
  const byKey = new Map(cells.map((c) => [`${c.d}-${c.h}`, c.c]));
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const [hover, setHover] = useState<string | null>(null);
  return (
    <div className="card flex h-full flex-col p-5" onMouseLeave={() => setHover(null)}>
      <div className="flex items-center gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#ffa950]/15 text-[#b06a1f] dark:bg-[#ffa950]/10 dark:text-[#ffa950]"><ClockIcon /></span>
        <div className="min-w-0">
          <h3 className="head text-sm font-bold text-zinc-900 dark:text-zinc-50">Busy hours</h3>
          <p className="truncate text-[11px] text-zinc-500 dark:text-zinc-400">{hover ?? <span className="text-zinc-400 dark:text-zinc-500">visitors by hour · last 4 weeks (UTC)</span>}</p>
        </div>
      </div>
      <div className="mt-4 flex-1 overflow-x-auto">
        <div className="min-w-[19rem]">
          {days.map((day, di) => (
            <div key={day} className="mb-[3px] flex items-center gap-1.5">
              <span className="w-8 shrink-0 text-[10px] font-medium text-zinc-400 dark:text-zinc-500">{day}</span>
              <div className="grid flex-1 gap-[3px]" style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}>
                {Array.from({ length: 24 }, (_, h) => {
                  const c = byKey.get(`${di + 1}-${h}`) ?? 0;
                  const alpha = max > 0 ? c / max : 0;
                  return <span key={h} onMouseEnter={() => setHover(`${day} ${String(h).padStart(2, '0')}:00 — ${fmt(c)} visitor${c === 1 ? '' : 's'}`)} className="aspect-square rounded-[3px] transition-transform hover:scale-125 hover:ring-1 hover:ring-[#ffa950]" style={alpha === 0 ? { backgroundColor: 'rgba(128,128,140,0.12)' } : { backgroundColor: '#ffa950', opacity: 0.15 + alpha * 0.85 }} />;
                })}
              </div>
            </div>
          ))}
          <div className="ml-9 mt-1 flex justify-between text-[9px] text-zinc-400 dark:text-zinc-600"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:00</span></div>
        </div>
      </div>
    </div>
  );
}

// Funnel: visitors completing each configured step, with pass-through rates.
function FunnelCard({ siteId, funnel, readonly, onSaved }: { siteId: string; funnel: { steps: string[]; counts: number[] } | null; readonly?: boolean; onSaved: () => void }) {
  const [edit, setEdit] = useState(false);
  const top = funnel?.counts[0] ?? 0;
  return (
    <div className="card flex h-full flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#ffa950]/15 text-[#b06a1f] dark:bg-[#ffa950]/10 dark:text-[#ffa950]"><FunnelIcon /></span>
          <div className="min-w-0">
            <h3 className="head text-sm font-bold text-zinc-900 dark:text-zinc-50">Funnel</h3>
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500">visitors completing each step</p>
          </div>
        </div>
        {!readonly && <button onClick={() => setEdit(true)} className="shrink-0 text-xs font-semibold text-zinc-400 transition-colors hover:text-zinc-800 dark:hover:text-zinc-100">{funnel ? 'Edit' : 'Set up'}</button>}
      </div>
      <div className="mt-4 flex-1">
        {funnel ? (
          <div className="space-y-3">
            {funnel.steps.map((step, i) => {
              const c = funnel.counts[i] ?? 0;
              const pct = top > 0 ? Math.round((c / top) * 100) : 0;
              const prevC = i === 0 ? c : funnel.counts[i - 1] ?? 0;
              const stepRate = i === 0 ? null : prevC > 0 ? Math.round((c / prevC) * 100) : 0;
              return (
                <div key={`${step}-${i}`}>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate font-mono text-xs text-zinc-700 dark:text-zinc-200">{i + 1}. {step}</span>
                    <span className="shrink-0 tabular-nums font-semibold text-zinc-900 dark:text-zinc-100">{fmt(c)}{stepRate !== null && <span className="ml-1.5 text-[11px] font-medium text-zinc-400 dark:text-zinc-500">{stepRate}% of previous</span>}</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.08]">
                    <span className="block h-full rounded-full bg-[#ffa950] transition-[width] duration-500" style={{ width: `${Math.max(2, pct)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="px-2 py-8 text-center text-sm text-zinc-400 dark:text-zinc-600">Define 2 to 4 pages (for example /pricing then /signup) to see how many visitors make it through.</p>
        )}
      </div>
      {edit && <FunnelModal siteId={siteId} initial={funnel?.steps ?? []} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); onSaved(); }} />}
    </div>
  );
}

function FunnelModal({ siteId, initial, onClose, onSaved }: { siteId: string; initial: string[]; onClose: () => void; onSaved: () => void }) {
  const [steps, setSteps] = useState<string[]>([...initial, '', '', '', ''].slice(0, 4));
  const [busy, setBusy] = useState(false);
  const clean = steps.map((p) => p.trim()).filter(Boolean);
  return (
    <Overlay onClose={onClose}>
      <h3 className="head mb-1 text-lg font-bold text-zinc-900 dark:text-zinc-50">Funnel steps</h3>
      <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">Exact page paths, in order. A visitor counts for a step if they visited the pages in this order within 7 days.</p>
      <div className="space-y-2">
        {steps.map((p, i) => (
          <input key={i} value={p} onChange={(e) => setSteps((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))} placeholder={i === 0 ? '/pricing' : i === 1 ? '/signup' : 'Optional step'} className="field font-mono text-xs" />
        ))}
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-xl px-3 py-2 text-sm text-zinc-500 transition-colors hover:text-zinc-900 dark:hover:text-zinc-100">Cancel</button>
        <button
          disabled={busy || clean.length < 2}
          onClick={async () => { setBusy(true); await fetch(`/api/funnel?site=${encodeURIComponent(siteId)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ steps: clean }) }); setBusy(false); onSaved(); }}
          className="btn-primary"
        >{busy ? 'Saving…' : 'Save funnel'}</button>
      </div>
    </Overlay>
  );
}

// Retention: for each week's new visitors, the share that came back.
function RetentionCard({ rows }: { rows: { cohort: string; offset: number; n: number }[] }) {
  const cohorts = [...new Set(rows.map((r) => r.cohort))].sort().slice(-8);
  const byKey = new Map(rows.map((r) => [`${r.cohort}-${r.offset}`, r.n]));
  const maxOffset = 7;
  return (
    <div className="card flex h-full flex-col p-5">
      <div className="flex items-center gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#ffa950]/15 text-[#b06a1f] dark:bg-[#ffa950]/10 dark:text-[#ffa950]"><RepeatIcon /></span>
        <div className="min-w-0">
          <h3 className="head text-sm font-bold text-zinc-900 dark:text-zinc-50">Retention</h3>
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500">% of each week&apos;s visitors coming back</p>
        </div>
      </div>
      <div className="mt-4 flex-1">
        {cohorts.length === 0 ? (
          <p className="px-2 py-8 text-center text-sm text-zinc-400 dark:text-zinc-600">Weekly cohorts appear once visitors start returning.</p>
        ) : (
          <div>
            <div className="mb-1 flex items-center gap-0.5"><span className="w-11 shrink-0 sm:w-16" />{Array.from({ length: maxOffset + 1 }, (_, i) => <span key={i} className="flex-1 text-center text-[9px] font-medium text-zinc-400 dark:text-zinc-500">W{i}</span>)}</div>
            {cohorts.map((c) => {
              const size = byKey.get(`${c}-0`) ?? 0;
              const d = parseKey(c);
              return (
                <div key={c} className="mb-1 flex items-center gap-0.5">
                  <span className="w-11 shrink-0 text-[10px] font-medium text-zinc-500 sm:w-16 dark:text-zinc-400">{d ? `${d.getDate()} ${MONTHS[d.getMonth()]}` : c}</span>
                  {Array.from({ length: maxOffset + 1 }, (_, o) => {
                    const v = byKey.get(`${c}-${o}`) ?? 0;
                    const pct = size > 0 ? Math.round((v / size) * 100) : 0;
                    const active = o === 0 ? size > 0 : v > 0;
                    return <span key={o} title={`${fmt(v)} visitors (${pct}%)`} className="flex h-7 flex-1 items-center justify-center rounded-md text-[9px] font-semibold tabular-nums" style={active ? { background: `rgba(255,169,80,${0.12 + Math.min(1, pct / 100) * 0.75})`, color: pct > 45 ? '#573310' : undefined } : { background: 'rgba(128,128,140,0.08)' }}>{active ? `${pct}%` : ''}</span>;
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// Revenue attribution: which sources and campaigns actually bring money.
function RevenueAttribCard({ data, currency, siteId }: { data?: { source: { name: string; amount: number }[]; campaign: { name: string; amount: number }[] }; currency: string; siteId: string }) {
  const [tab, setTab] = useState<'source' | 'campaign'>('source');
  const rows = (tab === 'source' ? data?.source : data?.campaign) ?? [];
  const max = rows[0]?.amount ?? 1;
  return (
    <div className="card flex h-full flex-col p-5">
      <div className="flex items-center gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#ffa950]/15 text-[#b06a1f] dark:bg-[#ffa950]/10 dark:text-[#ffa950]"><CoinIcon /></span>
        <div className="min-w-0">
          <h3 className="head text-sm font-bold text-zinc-900 dark:text-zinc-50">Revenue attribution</h3>
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500">which traffic actually brings money</p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 border-b border-[var(--card-border)]">
        <div className="flex gap-4">
          {(['source', 'campaign'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`-mb-px border-b-2 pb-2 text-xs font-semibold capitalize transition-colors ${tab === t ? 'border-[#ffa950] text-zinc-900 dark:text-zinc-50' : 'border-transparent text-zinc-400 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-200'}`}>{t}</button>
          ))}
        </div>
        <span className="shrink-0 pb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">Revenue</span>
      </div>
      <div className="mt-4 flex-1">
        {rows.length > 0 ? rows.slice(0, 10).map((r) => (
          <div key={r.name} className="py-[7px]">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-zinc-700 dark:text-zinc-200">{SOURCE_LABEL[r.name] ?? cap(r.name || 'direct')}</span>
              <span className="shrink-0 tabular-nums font-semibold text-zinc-900 dark:text-zinc-100">{fmtMoney(r.amount, currency)}</span>
            </div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.08]">
              <span className="block h-full rounded-full bg-[#ffa950]" style={{ width: `${Math.max(2, Math.round((r.amount / Math.max(1, max)) * 100))}%` }} />
            </div>
          </div>
        )) : (
          <div className="px-2 py-6 text-center text-sm text-zinc-400 dark:text-zinc-600">
            <p>Add one line on your thank-you page and every sale gets attributed to its traffic source:</p>
            <pre className="mt-3 max-w-full overflow-x-auto rounded-lg bg-black/[0.05] px-3 py-2 text-left font-mono text-xs text-zinc-600 dark:bg-white/[0.06] dark:text-zinc-300">{`insight('purchase', { amount: 99, currency: 'usd' })`}</pre>
            <p className="mt-2 text-xs">Works with the script already installed on {siteId || 'your site'}.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// Channel composition: one stacked bar with a legend, instead of a chart.
function RaceBar({ items, total }: { items: Item[]; total: number }) {
  return (
    <div>
      <div className="flex h-3 w-full gap-[3px] overflow-hidden rounded-full">
        {items.map((it) => (
          <span key={it.key} className="h-full rounded-full" style={{ width: `${total > 0 ? Math.max(1.5, (it.value / total) * 100) : 0}%`, background: it.color }} />
        ))}
      </div>
      <div className="mt-4 space-y-2.5">
        {items.map((it) => (
          <div key={it.key} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2 truncate text-zinc-700 dark:text-zinc-200">{it.left}</span>
            <span className="shrink-0 tabular-nums font-semibold text-zinc-900 dark:text-zinc-100">{fmt(it.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const alignCls = (a?: Align): string => (a === 'center' ? 'text-center' : a === 'right' ? 'text-right' : 'text-left');

function DetailsModal({ title, tab, metric, onClose }: { title: string; tab: Tab; metric: string; onClose: () => void }) {
  const total = tab.items.reduce((a, b) => a + b.value, 0);
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [onClose]);

  const detail = tab.detail;
  const rowIdx = detail ? detail.rows.map((_, i) => i).filter((i) => !query || (detail.filter?.[i] ?? '').toLowerCase().includes(query)) : [];
  const items = tab.items.filter((it) => !query || it.key.toLowerCase().includes(query));

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="relative flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700/80 dark:bg-[#131318]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-4 border-b border-zinc-200 px-5 py-3 dark:border-zinc-800">
          {detail?.logo ?? <h3 className="head shrink-0 text-base font-bold text-zinc-900 dark:text-zinc-50">{title}</h3>}
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-800 outline-none focus:border-[#ffa950] dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" />
          <button onClick={onClose} aria-label="Close" className="flex size-8 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"><CloseIcon /></button>
        </div>
        <div className="overflow-y-auto">
          {detail ? (
            <>
              {/* Desktop: table. */}
              <table className="hidden w-full table-fixed text-sm sm:table">
                <colgroup>{detail.columns.map((c, i) => <col key={c} style={detail.widths?.[i] ? { width: detail.widths[i] } : undefined} />)}</colgroup>
                <thead className="sticky top-0 bg-white dark:bg-[#131318]">
                  <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-400 dark:border-zinc-800">
                    {detail.columns.map((c, i) => <th key={c} className={`px-4 py-2.5 font-semibold ${alignCls(detail.align?.[i])}`}>{c}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rowIdx.map((ri) => (
                    <tr key={ri} className="border-b border-[var(--card-border)] last:border-0 hover:bg-black/[0.03] dark:hover:bg-white/[0.04]">
                      {detail.rows[ri].map((cell, ci) => <td key={ci} className={`truncate px-4 py-2.5 text-zinc-700 dark:text-zinc-200 ${alignCls(detail.align?.[ci])}`}>{cell}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
              {/* Mobile: each row as a stacked card, no horizontal scroll. */}
              <div className="divide-y divide-[var(--card-border)] sm:hidden">
                {rowIdx.map((ri) => (
                  <div key={ri} className="px-4 py-3">
                    <div className="min-w-0 text-sm font-medium text-zinc-800 dark:text-zinc-100">{detail.rows[ri][0]}</div>
                    <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                      {detail.columns.slice(1).map((col, ci) => (
                        <span key={col} className="text-xs text-zinc-500 dark:text-zinc-400">{col} <span className="font-semibold text-zinc-800 dark:text-zinc-100">{detail.rows[ri][ci + 1]}</span></span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <table className="hidden w-full table-fixed text-sm sm:table">
                <colgroup><col style={{ width: '3rem' }} /><col /><col style={{ width: '7rem' }} /><col style={{ width: '5rem' }} /></colgroup>
                <thead className="sticky top-0 bg-white dark:bg-[#131318]">
                  <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-400 dark:border-zinc-800">
                    <th className="px-4 py-2.5 text-left font-semibold">#</th>
                    <th className="py-2.5 text-left font-semibold">Name</th>
                    <th className="px-4 py-2.5 text-right font-semibold">{metric}</th>
                    <th className="px-4 py-2.5 text-right font-semibold">%</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, i) => (
                    <tr key={it.key} className="border-b border-[var(--card-border)] last:border-0 hover:bg-black/[0.03] dark:hover:bg-white/[0.04]">
                      <td className="px-4 py-2.5 tabular-nums text-zinc-400">{i + 1}</td>
                      <td className="min-w-0 truncate py-2.5 text-zinc-700 dark:text-zinc-200"><span className="flex min-w-0 items-center gap-2">{it.left}</span></td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-medium text-zinc-800 dark:text-zinc-100">{fmt(it.value)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-zinc-400">{total > 0 ? Math.round((it.value / total) * 100) : 0}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="divide-y divide-[var(--card-border)] sm:hidden">
                {items.map((it, i) => (
                  <div key={it.key} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                    <span className="flex min-w-0 items-center gap-2 text-zinc-700 dark:text-zinc-200"><span className="shrink-0 tabular-nums text-zinc-400">{i + 1}.</span>{it.left}</span>
                    <span className="shrink-0 tabular-nums"><span className="font-semibold text-zinc-800 dark:text-zinc-100">{fmt(it.value)}</span> <span className="text-xs text-zinc-400">{total > 0 ? Math.round((it.value / total) * 100) : 0}%</span></span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}


// AI/indexing card: a multi-line chart of crawls, and clicking a bot
// (ChatGPT, Googlebot, Bing...) shows the pages it crawled. No Details button.
const AI_COLORS = ['#ffa950', '#3b82f6', '#10b981', '#ec4899', '#a855f7', '#f43f5e'];

function AiTooltip({ active, payload, label }: { active?: boolean; payload?: RTipItem[]; label?: string | number }) {
  if (!active || !payload || !payload.length) return null;
  const rows = payload.filter((p) => Number(p.value) > 0);
  if (!rows.length) return null;
  return (
    <div className="min-w-[160px] rounded-xl border border-white/10 bg-zinc-900/95 px-3 py-2 text-xs shadow-2xl backdrop-blur">
      <p className="mb-1.5 border-b border-white/10 pb-1 text-[13px] font-semibold text-zinc-100">{fullDate(String(label ?? ''))}</p>
      {rows.map((p) => (
        <div key={String(p.dataKey)} className="mt-0.5 flex items-center justify-between gap-6">
          <span className="flex items-center gap-1.5 text-zinc-400"><span className="size-2 rounded-full" style={{ background: p.color }} />{String(p.dataKey)}</span>
          <span className="font-semibold tabular-nums text-zinc-50">{fmt(Number(p.value))}</span>
        </div>
      ))}
    </div>
  );
}

const AI_CAT_LABEL: Record<string, string> = { answer: 'AI answers', search: 'Indexing', training: 'Training' };

type AiTab = 'all' | 'answer' | 'search' | 'training';

function AiCard({ data, period }: { data: Stats | null; period: Period }) {
  const [tab, setTab] = useState<AiTab>('all');
  const [sel, setSel] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const all = data?.ai ?? [];
  const bots = all.filter((b) => tab === 'all' || b.category === tab);
  const series = data?.aiSeries ?? [];
  const lineKeys = data?.aiBots ?? [];
  const selected = all.find((b) => b.name === sel && (tab === 'all' || b.category === tab)) ?? null;
  const windowDays = period === '30d' ? 30 : period === '90d' ? 90 : 7;
  const countOf = (c: AiTab): number => all.filter((b) => c === 'all' || b.category === c).reduce((s, b) => s + b.count, 0);
  const tabs: { key: AiTab; label: string; icon: ReactNode }[] = [
    { key: 'all', label: 'All', icon: <BotIcon /> },
    { key: 'answer', label: 'AI answers', icon: <SparklesIcon /> },
    { key: 'search', label: 'Indexing', icon: <SearchIcon /> },
    { key: 'training', label: 'Training', icon: <BrainIcon /> },
  ];

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#ffa950]/15 text-[#b06a1f] dark:bg-[#ffa950]/10 dark:text-[#ffa950]"><BotIcon /></span>
          <div className="min-w-0">
            <h3 className="head truncate text-sm font-bold text-zinc-900 dark:text-zinc-50">AI &amp; crawlers</h3>
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500">crawls · last {windowDays} days</p>
          </div>
        </div>
        {!selected && (
          <div className="relative">
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400"><SearchIcon /></span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search crawlers" className="w-40 rounded-lg border border-[var(--card-border)] bg-transparent py-1.5 pl-8 pr-3 text-xs text-zinc-800 outline-none focus:border-[#ffa950] sm:w-52 dark:text-zinc-100" />
          </div>
        )}
      </div>

      <div className="tabs-scroll mt-3 flex gap-4 overflow-x-auto border-b border-[var(--card-border)]">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setSel(null); }}
            className={`-mb-px flex shrink-0 items-center gap-1.5 border-b-2 pb-2 text-xs font-semibold transition-colors ${tab === t.key ? 'border-[#ffa950] text-zinc-900 dark:text-zinc-50' : 'border-transparent text-zinc-400 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-200'}`}
          >
            {t.label}<span className="tabular-nums text-zinc-400 dark:text-zinc-500">{fmt(countOf(t.key))}</span>
          </button>
        ))}
      </div>

      <div className="mt-4 grid items-stretch gap-5 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col">
          {lineKeys.length > 0 ? (
            <div className="h-64 w-full sm:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={series} margin={{ top: 6, right: 8, left: 4, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(130,130,140,.2)" />
                  <XAxis dataKey="t" tickFormatter={axisLabel} tickLine={false} axisLine={{ stroke: 'rgba(130,130,140,.35)' }} tick={{ fill: '#a1a1aa', fontSize: 11 }} tickMargin={8} minTickGap={28} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fill: '#a1a1aa', fontSize: 11 }} width={38} allowDecimals={false} />
                  <Tooltip cursor={{ stroke: 'rgba(130,130,140,.5)' }} content={<AiTooltip />} />
                  {lineKeys.map((k, i) => <Line key={k} type="monotone" dataKey={k} stroke={AI_COLORS[i % AI_COLORS.length]} strokeWidth={2} dot={series.length <= 2 ? { r: 3 } : false} isAnimationActive={false} connectNulls />)}
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex h-72 items-center justify-center text-sm text-zinc-400 dark:text-zinc-600">No AI or indexing crawls detected yet.</div>
          )}
        </div>

        <div className="h-72 min-w-0 self-stretch overflow-hidden rounded-xl border border-[var(--card-border)] md:h-auto">
          {selected
            ? <AiBotPanel bot={selected} windowDays={windowDays} onClose={() => setSel(null)} />
            : <AiBotList bots={bots} query={q} onSelect={setSel} />}
        </div>
      </div>
    </div>
  );
}

function catIcon(category: string): ReactNode {
  if (category === 'answer') return <SparklesIcon />;
  if (category === 'search') return <SearchIcon />;
  if (category === 'training') return <BrainIcon />;
  return <BotIcon />;
}

function BotBadge({ vendor, size = 'md' }: { vendor: string; size?: 'md' | 'sm' }) {
  const box = size === 'sm' ? 'size-6' : 'size-7';
  const img = size === 'sm' ? 14 : 16;
  return (
    <span className={`flex ${box} shrink-0 items-center justify-center rounded-md ${vendorTint(vendor)}`}>
      <BrandSvg name={VENDOR_ICON[vendor] ?? ''} size={img} className="object-contain" />
    </span>
  );
}

function AiBotList({ bots, query, onSelect }: { bots: AiBot[]; query: string; onSelect: (name: string) => void }) {
  const q = query.trim().toLowerCase();
  const listed = bots.filter((b) => !q || b.name.toLowerCase().includes(q));
  return (
    <div className="h-full space-y-0.5 overflow-y-auto p-1.5">
      {listed.map((b) => (
        <button key={b.name} onClick={() => onSelect(b.name)} className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800/60">
          <span className="flex min-w-0 items-center gap-2">
            <BotBadge vendor={b.vendor} size="sm" />
            <span className="truncate font-medium text-zinc-800 dark:text-zinc-100">{b.name}</span>
            <span className="shrink-0 text-zinc-400 dark:text-zinc-500">{catIcon(b.category)}</span>
          </span>
          <span className="shrink-0 tabular-nums font-semibold text-zinc-700 dark:text-zinc-200">{fmt(b.count)}</span>
        </button>
      ))}
      {listed.length === 0 && <p className="py-10 text-center text-sm text-zinc-400 dark:text-zinc-600">No crawlers.</p>}
    </div>
  );
}

function AiBotPanel({ bot, windowDays, onClose }: { bot: AiBot; windowDays: number; onClose: () => void }) {
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const pages = bot.pages.filter((p) => !query || p.name.toLowerCase().includes(query));
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-[var(--card-border)] p-3">
        <BotBadge vendor={bot.vendor} />
        <div className="min-w-0 flex-1">
          <p className="head truncate text-sm font-bold text-zinc-900 dark:text-zinc-50">{bot.name}</p>
          <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{fmt(bot.count)} crawls · Last {windowDays} days · {AI_CAT_LABEL[bot.category] ?? 'Crawler'}</p>
        </div>
        <button onClick={onClose} aria-label="Back to crawlers" className="flex size-7 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"><CloseIcon /></button>
      </div>
      <div className="p-3 pb-0">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter pages…" className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-800 outline-none focus:border-[#ffa950] dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" />
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-1">
        {pages.map((p) => (
          <div key={p.name} className="flex items-center justify-between gap-3 border-b border-[var(--card-border)] py-2 last:border-0">
            <span className="truncate font-mono text-xs text-zinc-700 dark:text-zinc-200" title={p.name}>{p.name}</span>
            <span className="shrink-0 tabular-nums text-sm text-zinc-500 dark:text-zinc-400">{fmt(p.count)}</span>
          </div>
        ))}
        {pages.length === 0 && <p className="py-6 text-center text-sm text-zinc-400 dark:text-zinc-600">No pages.</p>}
      </div>
    </div>
  );
}

function MenuItem({ children, onClick, danger, icon }: { children: ReactNode; onClick: () => void; danger?: boolean; icon?: ReactNode }) {
  return (
    <button onClick={onClick} className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800 ${danger ? 'text-rose-600 dark:text-rose-400' : 'text-zinc-700 dark:text-zinc-200'}`}>
      <span className="flex size-4 shrink-0 items-center justify-center">{icon}</span>
      <span className="flex-1 truncate">{children}</span>
    </button>
  );
}

const CodeIcon = () => <Ico><path d="m16 18 6-6-6-6" /><path d="m8 6-6 6 6 6" /></Ico>;
const LinkIcon = () => <Ico><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></Ico>;
const TrashIcon = () => <Ico><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></Ico>;
const StripeIcon = () => <BrandSvg name="stripe" />;
const GaIcon = () => <BrandSvg name="googleanalytics" />;
const SignalIcon = () => <Ico><path d="M2 20h.01" /><path d="M7 20v-4" /><path d="M12 20v-8" /><path d="M17 20V8" /><path d="M22 4v16" /></Ico>;
const FileIcon = () => <Ico><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" /></Ico>;
const ChipIcon = () => <Ico><rect width="16" height="16" x="4" y="4" rx="2" /><rect width="6" height="6" x="9" y="9" rx="1" /><path d="M15 2v2" /><path d="M15 20v2" /><path d="M2 15h2" /><path d="M2 9h2" /><path d="M20 15h2" /><path d="M20 9h2" /><path d="M9 2v2" /><path d="M9 20v2" /></Ico>;
const ExpandIcon = () => <Ico><path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></Ico>;
const ChevLeft = () => <Ico><path d="m15 18-6-6 6-6" /></Ico>;
const ChevRight = () => <Ico><path d="m9 18 6-6-6-6" /></Ico>;
const PulseIcon = () => <Ico><path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2" /></Ico>;
const ClockIcon = () => <Ico><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></Ico>;
const FunnelIcon = () => <Ico><path d="M10 20a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341L21.74 4.67A1 1 0 0 0 21 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14z" /></Ico>;
const RepeatIcon = () => <Ico><path d="m17 2 4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14" /><path d="m7 22-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" /></Ico>;
const CoinIcon = () => <Ico><circle cx="12" cy="12" r="10" /><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" /><path d="M12 18V6" /></Ico>;
const CalIcon = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M8 2v4" /><path d="M16 2v4" /><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18" /></svg>;

function PlusIcon() {
  return <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden><path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
}
function DotsIcon() {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden><circle cx="8" cy="3" r="1.4" /><circle cx="8" cy="8" r="1.4" /><circle cx="8" cy="13" r="1.4" /></svg>;
}

function Onboarding({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="card mt-16 flex flex-col items-center border-dashed px-6 py-16 text-center">
      <h2 className="head text-xl font-bold text-zinc-900 dark:text-zinc-50">No site yet</h2>
      <p className="mt-1.5 max-w-sm text-sm text-zinc-500 dark:text-zinc-400">Add your first site to get a tracking script and start seeing live visitors.</p>
      <button onClick={onAdd} className="btn-primary mt-5"><PlusIcon /> Add your first site</button>
    </div>
  );
}

function Overlay({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-700/80 dark:bg-[#131318]" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} aria-label="Close" className="absolute right-3.5 top-3.5 flex size-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200">
          <CloseIcon />
        </button>
        {children}
      </div>
    </div>,
    document.body,
  );
}

function CloseIcon() {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden><path d="M12 4 4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="5" y="5" width="8.5" height="9.5" rx="1.6" stroke="currentColor" strokeWidth="1.4" />
      <path d="M11 5V3.6A1.6 1.6 0 0 0 9.4 2H4.6A1.6 1.6 0 0 0 3 3.6v6A1.6 1.6 0 0 0 4.6 11H5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden><path d="M3.5 8.5l3 3 6-6.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function Ico({ children }: { children: ReactNode }) {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden>{children}</svg>;
}
const BotIcon = () => <Ico><path d="M12 8V4H8" /><rect width="16" height="12" x="4" y="8" rx="2" /><path d="M2 14h2" /><path d="M20 14h2" /><path d="M15 13v2" /><path d="M9 13v2" /></Ico>;
const SparklesIcon = () => <Ico><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" /><path d="M20 3v4" /><path d="M22 5h-4" /><path d="M4 17v2" /><path d="M5 18H3" /></Ico>;
const SearchIcon = () => <Ico><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></Ico>;
const BrainIcon = () => <Ico><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" /><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" /><path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4" /></Ico>;
const DesktopIcon = () => <Ico><rect width="20" height="14" x="2" y="3" rx="2" /><path d="M8 21h8M12 17v4" /></Ico>;
const MobileIcon = () => <Ico><rect width="14" height="20" x="5" y="2" rx="2" /><path d="M12 18h.01" /></Ico>;
const TabletIcon = () => <Ico><rect width="16" height="20" x="4" y="2" rx="2" /><path d="M12 18h.01" /></Ico>;
const GlobeSmall = () => <Ico><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18" /></Ico>;
const WindowsIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="shrink-0" aria-hidden><path d="M3 5.6 10.2 4.6v6.9H3zM11.2 4.5 21 3.2v8.3h-9.8zM3 12.5h7.2v6.9L3 18.4zM11.2 12.5H21v8.3l-9.8-1.3z" /></svg>;
const PowerIcon = () => <Ico><path d="M12 2v10" /><path d="M18.36 6.64a9 9 0 1 1-12.73 0" /></Ico>;

interface DropOption { value: string; label: string; icon?: ReactNode }

function Menu({ button, buttonClass, align = 'left', children }: { button: ReactNode; buttonClass: string; align?: 'left' | 'right'; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onEsc);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onEsc); };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className={buttonClass}>{button}</button>
      {open && (
        <div className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} z-30 mt-1.5 max-h-72 min-w-[13rem] overflow-y-auto rounded-xl border border-zinc-200 bg-white p-1 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.35)] dark:border-zinc-700/80 dark:bg-[#131318]`}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

function Dropdown({ value, options, onChange, wide }: { value: string; options: DropOption[]; onChange: (v: string) => void; wide?: boolean }) {
  const current = options.find((o) => o.value === value);
  return (
    <Menu
      align="left"
      buttonClass={`flex items-center gap-2 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] px-3 py-2 text-sm font-semibold text-zinc-800 transition-colors hover:border-[#ffa950]/50 dark:text-zinc-100 ${wide ? 'w-full' : ''}`}
      button={<>{current?.icon}<span className={`truncate ${wide ? 'flex-1 text-left' : 'max-w-[9rem]'}`}>{current?.label ?? 'Select'}</span><ChevronDown /></>}
    >
      {(close) => options.map((o) => (
        <button
          key={o.value}
          onClick={() => { onChange(o.value); close(); }}
          className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800 ${o.value === value ? 'text-zinc-900 dark:text-zinc-50' : 'text-zinc-600 dark:text-zinc-300'}`}
        >
          {o.icon}
          <span className="flex-1 truncate">{o.label}</span>
          {o.value === value && <CheckMark />}
        </button>
      ))}
    </Menu>
  );
}

function ChevronDown() {
  return <svg className="size-3.5 shrink-0 text-zinc-400" viewBox="0 0 16 16" fill="none" aria-hidden><path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
function CheckMark() {
  return <svg className="size-3.5 shrink-0 text-[#ffa950]" viewBox="0 0 16 16" fill="none" aria-hidden><path d="M3.5 8.5l3 3 6-6.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

// Brands whose official logo is black/monochrome: invert to white in dark mode.
const DARK_BRANDS = new Set(['apple', 'openai', 'x', 'anthropic', 'threads']);
// Map an arbitrary hostname to a known brand slug (regional/subdomain variants).
function brandFromHost(host: string): string | null {
  if (DOMAIN_ICON[host]) return DOMAIN_ICON[host];
  const h = host.toLowerCase();
  const has = (...parts: string[]) => parts.some((p) => h.includes(p));
  if (has('google.')) return 'google';
  if (has('bing.')) return 'bing';
  if (has('yahoo.')) return 'yahoo';
  if (has('duckduckgo')) return 'duckduckgo';
  if (has('ecosia')) return 'ecosia';
  if (has('qwant')) return 'qwant';
  if (has('linkedin', 'lnkd.in')) return 'linkedin';
  if (has('facebook', 'fb.com', 'fb.me')) return 'facebook';
  if (has('instagram')) return 'instagram';
  if (has('youtube', 'youtu.be')) return 'youtube';
  if (has('tiktok')) return 'tiktok';
  if (has('reddit')) return 'reddit';
  if (has('brave.com')) return 'brave';
  if (has('chatgpt', 'openai')) return 'openai';
  if (has('perplexity')) return 'perplexity';
  if (has('claude', 'anthropic')) return 'anthropic';
  if (has('gemini.google')) return 'gemini';
  if (has('twitter', 'x.com', 't.co')) return 'x';
  if (has('sendinblue', 'brevo')) return 'brevo';
  if (has('copilot')) return 'copilot';
  if (has('you.com')) return 'you';
  return null;
}

// Official brand SVG served locally from /public/i, with a neutral-globe
// fallback for brands not yet bundled. Dark/monochrome logos flip to white in
// dark mode so they stay visible.
function BrandSvg({ name, size = 16, className = 'size-4 shrink-0 object-contain' }: { name: string; size?: number; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (!name || broken) return <GlobeSmall />;
  const dark = DARK_BRANDS.has(name) ? 'dark:invert' : '';
  return <img src={`/i/${name}.svg`} alt="" width={size} height={size} style={{ width: size, height: size }} className={`${className} ${dark}`} onError={() => setBroken(true)} />;
}
// Referrer favicon: known brands use the local SVG; any other host is proxied
// and cached on the VPS (SVG first), so the browser never hits a third party.
function DomainIcon({ domain }: { domain: string }) {
  const [broken, setBroken] = useState(false);
  const slug = brandFromHost(domain);
  if (slug) return <BrandSvg name={slug} className="size-4 shrink-0 rounded object-contain" />;
  if (!domain || broken) return <GlobeSmall />;
  return <img src={`/api/icon?d=${encodeURIComponent(domain)}`} alt="" width={16} height={16} className="size-4 shrink-0 rounded object-contain" onError={() => setBroken(true)} />;
}
function osIcon(name: string): ReactNode {
  const s = name.toLowerCase();
  if (s === 'windows') return <WindowsIcon />;
  const slug = OS_SLUG[s];
  return slug ? <BrandSvg name={slug} /> : <span className="size-4 shrink-0" />;
}
function browserIcon(name: string): ReactNode {
  const slug = BROWSER_LOGO[name.toLowerCase()];
  return slug ? <BrandSvg name={slug} /> : <GlobeSmall />;
}
function deviceIcon(name: string): ReactNode {
  const s = name.toLowerCase();
  if (s === 'mobile') return <MobileIcon />;
  if (s === 'tablet') return <TabletIcon />;
  return <DesktopIcon />;
}

const hideBroken = (e: SyntheticEvent<HTMLImageElement>) => { e.currentTarget.style.visibility = 'hidden'; };


// Self-hosted favicon: the server downloads the site's real icon onto the VPS and serves it
// from insight.nicolaslecocq.com (/api/favicon/<id>). No external source. Fallback: globe.
function SiteFavicon({ id, url }: { id: string; url: string }) {
  const [broken, setBroken] = useState(false);
  if (!url || broken) return <GlobeSmall />;
  return <img src={`/api/favicon/${id}`} alt="" width={16} height={16} className="size-4 shrink-0 rounded object-contain" onError={() => setBroken(true)} />;
}

function Favicon({ domain, label }: { domain: string; label: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <DomainIcon domain={domain} />
      <span className="truncate">{label}</span>
    </span>
  );
}

function Flag({ code }: { code: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <img src={`/flags/${code.toUpperCase()}.svg`} alt="" width={20} height={14} className="h-[14px] w-[20px] shrink-0 rounded-[2px] object-cover shadow-sm" onError={hideBroken} />
      <span className="truncate">{countryName(code)}</span>
    </span>
  );
}

function Snippet({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  const [persist, setPersist] = useState(false);
  const [verify, setVerify] = useState<{ state: 'idle' | 'checking' | 'ok' | 'ko'; count: number }>({ state: 'idle', count: 0 });
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const code = `<script defer data-site="${id}"${persist ? ' data-persist="true"' : ''} src="${origin}/t.js?s=${id}"></script>`;
  return (
    <div>
      {/* Two flavors of the same script: storage-free (banner-free) vs persistent id. */}
      <div className="mb-3 grid grid-cols-2 gap-2">
        <button
          onClick={() => setPersist(false)}
          className={`rounded-xl border p-3 text-left transition-colors ${!persist ? 'border-[#ffa950] bg-[#ffa950]/10' : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-700 dark:hover:border-zinc-600'}`}
        >
          <span className="block text-sm font-semibold text-zinc-900 dark:text-zinc-50">Cookieless</span>
          <span className="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400">Stores nothing on the device. No consent banner needed.</span>
        </button>
        <button
          onClick={() => setPersist(true)}
          className={`rounded-xl border p-3 text-left transition-colors ${persist ? 'border-[#ffa950] bg-[#ffa950]/10' : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-700 dark:hover:border-zinc-600'}`}
        >
          <span className="block text-sm font-semibold text-zinc-900 dark:text-zinc-50">Full data</span>
          <span className="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400">Precise returning visitors, retention and multi-day attribution.</span>
        </button>
      </div>
      <p className="mb-3 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
        {persist
          ? 'Stores one random first-party id in localStorage (no cookies, no fingerprinting), so a visitor keeps the same identity across days: exact new vs returning, retention cohorts and multi-day revenue attribution. Legally, treat it like a cookie: cover it in your privacy policy and, for EU visitors, in your consent flow. Policy line you can paste: "We use Insight, a self-hosted analytics tool. It sets no cookies. It stores a random identifier in your browser’s local storage to recognize returning visits. It never stores your IP address and the data never leaves our server."'
          : 'Counts visitors with a salted hash that rotates daily, server-side. Nothing is written to the visitor’s device and raw IPs are never stored, so no consent banner is required. Trade-off: a visitor who comes back on a later day counts as new again, so retention and new vs returning are approximate beyond one day.'}
      </p>
      <p className="mb-2 text-sm text-zinc-500 dark:text-zinc-400">Add this script to your site&apos;s <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">&lt;head&gt;</code>:</p>
      <div className="relative">
        <pre className="overflow-x-auto rounded-lg border border-zinc-200 bg-zinc-50 p-3 pr-16 text-xs text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">{code}</pre>
        <button
          onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
          aria-label="Copy"
          className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-md bg-[#ffa950] text-[#573310] shadow-sm transition-all hover:bg-[#f5991f] active:scale-95"
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          onClick={async () => {
            setVerify({ state: 'checking', count: 0 });
            try {
              const res = await fetch(`/api/verify?site=${encodeURIComponent(id)}`, { cache: 'no-store' });
              const j = await res.json();
              setVerify({ state: j.ok ? 'ok' : 'ko', count: j.count ?? 0 });
            } catch { setVerify({ state: 'ko', count: 0 }); }
          }}
          className="btn-ghost"
        >
          {verify.state === 'checking' ? 'Checking…' : 'Verify installation'}
        </button>
        {verify.state === 'ok' && <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">Script detected — {verify.count} events received.</span>}
        {verify.state === 'ko' && <span className="text-sm font-medium text-amber-600 dark:text-amber-400">Not detected yet. Add the script and open a page.</span>}
      </div>
    </div>
  );
}


// Chart annotations: add or remove small dated notes (deploy, campaign...).
function NoteModal({ siteId, notes, onClose, onChanged }: { siteId: string; notes: { date: string; text: string }[]; onClose: () => void; onChanged: () => void }) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Overlay onClose={onClose}>
      <h3 className="head mb-1 text-lg font-bold text-zinc-900 dark:text-zinc-50">Chart notes</h3>
      <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">Mark a launch, a deploy or a viral post to explain traffic spikes.</p>
      <div className="flex gap-2">
        <input type="date" value={date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} className="field w-36 shrink-0" />
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="What happened?" className="field" />
      </div>
      <div className="mt-3 flex justify-end">
        <button
          disabled={busy || !text.trim()}
          onClick={async () => { setBusy(true); await fetch(`/api/notes?site=${encodeURIComponent(siteId)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date, text }) }); setBusy(false); setText(''); onChanged(); }}
          className="btn-primary"
        >{busy ? 'Adding…' : 'Add note'}</button>
      </div>
      {notes.length > 0 && (
        <div className="mt-4 max-h-48 overflow-y-auto border-t border-[var(--card-border)] pt-3">
          {notes.map((nt, i) => (
            <div key={`${nt.date}-${i}`} className="flex items-center gap-3 py-1.5 text-sm">
              <span className="shrink-0 tabular-nums text-xs text-zinc-400">{nt.date}</span>
              <span className="min-w-0 flex-1 truncate text-zinc-700 dark:text-zinc-200">{nt.text}</span>
              <button
                onClick={async () => { await fetch(`/api/notes?site=${encodeURIComponent(siteId)}&date=${nt.date}&text=${encodeURIComponent(nt.text)}`, { method: 'DELETE' }); onChanged(); }}
                aria-label="Delete note" className="shrink-0 text-zinc-400 transition-colors hover:text-rose-500"
              ><CloseIcon /></button>
            </div>
          ))}
        </div>
      )}
    </Overlay>
  );
}

// Modern range picker: a real month calendar with visual range selection,
// quick presets, and a summary of the chosen span.
const pad2 = (n: number): string => String(n).padStart(2, '0');
const toKey = (d: Date): string => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

function RangeModal({ initial, onApply, onClose }: { initial: { from: string; to: string }; onApply: (r: { from: string; to: string }) => void; onClose: () => void }) {
  const [start, setStart] = useState<string>(initial.from);
  const [end, setEnd] = useState<string>(initial.to);
  const [view, setView] = useState<{ y: number; m: number }>(() => {
    const d = parseKey(initial.to) ?? new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const todayKey = toKey(new Date());
  const valid = !!start && !!end && start <= end;

  const pick = (key: string) => {
    if (!start || (start && end)) { setStart(key); setEnd(''); return; }
    if (key < start) { setEnd(start); setStart(key); return; }
    setEnd(key);
  };
  const preset = (days: number) => {
    const to = new Date(Date.now() - 86400000);
    const from = new Date(Date.now() - days * 86400000);
    setStart(toKey(from));
    setEnd(toKey(to));
    setView({ y: to.getFullYear(), m: to.getMonth() });
  };
  const nav = (dir: number) => setView((v) => {
    const d = new Date(v.y, v.m + dir, 1);
    return { y: d.getFullYear(), m: d.getMonth() };
  });

  const first = new Date(view.y, view.m, 1);
  const offset = (first.getDay() + 6) % 7; // Monday-first grid
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (string | null)[] = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => toKey(new Date(view.y, view.m, i + 1))),
  ];
  const fmtLong = (k: string): string => { const d = parseKey(k); return d ? `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}` : k; };

  return (
    <Overlay onClose={onClose}>
      <h3 className="head mb-1 text-lg font-bold text-zinc-900 dark:text-zinc-50">Custom date range</h3>
      <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">Click a start date, then an end date.</p>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {[{ l: '14 days', d: 14 }, { l: '28 days', d: 28 }, { l: '60 days', d: 60 }, { l: '180 days', d: 180 }].map((pr) => (
          <button key={pr.d} onClick={() => preset(pr.d)} className="rounded-full border border-[var(--card-border)] px-3 py-1 text-xs font-semibold text-zinc-500 transition-colors hover:border-[#ffa950]/60 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">{pr.l}</button>
        ))}
      </div>

      <div className="rounded-xl border border-[var(--card-border)] p-3">
        <div className="mb-2 flex items-center justify-between">
          <button onClick={() => nav(-1)} aria-label="Previous month" className="flex size-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-black/[0.05] hover:text-zinc-800 dark:hover:bg-white/[0.07] dark:hover:text-zinc-100"><ChevLeft /></button>
          <span className="head text-sm font-bold text-zinc-900 dark:text-zinc-50">{MONTHS_FULL[view.m]} {view.y}</span>
          <button onClick={() => nav(1)} aria-label="Next month" className="flex size-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-black/[0.05] hover:text-zinc-800 dark:hover:bg-white/[0.07] dark:hover:text-zinc-100"><ChevRight /></button>
        </div>
        <div className="grid grid-cols-7 text-center">
          {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => (
            <span key={d} className="pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">{d}</span>
          ))}
          {cells.map((key, i) => {
            if (!key) return <span key={`b${i}`} />;
            const future = key > todayKey;
            const isStart = key === start;
            const isEnd = key === end || (isStart && !end);
            const inRange = !!start && !!end && key > start && key < end;
            return (
              <button
                key={key}
                disabled={future}
                onClick={() => pick(key)}
                className={`relative mx-auto my-0.5 flex size-9 items-center justify-center text-[13px] tabular-nums transition-colors ${
                  isStart || isEnd
                    ? 'rounded-xl bg-[#ffa950] font-bold text-[#573310]'
                    : inRange
                      ? 'rounded-none bg-[#ffa950]/15 text-zinc-800 dark:text-zinc-100'
                      : future
                        ? 'rounded-xl text-zinc-300 dark:text-zinc-700'
                        : 'rounded-xl text-zinc-700 hover:bg-black/[0.06] dark:text-zinc-200 dark:hover:bg-white/[0.08]'
                }`}
              >
                {Number(key.slice(8, 10))}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-sm font-semibold text-zinc-700 dark:text-zinc-200">
          {start ? fmtLong(start) : '…'} <span className="text-zinc-400">→</span> {end ? fmtLong(end) : '…'}
        </span>
        <span className="flex shrink-0 gap-2">
          <button onClick={onClose} className="rounded-xl px-3 py-2 text-sm text-zinc-500 transition-colors hover:text-zinc-900 dark:hover:text-zinc-100">Cancel</button>
          <button disabled={!valid} onClick={() => onApply({ from: start, to: end })} className="btn-primary">Apply</button>
        </span>
      </div>
    </Overlay>
  );
}

function AddSiteModal({ onClose, onCreated }: { onClose: () => void; onCreated: (s: SiteItem) => void }) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Overlay onClose={onClose}>
      <h3 className="head mb-4 text-lg font-bold text-zinc-900 dark:text-zinc-50">Add a site</h3>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          setBusy(true);
          const res = await fetch('/api/sites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, url }) });
          setBusy(false);
          if (res.ok) onCreated((await res.json()).site as SiteItem);
        }}
        className="space-y-3"
      >
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Site name (e.g. My Website)" className="field" />
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Website URL (e.g. https://website.com)" className="field" />
        <p className="text-xs text-zinc-500 dark:text-zinc-400">The URL is used for the site favicon and for Search Console keywords.</p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm text-zinc-500 transition-colors hover:text-zinc-900 dark:hover:text-zinc-100">Cancel</button>
          <button disabled={busy} className="btn-primary">{busy ? 'Adding…' : 'Create'}</button>
        </div>
      </form>
    </Overlay>
  );
}

function ScriptModal({ site, onClose }: { site: SiteItem; onClose: () => void }) {
  return (
    <Overlay onClose={onClose}>
      <h3 className="head mb-1 text-lg font-bold text-zinc-900 dark:text-zinc-50">Tracking script — {site.name}</h3>
      <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">One line in your site&apos;s <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">&lt;head&gt;</code>. It also detects AI crawlers automatically, nothing else to install.</p>
      <Snippet id={site.id} />
      <div className="mt-5 flex justify-end"><button onClick={onClose} className="btn-primary">Done</button></div>
    </Overlay>
  );
}

function UrlModal({ site, onClose, onDone }: { site: SiteItem; onClose: () => void; onDone: () => void }) {
  const [url, setUrl] = useState(site.url ?? '');
  const [busy, setBusy] = useState(false);
  return (
    <Overlay onClose={onClose}>
      <h3 className="head mb-1 text-lg font-bold text-zinc-900 dark:text-zinc-50">Website URL — {site.name}</h3>
      <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">The site&apos;s address. It is required for the favicon and for Search Console keywords.</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const res = await fetch('/api/sites', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: site.id, url }) });
          setBusy(false);
          if (res.ok) onDone();
        }}
        className="space-y-4"
      >
        <input autoFocus value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://website.com" className="field" />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm text-zinc-500 transition-colors hover:text-zinc-900 dark:hover:text-zinc-100">Cancel</button>
          <button disabled={busy} className="btn-primary">{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Overlay>
  );
}

function StripeModal({ site, onClose, onDone }: { site: SiteItem; onClose: () => void; onDone: () => void }) {
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <Overlay onClose={onClose}>
      <h3 className="head mb-1 text-lg font-bold text-zinc-900 dark:text-zinc-50">Connect Stripe — {site.name}</h3>
      <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">Paste a Stripe restricted key (read-only on charges and balance). Revenue shows in dollars with daily change.</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true); setError('');
          const res = await fetch('/api/sites/stripe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siteId: site.id, key }) });
          setBusy(false);
          if (res.ok) onDone();
          else setError('Invalid key. Use a restricted key with read access.');
        }}
        className="space-y-4"
      >
        <input autoFocus value={key} onChange={(e) => setKey(e.target.value)} placeholder="rk_live_..." className="field font-mono" />
        {error && <p className="text-sm text-rose-500">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm text-zinc-500 transition-colors hover:text-zinc-900 dark:hover:text-zinc-100">Cancel</button>
          <button disabled={busy} className="btn-primary">Connect</button>
        </div>
      </form>
    </Overlay>
  );
}

function Ga4Modal({ site, onClose, onDone }: { site: SiteItem; onClose: () => void; onDone: () => void }) {
  const [propertyId, setPropertyId] = useState('');
  const [sa, setSa] = useState('');
  const [email, setEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/sites/ga4', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setEmail(d.email ?? null))
      .catch(() => setEmail(null));
  }, []);

  const shown = email ?? 'the service account email (client_email in your JSON)';

  return (
    <Overlay onClose={onClose}>
      <h3 className="head mb-1 text-lg font-bold text-zinc-900 dark:text-zinc-50">Connect GA4 — {site.name}</h3>
      <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">Insight reads Google Analytics live for the 7D, 30D and 90D periods, so the numbers match GA4 exactly. Today uses your own Insight script in real time.</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true); setError('');
          const res = await fetch('/api/sites/ga4', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siteId: site.id, propertyId, serviceAccount: sa }) });
          setBusy(false);
          if (res.ok) { onDone(); return; }
          const j = await res.json().catch(() => ({}));
          setError(
            j.error === 'invalid' ? 'Invalid property ID, or the service account has no Viewer access yet.'
              : j.error === 'invalid_json' ? 'The service account JSON is not valid.'
              : j.error === 'no_account' ? 'Paste your service account JSON (first time only).'
              : 'Connection failed. Check access and try again.',
          );
        }}
        className="space-y-3"
      >
        <input value={propertyId} onChange={(e) => setPropertyId(e.target.value)} placeholder="GA4 property ID (e.g. 123456789)" className="field" />
        {email
          ? <p className="text-xs text-zinc-500 dark:text-zinc-400">Using saved service account: <span className="break-all font-medium text-zinc-700 dark:text-zinc-200">{email}</span></p>
          : <textarea value={sa} onChange={(e) => setSa(e.target.value)} placeholder='Service account JSON: {"client_email":"...","private_key":"..."}' rows={5} className="field font-mono text-xs" />}

        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
          <p className="mb-1 font-semibold text-zinc-700 dark:text-zinc-200">Give access</p>
          <ol className="mb-3 list-decimal space-y-0.5 pl-4">
            <li>In GA4, click Admin.</li>
            <li>Property → Property Access Management.</li>
            <li>Click + (top right) → Add users → paste <span className="break-all font-medium text-zinc-700 dark:text-zinc-200">{shown}</span> → role Viewer → uncheck &quot;Notify by email&quot; → Add.</li>
          </ol>
          <p className="mb-1 font-semibold text-zinc-700 dark:text-zinc-200">Get your Property ID</p>
          <ol className="list-decimal space-y-0.5 pl-4">
            <li>In GA4, click Admin.</li>
            <li>Property column → Property Settings (e.g. PROPERTY ID: 123456789).</li>
          </ol>
        </div>

        {error && <p className="text-sm text-rose-500">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm text-zinc-500 transition-colors hover:text-zinc-900 dark:hover:text-zinc-100">Cancel</button>
          <button disabled={busy} className="btn-primary">{busy ? 'Connecting…' : 'Connect'}</button>
        </div>
      </form>
    </Overlay>
  );
}
