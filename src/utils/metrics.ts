import type {
  DailyStatisticRecord,
  DashboardMetrics,
  GroupRecord,
  MemberRecord,
  MessageEventRecord,
  MonthlyStatisticRecord,
  RankedMember,
  RankingSortPeriod,
} from '../types/analytics';
import {
  daysBetweenDateKeysInclusive,
  formatShortDhakaDate,
  getDhakaDateKey,
  getDhakaMonthKey,
  getDhakaWeekStartKey,
  getDhakaYesterdayKey,
  getRecentDhakaDateKeys,
  shiftDhakaDateKey,
} from './dhakaTime';

export function computeDashboardMetrics(
  group: GroupRecord | null,
  members: MemberRecord[],
  dailyStats: DailyStatisticRecord[],
  events: MessageEventRecord[],
  now: Date = new Date()
): DashboardMetrics {
  const todayKey = getDhakaDateKey(now);
  const yesterdayKey = getDhakaYesterdayKey(now);
  const weekStartKey = getDhakaWeekStartKey(now);
  const monthKey = getDhakaMonthKey(now);
  const creationDate = group?.creationDate || todayKey;

  const dailyMap = new Map<string, DailyStatisticRecord>();
  dailyStats.forEach((d) => dailyMap.set(d.dateKey, d));

  const validDays = dailyStats.filter((d) => d.dateKey >= creationDate);
  const activeValidDays = validDays.filter((d) => d.totalMessages > 0);

  const todayMessages = todayKey >= creationDate ? dailyMap.get(todayKey)?.totalMessages ?? 0 : 0;
  const yesterdayMessages =
    yesterdayKey >= creationDate ? dailyMap.get(yesterdayKey)?.totalMessages ?? 0 : 0;

  const lifetimeMessages = validDays.reduce((sum, d) => sum + d.totalMessages, 0);
  const weekMessages = validDays
    .filter((d) => d.dateKey >= weekStartKey && d.dateKey <= todayKey)
    .reduce((sum, d) => sum + d.totalMessages, 0);
  const monthMessages = validDays
    .filter((d) => d.monthKey === monthKey)
    .reduce((sum, d) => sum + d.totalMessages, 0);

  // Compute active members today accurately from events or member lastActiveDateDhaka
  const activeTodaySet = new Set<string>();
  events.forEach((ev) => {
    if (ev.dateKeyDhaka === todayKey && ev.dateKeyDhaka >= creationDate) {
      activeTodaySet.add(ev.senderId);
    }
  });
  members.forEach((m) => {
    if (m.lastActiveDateDhaka === todayKey && todayKey >= creationDate) {
      activeTodaySet.add(m.memberId);
    }
  });

  const activeDaysSinceCreation = activeValidDays.length;
  const elapsedDaysSinceCreation = Math.max(
    activeDaysSinceCreation > 0 ? 1 : 0,
    daysBetweenDateKeysInclusive(creationDate, todayKey)
  );
  const averageDailyMessages =
    activeDaysSinceCreation > 0 ? Number((lifetimeMessages / activeDaysSinceCreation).toFixed(1)) : 0;

  let highestDailyCount = 0;
  let highestDailyDate = '';
  for (const d of activeValidDays) {
    if (d.totalMessages > highestDailyCount) {
      highestDailyCount = d.totalMessages;
      highestDailyDate = d.dateKey;
    }
  }

  const todayShareOfWeekPct =
    weekMessages > 0 ? Number(((todayMessages / weekMessages) * 100).toFixed(1)) : 0;

  const todayVsYesterdayPct =
    yesterdayMessages > 0
      ? Number((((todayMessages - yesterdayMessages) / yesterdayMessages) * 100).toFixed(1))
      : null;

  return {
    todayMessages,
    yesterdayMessages,
    lifetimeMessages,
    weekMessages,
    monthMessages,
    totalMembers: members.length,
    activeMembersToday: activeTodaySet.size,
    averageDailyMessages,
    activeDaysSinceCreation,
    elapsedDaysSinceCreation,
    highestDailyCount,
    highestDailyDate,
    todayShareOfWeekPct,
    todayVsYesterdayPct,
  };
}

export function calcSharePct(part: number, total: number): number {
  if (total <= 0 || part <= 0) return 0;
  const raw = (part / total) * 100;
  if (raw < 0.1) return Number(raw.toFixed(2));
  return Number(raw.toFixed(1));
}

