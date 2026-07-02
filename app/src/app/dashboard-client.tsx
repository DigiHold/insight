'use client';

import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode, type SyntheticEvent } from 'react';
import { Area, Bar, CartesianGrid, Cell, ComposedChart, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from 'recharts';
import dynamic from 'next/dynamic';

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
  series: { t: string; count: number; revenue?: number }[];
  ai: AiBot[];
  aiSeries?: Record<string, number | string>[];
  aiBots?: string[];
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
const VENDOR_DOMAIN: Record<string, string> = {
  openai: 'openai.com', anthropic: 'anthropic.com', perplexity: 'perplexity.ai', google: 'google.com',
  xai: 'x.ai', bytedance: 'bytedance.com', amazon: 'amazon.com', apple: 'apple.com', commoncrawl: 'commoncrawl.org', meta: 'meta.com',
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
const OS_SLUG: Record<string, string> = { macos: 'apple', macintosh: 'apple', ios: 'apple', android: 'android', linux: 'linux', ubuntu: 'ubuntu', 'chrome os': 'googlechrome', chromeos: 'googlechrome' };
const BROWSER_LOGO: Record<string, string> = { chrome: 'chrome', safari: 'safari', firefox: 'firefox', edge: 'edge', opera: 'opera', brave: 'brave' };

const cap = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
let regionNames: Intl.DisplayNames | null = null;
try { regionNames = new Intl.DisplayNames(['en'], { type: 'region' }); } catch { regionNames = null; }
const countryName = (c: string): string => { try { return regionNames?.of(c.toUpperCase()) ?? c; } catch { return c; } };
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
interface Tab { label: string; icon?: ReactNode; items: Item[]; donut?: boolean; detail?: DetailTable; emptyNote?: string }
const plainItems = (rows: Row[], color: string, transform?: (s: string) => string): Item[] =>
  rows.map((r) => ({ key: r.name || '—', left: <span className="truncate">{(transform ?? ((s) => s || '/'))(r.name)}</span>, value: r.count, color }));

type Modal = null | { type: 'add' } | { type: 'script'; site: SiteItem } | { type: 'stripe'; site: SiteItem } | { type: 'ga4'; site: SiteItem } | { type: 'url'; site: SiteItem };
type Period = 'today' | '7d' | '30d' | '90d';

// One delegated mousemove for every glass card: feeds the CSS spotlight
// (--spot-x / --spot-y) of the card currently under the cursor.
function trackSpotlight(e: ReactMouseEvent<HTMLDivElement>) {
  const card = (e.target as HTMLElement).closest?.('.card') as HTMLElement | null;
  if (!card) return;
  const r = card.getBoundingClientRect();
  card.style.setProperty('--spot-x', `${e.clientX - r.left}px`);
  card.style.setProperty('--spot-y', `${e.clientY - r.top}px`);
}

const PERIODS: Period[] = ['today', '7d', '30d', '90d'];

export default function Dashboard() {
  const [sites, setSites] = useState<SiteItem[]>([]);
  const [siteId, setSiteId] = useState<string>(() => (typeof window !== 'undefined' ? localStorage.getItem('insight_site') ?? '' : ''));
  const [data, setData] = useState<Stats | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [globeOpen, setGlobeOpen] = useState(false);
  const [period, setPeriod] = useState<Period>(() => {
    const p = typeof window !== 'undefined' ? localStorage.getItem('insight_period') : null;
    return p && (PERIODS as string[]).includes(p) ? (p as Period) : 'today';
  });
  const site = sites.find((s) => s.id === siteId);

  useEffect(() => { if (siteId) localStorage.setItem('insight_site', siteId); }, [siteId]);
  useEffect(() => { localStorage.setItem('insight_period', period); }, [period]);

  const loadSites = useCallback(async () => {
    const res = await fetch('/api/sites', { cache: 'no-store' });
    if (!res.ok) return;
    const list = ((await res.json()).sites ?? []) as SiteItem[];
    setSites(list);
    setSiteId((cur) => (cur && list.some((s) => s.id === cur) ? cur : list[0]?.id ?? ''));
  }, []);

  const loadStats = useCallback(async (id: string) => {
    if (!id) { setData(null); return; }
    try {
      const res = await fetch(`/api/stats?site=${encodeURIComponent(id)}&period=${period}`, { cache: 'no-store' });
      if (res.ok) setData((await res.json()) as Stats);
    } catch { /* ignore */ }
  }, [period]);

  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [keywordError, setKeywordError] = useState<string | null>(null);
  const [keywordTried, setKeywordTried] = useState<string[]>([]);
  const [chartHover, setChartHover] = useState(false);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  useEffect(() => { loadSites(); }, [loadSites]);
  useEffect(() => {
    loadStats(siteId);
    const t = setInterval(() => loadStats(siteId), 5000);
    return () => clearInterval(t);
  }, [siteId, loadStats]);
  useEffect(() => {
    if (!siteId) { setKeywords([]); return; }
    let active = true;
    fetch(`/api/gsc?site=${encodeURIComponent(siteId)}&period=${period}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { keywords: [], error: null, tried: [] }))
      .then((j) => { if (active) { setKeywords((j.keywords ?? []) as Keyword[]); setKeywordError(j.error ?? null); setKeywordTried((j.tried ?? []) as string[]); } })
      .catch(() => { if (active) { setKeywords([]); setKeywordError(null); setKeywordTried([]); } });
    return () => { active = false; };
  }, [siteId, period]);

  const chartData = (data?.series ?? []).map((p) => ({ h: p.t, v: p.count, r: p.revenue ?? 0 }));
  const hasRevenue = chartData.some((d) => d.r > 0);
  const currency = data?.revenue?.currency ?? 'usd';
  const metrics = buildMetrics(data);
  const metricCols = metrics.length === 8 ? 'xl:grid-cols-8' : 'xl:grid-cols-5';

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
      <span key="q" className="flex min-w-0 items-center gap-2"><img src="https://icons.duckduckgo.com/ip3/google.com.ico" alt="" width={16} height={16} className="size-4 shrink-0 rounded" onError={hideBroken} /><span className="truncate" title={k.query}>{k.query}</span></span>,
      posLabel(k.position),
      fmt(k.impressions),
      fmt(k.clicks),
      `${(k.ctr * 100).toFixed(1)}%`,
    ]),
  };

  return (
    <div className="min-h-screen" onMouseMove={trackSpotlight}>
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-5">
        <header className="fade-up mb-7 flex flex-wrap items-center justify-between gap-3">
          <Logo />
          <div className="flex flex-wrap items-center gap-2">
            {sites.length > 0 && (
              <>
                <Dropdown
                  value={siteId}
                  onChange={setSiteId}
                  options={sites.map((s) => ({
                    value: s.id,
                    label: s.name,
                    icon: <SiteFavicon id={s.id} url={s.url} />,
                  }))}
                />
                <div className="flex rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] p-0.5 backdrop-blur-xl">
                  {(['today', '7d', '30d', '90d'] as Period[]).map((p) => (
                    <button
                      key={p}
                      onClick={() => setPeriod(p)}
                      className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${period === p ? 'bg-[#ffa950] text-[#573310]' : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'}`}
                    >
                      {p === 'today' ? 'Today' : p.toUpperCase()}
                    </button>
                  ))}
                </div>
              </>
            )}
            <button onClick={() => setModal({ type: 'add' })} className="btn-primary"><PlusIcon /> Add site</button>
            {site && (
              <Menu align="right" buttonClass="btn-ghost px-2.5" button={<DotsIcon />}>
                {(close) => (
                  <>
                    <MenuItem icon={<CodeIcon />} onClick={() => { setModal({ type: 'script', site }); close(); }}>Show tracking script</MenuItem>
                    <MenuItem icon={<LinkIcon />} onClick={() => { setModal({ type: 'url', site }); close(); }}>Set website URL</MenuItem>
                    {site.stripe
                      ? <MenuItem icon={<StripeIcon />} onClick={async () => { await fetch(`/api/sites/stripe?siteId=${site.id}`, { method: 'DELETE' }); loadSites(); close(); }}>Disconnect Stripe</MenuItem>
                      : <MenuItem icon={<StripeIcon />} onClick={() => { setModal({ type: 'stripe', site }); close(); }}>Connect Stripe</MenuItem>}
                    {site.ga4
                      ? <MenuItem icon={<GaIcon />} onClick={async () => { await fetch(`/api/sites/ga4?siteId=${site.id}`, { method: 'DELETE' }); loadSites(); close(); }}>Disconnect GA4</MenuItem>
                      : <MenuItem icon={<GaIcon />} onClick={() => { setModal({ type: 'ga4', site }); close(); }}>Connect GA4</MenuItem>}
                    <MenuItem danger icon={<TrashIcon />} onClick={async () => {
                      close();
                      if (!confirm(`Delete ${site.name}? This permanently removes the site and all its Insight + GA4 data and favicon.`)) return;
                      await fetch(`/api/sites?id=${site.id}`, { method: 'DELETE' });
                      loadSites();
                    }}>Delete site</MenuItem>
                  </>
                )}
              </Menu>
            )}
            <button
              onClick={async () => { await fetch('/api/auth/logout', { method: 'POST' }); window.location.href = '/login'; }}
              aria-label="Log out"
              title="Log out"
              className="flex size-9 items-center justify-center rounded-lg border border-rose-200 bg-white text-rose-600 shadow-sm transition-all hover:bg-rose-50 active:scale-[0.98] dark:border-rose-900/50 dark:bg-zinc-900 dark:text-rose-400 dark:hover:bg-rose-950/40"
            >
              <PowerIcon />
            </button>
          </div>
        </header>

        {sites.length === 0 ? (
          <Onboarding onAdd={() => setModal({ type: 'add' })} />
        ) : (
          <>
            <section className="card fade-up mb-5 overflow-hidden" style={{ animationDelay: '80ms' }}>
              <div className={`grid grid-cols-2 md:grid-cols-4 ${metricCols}`}>
                {metrics.map((m) => <MetricCell key={m.label} {...m} onClick={m.live ? () => setGlobeOpen(true) : undefined} />)}
              </div>
              <div className="h-64 p-4 pr-5 sm:h-72">
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                      data={chartData}
                      margin={{ top: 10, right: 8, bottom: 0, left: 6 }}
                      onMouseMove={(s: { isTooltipActive?: boolean; activeTooltipIndex?: number }) => { setChartHover(!!s?.isTooltipActive); setActiveIdx(typeof s?.activeTooltipIndex === 'number' ? s.activeTooltipIndex : null); }}
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
                        <Bar yAxisId="r" dataKey="r" radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false}>
                          {chartData.map((_, i) => <Cell key={i} fill="#ffa950" fillOpacity={activeIdx === null ? 0.9 : i === activeIdx ? 1 : 0.25} />)}
                        </Bar>
                      )}
                      <Area yAxisId="v" type="monotone" dataKey="v" className="chart-glow" stroke="#3b82f6" strokeWidth={2.5} fill="url(#fillv)" isAnimationActive={false} fillOpacity={chartHover ? 0.5 : 1} activeDot={{ r: 5, fill: '#3b82f6', stroke: '#fff', strokeWidth: 2 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-zinc-400 dark:text-zinc-600">No data for this period yet.</div>
                )}
              </div>
            </section>

            <section className="grid gap-4 md:grid-cols-2">
              <div className="fade-up min-w-0" style={{ animationDelay: '160ms' }}>
                <TabbedCard title="Sources" tabs={[
                  { label: 'Channel', items: channelItems, donut: true },
                  { label: 'Referrer', items: referrerItems },
                  { label: 'Campaign', items: plainItems(data?.campaigns ?? [], ACCENT) },
                  { label: 'Keyword', icon: <SearchIcon />, items: keywordItems, detail: keywordDetail, emptyNote: keywordNote },
                ]} />
              </div>
              <div className="fade-up min-w-0" style={{ animationDelay: '220ms' }}>
                <TabbedCard title="Top pages" metric="Views" tabs={[{ label: 'Top pages', items: plainItems(data?.pages ?? [], ACCENT) }]} />
              </div>
              <div className="fade-up min-w-0" style={{ animationDelay: '280ms' }}>
                <TabbedCard title="Technology" tabs={[
                  { label: 'Browser', items: browserItems },
                  { label: 'OS', items: osItems },
                  { label: 'Device', items: deviceItems },
                ]} />
              </div>
              <div className="fade-up min-w-0" style={{ animationDelay: '340ms' }}>
                <TabbedCard title="Countries" tabs={[{ label: 'Countries', items: countryItems }]} />
              </div>
              <div className="fade-up md:col-span-2" style={{ animationDelay: '400ms' }}><AiCard data={data} period={period} /></div>
            </section>
          </>
        )}

        <footer className="mt-10 text-center text-xs text-zinc-400 dark:text-zinc-600">Insight — private, real-time analytics. Updates every 5 seconds.</footer>
      </div>

      {modal?.type === 'add' && <AddSiteModal onClose={() => setModal(null)} onCreated={(s) => { loadSites(); setSiteId(s.id); setModal({ type: 'script', site: s }); }} />}
      {modal?.type === 'script' && <ScriptModal site={modal.site} onClose={() => setModal(null)} />}
      {modal?.type === 'stripe' && <StripeModal site={modal.site} onClose={() => setModal(null)} onDone={() => { loadSites(); setModal(null); }} />}
      {modal?.type === 'ga4' && <Ga4Modal site={modal.site} onClose={() => setModal(null)} onDone={() => { loadSites(); setModal(null); }} />}
      {modal?.type === 'url' && <UrlModal site={modal.site} onClose={() => setModal(null)} onDone={() => { loadSites(); setModal(null); }} />}
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
      <span className="head text-base font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Insight</span>
    </div>
  );
}

