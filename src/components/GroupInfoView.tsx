import { Calendar, Layers, ShieldAlert, Users } from 'lucide-react';
import type { DashboardMetrics, GroupRecord, IntegrationStatusRecord, NavSection } from '../types/analytics';
import { getStatusLabel, OFFICIAL_API_LIMITATION_NOTE } from '../services/integrationAdapter';
import { getDhakaDateKey } from '../utils/dhakaTime';

interface GroupInfoViewProps {
  group: GroupRecord | null;
  integration: IntegrationStatusRecord | null;
  metrics: DashboardMetrics;
  isAdmin: boolean;
  onNavigate: (section: NavSection) => void;
}

export function GroupInfoView({
  group,
  integration,
  metrics,
  isAdmin,
  onNavigate,
}: GroupInfoViewProps) {
  const creationDate = group?.creationDate || getDhakaDateKey();
  const status = integration?.status || 'unavailable';

  const infoRows = [
    { label: 'Group Name', value: group?.name || 'MoonLight Gang' },
    { label: 'Platform', value: group?.platform || 'TikTok Group Chat' },
    { label: 'Configured Group Creation Date', value: `${creationDate} (Asia/Dhaka)` },
    { label: 'Total Members', value: metrics.totalMembers.toLocaleString() },
    { label: 'Total Messages Since Creation', value: metrics.lifetimeMessages.toLocaleString() },
    { label: 'Total Active Days', value: metrics.activeDaysSinceCreation.toLocaleString() },
    { label: 'Calendar Days Since Creation', value: metrics.elapsedDaysSinceCreation.toLocaleString() },
    { label: 'Average Messages Per Day', value: metrics.averageDailyMessages.toLocaleString() },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold text-zinc-50 tracking-tight">
            Group Information
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Baseline creation date configuration and lifetime calculation scope
          </p>
        </div>

        {isAdmin && (
          <button
            type="button"
            onClick={() => onNavigate('admin')}
            className="min-h-[40px] px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium transition-colors whitespace-nowrap shrink-0 self-start sm:self-auto"
          >
            Edit Creation Date in Admin Panel
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 glass-panel rounded-2xl divide-y divide-violet-300/10">
          {infoRows.map((row) => (
            <div key={row.label} className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <span className="text-sm text-zinc-400">{row.label}</span>
              <span className="font-mono-tabular text-sm font-medium text-zinc-100">
                {row.value}
              </span>
            </div>
          ))}
        </div>

        <div className="space-y-4">
          <div className="glass-panel rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
              <Calendar className="w-4 h-4 text-violet-300" />
              <span>Creation Date Rule</span>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Total Lifetime Messages and Average Daily Messages are calculated strictly from the configured Group Creation Date ({creationDate}) forward in the Asia/Dhaka timezone—not merely from the date this dashboard was launched.
            </p>
          </div>

          <div className="glass-panel rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
              <ShieldAlert className="w-4 h-4 text-violet-300" />
              <span>TikTok Integration Architecture</span>
            </div>
            <div className="text-xs text-zinc-300 font-medium">
              Status: {getStatusLabel(status)}
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              {integration?.limitationNote || OFFICIAL_API_LIMITATION_NOTE}
            </p>
          </div>

          <div className="glass-panel rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
              <Layers className="w-4 h-4 text-violet-300" />
              <span>Privacy & Deduplication</span>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Each event is keyed by its unique <code className="text-violet-300">messageId</code> inside Cloud Firestore to prevent duplicate counting. Only sender and timestamp metadata are retained.
            </p>
          </div>

          <div className="glass-panel rounded-2xl p-5 space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
              <Users className="w-4 h-4 text-violet-300" />
              <span>Active Participation</span>
            </div>
            <div className="font-mono-tabular text-xl font-semibold text-zinc-50">
              {metrics.activeMembersToday} / {metrics.totalMembers}
            </div>
            <div className="text-xs text-zinc-400">Members active today (Asia/Dhaka)</div>
          </div>
        </div>
      </div>
    </div>
  );
}
