import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  DailyStatisticRecord,
  DashboardMetrics,
  MonthlyStatisticRecord,
  RankedMember,
} from '../types/analytics';
import {
  buildDailyChartSeries,
  buildMonthlyChartSeries,
  buildWeeklyComparisonSeries,
} from '../utils/metrics';

interface AnalyticsViewProps {
  dailyStats: DailyStatisticRecord[];
  monthlyStats: MonthlyStatisticRecord[];
  rankedMembers: RankedMember[];
  metrics: DashboardMetrics;
  creationDate: string;
}

const tooltipStyle = {
  backgroundColor: '#12121B',
  borderColor: 'rgba(196, 181, 253, 0.22)',
  borderRadius: '12px',
  fontSize: '12px',
  color: '#F4F4F5',
};

export function AnalyticsView({
  dailyStats,
  monthlyStats,
  rankedMembers,
  metrics,
  creationDate,
}: AnalyticsViewProps) {
  const dailySeries = buildDailyChartSeries(dailyStats, creationDate, 30);
  const weeklySeries = buildWeeklyComparisonSeries(dailyStats, creationDate, 8);
  const monthlySeries = buildMonthlyChartSeries(monthlyStats, dailyStats, creationDate);
  const memberComparisonSeries = rankedMembers.slice(0, 10).map((m) => ({
    name: m.displayName.length > 14 ? `${m.displayName.slice(0, 12)}…` : m.displayName,
    lifetime: m.messagesLifetime,
    thisMonth: m.messagesThisMonth,
    today: m.messagesToday,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-semibold text-zinc-50 tracking-tight">
          Analytics & Visual Insights
        </h1>
        <p className="text-sm text-zinc-400 mt-1">
          Interactive Recharts metrics driven directly from Firestore records · Since {creationDate}
        </p>
      </div>

      {/* Key Analytical Highlights */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-panel rounded-2xl p-5 space-y-2">
          <div className="text-xs font-medium text-zinc-400">Most Active Day</div>
          <div className="font-mono-tabular text-2xl font-semibold text-zinc-50">
            {metrics.highestDailyDate || 'No activity yet'}
          </div>
          <div className="text-xs text-zinc-400">Asia/Dhaka calendar date</div>
        </div>

        <div className="glass-panel rounded-2xl p-5 space-y-2">
          <div className="text-xs font-medium text-zinc-400">Highest Single-Day Messages</div>
          <div className="font-mono-tabular text-2xl font-semibold text-violet-300">
            {metrics.highestDailyCount.toLocaleString()}
          </div>
          <div className="text-xs text-zinc-400">
            Peak recorded volume in 24h window
          </div>
        </div>

        <div className="glass-panel rounded-2xl p-5 space-y-2">
          <div className="text-xs font-medium text-zinc-400">Average Messages Per Day</div>
          <div className="font-mono-tabular text-2xl font-semibold text-zinc-50">
            {metrics.averageDailyMessages.toLocaleString()}
          </div>
          <div className="text-xs text-zinc-400">
            Across {metrics.activeDaysSinceCreation} active {metrics.activeDaysSinceCreation === 1 ? 'day' : 'days'}
          </div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Daily Message Activity */}
        <div className="glass-panel rounded-2xl p-5 sm:p-6 space-y-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-zinc-100">
              Daily Message Activity (30 Days)
            </h2>
            <p className="text-xs text-zinc-400">Message counts per Dhaka day</p>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailySeries} margin={{ top: 10, right: 10, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="dailyLavender" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#A78BFA" stopOpacity={0.38} />
                    <stop offset="95%" stopColor="#A78BFA" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(196, 181, 253, 0.08)" />
                <XAxis dataKey="label" stroke="#71717A" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#71717A" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Area
                  type="monotone"
                  dataKey="messages"
                  name="Messages"
                  stroke="#C4B5FD"
                  strokeWidth={2}
                  fill="url(#dailyLavender)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Weekly Comparison */}
        <div className="glass-panel rounded-2xl p-5 sm:p-6 space-y-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-zinc-100">
              Weekly Comparison (8 Weeks)
            </h2>
            <p className="text-xs text-zinc-400">Monday–Sunday totals in Asia/Dhaka</p>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklySeries} margin={{ top: 10, right: 10, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(196, 181, 253, 0.08)" />
                <XAxis dataKey="shortLabel" stroke="#71717A" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#71717A" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="messages" name="Weekly Messages" fill="#8B5CF6" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Monthly Activity */}
        <div className="glass-panel rounded-2xl p-5 sm:p-6 space-y-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-zinc-100">
              Monthly Activity
            </h2>
            <p className="text-xs text-zinc-400">Aggregated volume by calendar month</p>
          </div>
          <div className="h-72 w-full">
            {monthlySeries.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-zinc-400">
                No monthly data recorded since {creationDate}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlySeries} margin={{ top: 10, right: 10, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(196, 181, 253, 0.08)" />
                  <XAxis dataKey="monthKey" stroke="#71717A" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#71717A" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="messages" name="Monthly Messages" fill="#C4B5FD" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Member Activity Comparison */}
        <div className="glass-panel rounded-2xl p-5 sm:p-6 space-y-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-zinc-100">
              Member Activity Comparison
            </h2>
            <p className="text-xs text-zinc-400">Top 10 members by lifetime vs current month volume</p>
          </div>
          <div className="h-72 w-full">
            {memberComparisonSeries.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-zinc-400">
                No member activity recorded yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={memberComparisonSeries} margin={{ top: 10, right: 10, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(196, 181, 253, 0.08)" />
                  <XAxis dataKey="name" stroke="#71717A" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#71717A" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="lifetime" name="Lifetime" fill="#8B5CF6" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="thisMonth" name="This Month" fill="#DDD6FE" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
