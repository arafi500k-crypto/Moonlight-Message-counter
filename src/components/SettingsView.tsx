import { Download, FileText, Globe, Server, Shield } from 'lucide-react';
import { FIREBASE_PROJECT_ID, FIRESTORE_DATABASE_ID } from '../lib/firebase';
import type {
  DailyStatisticRecord,
  DashboardMetrics,
  GroupRecord,
  IntegrationStatusRecord,
  MessageEventRecord,
  RankedMember,
} from '../types/analytics';
import { getDhakaDateKey, getDhakaMonthKey } from '../utils/dhakaTime';
import {
  exportDailyReportPdf,
  exportLifetimeStatisticsCsv,
  exportMemberStatisticsCsv,
  exportMonthlyReportPdf,
} from '../utils/exportReports';

interface SettingsViewProps {
  group: GroupRecord | null;
  integration: IntegrationStatusRecord | null;
  dailyStats: DailyStatisticRecord[];
  rankedMembers: RankedMember[];
  events: MessageEventRecord[];
  metrics: DashboardMetrics;
}

export function SettingsView({
  group,
  integration,
  dailyStats,
  rankedMembers,
  events,
  metrics,
}: SettingsViewProps) {
  const todayKey = getDhakaDateKey();
  const monthKey = getDhakaMonthKey();
  const todayEvents = events.filter((e) => e.dateKeyDhaka === todayKey);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-semibold text-zinc-50 tracking-tight">
          Settings, Reports & Deployment
        </h1>
        <p className="text-sm text-zinc-400 mt-1">
          Export PDF/CSV reports, inspect timezone configuration, and review Firebase deployment commands
        </p>
      </div>

      {/* Reports & Export Center */}
      <div className="glass-panel rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-violet-300" />
          <h2 className="font-display text-lg font-semibold text-zinc-100">
            Reports & Data Exports
          </h2>
        </div>
        <p className="text-xs text-zinc-400">
          Generate formatted PDF summaries or machine-readable CSV datasets calculated in Asia/Dhaka.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <button
            type="button"
            onClick={() =>
              exportDailyReportPdf(group, metrics, rankedMembers, todayEvents, todayKey)
            }
            className="min-h-[44px] px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
          >
            <Download className="w-4 h-4 shrink-0" />
            <span>Daily Report (PDF)</span>
          </button>

          <button
            type="button"
            onClick={() => exportMonthlyReportPdf(group, dailyStats, rankedMembers, monthKey)}
            className="min-h-[44px] px-4 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-violet-300/15 text-zinc-100 text-xs font-medium flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
          >
            <Download className="w-4 h-4 text-violet-300 shrink-0" />
            <span>Monthly Report (PDF)</span>
          </button>

          <button
            type="button"
            onClick={() => exportMemberStatisticsCsv(rankedMembers)}
            className="min-h-[44px] px-4 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-violet-300/15 text-zinc-100 text-xs font-medium flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
          >
            <Download className="w-4 h-4 text-violet-300 shrink-0" />
            <span>Member Stats (CSV)</span>
          </button>

          <button
            type="button"
            onClick={() => exportLifetimeStatisticsCsv(group, dailyStats, metrics)}
            className="min-h-[44px] px-4 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-violet-300/15 text-zinc-100 text-xs font-medium flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
          >
            <Download className="w-4 h-4 text-violet-300 shrink-0" />
            <span>Lifetime Stats (CSV)</span>
          </button>
        </div>
      </div>

      {/* Active Runtime Configuration */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-panel rounded-2xl p-5 sm:p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-violet-300" />
            <h2 className="font-display text-lg font-semibold text-zinc-100">
              Runtime & Firestore Target
            </h2>
          </div>

          <div className="space-y-2.5 text-xs">
            <div className="flex justify-between gap-4 py-1.5 border-b border-violet-300/10">
              <span className="text-zinc-400">Firebase Project ID</span>
              <span className="font-mono-tabular text-zinc-200">{FIREBASE_PROJECT_ID}</span>
            </div>
            <div className="flex justify-between gap-4 py-1.5 border-b border-violet-300/10">
              <span className="text-zinc-400">Firestore Database ID</span>
              <span className="font-mono-tabular text-zinc-200 truncate max-w-[260px]">
                {FIRESTORE_DATABASE_ID}
              </span>
            </div>
            <div className="flex justify-between gap-4 py-1.5 border-b border-violet-300/10">
              <span className="text-zinc-400">Active Timezone</span>
              <span className="font-mono-tabular text-zinc-200">Asia/Dhaka (UTC+06:00)</span>
            </div>
            <div className="flex justify-between gap-4 py-1.5">
              <span className="text-zinc-400">Cloud Function Endpoint</span>
              <span className="font-mono-tabular text-violet-300 truncate max-w-[260px]">
                {integration?.endpointUrl || 'Not configured'}
              </span>
            </div>
          </div>
        </div>

        <div className="glass-panel rounded-2xl p-5 sm:p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-violet-300" />
            <h2 className="font-display text-lg font-semibold text-zinc-100">
              Security & Deduplication Policy
            </h2>
          </div>
          <ul className="space-y-2 text-xs text-zinc-300 leading-relaxed">
            <li>1. Unique <code className="text-violet-300">messageId</code> document keys prevent duplicate counting across replays and retries.</li>
            <li>2. Zero private message text or media payloads are stored in Firestore (<code className="text-violet-300">messageEvents</code> retains metadata only).</li>
            <li>3. Client writes are restricted to verified admin accounts enforced by <code className="text-violet-300">firestore.rules</code>.</li>
            <li>4. Server-side Cloud Function ingestion validates a shared webhook signature header before committing transactional updates.</li>
          </ul>
        </div>
      </div>

      {/* Deployment Commands */}
      <div className="glass-panel rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Server className="w-4 h-4 text-violet-300" />
          <h2 className="font-display text-lg font-semibold text-zinc-100">
            Firebase CLI Deployment Guide
          </h2>
        </div>
        <p className="text-xs text-zinc-400">
          Use the bundled <code className="text-violet-300">firebase.json</code>,{' '}
          <code className="text-violet-300">firestore.rules</code>,{' '}
          <code className="text-violet-300">firestore.indexes.json</code>, and{' '}
          <code className="text-violet-300">functions/src/index.ts</code> to deploy rules, Cloud Functions, and Hosting:
        </p>
        <pre className="p-4 rounded-xl bg-[#09090D] border border-violet-300/10 text-xs font-mono-tabular text-zinc-200 overflow-x-auto leading-relaxed">
{`# 1. Authenticate & select Firebase project
firebase login
firebase use ${FIREBASE_PROJECT_ID}

# 2. Deploy Firestore security rules & composite indexes
firebase deploy --only firestore:rules,firestore:indexes

# 3. Configure Cloud Function webhook secret & deploy functions
firebase functions:secrets:set MOONLIGHT_WEBHOOK_SECRET
cd functions && npm install && npm run build && cd ..
firebase deploy --only functions

# 4. Build frontend & deploy to Firebase Hosting
npm run build
firebase deploy --only hosting`}
        </pre>
      </div>
    </div>
  );
}
