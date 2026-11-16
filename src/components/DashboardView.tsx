import { AlertTriangle, CheckCircle2, Link2Off, PlugZap, Trophy } from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  DailyStatisticRecord,
  DashboardMetrics,
  GroupRecord,
  IntegrationStatusRecord,
  NavSection,
  RankedMember,
} from '../types/analytics';
import { getStatusLabel, OFFICIAL_API_LIMITATION_NOTE } from '../services/integrationAdapter';
import { formatDhakaDateTime, getDhakaDateKey } from '../utils/dhakaTime';
import { buildDailyChartSeries } from '../utils/metrics';
import { KpiGrid } from './KpiGrid';

interface DashboardViewProps {
  group: GroupRecord | null;
  integration: IntegrationStatusRecord | null;
  metrics: DashboardMetrics;
  dailyStats: DailyStatisticRecord[];
  rankedMembers: RankedMember[];
  isAdmin: boolean;
  onNavigate: (section: NavSection) => void;
}

export function DashboardView({
  group,
  integration,
  metrics,
  dailyStats,
  rankedMembers,
  isAdmin,
  onNavigate,
}: DashboardViewProps) {
  const creationDate = group?.creationDate || getDhakaDateKey();
  const status = integration?.status || 'unavailable';
  const chartData = buildDailyChartSeries(dailyStats, creationDate, 14);
  const topThree = rankedMembers.slice(0, 3);

  const statusMeta = {
    connected: {
      icon: CheckCircle2,
      textClass: 'text-emerald-300',
      borderClass: 'border-emerald-400/25 bg-emerald-500/10',
    },
    disconnected: {
      icon: Link2Off,
      textClass: 'text-amber-300',
      borderClass: 'border-amber-400/25 bg-amber-500/10',
    },
    unavailable: {
      icon: AlertTriangle,
      textClass: 'text-violet-200',
      borderClass: 'border-violet-400/25 bg-violet-500/10',
    },
  }[status];

  const StatusIcon = statusMeta.icon;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold text-zinc-50 tracking-tight">
            MoonLight Gang Overview
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Live Firestore analytics · Group created {creationDate} · Timezone Asia/Dhaka (+06:00)
          </p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={() => onNavigate('admin')}
            className="min-h-[40px] px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors whitespace-nowrap shrink-0 self-start sm:self-auto"
          >
            Log or Import Messages
          </button>
        )}
      </div>

      {/* Honest Integration Connection Status Banner */}
      <div className={`rounded-2xl border p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${statusMeta.borderClass}`}>
        <div className="flex items-start gap-3">
          <StatusIcon className={`w-5 h-5 shrink-0 mt-0.5 ${statusMeta.textClass}`} />
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-zinc-100">
              <span>Integration Status:</span>
              <span className={statusMeta.textClass}>{getStatusLabel(status)}</span>
              <span className="text-zinc-500" aria-hidden="true">·</span>
              <span className="text-zinc-300 font-normal">
                {integration?.adapterName || 'Authorized Webhook & Manual Ledger Adapter'}
              </span>
            </div>
            <p className="text-xs text-zinc-300/90 leading-relaxed max-w-3xl">
              {integration?.limitationNote || OFFICIAL_API_LIMITATION_NOTE}
            </p>
            <div className="text-xs text-zinc-400 font-mono-tabular">
              Processed Events: {(integration?.eventsProcessedCount ?? 0).toLocaleString()} · Last Event:{' '}
              {integration?.lastEventAt ? formatDhakaDateTime(integration.lastEventAt) : 'None yet'}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onNavigate(isAdmin ? 'admin' : 'settings')}
          className="min-h-[40px] px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 text-xs font-medium text-zinc-100 flex items-center gap-2 whitespace-nowrap shrink-0 self-start lg:self-center"
        >
          <PlugZap className="w-3.5 h-3.5 text-violet-300" />
          <span>{isAdmin ? 'Configure Adapter' : 'View Integration Details'}</span>
        </button>
      </div>

      {/* 8 Required KPI Cards */}
      <KpiGrid metrics={metrics} creationDate={creationDate} />

      {/* 14-Day Activity Chart & Top 3 Podium */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 glass-panel rounded-2xl p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-lg font-semibold text-zinc-100">
                14-Day Message Activity
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Daily message volume in Asia/Dhaka from recorded events
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('analytics')}
              className="text-xs font-medium text-violet-300 hover:text-violet-200 whitespace-nowrap shrink-0"
            >
              Full Analytics
            </button>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 12, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="lavenderArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.38} />
                    <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(196, 181, 253, 0.08)" />
                <XAxis
                  dataKey="label"
                  stroke="#71717A"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="#71717A"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#12121B',
                    borderColor: 'rgba(196, 181, 253, 0.2)',
                    borderRadius: '12px',
                    fontSize: '12px',
                    color: '#F4F4F5',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="messages"
                  name="Messages"
                  stroke="#C4B5FD"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#lavenderArea)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top 3 Leaderboard Podium */}
        <div className="glass-panel rounded-2xl p-5 sm:p-6 flex flex-col justify-between gap-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Trophy className="w-4 h-4 text-violet-300" />
              <h2 className="font-display text-lg font-semibold text-zinc-100">
                Top Active Members
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('members')}
              className="text-xs font-medium text-violet-300 hover:text-violet-200 whitespace-nowrap"
            >
              All Members
            </button>
          </div>

          {topThree.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-8 space-y-2">
              <p className="text-sm text-zinc-300 font-medium">No member activity recorded yet</p>
              <p className="text-xs text-zinc-400 max-w-xs">
                {isAdmin
                  ? 'Add members or log verified message events in the Admin Panel to populate rankings.'
                  : 'Rankings will update automatically once authorized message events arrive.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3 flex-1">
              {topThree.map((member, index) => {
                const rankLabels = [
                  '#1 Most Active Member',
                  '#2 Second Most Active',
                  '#3 Third Most Active',
                ];
                return (
                  <div
                    key={member.memberId}
                    className="rounded-xl bg-white/[0.03] border border-violet-300/10 p-3.5 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-violet-300">
                        {rankLabels[index]}
                      </span>
                      <span className="font-mono-tabular text-xs text-zinc-400">
                        {member.shareLifetimePct}% share
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-zinc-100 truncate">
                          {member.displayName}
                        </div>
                        <div className="text-xs text-zinc-400 font-mono-tabular">
                          Today: {member.messagesToday.toLocaleString()} · Week: {member.messagesThisWeek.toLocaleString()}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-mono-tabular text-lg font-semibold text-zinc-50">
                          {member.messagesLifetime.toLocaleString()}
                        </div>
                        <div className="text-[11px] text-zinc-400">lifetime</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
