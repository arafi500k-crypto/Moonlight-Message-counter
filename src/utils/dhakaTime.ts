export const DHAKA_TIMEZONE = 'Asia/Dhaka';

const dhakaDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: DHAKA_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const dhakaDisplayFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: DHAKA_TIMEZONE,
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
  hour12: true,
});

const dhakaShortDateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: DHAKA_TIMEZONE,
  month: 'short',
  day: 'numeric',
});

export function getDhakaDateKey(input: Date | string = new Date()): string {
  const date = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) {
    return dhakaDateFormatter.format(new Date());
  }
  return dhakaDateFormatter.format(date);
}

export function getDhakaMonthKey(input: Date | string = new Date()): string {
  return getDhakaDateKey(input).slice(0, 7);
}

export function shiftDhakaDateKey(dateKey: string, deltaDays: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const utcMs = Date.UTC(y, (m || 1) - 1, d || 1) + deltaDays * 86400000;
  const shifted = new Date(utcMs);
  const yy = shifted.getUTCFullYear();
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(shifted.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function getDhakaYesterdayKey(now: Date = new Date()): string {
  return shiftDhakaDateKey(getDhakaDateKey(now), -1);
}

export function getDhakaWeekStartKey(now: Date = new Date()): string {
  const todayKey = getDhakaDateKey(now);
  const [y, m, d] = todayKey.split('-').map(Number);
  const utcDay = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sun, 1 = Mon ... 6 = Sat
  const diffFromMonday = utcDay === 0 ? -6 : 1 - utcDay;
  return shiftDhakaDateKey(todayKey, diffFromMonday);
}

export function daysBetweenDateKeysInclusive(startKey: string, endKey: string): number {
  if (!startKey || !endKey || endKey < startKey) return 0;
  const [sy, sm, sd] = startKey.split('-').map(Number);
  const [ey, em, ed] = endKey.split('-').map(Number);
  const startMs = Date.UTC(sy, sm - 1, sd);
  const endMs = Date.UTC(ey, em - 1, ed);
  return Math.floor((endMs - startMs) / 86400000) + 1;
}

export function formatDhakaDateTime(isoString?: string): string {
  if (!isoString) return 'No activity recorded';
  const parsed = new Date(isoString);
  if (Number.isNaN(parsed.getTime())) return isoString;
  return `${dhakaDisplayFormatter.format(parsed)} +06`;
}

export function formatShortDhakaDate(dateKey: string): string {
  if (!dateKey || dateKey.length !== 10) return dateKey;
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 6, 0, 0));
  return dhakaShortDateFormatter.format(dt);
}

export function dhakaDateAndTimeToIso(dateKey: string, timeHHMM: string = '12:00'): string {
  const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(dateKey) ? dateKey : getDhakaDateKey();
  const safeTime = /^\d{2}:\d{2}$/.test(timeHHMM) ? timeHHMM : '12:00';
  // Asia/Dhaka is fixed UTC+06:00 (no DST)
  return new Date(`${safeDate}T${safeTime}:00+06:00`).toISOString();
}

export function getRecentDhakaDateKeys(count: number, endKey: string = getDhakaDateKey()): string[] {
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    keys.push(shiftDhakaDateKey(endKey, -i));
  }
  return keys;
}
