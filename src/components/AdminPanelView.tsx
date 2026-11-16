import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  AlertTriangle,
  Calendar,
  Check,
  Download,
  KeyRound,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Shuffle,
  Trash2,
  Upload,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {
  ingestAuthorizedEvents,
  removeMember,
  removeUserLoginRecord,
  resetAnalyticsData,
  updateGroupCreationDate,
  updateIntegrationSettings,
  updateMemberWithMessageTotal,
  upsertMember,
} from '../services/firestoreAnalytics';
import {
  OFFICIAL_API_LIMITATION_NOTE,
  parseAuthorizedImportText,
  sanitizeFirestoreId,
} from '../services/integrationAdapter';
import type {
  AdminSettingsRecord,
  AuthorizedIncomingEvent,
  DailyStatisticRecord,
  DashboardMetrics,
  GroupRecord,
  IntegrationConnectionState,
  IntegrationStatusRecord,
  MemberRecord,
  MessageEventRecord,
  MonthlyStatisticRecord,
  RankedMember,
  UserLoginRecord,
} from '../types/analytics';
import { dhakaDateAndTimeToIso, formatDhakaDateTime, getDhakaDateKey } from '../utils/dhakaTime';
import {
  exportDailyReportPdf,
  exportLifetimeStatisticsCsv,
  exportMemberStatisticsCsv,
  exportMonthlyReportPdf,
} from '../utils/exportReports';
import { calcSharePct } from '../utils/metrics';
import {
  buildDistributedIncomingEvents,
  computeRandomMemberAllocations,
  type DistributionParticipantMode,
  type DistributionSpreadMode,
} from '../utils/randomDistribution';

interface AdminPanelViewProps {
  isAdmin: boolean;
  userEmail: string;
  group: GroupRecord | null;
  integration: IntegrationStatusRecord | null;
  adminSettings: AdminSettingsRecord | null;
  members: MemberRecord[];
  rankedMembers: RankedMember[];
  dailyStats: DailyStatisticRecord[];
  monthlyStats: MonthlyStatisticRecord[];
  events: MessageEventRecord[];
  metrics: DashboardMetrics;
  userLogins: UserLoginRecord[];
}

function LoginUserAvatar({ name, photoUrl }: { name: string; photoUrl: string }) {
  const [imgError, setImgError] = useState(false);
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');

  if (photoUrl && !imgError) {
    return (
      <img
        src={photoUrl}
        alt={`${name} avatar`}
        referrerPolicy="no-referrer"
        onError={() => setImgError(true)}
        className="w-8 h-8 rounded-full object-cover border border-violet-300/20 shrink-0"
      />
    );
  }

  return (
    <div
      className="w-8 h-8 rounded-full bg-violet-500/15 border border-violet-300/20 text-violet-200 font-display text-xs font-semibold flex items-center justify-center shrink-0"
      aria-hidden="true"
    >
      {initials || 'G'}
    </div>
  );
}

