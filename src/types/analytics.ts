export type NavSection =
  | 'dashboard'
  | 'members'
  | 'history'
  | 'analytics'
  | 'group'
  | 'settings'
  | 'admin';

export type IntegrationConnectionState = 'connected' | 'disconnected' | 'unavailable';

export type MessageSource = 'official_webhook' | 'authorized_import' | 'admin_manual';

export type RankingSortPeriod = 'daily' | 'weekly' | 'monthly' | 'lifetime';

export interface GroupRecord {
  groupId: string;
  name: string;
  platform: string;
  creationDate: string; // YYYY-MM-DD (Asia/Dhaka)
  timezone: string;
  totalMembers: number;
  totalLifetimeMessages: number;
  totalActiveDays: number;
  highestDailyCount: number;
  highestDailyDate: string;
  updatedAt?: unknown;
  updatedBy: string;
}

export interface MemberRecord {
  memberId: string;
  groupId: string;
  displayName: string;
  handle: string;
  avatarUrl: string;
  totalMessages: number;
  lastActiveAt: string;
  lastActiveDateDhaka: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface MessageEventRecord {
  messageId: string;
  groupId: string;
  senderId: string;
  senderDisplayName: string;
  timestamp: string;
  receivedTimestamp?: unknown;
  dateKeyDhaka: string;
  monthKeyDhaka: string;
  source: MessageSource;
  createdBy: string;
  messageCount?: number;
}

export interface DailyStatisticRecord {
  dateKey: string;
  groupId: string;
  monthKey: string;
  totalMessages: number;
  activeMemberCount: number;
  updatedAt?: unknown;
}

export interface MonthlyStatisticRecord {
  monthKey: string;
  groupId: string;
  totalMessages: number;
  activeDays: number;
  peakDailyMessages: number;
  peakDate: string;
  updatedAt?: unknown;
}

export interface IntegrationStatusRecord {
  groupId: string;
  status: IntegrationConnectionState;
  adapterName: string;
  endpointUrl: string;
  limitationNote: string;
  lastHeartbeatAt: string;
  lastEventAt: string;
  eventsProcessedCount: number;
  updatedAt?: unknown;
  updatedBy: string;
}

export interface AdminSettingsRecord {
  groupId: string;
  groupCreationDate: string;
  timezone: string;
  deduplicationEnabled: boolean;
  storeMetadataOnly: boolean;
  webhookHeaderName: string;
  updatedAt?: unknown;
  updatedBy: string;
}

export interface RankedMember extends MemberRecord {
  messagesToday: number;
  messagesThisWeek: number;
  messagesThisMonth: number;
  messagesLifetime: number;
  shareTodayPct: number;
  shareWeekPct: number;
  shareMonthPct: number;
  shareLifetimePct: number;
  rank: number;
}

export interface DashboardMetrics {
  todayMessages: number;
  yesterdayMessages: number;
  lifetimeMessages: number;
  weekMessages: number;
  monthMessages: number;
  totalMembers: number;
  activeMembersToday: number;
  averageDailyMessages: number;
  activeDaysSinceCreation: number;
  elapsedDaysSinceCreation: number;
  highestDailyCount: number;
  highestDailyDate: string;
  todayShareOfWeekPct: number;
  todayVsYesterdayPct: number | null;
}

export interface AuthorizedIncomingEvent {
  messageId: string;
  senderId: string;
  senderDisplayName: string;
  timestamp: string;
  handle?: string;
  avatarUrl?: string;
  source?: MessageSource;
  messageCount?: number;
}

export interface UserLoginRecord {
  uid: string;
  groupId: string;
  email: string;
  displayName: string;
  photoUrl: string;
  loginCount: number;
  firstLoginAt?: unknown;
  lastLoginAt?: unknown;
  lastLoginIso: string;
  updatedAt?: unknown;
}