export function computeRankedMembers(
  members: MemberRecord[],
  events: MessageEventRecord[],
  creationDate: string,
  sortBy: RankingSortPeriod = 'lifetime',
  now: Date = new Date()
): RankedMember[] {
  const todayKey = getDhakaDateKey(now);
  const weekStartKey = getDhakaWeekStartKey(now);
  const monthKey = getDhakaMonthKey(now);

  const memberCounts = new Map<
    string,
    { today: number; week: number; month: number; lifetimeEvents: number }
  >();
  const membersWithAnyEvents = new Set<string>();

  for (const ev of events) {
    membersWithAnyEvents.add(ev.senderId);
    if (ev.dateKeyDhaka < creationDate) continue;
    const weight = ev.messageCount && ev.messageCount > 0 ? ev.messageCount : 1;
    const entry = memberCounts.get(ev.senderId) || {
      today: 0,
      week: 0,
      month: 0,
      lifetimeEvents: 0,
    };
    entry.lifetimeEvents += weight;
    if (ev.dateKeyDhaka === todayKey) entry.today += weight;
    if (ev.dateKeyDhaka >= weekStartKey && ev.dateKeyDhaka <= todayKey) entry.week += weight;
    if (ev.monthKeyDhaka === monthKey) entry.month += weight;
    memberCounts.set(ev.senderId, entry);
  }

  const enriched = members.map((m) => {
    const counts = memberCounts.get(m.memberId) || {
      today: 0,
      week: 0,
      month: 0,
      lifetimeEvents: 0,
    };
    const messagesLifetime = membersWithAnyEvents.has(m.memberId)
      ? counts.lifetimeEvents
      : m.totalMessages;
    return {
      ...m,
      messagesToday: counts.today,
      messagesThisWeek: counts.week,
      messagesThisMonth: counts.month,
      messagesLifetime,
      shareTodayPct: 0,
      shareWeekPct: 0,
      shareMonthPct: 0,
      shareLifetimePct: 0,
      rank: 0,
    };
  });

  const sumToday = enriched.reduce((s, m) => s + m.messagesToday, 0);
  const sumWeek = enriched.reduce((s, m) => s + m.messagesThisWeek, 0);
  const sumMonth = enriched.reduce((s, m) => s + m.messagesThisMonth, 0);
  const sumLifetime = enriched.reduce((s, m) => s + m.messagesLifetime, 0);

  enriched.forEach((m) => {
    m.shareTodayPct = calcSharePct(m.messagesToday, sumToday);
    m.shareWeekPct = calcSharePct(m.messagesThisWeek, sumWeek);
    m.shareMonthPct = calcSharePct(m.messagesThisMonth, sumMonth);
    m.shareLifetimePct = calcSharePct(m.messagesLifetime, sumLifetime);
  });

  const getMetricValue = (m: RankedMember): number => {
    switch (sortBy) {
      case 'daily':
        return m.messagesToday;
      case 'weekly':
        return m.messagesThisWeek;
      case 'monthly':
        return m.messagesThisMonth;
      case 'lifetime':
      default:
        return m.messagesLifetime;
    }
  };

  enriched.sort((a, b) => {
    const diff = getMetricValue(b) - getMetricValue(a);
    if (diff !== 0) return diff;
    const lifeDiff = b.messagesLifetime - a.messagesLifetime;
    if (lifeDiff !== 0) return lifeDiff;
    return a.displayName.localeCompare(b.displayName);
  });

  enriched.forEach((m, index) => {
    m.rank = index + 1;
  });

  return enriched;
}

export function buildDailyChartSeries(
  dailyStats: DailyStatisticRecord[],
  creationDate: string,
  daysCount: number = 14,
  now: Date = new Date()
) {
  const todayKey = getDhakaDateKey(now);
  const keys = getRecentDhakaDateKeys(daysCount, todayKey);
  const map = new Map<string, DailyStatisticRecord>();
  dailyStats.forEach((d) => map.set(d.dateKey, d));

  return keys.map((dateKey) => {
    const record = dateKey >= creationDate ? map.get(dateKey) : undefined;
    return {
      dateKey,
      label: formatShortDhakaDate(dateKey),
      messages: record?.totalMessages ?? 0,
      activeMembers: record?.activeMemberCount ?? 0,
    };
  });
}

export function buildWeeklyComparisonSeries(
  dailyStats: DailyStatisticRecord[],
  creationDate: string,
  weeksCount: number = 6,
  now: Date = new Date()
) {
  const currentWeekStart = getDhakaWeekStartKey(now);
  const validDays = dailyStats.filter((d) => d.dateKey >= creationDate);
  const result = [];

  for (let i = weeksCount - 1; i >= 0; i -= 1) {
    const startKey = shiftDhakaDateKey(currentWeekStart, -i * 7);
    const endKey = shiftDhakaDateKey(startKey, 6);
    const total = validDays
      .filter((d) => d.dateKey >= startKey && d.dateKey <= endKey)
      .reduce((acc, d) => acc + d.totalMessages, 0);
    result.push({
      weekRange: `${formatShortDhakaDate(startKey)} - ${formatShortDhakaDate(endKey)}`,
      shortLabel: formatShortDhakaDate(startKey),
      messages: total,
    });
  }
  return result;
}

export function buildMonthlyChartSeries(
  monthlyStats: MonthlyStatisticRecord[],
  dailyStats: DailyStatisticRecord[],
  creationDate: string
) {
  const creationMonth = creationDate.slice(0, 7);
  // Compute directly from valid dailyStats so changing creationDate immediately reflects in monthly chart
  const monthTotals = new Map<string, { total: number; activeDays: number }>();
  dailyStats
    .filter((d) => d.dateKey >= creationDate && d.totalMessages > 0)
    .forEach((d) => {
      const prev = monthTotals.get(d.monthKey) || { total: 0, activeDays: 0 };
      prev.total += d.totalMessages;
      prev.activeDays += 1;
      monthTotals.set(d.monthKey, prev);
    });

  // Ensure any monthlyStats doc >= creationMonth is represented
  monthlyStats
    .filter((m) => m.monthKey >= creationMonth)
    .forEach((m) => {
      if (!monthTotals.has(m.monthKey) && m.totalMessages > 0) {
        monthTotals.set(m.monthKey, { total: m.totalMessages, activeDays: m.activeDays });
      }
    });

  return Array.from(monthTotals.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([monthKey, data]) => ({
      monthKey,
      messages: data.total,
      activeDays: data.activeDays,
    }));
}