export function AdminPanelView({
  isAdmin,
  userEmail,
  group,
  integration,
  adminSettings,
  members,
  rankedMembers,
  dailyStats,
  monthlyStats,
  events,
  metrics,
  userLogins,
}: AdminPanelViewProps) {
  const todayDhaka = getDhakaDateKey();
  const currentCreationDate = group?.creationDate || adminSettings?.groupCreationDate || todayDhaka;

  // Feedback banner state
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );
  const [busy, setBusy] = useState(false);

  // Manual Message Logger state
  const [selectedMemberId, setSelectedMemberId] = useState<string>('__new__');
  const [inlineMemberName, setInlineMemberName] = useState('');
  const [logDate, setLogDate] = useState(todayDhaka);
  const [logTime, setLogTime] = useState(() => {
    const now = new Date();
    const dhaka = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Dhaka',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(now);
    return dhaka;
  });
  const [logCountText, setLogCountText] = useState('1');
  const [customMessageId, setCustomMessageId] = useState('');

  // Member management state
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberHandle, setNewMemberHandle] = useState('');
  const [newMemberAvatar, setNewMemberAvatar] = useState('');
  const [newMemberMessagesText, setNewMemberMessagesText] = useState('');
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editHandle, setEditHandle] = useState('');
  const [editAvatar, setEditAvatar] = useState('');
  const [editTotalMessagesText, setEditTotalMessagesText] = useState('0');
  const [confirmDeleteMemberId, setConfirmDeleteMemberId] = useState<string | null>(null);

  // Random Multi-Member Message Distribution state
  const [distTotalText, setDistTotalText] = useState('25000');
  const [distParticipantMode, setDistParticipantMode] =
    useState<DistributionParticipantMode>('all');
  const [distSpreadMode, setDistSpreadMode] = useState<DistributionSpreadMode>('single');
  const [distDate, setDistDate] = useState(todayDhaka);
  const [distSeed, setDistSeed] = useState(() => Math.floor(Math.random() * 1_000_000_000) || 1);

  // Creation Date state
  const [creationDateInput, setCreationDateInput] = useState(currentCreationDate);

  // Integration settings state
  const [statusInput, setStatusInput] = useState<IntegrationConnectionState>(
    integration?.status || 'unavailable'
  );
  const [adapterNameInput, setAdapterNameInput] = useState(
    integration?.adapterName || 'Authorized Webhook & Manual Ledger Adapter'
  );
  const [endpointInput, setEndpointInput] = useState(integration?.endpointUrl || '');
  const [webhookHeaderInput, setWebhookHeaderInput] = useState(
    adminSettings?.webhookHeaderName || 'x-moonlight-signature'
  );
  const [limitationInput, setLimitationInput] = useState(
    integration?.limitationNote || OFFICIAL_API_LIMITATION_NOTE
  );

  // Bulk import state
  const [importText, setImportText] = useState('');

  // Reset confirmation state
  const [showResetBox, setShowResetBox] = useState(false);
  const [resetPhrase, setResetPhrase] = useState('');
  const [keepMembersOnReset, setKeepMembersOnReset] = useState(true);

  // Login history state
  const [loginSearch, setLoginSearch] = useState('');
  const [confirmDeleteLoginUid, setConfirmDeleteLoginUid] = useState<string | null>(null);

  if (!isAdmin) {
    return (
      <div className="glass-panel rounded-2xl p-8 max-w-2xl mx-auto text-center space-y-3">
        <ShieldAlert className="w-8 h-8 text-violet-300 mx-auto" />
        <h1 className="font-display text-xl font-semibold text-zinc-100">
          Administrator Access Required
        </h1>
        <p className="text-sm text-zinc-400">
          Signed in as <span className="text-zinc-200">{userEmail}</span>. Only authorized MoonLight Gang administrators can log manual message counts, edit member names, configure the group creation date, or reset analytics.
        </p>
      </div>
    );
  }

  const runAction = async (fn: () => Promise<string>) => {
    setBusy(true);
    setFeedback(null);
    try {
      const msg = await fn();
      setFeedback({ type: 'success', text: msg });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Operation failed.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleManualLogSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const parsedCount = Math.floor(Number(logCountText));
    if (!Number.isFinite(parsedCount) || parsedCount < 1) {
      setFeedback({ type: 'error', text: 'Enter a valid message count of at least 1.' });
      return;
    }

    const targetMember =
      selectedMemberId !== '__new__'
        ? members.find((m) => m.memberId === selectedMemberId)
        : undefined;

    const senderName = targetMember ? targetMember.displayName : inlineMemberName.trim();
    if (!senderName) {
      setFeedback({ type: 'error', text: 'Select an existing member or enter a new member name.' });
      return;
    }

    const senderId = targetMember
      ? targetMember.memberId
      : sanitizeFirestoreId(`mem_${senderName.toLowerCase()}`, 'mem');

    const baseIso = dhakaDateAndTimeToIso(logDate, logTime);
    const baseMs = new Date(baseIso).getTime();

    const msgId =
      parsedCount === 1 && customMessageId.trim()
        ? sanitizeFirestoreId(customMessageId.trim(), 'msg')
        : sanitizeFirestoreId(
            `manual_${senderId}_${baseMs}_${Math.random().toString(36).slice(2, 8)}`,
            'msg'
          );

    const batchEvents: AuthorizedIncomingEvent[] = [
      {
        messageId: msgId,
        senderId,
        senderDisplayName: senderName,
        timestamp: baseIso,
        handle: targetMember?.handle || '',
        avatarUrl: targetMember?.avatarUrl || '',
        source: 'admin_manual',
        messageCount: parsedCount,
      },
    ];

    await runAction(async () => {
      const result = await ingestAuthorizedEvents(
        batchEvents,
        group,
        members,
        dailyStats,
        monthlyStats,
        integration?.eventsProcessedCount ?? 0
      );
      if (selectedMemberId === '__new__') {
        setInlineMemberName('');
      }
      setCustomMessageId('');
      return `Logged ${result.inserted.toLocaleString()} ${result.inserted === 1 ? 'message' : 'messages'} for ${senderName} (${result.duplicatesSkipped} duplicate skipped).`;
    });
  };

  const handleAddMember = async (e: FormEvent) => {
    e.preventDefault();
    const safeName = newMemberName.trim();
    if (!safeName) {
      setFeedback({ type: 'error', text: 'Enter a member display name.' });
      return;
    }

    const parsedInitial = newMemberMessagesText.trim()
      ? Math.floor(Number(newMemberMessagesText))
      : 0;
    if (!Number.isFinite(parsedInitial) || parsedInitial < 0) {
      setFeedback({ type: 'error', text: 'Initial messages must be 0 or greater.' });
      return;
    }

    await runAction(async () => {
      const id = sanitizeFirestoreId(`mem_${safeName.toLowerCase()}`, 'mem');
      if (parsedInitial > 0) {
        await ingestAuthorizedEvents(
          [
            {
              messageId: sanitizeFirestoreId(
                `init_${id}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                'msg'
              ),
              senderId: id,
              senderDisplayName: safeName,
              timestamp: new Date().toISOString(),
              handle: newMemberHandle.trim(),
              avatarUrl: newMemberAvatar.trim(),
              source: 'admin_manual',
              messageCount: parsedInitial,
            },
          ],
          group,
          members,
          dailyStats,
          monthlyStats,
          integration?.eventsProcessedCount ?? 0
        );
      } else {
        await upsertMember({
          memberId: id,
          displayName: safeName,
          handle: newMemberHandle,
          avatarUrl: newMemberAvatar,
        });
      }
      setNewMemberName('');
      setNewMemberHandle('');
      setNewMemberAvatar('');
      setNewMemberMessagesText('');
      return parsedInitial > 0
        ? `Added ${safeName} (${id}) with ${parsedInitial.toLocaleString()} messages.`
        : `Saved member profile (${id}).`;
    });
  };

  const handleSaveMemberEdit = async (memberId: string) => {
    if (!editDisplayName.trim()) {
      setFeedback({ type: 'error', text: 'Display name cannot be empty.' });
      return;
    }
    const parsedTotal = Math.floor(Number(editTotalMessagesText));
    if (!Number.isFinite(parsedTotal) || parsedTotal < 0) {
      setFeedback({ type: 'error', text: 'Enter a valid message count (0 or greater).' });
      return;
    }

    await runAction(async () => {
      await updateMemberWithMessageTotal({
        memberId,
        displayName: editDisplayName,
        handle: editHandle,
        avatarUrl: editAvatar,
        targetTotalMessages: parsedTotal,
        currentGroup: group,
        existingMembers: members,
        existingDaily: dailyStats,
        existingMonthly: monthlyStats,
        currentProcessedCount: integration?.eventsProcessedCount ?? 0,
      });
      setEditingMemberId(null);
      return `Updated ${editDisplayName.trim()} (${parsedTotal.toLocaleString()} lifetime messages).`;
    });
  };

  const handleDeleteMember = async (memberId: string) => {
    await runAction(async () => {
      await removeMember(memberId);
      setConfirmDeleteMemberId(null);
      return `Removed member ${memberId}.`;
    });
  };

  const handleUpdateCreationDate = async (e: FormEvent) => {
    e.preventDefault();
    await runAction(async () => {
      await updateGroupCreationDate(creationDateInput, dailyStats);
      return `Updated Group Creation Date to ${creationDateInput} and recalculated lifetime counters.`;
    });
  };

  const handleSaveIntegration = async (e: FormEvent) => {
    e.preventDefault();
    await runAction(async () => {
      await updateIntegrationSettings({
        status: statusInput,
        adapterName: adapterNameInput,
        endpointUrl: endpointInput,
        limitationNote: limitationInput,
        webhookHeaderName: webhookHeaderInput,
      });
      return `Updated integration status to "${statusInput}".`;
    });
  };

  const handleFileImport = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setImportText(String(reader.result || ''));
    };
    reader.readAsText(file);
  };

  const handleRunImport = async () => {
    const parsed = parseAuthorizedImportText(importText);
    if (parsed.error) {
      setFeedback({ type: 'error', text: parsed.error });
      return;
    }
    if (parsed.events.length === 0) {
      setFeedback({ type: 'error', text: 'No valid message metadata events found in input.' });
      return;
    }
    await runAction(async () => {
      const res = await ingestAuthorizedEvents(
        parsed.events,
        group,
        members,
        dailyStats,
        monthlyStats,
        integration?.eventsProcessedCount ?? 0
      );
      setImportText('');
      return `Imported ${res.inserted} new events (${res.duplicatesSkipped} duplicate IDs skipped, ${parsed.skipped} invalid rows ignored).`;
    });
  };

  const handleResetConfirm = async () => {
    if (resetPhrase.trim() !== 'RESET') {
      setFeedback({ type: 'error', text: 'Type RESET to confirm clearing analytics data.' });
      return;
    }
    await runAction(async () => {
      await resetAnalyticsData(keepMembersOnReset);
      setShowResetBox(false);
      setResetPhrase('');
      return 'Analytics data reset to zero.';
    });
  };

  const todayEvents = events.filter((e) => e.dateKeyDhaka === todayDhaka);

  const parsedDistTotal = Math.max(0, Math.floor(Number(distTotalText) || 0));
  const distAllocations = useMemo(
    () =>
      computeRandomMemberAllocations({
        rankedMembers,
        totalToAdd: parsedDistTotal,
        participantMode: distParticipantMode,
        seed: distSeed,
      }),
    [rankedMembers, parsedDistTotal, distParticipantMode, distSeed]
  );

  const distActiveRecipients = distAllocations.filter((a) => a.addedMessages > 0).length;

  const handleShuffleSplit = () => {
    setDistSeed((prev) => {
      const next = Math.floor(Math.random() * 1_000_000_000) || 1;
      return next === prev ? prev + 7 : next;
    });
  };

  const handleRandomize20kTo30k = () => {
    const randomVal = 20000 + Math.floor(Math.random() * 10001);
    setDistTotalText(String(randomVal));
    handleShuffleSplit();
  };

  const handleApplyDistribution = async () => {
    if (members.length === 0) {
      setFeedback({ type: 'error', text: 'Add at least one member first before distributing messages.' });
      return;
    }
    if (!Number.isFinite(parsedDistTotal) || parsedDistTotal < 1) {
      setFeedback({ type: 'error', text: 'Enter a valid total message count of at least 1.' });
      return;
    }

    const batchEvents = buildDistributedIncomingEvents({
      allocations: distAllocations,
      members,
      spreadMode: distSpreadMode,
      targetDateDhaka: distDate,
      targetTimeDhaka: logTime,
      creationDate: currentCreationDate,
      seed: distSeed,
    });

    if (batchEvents.length === 0) {
      setFeedback({ type: 'error', text: 'No member allocations generated. Try shuffling again.' });
      return;
    }

    await runAction(async () => {
      const res = await ingestAuthorizedEvents(
        batchEvents,
        group,
        members,
        dailyStats,
        monthlyStats,
        integration?.eventsProcessedCount ?? 0
      );
      handleShuffleSplit();
      return `Distributed ${res.inserted.toLocaleString()} messages randomly across ${distActiveRecipients} ${distActiveRecipients === 1 ? 'member' : 'members'}. Rankings and % shares updated automatically.`;
    });
  };

  const handleDeleteLoginRecord = async (uid: string) => {
    await runAction(async () => {
      await removeUserLoginRecord(uid);
      setConfirmDeleteLoginUid(null);
      return 'Removed login log entry.';
    });
  };

  const filteredLogins = useMemo(() => {
    const q = loginSearch.trim().toLowerCase();
    if (!q) return userLogins;
    return userLogins.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        u.displayName.toLowerCase().includes(q) ||
        u.uid.toLowerCase().includes(q)
    );
  }, [userLogins, loginSearch]);

  const totalLoginCountSum = useMemo(
    () => userLogins.reduce((sum, u) => sum + (u.loginCount || 0), 0),
    [userLogins]
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-semibold text-zinc-50 tracking-tight">
          Manual Message Analytics Admin Panel
        </h1>
        <p className="text-sm text-zinc-400 mt-1">
          Log verified message counts, manage MoonLight Gang members, configure creation date, and control integration settings
        </p>
      </div>

      {feedback && (
        <div
          className={`rounded-xl border p-4 text-xs flex items-center justify-between gap-3 ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-400/25 text-emerald-200'
              : 'bg-red-500/10 border-red-400/25 text-red-200'
          }`}
        >
          <span>{feedback.text}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            aria-label="Dismiss notification"
            className="text-zinc-400 hover:text-zinc-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 1. Manual Message Event Logger & Group Creation Date */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <form
          onSubmit={(e) => void handleManualLogSubmit(e)}
          className="xl:col-span-2 glass-panel rounded-2xl p-5 sm:p-6 space-y-4"
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-lg font-semibold text-zinc-100">
                Record Manual / Verified Messages
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Atomically updates today, weekly, monthly, lifetime totals, and member rankings in Asia/Dhaka
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-zinc-400 mb-1.5" htmlFor="admin-select-member">
                Member
              </label>
              <select
                id="admin-select-member"
                value={selectedMemberId}
                onChange={(e) => setSelectedMemberId(e.target.value)}
                className="w-full h-10 px-3 rounded-xl bg-[#0B0B11] border border-violet-300/15 text-sm text-zinc-100 focus:outline-none focus:border-violet-400"
              >
                <option value="__new__">+ Create / Enter New Member</option>
                {members.map((m) => (
                  <option key={m.memberId} value={m.memberId}>
                    {m.displayName} ({m.totalMessages} total)
                  </option>
                ))}
              </select>
            </div>

            {selectedMemberId === '__new__' ? (
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5" htmlFor="admin-inline-name">
                  New Member Display Name
                </label>
                <input
                  id="admin-inline-name"
                  type="text"
                  value={inlineMemberName}
                  onChange={(e) => setInlineMemberName(e.target.value)}
                  placeholder="e.g. Rafi"
                  maxLength={80}
                  className="w-full h-10 px-3 rounded-xl bg-[#0B0B11] border border-violet-300/15 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-violet-400"
                />
              </div>
            ) : (
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5" htmlFor="admin-msg-count">
                  Message Count (Unlimited)
                </label>
                <input
                  id="admin-msg-count"
                  type="number"
                  min={1}
                  step={1}
                  value={logCountText}
                  onChange={(e) => setLogCountText(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl bg-[#0B0B11] border border-violet-300/15 font-mono-tabular text-sm text-zinc-100 focus:outline-none focus:border-violet-400"
                />
              </div>
            )}

            {selectedMemberId === '__new__' && (
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5" htmlFor="admin-msg-count-new">
                  Message Count (Unlimited)
                </label>
                <input
                  id="admin-msg-count-new"
                  type="number"
                  min={1}
                  step={1}
                  value={logCountText}
                  onChange={(e) => setLogCountText(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl bg-[#0B0B11] border border-violet-300/15 font-mono-tabular text-sm text-zinc-100 focus:outline-none focus:border-violet-400"
                />
              </div>
            )}

            <div>
              <label className="block text-xs text-zinc-400 mb-1.5" htmlFor="admin-log-date">
                Date (Asia/Dhaka)
              </label>
              <input
                id="admin-log-date"
                type="date"
                value={logDate}
                onChange={(e) => setLogDate(e.target.value)}
                className="w-full h-10 px-3 rounded-xl bg-[#0B0B11] border border-violet-300/15 text-sm text-zinc-100 focus:outline-none focus:border-violet-400"
              />
            </div>

            <div>
              <label className="block text-xs text-zinc-400 mb-1.5" htmlFor="admin-log-time">
                Time (Asia/Dhaka)
              </label>
              <input
                id="admin-log-time"
                type="time"
                value={logTime}
                onChange={(e) => setLogTime(e.target.value)}
                className="w-full h-10 px-3 rounded-xl bg-[#0B0B11] border border-violet-300/15 text-sm text-zinc-100 focus:outline-none focus:border-violet-400"
              />
            </div>

            {Number(logCountText) === 1 && (
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5" htmlFor="admin-custom-msgid">
                  Custom Message ID (Optional deduplication key)
                </label>
                <input
                  id="admin-custom-msgid"
                  type="text"
                  value={customMessageId}
                  onChange={(e) => setCustomMessageId(e.target.value)}
                  placeholder="Auto-generated if blank"
                  maxLength={100}
                  className="w-full h-10 px-3 rounded-xl bg-[#0B0B11] border border-violet-300/15 font-mono-tabular text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-violet-400"
                />
              </div>
            )}
          </div>

          <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-zinc-400">
              Each event stores metadata only and uses unique messageId deduplication.
            </span>
            <button
              type="submit"
              disabled={busy}
              className="min-h-[40px] px-5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-medium flex items-center gap-2 transition-colors whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>{busy ? 'Saving...' : 'Record Messages'}</span>
            </button>
          </div>
        </form>

        {/* Group Creation Date Config */}
        <form
          onSubmit={(e) => void handleUpdateCreationDate(e)}
          className="glass-panel rounded-2xl p-5 sm:p-6 flex flex-col justify-between gap-4"
        >
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-violet-300" />
              <h2 className="font-display text-lg font-semibold text-zinc-100">
                Group Creation Date
              </h2>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Lifetime messages and active days are calculated starting from this date in Asia/Dhaka.
            </p>
            <div>
              <label className="block text-xs text-zinc-400 mb-1.5" htmlFor="admin-creation-date">
                Configured Creation Date
              </label>
              <input
                id="admin-creation-date"
                type="date"
                value={creationDateInput}
                onChange={(e) => setCreationDateInput(e.target.value)}
                className="w-full h-10 px-3 rounded-xl bg-[#0B0B11] border border-violet-300/15 font-mono-tabular text-sm text-zinc-100 focus:outline-none focus:border-violet-400"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={busy}
            className="w-full min-h-[40px] px-4 py-2 rounded-xl bg-white/[0.07] hover:bg-white/[0.12] border border-violet-300/15 text-xs font-medium text-zinc-100 transition-colors"
          >
            Save Creation Date
          </button>
        </form>
      </div>

      {/* 1b. Random Multi-Member Message Distribution */}
      <div className="glass-panel rounded-2xl p-5 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-violet-300" />
              <h2 className="font-display text-lg font-semibold text-zinc-100">
                Distribute Random Messages Across Members
              </h2>
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              Split any combined total (e.g. 20k–30k, less, or more) randomly across your added members with live preview and automatic % recalculation
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={busy || members.length === 0}
              onClick={handleRandomize20kTo30k}
              className="min-h-[40px] px-3.5 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.11] disabled:opacity-40 border border-violet-300/15 text-xs font-medium text-zinc-100 whitespace-nowrap shrink-0 transition-colors"
            >
              Random 20k–30k
            </button>
            <button
              type="button"
              disabled={busy || members.length === 0}
              onClick={handleShuffleSplit}
              className="min-h-[40px] px-3.5 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.11] disabled:opacity-40 border border-violet-300/15 text-xs font-medium text-zinc-100 flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
            >
              <Shuffle className="w-3.5 h-3.5 text-violet-300" />
              <span>Shuffle Split</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs text-zinc-400 mb-1.5" htmlFor="dist-total-count">
              Combined Total Messages (Unlimited)
            </label>
            <input
              id="dist-total-count"
              type="number"
              min={1}
              step={1}
              value={distTotalText}
              onChange={(e) => setDistTotalText(e.target.value)}
              placeholder="e.g. 25000"
              className="w-full h-10 px-3 rounded-xl bg-[#0B0B11] border border-violet-300/15 font-mono-tabular text-sm text-zinc-100 focus:outline-none focus:border-violet-400"
            />
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1.5" htmlFor="dist-participants">
              Member Selection
            </label>
            <select
              id="dist-participants"
              value={distParticipantMode}
              onChange={(e) => setDistParticipantMode(e.target.value as DistributionParticipantMode)}
              className="w-full h-10 px-3 rounded-xl bg-[#0B0B11] border border-violet-300/15 text-sm text-zinc-100 focus:outline-none focus:border-violet-400"
            >
              <option value="all">All added members (varied amounts)</option>
              <option value="subset">Random subset of members</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1.5" htmlFor="dist-spread">
              Date Spread (Asia/Dhaka)
            </label>
            <select
              id="dist-spread"
              value={distSpreadMode}
              onChange={(e) => setDistSpreadMode(e.target.value as DistributionSpreadMode)}
              className="w-full h-10 px-3 rounded-xl bg-[#0B0B11] border border-violet-300/15 text-sm text-zinc-100 focus:outline-none focus:border-violet-400"
            >
              <option value="single">Single selected date</option>
              <option value="7d">Spread randomly over last 7 days</option>
              <option value="30d">Spread randomly over last 30 days</option>
            </select>
          </div>

          {distSpreadMode === 'single' ? (
            <div>
              <label className="block text-xs text-zinc-400 mb-1.5" htmlFor="dist-date">
                Target Date (Asia/Dhaka)
              </label>
              <input
                id="dist-date"
                type="date"
                value={distDate}
                onChange={(e) => setDistDate(e.target.value)}
                className="w-full h-10 px-3 rounded-xl bg-[#0B0B11] border border-violet-300/15 font-mono-tabular text-sm text-zinc-100 focus:outline-none focus:border-violet-400"
              />
            </div>
          ) : (
            <div className="flex flex-col justify-end">
              <div className="h-10 px-3 rounded-xl bg-[#0B0B11]/60 border border-violet-300/10 flex items-center text-xs text-zinc-400">
                Spread between {currentCreationDate} and {todayDhaka}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-zinc-400 mr-1">Quick Totals:</span>
          {[5000, 15000, 20000, 25000, 30000, 50000].map((preset) => (
            <button
              key={preset}
              type="button"
              disabled={busy}
              onClick={() => {
                setDistTotalText(String(preset));
                handleShuffleSplit();
              }}
              className={`px-3 py-1.5 rounded-lg border font-mono-tabular transition-colors whitespace-nowrap shrink-0 ${
                parsedDistTotal === preset
                  ? 'bg-violet-600/25 border-violet-400/50 text-violet-200'
                  : 'bg-white/[0.04] border-violet-300/10 text-zinc-300 hover:bg-white/[0.08]'
              }`}
            >
              {preset.toLocaleString()}
            </button>
          ))}
        </div>

        {members.length === 0 ? (
          <div className="rounded-xl border border-violet-300/10 bg-[#0B0B11]/50 p-5 text-center text-xs text-zinc-400">
            No group members added yet. Add members in Member Management below to distribute random message counts across them.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto border-t border-violet-300/10 pt-3">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="text-xs font-medium text-zinc-400 border-b border-violet-300/10">
                    <th className="py-2.5 px-3">Member</th>
                    <th className="py-2.5 px-3 text-right">Current</th>
                    <th className="py-2.5 px-3 text-right">+ Random Added</th>
                    <th className="py-2.5 px-3 text-right">New Total</th>
                    <th className="py-2.5 px-3 text-right">New Share</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-violet-300/10">
                  {distAllocations.map((alloc) => (
                    <tr key={alloc.memberId}>
                      <td className="py-2.5 px-3 font-medium text-zinc-100">
                        {alloc.displayName}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono-tabular text-zinc-400">
                        {alloc.currentMessages.toLocaleString()}
                      </td>
                      <td
                        className={`py-2.5 px-3 text-right font-mono-tabular font-medium ${
                          alloc.addedMessages > 0 ? 'text-violet-300' : 'text-zinc-500'
                        }`}
                      >
                        +{alloc.addedMessages.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono-tabular text-zinc-100 font-semibold">
                        {alloc.newTotalMessages.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono-tabular text-xs text-zinc-300">
                        {alloc.newSharePct}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pt-1 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-zinc-400">
                Previewing{' '}
                <span className="font-mono-tabular text-zinc-200 font-medium">
                  +{parsedDistTotal.toLocaleString()}
                </span>{' '}
                messages across{' '}
                <span className="font-mono-tabular text-zinc-200 font-medium">
                  {distActiveRecipients}
                </span>{' '}
                {distActiveRecipients === 1 ? 'member' : 'members'}
              </span>
              <button
                type="button"
                disabled={busy || parsedDistTotal < 1 || distActiveRecipients === 0}
                onClick={() => void handleApplyDistribution()}
                className="min-h-[40px] px-5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-medium flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>
                  {busy
                    ? 'Distributing...'
                    : `Apply +${parsedDistTotal.toLocaleString()} Distribution`}
                </span>
              </button>
            </div>
          </>
        )}
      </div>

      {/* 2. Member Management */}
      <div className="glass-panel rounded-2xl p-5 sm:p-6 space-y-5">
        <div className="flex items-center gap-2">
          <UserPlus className="w-4 h-4 text-violet-300" />
          <h2 className="font-display text-lg font-semibold text-zinc-100">
            Member Management ({members.length})
          </h2>
        </div>

        <form
          onSubmit={(e) => void handleAddMember(e)}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3"
        >
          <input
            type="text"
            value={newMemberName}
            onChange={(e) => setNewMemberName(e.target.value)}
            placeholder="Display Name (required)"
            maxLength={80}
            className="h-10 px-3 rounded-xl bg-[#0B0B11] border border-violet-300/15 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-violet-400"
          />
          <input
            type="text"
            value={newMemberHandle}
            onChange={(e) => setNewMemberHandle(e.target.value)}
            placeholder="Official @handle (optional)"
            maxLength={80}
            className="h-10 px-3 rounded-xl bg-[#0B0B11] border border-violet-300/15 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-violet-400"
          />
          <input
            type="url"
            value={newMemberAvatar}
            onChange={(e) => setNewMemberAvatar(e.target.value)}
            placeholder="Avatar HTTPS URL (optional)"
            maxLength={512}
            className="h-10 px-3 rounded-xl bg-[#0B0B11] border border-violet-300/15 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-violet-400"
          />
          <input
            type="number"
            min={0}
            step={1}
            value={newMemberMessagesText}
            onChange={(e) => setNewMemberMessagesText(e.target.value)}
            placeholder="Initial Messages (optional)"
            aria-label="Initial message count"
            className="h-10 px-3 rounded-xl bg-[#0B0B11] border border-violet-300/15 font-mono-tabular text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-violet-400"
          />
          <button
            type="submit"
            disabled={busy}
            className="h-10 px-4 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-medium flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Add Member</span>
          </button>
        </form>

        {members.length > 0 && (
          <div className="overflow-x-auto border-t border-violet-300/10 pt-3">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="text-xs font-medium text-zinc-400 border-b border-violet-300/10">
                  <th className="py-2.5 px-3">Rank</th>
                  <th className="py-2.5 px-3">Display Name</th>
                  <th className="py-2.5 px-3">Handle</th>
                  <th className="py-2.5 px-3 text-right">Lifetime</th>
                  <th className="py-2.5 px-3 text-right">Share</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-violet-300/10">
                {rankedMembers.map((m) => {
                  const isEditing = editingMemberId === m.memberId;
                  const isConfirmDelete = confirmDeleteMemberId === m.memberId;
                  const otherMembersTotal = isEditing
                    ? rankedMembers
                        .filter((other) => other.memberId !== m.memberId)
                        .reduce((acc, other) => acc + other.messagesLifetime, 0)
                    : 0;
                  const draftCount = isEditing
                    ? Math.max(0, Math.floor(Number(editTotalMessagesText) || 0))
                    : m.messagesLifetime;
                  const displaySharePct = isEditing
                    ? calcSharePct(draftCount, otherMembersTotal + draftCount)
                    : m.shareLifetimePct;
                  return (
                    <tr key={m.memberId}>
                      <td className="py-3 px-3 font-mono-tabular text-xs text-violet-300">
                        #{m.rank}
                      </td>
                      <td className="py-3 px-3">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editDisplayName}
                            onChange={(e) => setEditDisplayName(e.target.value)}
                            aria-label="Edit display name"
                            className="h-8 px-2 rounded-lg bg-[#0B0B11] border border-violet-400 text-xs text-zinc-100 w-40"
                          />
                        ) : (
                          <span className="font-medium text-zinc-100">{m.displayName}</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-xs text-zinc-400">
                        {isEditing ? (
                          <div className="flex flex-col sm:flex-row gap-1.5">
                            <input
                              type="text"
                              value={editHandle}
                              onChange={(e) => setEditHandle(e.target.value)}
                              placeholder="@handle"
                              aria-label="Edit handle"
                              className="h-8 px-2 rounded-lg bg-[#0B0B11] border border-violet-300/20 text-xs text-zinc-100 w-28"
                            />
                            <input
                              type="url"
                              value={editAvatar}
                              onChange={(e) => setEditAvatar(e.target.value)}
                              placeholder="https:// avatar"
                              aria-label="Edit avatar URL"
                              className="h-8 px-2 rounded-lg bg-[#0B0B11] border border-violet-300/20 text-xs text-zinc-100 w-36"
                            />
                          </div>
                        ) : (
                          m.handle || '—'
                        )}
                      </td>
                      <td className="py-3 px-3 text-right font-mono-tabular text-zinc-200">
                        {isEditing ? (
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={editTotalMessagesText}
                            onChange={(e) => setEditTotalMessagesText(e.target.value)}
                            aria-label={`Edit lifetime messages for ${m.displayName}`}
                            className="h-8 w-28 sm:w-32 px-2 rounded-lg bg-[#0B0B11] border border-violet-400 font-mono-tabular text-xs text-right text-zinc-100 focus:outline-none"
                          />
                        ) : (
                          m.messagesLifetime.toLocaleString()
                        )}
                      </td>
                      <td className="py-3 px-3 text-right font-mono-tabular text-xs text-zinc-400">
                        {displaySharePct}%
                      </td>
                      <td className="py-3 px-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          {isEditing ? (
                            <>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void handleSaveMemberEdit(m.memberId)}
                                aria-label="Save member"
                                className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-50"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => setEditingMemberId(null)}
                                aria-label="Cancel edit"
                                className="p-1.5 rounded-lg bg-white/[0.06] text-zinc-300 hover:bg-white/[0.1] disabled:opacity-50"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </>
                          ) : isConfirmDelete ? (
                            <>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void handleDeleteMember(m.memberId)}
                                className="px-2.5 py-1 rounded-lg bg-red-600 text-white text-xs font-medium disabled:opacity-50"
                              >
                                Confirm
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteMemberId(null)}
                                className="px-2 py-1 rounded-lg bg-white/[0.06] text-zinc-300 text-xs"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingMemberId(m.memberId);
                                  setEditDisplayName(m.displayName);
                                  setEditHandle(m.handle);
                                  setEditAvatar(m.avatarUrl);
                                  setEditTotalMessagesText(String(m.messagesLifetime));
                                }}
                                aria-label={`Edit ${m.displayName}`}
                                className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.09] text-zinc-300"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteMemberId(m.memberId)}
                                aria-label={`Remove ${m.displayName}`}
                                className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-red-500/20 text-zinc-400 hover:text-red-300"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 3. Authorized Bulk Import & Integration Settings */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="glass-panel rounded-2xl p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Upload className="w-4 h-4 text-violet-300" />
              <h2 className="font-display text-lg font-semibold text-zinc-100">
                Authorized JSON / CSV Import
              </h2>
            </div>
            <label className="cursor-pointer px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-xs font-medium text-zinc-200 border border-violet-300/15">
              Upload File
              <input
                type="file"
                accept=".json,.csv,text/csv,application/json"
                onChange={handleFileImport}
                className="hidden"
              />
            </label>
          </div>
          <p className="text-xs text-zinc-400">
            Paste JSON array or CSV (<code className="text-violet-300">messageId,senderId,senderDisplayName,timestamp</code>). Existing message IDs are automatically skipped.
          </p>
          <textarea
            rows={5}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder={`[\n  { "messageId": "ext_1001", "senderId": "rafi", "senderDisplayName": "Rafi", "timestamp": "2026-11-15T14:20:00Z" }\n]`}
            className="w-full p-3 rounded-xl bg-[#0B0B11] border border-violet-300/15 font-mono-tabular text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-violet-400"
          />
          <button
            type="button"
            disabled={busy || !importText.trim()}
            onClick={() => void handleRunImport()}
            className="min-h-[40px] px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-xs font-medium transition-colors"
          >
            Validate & Import Events
          </button>
        </div>

        <form
          onSubmit={(e) => void handleSaveIntegration(e)}
          className="glass-panel rounded-2xl p-5 sm:p-6 space-y-4"
        >
          <div className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-violet-300" />
            <h2 className="font-display text-lg font-semibold text-zinc-100">
              Integration Adapter Settings
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-zinc-400 mb-1" htmlFor="int-status">
                Connection Status
              </label>
              <select
                id="int-status"
                value={statusInput}
                onChange={(e) => setStatusInput(e.target.value as IntegrationConnectionState)}
                className="w-full h-10 px-3 rounded-xl bg-[#0B0B11] border border-violet-300/15 text-sm text-zinc-100 focus:outline-none focus:border-violet-400"
              >
                <option value="unavailable">Integration unavailable</option>
                <option value="disconnected">Disconnected</option>
                <option value="connected">Connected</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-zinc-400 mb-1" htmlFor="int-header">
                Webhook Signature Header
              </label>
              <input
                id="int-header"
                type="text"
                value={webhookHeaderInput}
                onChange={(e) => setWebhookHeaderInput(e.target.value)}
                maxLength={64}
                className="w-full h-10 px-3 rounded-xl bg-[#0B0B11] border border-violet-300/15 font-mono-tabular text-xs text-zinc-100 focus:outline-none focus:border-violet-400"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1" htmlFor="int-adapter">
              Adapter Name
            </label>
            <input
              id="int-adapter"
              type="text"
              value={adapterNameInput}
              onChange={(e) => setAdapterNameInput(e.target.value)}
              maxLength={80}
              className="w-full h-10 px-3 rounded-xl bg-[#0B0B11] border border-violet-300/15 text-sm text-zinc-100 focus:outline-none focus:border-violet-400"
            />
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1" htmlFor="int-endpoint">
              Authorized Cloud Function Webhook URL
            </label>
            <input
              id="int-endpoint"
              type="text"
              value={endpointInput}
              onChange={(e) => setEndpointInput(e.target.value)}
              maxLength={256}
              className="w-full h-10 px-3 rounded-xl bg-[#0B0B11] border border-violet-300/15 font-mono-tabular text-xs text-zinc-100 focus:outline-none focus:border-violet-400"
            />
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1" htmlFor="int-note">
              API Status / Limitation Notice
            </label>
            <textarea
              id="int-note"
              rows={2}
              value={limitationInput}
              onChange={(e) => setLimitationInput(e.target.value)}
              maxLength={500}
              className="w-full p-2.5 rounded-xl bg-[#0B0B11] border border-violet-300/15 text-xs text-zinc-100 focus:outline-none focus:border-violet-400"
            />
          </div>

          <button
            type="submit"
            disabled={busy}
            className="min-h-[40px] px-4 py-2 rounded-xl bg-white/[0.07] hover:bg-white/[0.12] border border-violet-300/15 text-xs font-medium text-zinc-100 transition-colors"
          >
            Save Adapter Configuration
          </button>
        </form>
      </div>

      {/* 3b. Website Login History (Google Accounts) */}
      <div className="glass-panel rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-violet-300" />
              <h2 className="font-display text-lg font-semibold text-zinc-100">
                Website Login History
              </h2>
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              {userLogins.length} {userLogins.length === 1 ? 'account' : 'accounts'} ·{' '}
              <span className="font-mono-tabular">{totalLoginCountSum.toLocaleString()}</span> total sign-ins · Verified Google accounts only
            </p>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={loginSearch}
              onChange={(e) => setLoginSearch(e.target.value)}
              placeholder="Search name or Gmail..."
              aria-label="Search logged-in Google accounts"
              className="w-full h-10 pl-10 pr-3.5 rounded-xl bg-[#0B0B11] border border-violet-300/15 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-violet-400"
            />
          </div>
        </div>

        {filteredLogins.length === 0 ? (
          <div className="rounded-xl border border-violet-300/10 bg-[#0B0B11]/50 p-6 text-center text-xs text-zinc-400">
            {userLogins.length === 0
              ? 'No verified Google sign-ins recorded yet. Sign-ins are logged automatically when users access the dashboard.'
              : 'No logged-in accounts match your search.'}
          </div>
        ) : (
          <div className="overflow-x-auto border-t border-violet-300/10 pt-3">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="text-xs font-medium text-zinc-400 border-b border-violet-300/10">
                  <th className="py-2.5 px-3">Account</th>
                  <th className="py-2.5 px-3">Gmail Address</th>
                  <th className="py-2.5 px-3 text-right">Logins</th>
                  <th className="py-2.5 px-3 text-right">Last Sign-In (Asia/Dhaka)</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-violet-300/10">
                {filteredLogins.map((u) => {
                  const isConfirmDelete = confirmDeleteLoginUid === u.uid;
                  const isPrimaryAdmin =
                    u.email.toLowerCase() === 'sazzadulislamarafi80@gmail.com';
                  return (
                    <tr key={u.uid}>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-3">
                          <LoginUserAvatar
                            name={u.displayName || u.email || 'Google User'}
                            photoUrl={u.photoUrl}
                          />
                          <div className="min-w-0">
                            <div className="font-medium text-zinc-100 truncate max-w-[180px]">
                              {u.displayName || 'Google User'}
                            </div>
                            <div className="text-xs text-zinc-400">
                              {isPrimaryAdmin ? 'Admin' : 'Viewer'} · {u.uid.slice(0, 8)}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3 font-mono-tabular text-xs text-violet-200">
                        {u.email}
                      </td>
                      <td className="py-3 px-3 text-right font-mono-tabular text-zinc-200">
                        {(u.loginCount || 1).toLocaleString()}
                      </td>
                      <td className="py-3 px-3 text-right font-mono-tabular text-xs text-zinc-400 whitespace-nowrap">
                        {formatDhakaDateTime(u.lastLoginIso)}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          {isConfirmDelete ? (
                            <>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void handleDeleteLoginRecord(u.uid)}
                                className="px-2.5 py-1 rounded-lg bg-red-600 text-white text-xs font-medium disabled:opacity-50"
                              >
                                Confirm
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteLoginUid(null)}
                                className="px-2 py-1 rounded-lg bg-white/[0.06] text-zinc-300 text-xs"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteLoginUid(u.uid)}
                              aria-label={`Remove login entry for ${u.email}`}
                              className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-red-500/20 text-zinc-400 hover:text-red-300"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 4. Exports & Danger Zone Reset */}
      <div className="glass-panel rounded-2xl p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => exportDailyReportPdf(group, metrics, rankedMembers, todayEvents, todayDhaka)}
            className="min-h-[40px] px-3.5 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-violet-300/15 text-xs font-medium text-zinc-100 flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5 text-violet-300" />
            <span>Daily PDF</span>
          </button>
          <button
            type="button"
            onClick={() => exportMonthlyReportPdf(group, dailyStats, rankedMembers)}
            className="min-h-[40px] px-3.5 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-violet-300/15 text-xs font-medium text-zinc-100 flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5 text-violet-300" />
            <span>Monthly PDF</span>
          </button>
          <button
            type="button"
            onClick={() => exportMemberStatisticsCsv(rankedMembers)}
            className="min-h-[40px] px-3.5 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-violet-300/15 text-xs font-medium text-zinc-100 flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5 text-violet-300" />
            <span>Members CSV</span>
          </button>
          <button
            type="button"
            onClick={() => exportLifetimeStatisticsCsv(group, dailyStats, metrics)}
            className="min-h-[40px] px-3.5 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-violet-300/15 text-xs font-medium text-zinc-100 flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5 text-violet-300" />
            <span>Lifetime CSV</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => setShowResetBox((v) => !v)}
          className="min-h-[40px] px-4 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-400/25 text-xs font-medium text-red-200 flex items-center gap-2 self-start lg:self-auto"
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>Reset Analytics</span>
        </button>
      </div>

      {showResetBox && (
        <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-5 space-y-4">
          <div className="text-sm font-semibold text-red-200">
            Confirm Analytics Reset
          </div>
          <p className="text-xs text-red-200/80">
            This deletes all recorded message events, daily rollups, and monthly rollups from Firestore. Type <code className="font-mono-tabular font-bold">RESET</code> below to confirm.
          </p>
          <label className="flex items-center gap-2 text-xs text-zinc-200 cursor-pointer">
            <input
              type="checkbox"
              checked={keepMembersOnReset}
              onChange={(e) => setKeepMembersOnReset(e.target.checked)}
              className="rounded border-red-400/40"
            />
            <span>Keep member profiles (zero out their message counts instead of deleting them)</span>
          </label>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={resetPhrase}
              onChange={(e) => setResetPhrase(e.target.value)}
              placeholder="Type RESET"
              className="h-10 px-3 rounded-xl bg-[#09090D] border border-red-400/30 font-mono-tabular text-sm text-zinc-100 sm:w-52"
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleResetConfirm()}
              className="h-10 px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-medium"
            >
              Confirm Permanent Reset
            </button>
            <button
              type="button"
              onClick={() => {
                setShowResetBox(false);
                setResetPhrase('');
              }}
              className="h-10 px-4 rounded-xl bg-white/[0.06] text-zinc-200 text-xs font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
