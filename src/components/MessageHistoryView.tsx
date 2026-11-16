import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import type {
  DailyStatisticRecord,
  MemberRecord,
  MessageEventRecord,
  MonthlyStatisticRecord,
} from '../types/analytics';
import { formatDhakaDateTime, getDhakaDateKey } from '../utils/dhakaTime';
import { buildWeeklyComparisonSeries } from '../utils/metrics';

interface MessageHistoryViewProps {
  events: MessageEventRecord[];
  dailyStats: DailyStatisticRecord[];
  monthlyStats: MonthlyStatisticRecord[];
  members: MemberRecord[];
  creationDate: string;
}

type HistoryTab = 'events' | 'daily' | 'weekly' | 'monthly';

const PAGE_SIZE = 20;

export function MessageHistoryView({
  events,
  dailyStats,
  monthlyStats,
  members,
  creationDate,
}: MessageHistoryViewProps) {
  const [tab, setTab] = useState<HistoryTab>('events');
  const [searchMember, setSearchMember] = useState('');
  const [selectedMemberId, setSelectedMemberId] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>(creationDate);
  const [endDate, setEndDate] = useState<string>(getDhakaDateKey());
  const [page, setPage] = useState(1);

  const filteredEvents = useMemo(() => {
    const q = searchMember.trim().toLowerCase();
    return events
      .filter((ev) => {
        if (startDate && ev.dateKeyDhaka < startDate) return false;
        if (endDate && ev.dateKeyDhaka > endDate) return false;
        if (selectedMemberId !== 'all' && ev.senderId !== selectedMemberId) return false;
        if (
          q &&
          !ev.senderDisplayName.toLowerCase().includes(q) &&
          !ev.senderId.toLowerCase().includes(q) &&
          !ev.messageId.toLowerCase().includes(q)
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }, [events, startDate, endDate, selectedMemberId, searchMember]);

  const filteredDaily = useMemo(() => {
    return dailyStats
      .filter((d) => {
        if (startDate && d.dateKey < startDate) return false;
        if (endDate && d.dateKey > endDate) return false;
        return true;
      })
      .sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  }, [dailyStats, startDate, endDate]);

  const weeklySeries = useMemo(
    () => buildWeeklyComparisonSeries(dailyStats, creationDate, 12).reverse(),
    [dailyStats, creationDate]
  );

  const sortedMonthly = useMemo(
    () =>
      [...monthlyStats]
        .filter((m) => m.monthKey >= creationDate.slice(0, 7))
        .sort((a, b) => b.monthKey.localeCompare(a.monthKey)),
    [monthlyStats, creationDate]
  );

  const totalPages = Math.max(1, Math.ceil(filteredEvents.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedEvents = filteredEvents.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const handleFilterChange = (updater: () => void) => {
    updater();
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-semibold text-zinc-50 tracking-tight">
          Message History
        </h1>
        <p className="text-sm text-zinc-400 mt-1">
          Metadata-only timestamps and historical rollups in Asia/Dhaka · No private message text stored
        </p>
      </div>

      {/* View Switcher */}
      <div className="inline-flex flex-wrap items-center gap-1 p-1 rounded-xl bg-[#111119] border border-violet-300/10">
        {(
          [
            { id: 'events', label: 'Message Timestamps' },
            { id: 'daily', label: 'Daily Totals' },
            { id: 'weekly', label: 'Weekly Totals' },
            { id: 'monthly', label: 'Monthly Totals' },
          ] as Array<{ id: HistoryTab; label: string }>
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              tab === item.id ? 'bg-violet-600 text-white' : 'text-zinc-400 hover:text-zinc-100'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Filter Bar for Events & Daily */}
      {(tab === 'events' || tab === 'daily') && (
        <div className="glass-panel rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs text-zinc-400 mb-1.5" htmlFor="hist-start">
              From Date (Asia/Dhaka)
            </label>
            <input
              id="hist-start"
              type="date"
              value={startDate}
              onChange={(e) => handleFilterChange(() => setStartDate(e.target.value))}
              className="w-full h-10 px-3 rounded-xl bg-[#0B0B11] border border-violet-300/15 text-sm text-zinc-100 focus:outline-none focus:border-violet-400"
            />
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1.5" htmlFor="hist-end">
              To Date (Asia/Dhaka)
            </label>
            <input
              id="hist-end"
              type="date"
              value={endDate}
              onChange={(e) => handleFilterChange(() => setEndDate(e.target.value))}
              className="w-full h-10 px-3 rounded-xl bg-[#0B0B11] border border-violet-300/15 text-sm text-zinc-100 focus:outline-none focus:border-violet-400"
            />
          </div>

          {tab === 'events' && (
            <>
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5" htmlFor="hist-member">
                  Filter by Member
                </label>
                <select
                  id="hist-member"
                  value={selectedMemberId}
                  onChange={(e) => handleFilterChange(() => setSelectedMemberId(e.target.value))}
                  className="w-full h-10 px-3 rounded-xl bg-[#0B0B11] border border-violet-300/15 text-sm text-zinc-100 focus:outline-none focus:border-violet-400"
                >
                  <option value="all">All Members ({members.length})</option>
                  {members.map((m) => (
                    <option key={m.memberId} value={m.memberId}>
                      {m.displayName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-zinc-400 mb-1.5" htmlFor="hist-search">
                  Search Member or Event ID
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="hist-search"
                    type="text"
                    value={searchMember}
                    onChange={(e) => handleFilterChange(() => setSearchMember(e.target.value))}
                    placeholder="Search..."
                    className="w-full h-10 pl-9 pr-3 rounded-xl bg-[#0B0B11] border border-violet-300/15 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-violet-400"
                  />
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Tab Content */}
      <div className="glass-panel rounded-2xl overflow-hidden">
        {tab === 'events' && (
          <>
            <div className="px-5 py-3.5 border-b border-violet-300/10 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400">
              <span>
                Showing {pagedEvents.length} of {filteredEvents.length.toLocaleString()} matching message events
              </span>
              <span className="font-mono-tabular">
                Page {safePage} of {totalPages}
              </span>
            </div>

            {pagedEvents.length === 0 ? (
              <div className="p-10 text-center text-sm text-zinc-400">
                No message events match the selected filters.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-violet-300/10 text-xs font-medium text-zinc-400">
                      <th className="py-3 px-4">Message ID</th>
                      <th className="py-3 px-4">Sender</th>
                      <th className="py-3 px-4 text-right">Messages</th>
                      <th className="py-3 px-4">Date (Dhaka)</th>
                      <th className="py-3 px-4">Source</th>
                      <th className="py-3 px-4 text-right">Timestamp (Asia/Dhaka)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-violet-300/10 text-sm">
                    {pagedEvents.map((ev) => (
                      <tr key={ev.messageId} className="hover:bg-white/[0.025]">
                        <td className="py-3 px-4 font-mono-tabular text-xs text-zinc-300">
                          {ev.messageId}
                        </td>
                        <td className="py-3 px-4 font-medium text-zinc-100">
                          {ev.senderDisplayName}
                        </td>
                        <td className="py-3 px-4 text-right font-mono-tabular text-xs text-violet-200">
                          {(ev.messageCount ?? 1).toLocaleString()}
                        </td>
                        <td className="py-3 px-4 font-mono-tabular text-xs text-zinc-400">
                          {ev.dateKeyDhaka}
                        </td>
                        <td className="py-3 px-4 text-xs text-violet-300">
                          {ev.source.replace('_', ' ')}
                        </td>
                        <td className="py-3 px-4 text-right font-mono-tabular text-xs text-zinc-300 whitespace-nowrap">
                          {formatDhakaDateTime(ev.timestamp)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {totalPages > 1 && (
              <div className="px-5 py-3 border-t border-violet-300/10 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                  className="min-h-[36px] px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] disabled:opacity-40 text-xs text-zinc-200 flex items-center gap-1"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Previous</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                  className="min-h-[36px] px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] disabled:opacity-40 text-xs text-zinc-200 flex items-center gap-1"
                >
                  <span>Next</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </>
        )}

        {tab === 'daily' && (
          <div className="overflow-x-auto">
            {filteredDaily.length === 0 ? (
              <div className="p-10 text-center text-sm text-zinc-400">
                No daily totals recorded for this range.
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-violet-300/10 text-xs font-medium text-zinc-400">
                    <th className="py-3.5 px-4">Date (Asia/Dhaka)</th>
                    <th className="py-3.5 px-4">Month</th>
                    <th className="py-3.5 px-4 text-right">Active Members</th>
                    <th className="py-3.5 px-4 text-right">Total Messages</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-violet-300/10 text-sm">
                  {filteredDaily.map((d) => (
                    <tr key={d.dateKey} className="hover:bg-white/[0.025]">
                      <td className="py-3.5 px-4 font-mono-tabular text-zinc-100">{d.dateKey}</td>
                      <td className="py-3.5 px-4 font-mono-tabular text-zinc-400">{d.monthKey}</td>
                      <td className="py-3.5 px-4 text-right font-mono-tabular text-zinc-300">
                        {d.activeMemberCount.toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono-tabular font-semibold text-violet-200">
                        {d.totalMessages.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === 'weekly' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-violet-300/10 text-xs font-medium text-zinc-400">
                  <th className="py-3.5 px-4">Week Window (Asia/Dhaka)</th>
                  <th className="py-3.5 px-4 text-right">Total Messages</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-violet-300/10 text-sm">
                {weeklySeries.map((w) => (
                  <tr key={w.weekRange} className="hover:bg-white/[0.025]">
                    <td className="py-3.5 px-4 text-zinc-100">{w.weekRange}</td>
                    <td className="py-3.5 px-4 text-right font-mono-tabular font-semibold text-violet-200">
                      {w.messages.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'monthly' && (
          <div className="overflow-x-auto">
            {sortedMonthly.length === 0 ? (
              <div className="p-10 text-center text-sm text-zinc-400">
                No monthly totals recorded yet.
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-violet-300/10 text-xs font-medium text-zinc-400">
                    <th className="py-3.5 px-4">Month (Asia/Dhaka)</th>
                    <th className="py-3.5 px-4 text-right">Active Days</th>
                    <th className="py-3.5 px-4 text-right">Peak Day</th>
                    <th className="py-3.5 px-4 text-right">Peak Messages</th>
                    <th className="py-3.5 px-4 text-right">Total Messages</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-violet-300/10 text-sm">
                  {sortedMonthly.map((m) => (
                    <tr key={m.monthKey} className="hover:bg-white/[0.025]">
                      <td className="py-3.5 px-4 font-mono-tabular text-zinc-100">{m.monthKey}</td>
                      <td className="py-3.5 px-4 text-right font-mono-tabular text-zinc-300">
                        {m.activeDays.toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono-tabular text-zinc-400">
                        {m.peakDate || '—'}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono-tabular text-zinc-300">
                        {m.peakDailyMessages.toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono-tabular font-semibold text-violet-200">
                        {m.totalMessages.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
