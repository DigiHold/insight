'use client';

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { CENTROIDS } from '@/lib/geo-centroids';
import { createAvatar } from '@dicebear/core';
import { adventurer } from '@dicebear/collection';

// The map uses Mapbox: a 3D globe with native atmosphere and stars, plus a flat 2D version.
// The public token (URL-restricted) is read at runtime via /api/config.
const STYLE = 'mapbox://styles/mapbox/standard';
const prefersDark = (): boolean => { try { return window.matchMedia('(prefers-color-scheme: dark)').matches; } catch { return true; } };

interface Visitor {
  id: string; country: string; device: string; browser: string; os: string;
  source: string; path: string; sessionSec: number; visits: number; pages: string[];
}
interface LiveData { online?: number; countries: { country: string; count: number }[]; visitors: Visitor[] }

const ADJ = ['sapphire', 'amber', 'crimson', 'emerald', 'golden', 'silver', 'azure', 'violet', 'coral', 'jade', 'ivory', 'onyx', 'ruby', 'teal', 'olive', 'scarlet'];
const ANIMAL = ['hedgehog', 'otter', 'falcon', 'gecko', 'lynx', 'heron', 'ermine', 'marten', 'ibis', 'koala', 'tapir', 'panda', 'viper', 'crane', 'moth', 'fox'];
const nameFor = (id: string): string => `${ADJ[parseInt(id.slice(0, 2), 16) % ADJ.length]} ${ANIMAL[parseInt(id.slice(2, 4), 16) % ANIMAL.length]}`;
const jit = (id: string, i: number): number => (parseInt(id.slice(i, i + 2) || '80', 16) / 255 - 0.5) * 5;
const cap = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
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
let regionNames: Intl.DisplayNames | null = null;
try { regionNames = new Intl.DisplayNames(['en'], { type: 'region' }); } catch { regionNames = null; }
const countryName = (c: string): string => { try { return regionNames?.of(c.toUpperCase()) ?? c; } catch { return c; } };
const fmtDur = (s: number): string => (s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`);

// Visitor avatars are generated locally (DiceBear, no network) as data URIs.
const avatarCache = new Map<string, string>();
const avatar = (id: string): string => {
  let uri = avatarCache.get(id);
  if (!uri) {
    uri = createAvatar(adventurer, { seed: id, backgroundColor: ['b6e3f4', 'c0aede', 'd1d4f9', 'ffd5dc', 'ffdfbf'], radius: 50 }).toDataUri();
    avatarCache.set(id, uri);
  }
  return uri;
};

// Avatar size based on zoom: floor at 40px so it stays clearly visible everywhere.
const sizeForZoom = (z: number): number => Math.round(Math.max(40, Math.min(52, 60 - z * 3)));
function setMarkerSize(el: HTMLElement, size: number): void {
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  const img = el.querySelector('img');
  if (img) { img.style.width = `${size}px`; img.style.height = `${size}px`; }
  const badge = el.querySelector('span');
  if (badge) { const b = Math.max(8, Math.round(size * 0.3)); badge.style.width = `${b}px`; badge.style.height = `${b}px`; }
}

// The popover is a native Mapbox Popup (it follows the avatar and disappears behind the globe). Its
// content is HTML, with icons (flag, OS, device, browser, referrer favicon).
const BROWSER_LOGO: Record<string, string> = { chrome: 'chrome', safari: 'safari', 'safari (in-app)': 'safari', 'mobile safari': 'safari', firefox: 'firefox', edge: 'edge', 'microsoft edge': 'edge', opera: 'opera', brave: 'brave', 'samsung internet': 'samsung', 'android webview': 'chrome' };
const OS_SLUG: Record<string, string> = { macos: 'apple', macintosh: 'apple', ios: 'apple', android: 'android', linux: 'linux', ubuntu: 'ubuntu', 'chrome os': 'chrome', chromeos: 'chrome' };
const hostOf = (u: string): string => { try { return new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`).hostname; } catch { return ''; } };

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const esc = (s: string): string => String(s ?? '').replace(/[&<>"]/g, (c) => ESC[c]);
const imgHTML = (src: string, style: string): string => `<img src="${src}" style="${style}" onerror="this.style.visibility='hidden'"/>`;
const S16 = 'width:16px;height:16px;object-fit:contain;flex:none';
const flagHTML = (code: string): string => (code ? imgHTML(`/flags/${code.toUpperCase()}.svg`, 'width:20px;height:14px;border-radius:2px;object-fit:cover;flex:none') : '<span style="width:20px"></span>');
const browserHTML = (name: string): string => { const s = BROWSER_LOGO[name.toLowerCase()]; return s ? imgHTML(`/i/${s}.svg`, S16) : '<span style="width:16px"></span>'; };
const osHTML = (name: string): string => {
  const s = name.toLowerCase();
  if (s === 'windows') return `<svg width="16" height="16" viewBox="0 0 24 24" fill="#f4f4f5" style="${S16}"><path d="M3 5.6 10.2 4.6v6.9H3zM11.2 4.5 21 3.2v8.3h-9.8zM3 12.5h7.2v6.9L3 18.4zM11.2 12.5H21v8.3l-9.8-1.3z"/></svg>`;
  const slug = OS_SLUG[s];
  if (!slug) return '<span style="width:16px"></span>';
  const inv = slug === 'apple' ? ';filter:invert(1)' : '';
  return imgHTML(`/i/${slug}.svg`, S16 + inv);
};
const deviceHTML = (name: string): string => {
  const s = name.toLowerCase();
  const p = s === 'mobile' ? '<rect width="14" height="20" x="5" y="2" rx="2"/><path d="M12 18h.01"/>' : s === 'tablet' ? '<rect width="16" height="20" x="4" y="2" rx="2"/><path d="M12 18h.01"/>' : '<rect width="20" height="14" x="2" y="3" rx="2"/><path d="M8 21h8M12 17v4"/>';
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d4d4d8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="${S16}">${p}</svg>`;
};

const CELL = 'display:flex;align-items:center;gap:8px;min-width:0';
const TRUNC = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
const KROW = 'display:flex;justify-content:space-between;gap:12px';

// HTML for the visitor card (no avatar: the avatar is already the marker).
function cardHTML(v: Visitor): string {
  const ref = v.source && v.source !== 'direct'
    ? `${imgHTML(`/api/icon?d=${encodeURIComponent(hostOf(v.source))}`, 'width:16px;height:16px;border-radius:3px;flex:none')}<span style="${TRUNC}">${esc(v.source)}</span>`
    : 'Direct';
  const pages = v.pages.length
    ? `<div style="border-top:1px solid rgba(255,255,255,.1);padding:12px 16px"><p style="font-size:12px;font-weight:600;color:#a1a1aa;margin:0 0 6px">Pages visited</p><div style="max-height:150px;overflow:auto;display:flex;flex-direction:column;gap:2px">${v.pages.map((p) => `<p style="font-family:monospace;font-size:12px;color:#d4d4d8;margin:0;${TRUNC}">${esc(p || '/')}</p>`).join('')}</div></div>`
    : '';
  const start = Math.floor(Date.now() / 1000) - Math.max(0, v.sessionSec);
  return `<div style="width:300px;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,.1);background:rgba(24,24,27,.97);color:#e4e4e7;box-shadow:0 20px 50px rgba(0,0,0,.55)">
    <div style="padding:16px">
      <div style="display:flex;align-items:center;gap:12px;margin:0 0 12px">
        <img src="${avatar(v.id)}" style="width:52px;height:52px;border-radius:50%;background:#fff;flex:none" onerror="this.style.visibility='hidden'"/>
        <p style="font-weight:700;font-size:18px;text-transform:capitalize;color:#fafafa;margin:0;${TRUNC}">${esc(nameFor(v.id))}</p>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 16px;font-size:14px">
        <span style="${CELL}">${flagHTML(v.country)}<span style="${TRUNC}">${esc(countryName(v.country))}</span></span>
        <span style="${CELL}">${osHTML(v.os)}<span style="${TRUNC}">${esc(osLabel(v.os))}</span></span>
        <span style="${CELL}">${deviceHTML(v.device)}<span style="${TRUNC}">${esc(cap(v.device))}</span></span>
        <span style="${CELL}">${browserHTML(v.browser)}<span style="${TRUNC}">${esc(cap(v.browser))}</span></span>
      </div>
    </div>
    <div style="border-top:1px solid rgba(255,255,255,.1);padding:12px 16px;font-size:14px;display:flex;flex-direction:column;gap:6px">
      <div style="${KROW}"><span style="color:#a1a1aa">Referrer</span><span style="display:flex;align-items:center;gap:6px;min-width:0;color:#f4f4f5">${ref}</span></div>
      <div style="${KROW}"><span style="color:#a1a1aa;flex:none">Current URL</span><span style="font-family:monospace;font-size:12px;color:#f4f4f5;${TRUNC}">${esc(v.path || '/')}</span></div>
      <div style="${KROW}"><span style="color:#a1a1aa">Session time</span><span class="insight-session" data-start="${start}" style="color:#f4f4f5">${fmtDur(v.sessionSec)}</span></div>
      <div style="${KROW}"><span style="color:#a1a1aa">Total visits</span><span style="color:#f4f4f5">${v.visits}</span></div>
    </div>
    ${pages}
  </div>`;
}

export function GlobeModal({ site, onClose }: { site: string; onClose: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const markersKeyRef = useRef('');
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [ready, setReady] = useState(false);
  const [data, setData] = useState<LiveData>({ countries: [], visitors: [] });
  const [projection, setProjection] = useState<'globe' | 'mercator'>('globe');

  useEffect(() => {
    fetch('/api/config', { cache: 'no-store' })
      .then((r) => (r.ok ? (r.json() as Promise<{ mapbox?: string | null }>) : { mapbox: null }))
      .then((c) => setToken(c.mapbox ?? null))
      .catch(() => setToken(null));
  }, []);

  useEffect(() => {
    if (!containerRef.current || !token) return;
    mapboxgl.accessToken = token;
    let map: mapboxgl.Map;
    try {
      map = new mapboxgl.Map({
        container: containerRef.current,
        style: STYLE,
        center: [8, 30],
        zoom: 2.3,
        projection: { name: 'globe' },
        attributionControl: false,
      });
    } catch {
      return;
    }
    map.on('style.load', () => {
      try { map.setConfigProperty('basemap', 'lightPreset', prefersDark() ? 'night' : 'day'); } catch { /* ignore */ }
      // Subtle halo: a diffuse glow behind the globe, not a bright edge.
      try {
        map.setFog({
          color: 'rgb(28, 38, 66)',
          'high-color': 'rgb(24, 44, 96)',
          'horizon-blend': 0.18,
          'space-color': 'rgb(7, 10, 22)',
          'star-intensity': 0.35,
        });
      } catch { /* ignore */ }
      setReady(true);
    });
    map.on('error', () => { /* tiles/network: ignore */ });
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; setReady(false); };
  }, [token]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    try { map.setProjection({ name: projection }); } catch { /* ignore */ }
  }, [projection, ready]);

  // Follows the system theme: day (light) / night (dark) preset, same map.
  useEffect(() => {
    let mq: MediaQueryList;
    try { mq = window.matchMedia('(prefers-color-scheme: dark)'); } catch { return; }
    const onChange = () => { try { mapRef.current?.setConfigProperty('basemap', 'lightPreset', mq.matches ? 'night' : 'day'); } catch { /* ignore */ } };
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, [ready]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/live?site=${encodeURIComponent(site)}`, { cache: 'no-store' });
        if (res.ok && active) setData((await res.json()) as LiveData);
      } catch { /* ignore */ }
    };
    load();
    const t = setInterval(load, 5000);
    return () => { active = false; clearInterval(t); };
  }, [site]);

  // Live session time: increment the open popover's counter every second.
  useEffect(() => {
    const tick = () => {
      const now = Math.floor(Date.now() / 1000);
      document.querySelectorAll<HTMLElement>('.insight-session').forEach((el) => {
        el.textContent = fmtDur(Math.max(0, now - Number(el.getAttribute('data-start') || now)));
      });
    };
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    // Only recreate the markers if the set of visitors changes, so we don't close an
    // open popover on every refresh (every 5s).
    const key = data.visitors.map((v) => v.id).sort().join(',');
    if (key === markersKeyRef.current) return;
    markersKeyRef.current = key;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    const els: HTMLElement[] = [];
    data.visitors.forEach((v) => {
      const c = CENTROIDS[v.country];
      if (!c) return;
      const el = document.createElement('div');
      el.style.cssText = 'position:relative;cursor:pointer';
      el.innerHTML = `<img src="${avatar(v.id)}" style="display:block;width:100%;height:100%;border-radius:50%;background:#fff;border:2px solid #fff;box-shadow:0 2px 12px rgba(0,0,0,.55)"/><span style="position:absolute;top:0;right:0;border-radius:50%;background:#3b82f6;border:2px solid #05070f;box-shadow:0 0 8px rgba(59,130,246,.9)"></span>`;
      setMarkerSize(el, sizeForZoom(map.getZoom()));
      // Popup anchored so ITS avatar lands exactly on the marker (the popover opens
      // from the avatar, not beside it). Padding 16 + radius 26 places the avatar's center at 42px.
      const popup = new mapboxgl.Popup({ closeButton: true, closeOnClick: true, anchor: 'top-left', offset: [-42, -42], maxWidth: '340px', className: 'insight-popup' }).setHTML(cardHTML(v));
      const marker = new mapboxgl.Marker({ element: el }).setLngLat([c[1] + jit(v.id, 4), c[0] + jit(v.id, 6)]).setPopup(popup).addTo(map);
      // Single avatar: hide the marker while its popover (which has the same avatar) is open.
      popup.on('open', () => { el.style.visibility = 'hidden'; });
      popup.on('close', () => { el.style.visibility = 'visible'; });
      el.addEventListener('click', (e) => { e.stopPropagation(); marker.togglePopup(); });
      markersRef.current.push(marker);
      els.push(el);
    });
    const resize = () => { const z = map.getZoom(); els.forEach((el) => setMarkerSize(el, sizeForZoom(z))); };
    map.on('zoom', resize);
    return () => { map.off('zoom', resize); };
  }, [data.visitors, ready]);

  // Total matches the dashboard "Online" chip. Some present visitors have no
  // known location, so they are counted here but not plotted on the globe.
  const total = data.online ?? data.visitors.length;
  const located = data.visitors.filter((v) => v.country).length;
  const unknown = Math.max(0, total - located);

  return (
    <div className="fixed inset-0 z-50 bg-black/80" onClick={onClose}>
      <div className="absolute inset-0 overflow-hidden bg-[#05070f] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div ref={containerRef} className="size-full" style={{ backgroundColor: '#05070f' }} />

        {token === null && (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-zinc-400">
            <p>Map unavailable.</p>
          </div>
        )}

        <div className="pointer-events-none absolute left-4 top-4 z-10 max-w-[80%]">
          <div className="pointer-events-auto inline-block rounded-xl border border-white/10 bg-zinc-900/80 p-3 shadow-lg backdrop-blur">
            <div className="flex items-center gap-2">
              <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-70" /><span className="relative inline-flex size-2 rounded-full bg-emerald-500" /></span>
              <span className="head text-sm font-bold text-zinc-50">{total} live visitor{total === 1 ? '' : 's'}</span>
            </div>
            {data.countries.length > 0 && (
              <div className="mt-2 flex max-w-sm flex-wrap gap-1">
                {data.countries.slice(0, 8).map((c) => (
                  <span key={c.country} className="flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-xs text-zinc-200">
                    <img src={`/flags/${c.country.toUpperCase()}.svg`} alt="" className="h-3.5 w-5 rounded-[2px] object-cover shadow-sm" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
                    {countryName(c.country)} {c.count}
                  </span>
                ))}
                {unknown > 0 && (
                  <span className="flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-xs text-zinc-400">Unknown location {unknown}</span>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="absolute right-4 top-4 z-10 flex items-center gap-2">
          <div className="flex rounded-lg border border-white/10 bg-zinc-900/80 p-0.5 shadow backdrop-blur">
            <button onClick={() => setProjection('globe')} className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${projection === 'globe' ? 'bg-[#ffa950] text-[#573310]' : 'text-zinc-400 hover:text-zinc-100'}`}>3D</button>
            <button onClick={() => setProjection('mercator')} className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${projection === 'mercator' ? 'bg-[#ffa950] text-[#573310]' : 'text-zinc-400 hover:text-zinc-100'}`}>2D</button>
          </div>
          <button onClick={onClose} aria-label="Close" className="flex size-9 items-center justify-center rounded-lg border border-white/10 bg-zinc-900/80 text-zinc-300 shadow backdrop-blur hover:text-zinc-50">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M12 4 4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          </button>
        </div>

      </div>
    </div>
  );
}

export default GlobeModal;