function ChartTooltip({ active, payload, label, currency, hasRevenue }: TooltipProps<number, string> & { currency: string; hasRevenue: boolean }) {
  if (!active || !payload || !payload.length) return null;
  const v = Number(payload.find((p) => p.dataKey === 'v')?.value ?? 0);
  const r = Number(payload.find((p) => p.dataKey === 'r')?.value ?? 0);
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
    </div>
  );
}

function MetricCell({ label, value, live, change, inverse, revenue, onClick }: MetricDef & { onClick?: () => void }) {
  const rose = change !== null && change !== undefined && (inverse ? change > 0 : change < 0);
  const arrowUp = (change ?? 0) >= 0;
  return (
    <div
      onClick={onClick}
      className={`group relative border-b border-r border-[var(--card-border)] px-4 py-4 ${onClick ? 'cursor-pointer transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.04]' : ''}`}
    >
      <div className="flex items-center gap-1.5">
        <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</p>
        {live && (
          <span className="relative flex size-2 shrink-0">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-70" />
            <span className="relative inline-flex size-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.9)]" />
          </span>
        )}
      </div>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <p className="head text-2xl font-bold tabular-nums text-zinc-900 sm:text-[1.75rem] dark:text-zinc-50">
          <span key={value} className="num-roll">{value}</span>
        </p>
        {change !== undefined && change !== null && (
          <span className={`text-xs font-semibold ${rose ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{arrowUp ? '↑' : '↓'} {Math.abs(change)}%</span>
        )}
      </div>
      {onClick && <p className="mt-0.5 text-[11px] text-zinc-400 dark:text-zinc-600">View on globe</p>}
      {revenue && <RevenueTip {...revenue} />}
    </div>
  );
}

// Revenue breakdown on hover: net total, new (gross) and refunds.
function RevenueTip({ currency, total, gross, refunds }: RevenueBreakdown) {
  return (
    <div className="pointer-events-none absolute left-4 top-full z-30 mt-1 hidden min-w-[11rem] rounded-xl border border-white/10 bg-zinc-900/95 p-3 text-xs shadow-2xl backdrop-blur group-hover:block">
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

function TabbedCard({ title, tabs, emptyNote, metric = 'Visitors' }: { title: string; tabs: Tab[]; emptyNote?: string; metric?: string }) {
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const idx = Math.min(active, tabs.length - 1);
  const tab = tabs[idx];
  const max = tab.items[0]?.value ?? 1;
  const shown = tab.items.slice(0, 10);
  const note = tab.emptyNote ?? emptyNote;
  const hasData = tab.detail ? tab.detail.rows.length > 0 : tab.items.length > 0;
  return (
    <div className="card flex h-full flex-col p-5">
      <div className="flex items-center justify-between gap-3">
        <SegTabs tabs={tabs} active={idx} onSelect={setActive} />
        {!tab.donut && <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">{metric}</span>}
      </div>
      <div className="mt-4 flex-1">
        {tab.donut && tab.items.length > 0 ? (
          <Donut items={tab.items} />
        ) : (
          <div className="space-y-1">
            {shown.map((it) => <BarRow key={it.key} left={it.left} value={it.value} max={max} color={it.color} />)}
            {tab.items.length === 0 && <p className="px-2 py-8 text-center text-sm text-zinc-400 dark:text-zinc-600">{note ?? 'No data yet.'}</p>}
          </div>
        )}
      </div>
      {hasData && (
        <div className="mt-3 flex justify-center border-t border-[var(--card-border)] pt-3">
          <button onClick={() => setOpen(true)} className="inline-flex select-none items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400 opacity-90 transition-colors hover:text-zinc-800 hover:opacity-100 dark:hover:text-zinc-100">
            <ScanIcon /> Details
          </button>
        </div>
      )}
      {open && <DetailsModal title={tabs.length > 1 ? `${title} · ${tab.label}` : title} tab={tab} metric={metric} onClose={() => setOpen(false)} />}
    </div>
  );
}

function SegTabs({ tabs, active, onSelect }: { tabs: Tab[]; active: number; onSelect: (i: number) => void }) {
  if (tabs.length <= 1) return <p className="head text-sm font-bold text-zinc-900 dark:text-zinc-50">{tabs[0]?.label}</p>;
  return (
    <div className="inline-flex flex-wrap gap-0.5 self-start rounded-xl bg-black/[0.05] p-1 dark:bg-white/[0.06]">
      {tabs.map((t, i) => (
        <button
          key={t.label}
          onClick={() => onSelect(i)}
          className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${i === active ? 'bg-white text-zinc-900 shadow-sm ring-1 ring-black/5 dark:bg-zinc-900 dark:text-zinc-50 dark:ring-white/10' : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100'}`}
        >
          {t.icon}{t.label}
        </button>
      ))}
    </div>
  );
}

