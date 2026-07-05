// Single source of truth for the analytics timezone. All day/hour buckets (the
// ClickHouse date functions, the Stripe revenue overlay) use it, so "Today",
// the heatmap, retention weeks and the revenue chart line up for the site owner
// instead of defaulting to UTC. Set INSIGHT_TZ (e.g. "Europe/Zurich") in the
// environment; defaults to UTC so a fresh install behaves predictably.
export const TZ = process.env.INSIGHT_TZ || 'UTC';

function partsAt(unixSec: number): { y: number; mo: number; d: number; h: number; mi: number; s: number } {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = dtf.formatToParts(new Date(unixSec * 1000));
  const g = (t: string): number => Number(p.find((x) => x.type === t)?.value ?? '0');
  return { y: g('year'), mo: g('month'), d: g('day'), h: g('hour'), mi: g('minute'), s: g('second') };
}

const pad = (n: number): string => String(n).padStart(2, '0');

// "YYYY-MM-DD" for the given instant, in TZ. Matches ClickHouse toDate/toStartOfDay labels.
export function tzDateLabel(unixSec: number): string {
  const p = partsAt(unixSec);
  return `${p.y}-${pad(p.mo)}-${pad(p.d)}`;
}

// "HH:00" for the given instant, in TZ. Matches the native hourly series labels.
export function tzHourLabel(unixSec: number): string {
  return `${pad(partsAt(unixSec).h)}:00`;
}

// Seconds between TZ wall-clock and UTC at this instant (handles DST).
function tzOffsetSec(unixSec: number): number {
  const p = partsAt(unixSec);
  const asIfUtc = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) / 1000;
  return asIfUtc - unixSec;
}

// Unix seconds of local midnight for the day that is `offsetDays` before today, in TZ.
export function tzStartOfDayUnix(offsetDays = 0): number {
  const target = Math.floor(Date.now() / 1000) - offsetDays * 86400;
  const p = partsAt(target);
  const midnightAsUtc = Date.UTC(p.y, p.mo - 1, p.d, 0, 0, 0) / 1000;
  return midnightAsUtc - tzOffsetSec(midnightAsUtc);
}
