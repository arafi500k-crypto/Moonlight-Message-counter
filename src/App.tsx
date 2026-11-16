import { useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { AlertCircle } from 'lucide-react';
import { AdminPanelView } from './components/AdminPanelView';
import { AnalyticsView } from './components/AnalyticsView';
import { AuthGate } from './components/AuthGate';
import { DashboardView } from './components/DashboardView';
import { GroupInfoView } from './components/GroupInfoView';
import { MembersView } from './components/MembersView';
import { MessageHistoryView } from './components/MessageHistoryView';
import { SettingsView } from './components/SettingsView';
import { SidebarNav } from './components/SidebarNav';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from './lib/firebase';
import { bootstrapWorkspaceIfMissing, recordUserLogin } from './services/firestoreAnalytics';
import { GROUP_ID } from './services/integrationAdapter';
import type {
  AdminSettingsRecord,
  DailyStatisticRecord,
  GroupRecord,
  IntegrationStatusRecord,
  MemberRecord,
  MessageEventRecord,
  MonthlyStatisticRecord,
  NavSection,
  UserLoginRecord,
} from './types/analytics';
import { getDhakaDateKey } from './utils/dhakaTime';
import { computeDashboardMetrics, computeRankedMembers } from './utils/metrics';

const BOOTSTRAPPED_ADMIN_EMAIL = 'sazzadulislamarafi80@gmail.com';

export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [hasAdminDoc, setHasAdminDoc] = useState(false);

  const [activeSection, setActiveSection] = useState<NavSection>('dashboard');
  const [runtimeError, setRuntimeError] = useState<string | null>(null);

  // Live Firestore states
  const [group, setGroup] = useState<GroupRecord | null>(null);
  const [integration, setIntegration] = useState<IntegrationStatusRecord | null>(null);
  const [adminSettings, setAdminSettings] = useState<AdminSettingsRecord | null>(null);
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [dailyStats, setDailyStats] = useState<DailyStatisticRecord[]>([]);
  const [monthlyStats, setMonthlyStats] = useState<MonthlyStatisticRecord[]>([]);
  const [events, setEvents] = useState<MessageEventRecord[]>([]);
  const [userLogins, setUserLogins] = useState<UserLoginRecord[]>([]);
  const recordedLoginUidRef = useRef<string | null>(null);

  const isBootstrappedAdmin = Boolean(
    user && user.emailVerified && user.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL
  );
  const isAdmin = isBootstrappedAdmin || hasAdminDoc;

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
      if (!nextUser) {
        recordedLoginUidRef.current = null;
        setHasAdminDoc(false);
        setGroup(null);
        setIntegration(null);
        setAdminSettings(null);
        setMembers([]);
        setDailyStats([]);
        setMonthlyStats([]);
        setEvents([]);
        setUserLogins([]);
      }
    });
    return () => unsub();
  }, []);

  // Check /admins/{uid} document when authenticated
  useEffect(() => {
    if (!authReady || !user || !user.emailVerified) return;

    const adminRef = doc(db, 'admins', user.uid);
    const unsub = onSnapshot(
      adminRef,
      (snap) => {
        setHasAdminDoc(snap.exists());
      },
      (err) => {
        // Non-bootstrapped non-admins simply don't have an admin doc; ignore permission error if not admin
        if (!isBootstrappedAdmin) {
          setHasAdminDoc(false);
          return;
        }
        handleFirestoreError(err, OperationType.GET, `admins/${user.uid}`);
      }
    );
    return () => unsub();
  }, [authReady, user, isBootstrappedAdmin]);

  // Record verified Google sign-in once per authenticated session
  useEffect(() => {
    if (!authReady || !user || !user.emailVerified) return;
    if (recordedLoginUidRef.current === user.uid) return;
    recordedLoginUidRef.current = user.uid;
    void recordUserLogin().catch(() => {
      // Structured Firestore error already logged in handleFirestoreError
    });
  }, [authReady, user]);

  // Bootstrap base group docs automatically for admin on first sign-in
  useEffect(() => {
    if (!authReady || !user || !isAdmin) return;
    void bootstrapWorkspaceIfMissing(getDhakaDateKey()).catch((err) => {
      setRuntimeError(err instanceof Error ? err.message : 'Failed to initialize Firestore workspace.');
    });
  }, [authReady, user, isAdmin]);

  // Real-time Firestore listeners (strictly attached only when authenticated & email verified)
  useEffect(() => {
    if (!authReady || !user || !user.emailVerified) return;

    setRuntimeError(null);

    const unsubGroup = onSnapshot(
      doc(db, 'groups', GROUP_ID),
      (snap) => {
        setGroup(snap.exists() ? (snap.data() as GroupRecord) : null);
      },
      (err) => {
        setRuntimeError(err.message);
        handleFirestoreError(err, OperationType.GET, `groups/${GROUP_ID}`);
      }
    );

    const unsubIntegration = onSnapshot(
      doc(db, 'integrationStatus', GROUP_ID),
      (snap) => {
        setIntegration(snap.exists() ? (snap.data() as IntegrationStatusRecord) : null);
      },
      (err) => {
        setRuntimeError(err.message);
        handleFirestoreError(err, OperationType.GET, `integrationStatus/${GROUP_ID}`);
      }
    );

    const unsubMembers = onSnapshot(
      query(collection(db, 'members'), where('groupId', '==', GROUP_ID)),
      (snap) => {
        setMembers(snap.docs.map((d) => d.data() as MemberRecord));
      },
      (err) => {
        setRuntimeError(err.message);
        handleFirestoreError(err, OperationType.LIST, 'members');
      }
    );

    const unsubDaily = onSnapshot(
      query(collection(db, 'dailyStatistics'), where('groupId', '==', GROUP_ID)),
      (snap) => {
        setDailyStats(snap.docs.map((d) => d.data() as DailyStatisticRecord));
      },
      (err) => {
        setRuntimeError(err.message);
        handleFirestoreError(err, OperationType.LIST, 'dailyStatistics');
      }
    );

    const unsubMonthly = onSnapshot(
      query(collection(db, 'monthlyStatistics'), where('groupId', '==', GROUP_ID)),
      (snap) => {
        setMonthlyStats(snap.docs.map((d) => d.data() as MonthlyStatisticRecord));
      },
      (err) => {
        setRuntimeError(err.message);
        handleFirestoreError(err, OperationType.LIST, 'monthlyStatistics');
      }
    );

    const unsubEvents = onSnapshot(
      query(collection(db, 'messageEvents'), where('groupId', '==', GROUP_ID)),
      (snap) => {
        setEvents(snap.docs.map((d) => d.data() as MessageEventRecord));
      },
      (err) => {
        setRuntimeError(err.message);
        handleFirestoreError(err, OperationType.LIST, 'messageEvents');
      }
    );

    return () => {
      unsubGroup();
      unsubIntegration();
      unsubMembers();
      unsubDaily();
      unsubMonthly();
      unsubEvents();
    };
  }, [authReady, user]);

  // Admin-only settings & login log listeners
  useEffect(() => {
    if (!authReady || !user || !isAdmin) return;
    const unsubSettings = onSnapshot(
      doc(db, 'adminSettings', GROUP_ID),
      (snap) => {
        setAdminSettings(snap.exists() ? (snap.data() as AdminSettingsRecord) : null);
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, `adminSettings/${GROUP_ID}`);
      }
    );

    const unsubLogins = onSnapshot(
      query(collection(db, 'userLogins'), where('groupId', '==', GROUP_ID)),
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as UserLoginRecord)
          .sort((a, b) => (b.lastLoginIso || '').localeCompare(a.lastLoginIso || ''));
        setUserLogins(list);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'userLogins');
      }
    );

    return () => {
      unsubSettings();
      unsubLogins();
    };
  }, [authReady, user, isAdmin]);

  const creationDate = group?.creationDate || adminSettings?.groupCreationDate || getDhakaDateKey();

  const metrics = useMemo(
    () => computeDashboardMetrics(group, members, dailyStats, events),
    [group, members, dailyStats, events]
  );

  const rankedMembers = useMemo(
    () => computeRankedMembers(members, events, creationDate, 'lifetime'),
    [members, events, creationDate]
  );

  const handleSignIn = async () => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Google sign-in failed.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
  };

  if (!authReady) {
    return (
      <div className="min-h-screen bg-[#09090D] flex items-center justify-center text-sm text-zinc-400">
        Connecting to MoonLight Gang Analytics...
      </div>
    );
  }

  if (!user || !user.emailVerified) {
    return (
      <AuthGate
        onSignIn={handleSignIn}
        loading={authLoading}
        error={
          user && !user.emailVerified
            ? 'Your Google account email must be verified to access Firestore analytics.'
            : authError
        }
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#09090D] text-zinc-100">
      <SidebarNav
        activeSection={activeSection}
        onSelect={setActiveSection}
        userEmail={user.email || user.uid}
        isAdmin={isAdmin}
        onSignOut={() => void handleSignOut()}
      />

      <main className="md:pl-64 pb-24 md:pb-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
          {runtimeError && (
            <div className="rounded-xl border border-red-400/25 bg-red-500/10 p-4 flex items-start gap-2.5 text-xs text-red-200">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{runtimeError}</span>
            </div>
          )}

          {activeSection === 'dashboard' && (
            <DashboardView
              group={group}
              integration={integration}
              metrics={metrics}
              dailyStats={dailyStats}
              rankedMembers={rankedMembers}
              isAdmin={isAdmin}
              onNavigate={setActiveSection}
            />
          )}

          {activeSection === 'members' && (
            <MembersView members={members} events={events} creationDate={creationDate} />
          )}

          {activeSection === 'history' && (
            <MessageHistoryView
              events={events}
              dailyStats={dailyStats}
              monthlyStats={monthlyStats}
              members={members}
              creationDate={creationDate}
            />
          )}

          {activeSection === 'analytics' && (
            <AnalyticsView
              dailyStats={dailyStats}
              monthlyStats={monthlyStats}
              rankedMembers={rankedMembers}
              metrics={metrics}
              creationDate={creationDate}
            />
          )}

          {activeSection === 'group' && (
            <GroupInfoView
              group={group}
              integration={integration}
              metrics={metrics}
              isAdmin={isAdmin}
              onNavigate={setActiveSection}
            />
          )}

          {activeSection === 'settings' && (
            <SettingsView
              group={group}
              integration={integration}
              dailyStats={dailyStats}
              rankedMembers={rankedMembers}
              events={events}
              metrics={metrics}
            />
          )}

          {activeSection === 'admin' && (
            <AdminPanelView
              isAdmin={isAdmin}
              userEmail={user.email || user.uid}
              group={group}
              integration={integration}
              adminSettings={adminSettings}
              members={members}
              rankedMembers={rankedMembers}
              dailyStats={dailyStats}
              monthlyStats={monthlyStats}
              events={events}
              metrics={metrics}
              userLogins={userLogins}
            />
          )}
        </div>
      </main>
    </div>
  );
}