function Donut({ items }: { items: Item[] }) {
  const total = items.reduce((a, b) => a + b.value, 0);
  const data = items.map((it) => ({ name: it.key, value: it.value, color: it.color }));
  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:justify-between">
      <div className="relative size-40 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="66%" outerRadius="100%" paddingAngle={2} stroke="none" isAnimationActive={false}>
              {data.map((d) => <Cell key={d.name} fill={d.color} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="head text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-50">{fmt(total)}</span>
          <span className="text-[11px] font-medium text-zinc-400">Visitors</span>
        </div>
      </div>
      <div className="w-full space-y-1.5">
        {items.map((it) => (
          <div key={it.key} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2 truncate text-zinc-700 dark:text-zinc-200">{it.left}</span>
            <span className="shrink-0 tabular-nums text-zinc-500 dark:text-zinc-400">{fmt(it.value)} <span className="text-zinc-400 dark:text-zinc-500">{total > 0 ? Math.round((it.value / total) * 100) : 0}%</span></span>
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="relative flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[var(--card-border)] bg-white/90 shadow-2xl backdrop-blur-2xl dark:bg-zinc-900/85" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-4 border-b border-zinc-200 px-5 py-3 dark:border-zinc-800">
          {detail?.logo ?? <h3 className="head shrink-0 text-base font-bold text-zinc-900 dark:text-zinc-50">{title}</h3>}
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-800 outline-none focus:border-[#ffa950] dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" />
          <button onClick={onClose} aria-label="Close" className="flex size-8 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"><CloseIcon /></button>
        </div>
        <div className="overflow-y-auto">
          {detail ? (
            <table className="w-full table-fixed text-sm">
              <colgroup>{detail.columns.map((c, i) => <col key={c} style={detail.widths?.[i] ? { width: detail.widths[i] } : undefined} />)}</colgroup>
              <thead className="sticky top-0 bg-white dark:bg-zinc-900">
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
          ) : (
            <table className="w-full table-fixed text-sm">
              <colgroup><col style={{ width: '3rem' }} /><col /><col style={{ width: '7rem' }} /><col style={{ width: '5rem' }} /></colgroup>
              <thead className="sticky top-0 bg-white dark:bg-zinc-900">
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
          )}
        </div>
      </div>
    </div>
  );
}

const ScanIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3.5" aria-hidden><path d="M3 7V5a2 2 0 0 1 2-2h2" /><path d="M17 3h2a2 2 0 0 1 2 2v2" /><path d="M21 17v2a2 2 0 0 1-2 2h-2" /><path d="M7 21H5a2 2 0 0 1-2-2v-2" /></svg>;

// AI/indexing card: a multi-line chart of crawls, and clicking a bot
// (ChatGPT, Googlebot, Bing...) shows the pages it crawled. No Details button.
const AI_COLORS = ['#ffa950', '#3b82f6', '#10b981', '#ec4899', '#a855f7', '#f43f5e'];

function AiTooltip({ active, payload, label }: TooltipProps<number, string>) {
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
        <div className="inline-flex flex-wrap gap-0.5 rounded-xl bg-black/[0.05] p-1 dark:bg-white/[0.06]">
          {tabs.map((t) => (
            <button key={t.key} onClick={() => { setTab(t.key); setSel(null); }} className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${tab === t.key ? 'bg-white text-zinc-900 shadow-sm ring-1 ring-black/5 dark:bg-zinc-900 dark:text-zinc-50 dark:ring-white/10' : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100'}`}>
              {t.icon}{t.label}<span className="tabular-nums text-zinc-400">{fmt(countOf(t.key))}</span>
            </button>
          ))}
        </div>
        {!selected && (
          <div className="relative">
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400"><SearchIcon /></span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search crawlers" className="w-40 rounded-lg border border-zinc-200 bg-white py-1.5 pl-8 pr-3 text-xs text-zinc-800 outline-none focus:border-[#ffa950] sm:w-52 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" />
          </div>
        )}
      </div>

      <div className="mt-4 grid items-stretch gap-5 md:grid-cols-[1.6fr_1fr]">
        <div className="flex min-w-0 flex-col">
          {lineKeys.length > 0 ? (
            <div className="h-72 flex-1">
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
      <img src={`https://icons.duckduckgo.com/ip3/${VENDOR_DOMAIN[vendor] ?? 'google.com'}.ico`} alt="" width={img} height={img} style={{ width: img, height: img }} referrerPolicy="no-referrer" onError={hideBroken} />
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

function BarRow({ left, value, max, color }: { left: ReactNode; value: number; max: number; color: string }) {
  const pct = Math.max(2, Math.round((value / Math.max(1, max)) * 100));
  return (
    <div className="relative flex items-center justify-between gap-3 overflow-hidden rounded-lg px-2 py-1.5 text-sm">
      <span className="absolute inset-y-0 left-0 rounded-lg opacity-[0.16]" style={{ width: `${pct}%`, background: color }} />
      <span className="relative z-10 min-w-0 truncate text-zinc-700 dark:text-zinc-200">{left}</span>
      <span className="relative z-10 shrink-0 tabular-nums text-zinc-500 dark:text-zinc-400">{fmt(value)}</span>
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
const StripeIcon = () => <img src="https://cdn.simpleicons.org/stripe/635BFF" alt="" width={16} height={16} className="size-4" onError={hideBroken} />;
const GaIcon = () => <img src="https://cdn.simpleicons.org/googleanalytics/E37400" alt="" width={16} height={16} className="size-4" onError={hideBroken} />;

function PlusIcon() {
  return <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden><path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
}
function DotsIcon() {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden><circle cx="8" cy="3" r="1.4" /><circle cx="8" cy="8" r="1.4" /><circle cx="8" cy="13" r="1.4" /></svg>;
}

function Onboarding({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="mt-16 flex flex-col items-center rounded-2xl border border-dashed border-zinc-300 bg-white/50 px-6 py-16 text-center dark:border-zinc-700 dark:bg-zinc-900/30">
      <h2 className="head text-xl font-bold text-zinc-900 dark:text-zinc-50">No site yet</h2>
      <p className="mt-1.5 max-w-sm text-sm text-zinc-500 dark:text-zinc-400">Add your first site to get a tracking script and start seeing live visitors.</p>
      <button onClick={onAdd} className="btn-primary mt-5"><PlusIcon /> Add your first site</button>
    </div>
  );
}

function Overlay({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-[var(--card-border)] bg-white/90 p-6 shadow-2xl backdrop-blur-2xl dark:bg-zinc-900/85" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} aria-label="Close" className="absolute right-3.5 top-3.5 flex size-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200">
          <CloseIcon />
        </button>
        {children}
      </div>
    </div>
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
        <div className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} z-30 mt-1 max-h-72 min-w-[13rem] overflow-y-auto rounded-xl border border-[var(--card-border)] bg-white/85 p-1 shadow-xl backdrop-blur-xl dark:bg-zinc-900/85`}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

function Dropdown({ value, options, onChange }: { value: string; options: DropOption[]; onChange: (v: string) => void }) {
  const current = options.find((o) => o.value === value);
  return (
    <Menu
      align="left"
      buttonClass="flex items-center gap-2 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] px-3 py-2 text-sm font-semibold text-zinc-800 backdrop-blur-xl transition-colors hover:border-[#ffa950]/50 dark:text-zinc-100"
      button={<>{current?.icon}<span className="max-w-[9rem] truncate">{current?.label ?? 'Select'}</span><ChevronDown /></>}
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

function BrandImg({ slug }: { slug: string }) {
  return <img src={`https://cdn.simpleicons.org/${slug}`} alt="" width={16} height={16} className="size-4 shrink-0" onError={hideBroken} />;
}
function osIcon(name: string): ReactNode {
  const s = name.toLowerCase();
  if (s === 'windows') return <WindowsIcon />;
  const slug = OS_SLUG[s];
  return slug ? <BrandImg slug={slug} /> : <span className="size-4 shrink-0" />;
}
function browserIcon(name: string): ReactNode {
  const slug = BROWSER_LOGO[name.toLowerCase()];
  return slug
    ? <img src={`https://cdnjs.cloudflare.com/ajax/libs/browser-logos/74.1.0/${slug}/${slug}_64x64.png`} alt="" width={16} height={16} className="size-4 shrink-0" onError={hideBroken} />
    : <GlobeSmall />;
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
      {domain
        ? <img src={`https://icons.duckduckgo.com/ip3/${domain}.ico`} alt="" width={16} height={16} className="size-4 shrink-0 rounded" referrerPolicy="no-referrer" onError={hideBroken} />
        : <span className="size-4 shrink-0" />}
      <span className="truncate">{label}</span>
    </span>
  );
}

function Flag({ code }: { code: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <img src={`https://purecatamphetamine.github.io/country-flag-icons/3x2/${code.toUpperCase()}.svg`} alt="" width={20} height={14} className="h-[14px] w-[20px] shrink-0 rounded-[2px] object-cover shadow-sm" onError={hideBroken} />
      <span className="truncate">{countryName(code)}</span>
    </span>
  );
}

function Snippet({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  const [verify, setVerify] = useState<{ state: 'idle' | 'checking' | 'ok' | 'ko'; count: number }>({ state: 'idle', count: 0 });
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://insight.nicolaslecocq.com';
  const code = `<script defer data-site="${id}" src="${origin}/t.js?s=${id}"></script>`;
  return (
    <div>
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
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Site name (e.g. Amabrik)" className="field" />
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Website URL (e.g. https://amabrik.com)" className="field" />
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
        <input autoFocus value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://amabrik.com" className="field" />
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
