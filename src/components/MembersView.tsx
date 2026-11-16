import { useMemo, useState } from 'react';
import { Download, Search, Trophy } from 'lucide-react';
import type { MemberRecord, MessageEventRecord, RankingSortPeriod } from '../types/analytics';
import { formatDhakaDateTime } from '../utils/dhakaTime';
import { exportMemberStatisticsCsv } from '../utils/exportReports';
import { computeRankedMembers } from '../utils/metrics';

interface MembersViewProps {
  members: MemberRecord[];
  events: MessageEventRecord[];
  creationDate: string;
}

const SORT_OPTIONS: Array<{ id: RankingSortPeriod; label: string }> = [
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'lifetime', label: 'Lifetime' },
];

function MemberAvatar({ name, avatarUrl }: { name: string; avatarUrl: string }) {
  const [imgError, setImgError] = useState(false);
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');

  if (avatarUrl && !imgError) {
    return (
      <img
        src={avatarUrl}
        alt={`${name} profile`}
        referrerPolicy="no-referrer"
        onError={() => setImgError(true)}
        className="w-9 h-9 rounded-full object-cover border border-violet-300/20 shrink-0"
      />
    );
  }

  return (
    <div
      className="w-9 h-9 rounded-full bg-violet-500/15 border border-violet-300/20 text-violet-200 font-display text-xs font-semibold flex items-center justify-center shrink-0"
      aria-hidden="true"
    >
      {initials || 'MG'}
    </div>
  );
}

export function MembersView({ members, events, creationDate }: MembersViewProps) {
  const [sortBy, setSortBy] = useState<RankingSortPeriod>('lifetime');
  const [searchQuery, setSearchQuery] = useState('');

  const ranked = useMemo(
    () => computeRankedMembers(members, events, creationDate, sortBy),
    [members, events, creationDate, sortBy]
  );

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return ranked;
    return ranked.filter(
      (m) =>
        m.displayName.toLowerCase().includes(q) ||
        m.handle.toLowerCase().includes(q) ||
        m.memberId.toLowerCase().includes(q)
    );
  }, [ranked, searchQuery]);

  const topThree = ranked.slice(0, 3);
  const rankTitles = ['#1 Most Active Member', '#2 Second Most Active', '#3 Third Most Active'];

  const getActiveMetricForSort = (m: (typeof ranked)[number]) => {
    switch (sortBy) {
      case 'daily':
        return { count: m.messagesToday, share: m.shareTodayPct, unit: 'today' };
      case 'weekly':
        return { count: m.messagesThisWeek, share: m.shareWeekPct, unit: 'this week' };
      case 'monthly':
        return { count: m.messagesThisMonth, share: m.shareMonthPct, unit: 'this month' };
      case 'lifetime':
      default:
        return { count: m.messagesLifetime, share: m.shareLifetimePct, unit: 'lifetime' };
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold text-zinc-50 tracking-tight">
            Member Analytics & Rankings
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Automatic rankings and percentage share calculations · Sorted by {sortBy} messages
          </p>
        </div>

        <button
          type="button"
          onClick={() => exportMemberStatisticsCsv(ranked)}
          disabled={ranked.length === 0}
          className="min-h-[40px] px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] disabled:opacity-40 border border-violet-300/15 text-xs font-medium text-zinc-100 flex items-center gap-2 whitespace-nowrap shrink-0 self-start sm:self-auto"
        >
          <Download className="w-3.5 h-3.5 text-violet-300" />
          <span>Export CSV</span>
        </button>
      </div>

      {/* Controls: Sort Tabs + Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#111119] border border-violet-300/10 self-start">
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setSortBy(opt.id)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                sortBy === opt.id
                  ? 'bg-violet-600 text-white'
                  : 'text-zinc-400 hover:text-zinc-100'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search member name or ID..."
            aria-label="Search members"
            className="w-full h-10 pl-10 pr-3.5 rounded-xl bg-[#111119] border border-violet-300/15 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-violet-400"
          />
        </div>
      </div>

      {/* Top 3 Leaderboard Cards */}
      {topThree.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {topThree.map((member, idx) => {
            const activeStat = getActiveMetricForSort(member);
            return (
              <div key={member.memberId} className="glass-panel rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-medium text-violet-300">
                    <Trophy className="w-3.5 h-3.5 shrink-0" />
                    <span>{rankTitles[idx]}</span>
                  </div>
                  <span className="font-mono-tabular text-xs text-zinc-400">
                    {activeStat.share}% share
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <MemberAvatar name={member.displayName} avatarUrl={member.avatarUrl} />
                  <div className="min-w-0">
                    <div className="text-base font-semibold text-zinc-100 truncate">
                      {member.displayName}
                    </div>
                    <div className="text-xs text-zinc-400 truncate">
                      {member.handle ? `${member.handle} · ` : ''}
                      {member.memberId}
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-baseline justify-between">
                    <span className="font-mono-tabular text-2xl font-semibold text-zinc-50">
                      {activeStat.count.toLocaleString()}
                    </span>
                    <span className="text-xs text-zinc-400">{activeStat.unit}</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-white/[0.06] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-violet-400 transition-all duration-300"
                      style={{ width: `${Math.min(100, activeStat.share)}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Full Ranked Table */}
      <div className="glass-panel rounded-2xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <div className="text-sm font-medium text-zinc-200">
              {members.length === 0 ? 'No group members added yet' : 'No members match your search'}
            </div>
            <p className="text-xs text-zinc-400">
              {members.length === 0
                ? 'Members appear automatically when authorized message events arrive or when added in the Admin Panel.'
                : 'Try adjusting your search query.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-violet-300/10 text-xs font-medium text-zinc-400">
                  <th className="py-3.5 px-4">Rank</th>
                  <th className="py-3.5 px-4">Member</th>
                  <th className="py-3.5 px-4 text-right">Today</th>
                  <th className="py-3.5 px-4 text-right">This Week</th>
                  <th className="py-3.5 px-4 text-right">This Month</th>
                  <th className="py-3.5 px-4 text-right">Lifetime</th>
                  <th className="py-3.5 px-4 text-right">Share ({sortBy})</th>
                  <th className="py-3.5 px-4 text-right">Last Active (Asia/Dhaka)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-violet-300/10 text-sm">
                {filtered.map((m) => {
                  const activeStat = getActiveMetricForSort(m);
                  return (
                    <tr key={m.memberId} className="hover:bg-white/[0.025] transition-colors">
                      <td className="py-3.5 px-4 font-mono-tabular text-violet-300 font-medium">
                        #{m.rank}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <MemberAvatar name={m.displayName} avatarUrl={m.avatarUrl} />
                          <div className="min-w-0">
                            <div className="font-medium text-zinc-100 truncate max-w-[180px]">
                              {m.displayName}
                            </div>
                            <div className="text-xs text-zinc-400 truncate max-w-[180px]">
                              {m.handle || m.memberId}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono-tabular text-zinc-200">
                        {m.messagesToday.toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono-tabular text-zinc-200">
                        {m.messagesThisWeek.toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono-tabular text-zinc-200">
                        {m.messagesThisMonth.toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono-tabular font-semibold text-zinc-50">
                        {m.messagesLifetime.toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono-tabular text-violet-200">
                        {activeStat.share}%
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono-tabular text-xs text-zinc-400 whitespace-nowrap">
                        {formatDhakaDateTime(m.lastActiveAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
