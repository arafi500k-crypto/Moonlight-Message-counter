import type { DashboardMetrics } from '../types/analytics';

interface KpiGridProps {
  metrics: DashboardMetrics;
  creationDate: string;
}

export function KpiGrid({ metrics, creationDate }: KpiGridProps) {
  const deltaText =
    metrics.todayVsYesterdayPct === null
      ? 'No yesterday baseline'
      : `${metrics.todayVsYesterdayPct >= 0 ? '+' : ''}${metrics.todayVsYesterdayPct}% vs yesterday`;

  const cards = [
    {
      label: "Today's Total Messages",
      value: metrics.todayMessages.toLocaleString(),
      meta: `${deltaText} · Asia/Dhaka`,
    },
    {
      label: "Yesterday's Messages",
      value: metrics.yesterdayMessages.toLocaleString(),
      meta: 'Previous Dhaka calendar day',
    },
    {
      label: 'Total Lifetime Messages',
      value: metrics.lifetimeMessages.toLocaleString(),
      meta: `Since ${creationDate}`,
    },
    {
      label: 'Messages This Week',
      value: metrics.weekMessages.toLocaleString(),
      meta: `${metrics.todayShareOfWeekPct}% sent today`,
    },
    {
      label: 'Messages This Month',
      value: metrics.monthMessages.toLocaleString(),
      meta: 'Current Dhaka month',
    },
    {
      label: 'Total Group Members',
      value: metrics.totalMembers.toLocaleString(),
      meta: 'Tracked MoonLight Gang roster',
    },
    {
      label: 'Active Members Today',
      value: metrics.activeMembersToday.toLocaleString(),
      meta:
        metrics.totalMembers > 0
          ? `${Math.round((metrics.activeMembersToday / metrics.totalMembers) * 100)}% participation today`
          : '0% participation today',
    },
    {
      label: 'Average Daily Messages',
      value: metrics.averageDailyMessages.toLocaleString(),
      meta: `${metrics.activeDaysSinceCreation} active ${metrics.activeDaysSinceCreation === 1 ? 'day' : 'days'}`,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div key={card.label} className="glass-panel glass-panel-hover rounded-2xl p-5 flex flex-col justify-between gap-3">
          <div className="text-sm font-medium text-zinc-400">{card.label}</div>
          <div className="font-mono-tabular text-3xl font-semibold text-zinc-50 tracking-tight">
            {card.value}
          </div>
          <div className="text-xs text-zinc-400 truncate">{card.meta}</div>
        </div>
      ))}
    </div>
  );
}
