import type { AuthorizedIncomingEvent, MemberRecord, RankedMember } from '../types/analytics';
import { dhakaDateAndTimeToIso, getDhakaDateKey, getRecentDhakaDateKeys } from './dhakaTime';
import { calcSharePct } from './metrics';
import { sanitizeFirestoreId } from '../services/integrationAdapter';

export type DistributionParticipantMode = 'all' | 'subset';
export type DistributionSpreadMode = 'single' | '7d' | '30d';

export interface MemberAllocationPreview {
  memberId: string;
  displayName: string;
  handle: string;
  avatarUrl: string;
  currentMessages: number;
  addedMessages: number;
  newTotalMessages: number;
  newSharePct: number;
}

// Deterministic Mulberry32 PRNG so preview matches submitted distribution for a given seed
function createSeededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function allocateIntegerByWeights(
  total: number,
  weights: number[],
  rng: () => number,
  ensureMinOneWhenPossible: boolean
): number[] {
  const n = weights.length;
  if (n === 0 || total <= 0) return new Array(n).fill(0);

  if (total < n) {
    // Pick `total` distinct indices randomly to receive 1 message each
    const indices = Array.from({ length: n }, (_, i) => i);
    for (let i = indices.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    const result = new Array(n).fill(0);
    for (let i = 0; i < total; i += 1) {
      result[indices[i]] = 1;
    }
    return result;
  }

  const base = ensureMinOneWhenPossible ? 1 : 0;
  const remainingTotal = total - base * n;
  const weightSum = weights.reduce((acc, w) => acc + w, 0) || n;

  const exact = weights.map((w) => (remainingTotal * w) / weightSum);
  const floors = exact.map((val) => base + Math.floor(val));
  let leftover = total - floors.reduce((acc, v) => acc + v, 0);

  const remainders = exact.map((val, idx) => ({
    idx,
    frac: val - Math.floor(val),
    tie: rng(),
  }));
  remainders.sort((a, b) => (b.frac !== a.frac ? b.frac - a.frac : b.tie - a.tie));

  for (let i = 0; i < leftover; i += 1) {
    floors[remainders[i % n].idx] += 1;
  }

  return floors;
}

export function computeRandomMemberAllocations(params: {
  rankedMembers: RankedMember[];
  totalToAdd: number;
  participantMode: DistributionParticipantMode;
  seed: number;
}): MemberAllocationPreview[] {
  const { rankedMembers, totalToAdd, participantMode, seed } = params;
  const n = rankedMembers.length;
  if (n === 0) return [];

  const safeTotal = Math.max(0, Math.floor(totalToAdd));
  const rng = createSeededRng(seed);

  // Pick participating indices
  const allIndices = Array.from({ length: n }, (_, i) => i);
  let activeIndices = allIndices;

  if (participantMode === 'subset' && n > 1) {
    const shuffled = [...allIndices];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const minKeep = Math.max(2, Math.ceil(n * 0.55));
    const keepCount = minKeep + Math.floor(rng() * (n - minKeep + 1));
    activeIndices = shuffled.slice(0, keepCount);
  }

  // Generate varied random weights (ratio up to ~5.5x between members for natural 4k / 6k / 8k spread)
  const activeWeights = activeIndices.map(() => 0.3 + rng() * 1.65);
  const activeAmounts = allocateIntegerByWeights(safeTotal, activeWeights, rng, true);

  const addedByMemberId = new Map<string, number>();
  activeIndices.forEach((memberIdx, pos) => {
    addedByMemberId.set(rankedMembers[memberIdx].memberId, activeAmounts[pos] ?? 0);
  });

  const preliminary = rankedMembers.map((m) => {
    const added = addedByMemberId.get(m.memberId) ?? 0;
    const newTotal = m.messagesLifetime + added;
    return {
      memberId: m.memberId,
      displayName: m.displayName,
      handle: m.handle,
      avatarUrl: m.avatarUrl,
      currentMessages: m.messagesLifetime,
      addedMessages: added,
      newTotalMessages: newTotal,
      newSharePct: 0,
    };
  });

  const grandNewTotal = preliminary.reduce((sum, m) => sum + m.newTotalMessages, 0);
  return preliminary.map((item) => ({
    ...item,
    newSharePct: calcSharePct(item.newTotalMessages, grandNewTotal),
  }));
}

export function buildDistributedIncomingEvents(params: {
  allocations: MemberAllocationPreview[];
  members: MemberRecord[];
  spreadMode: DistributionSpreadMode;
  targetDateDhaka: string;
  targetTimeDhaka: string;
  creationDate: string;
  seed: number;
}): AuthorizedIncomingEvent[] {
  const {
    allocations,
    members,
    spreadMode,
    targetDateDhaka,
    targetTimeDhaka,
    creationDate,
    seed,
  } = params;

  const todayDhaka = getDhakaDateKey();
  const rng = createSeededRng(seed ^ 0x9e3779b9);
  const memberLookup = new Map<string, MemberRecord>();
  members.forEach((m) => memberLookup.set(m.memberId, m));

  let candidateDates = [targetDateDhaka];
  if (spreadMode === '7d' || spreadMode === '30d') {
    const dayCount = spreadMode === '7d' ? 7 : 30;
    const recent = getRecentDhakaDateKeys(dayCount, todayDhaka).filter(
      (key) => key >= creationDate
    );
    candidateDates = recent.length > 0 ? recent : [todayDhaka];
  }

  const events: AuthorizedIncomingEvent[] = [];
  const batchNonce = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

  for (const alloc of allocations) {
    if (alloc.addedMessages <= 0) continue;
    const member = memberLookup.get(alloc.memberId);

    if (candidateDates.length === 1) {
      const dateKey = candidateDates[0];
      events.push({
        messageId: sanitizeFirestoreId(
          `dist_${alloc.memberId}_${dateKey}_${batchNonce}`,
          'msg'
        ),
        senderId: alloc.memberId,
        senderDisplayName: alloc.displayName,
        timestamp: dhakaDateAndTimeToIso(dateKey, targetTimeDhaka),
        handle: member?.handle ?? alloc.handle,
        avatarUrl: member?.avatarUrl ?? alloc.avatarUrl,
        source: 'admin_manual',
        messageCount: alloc.addedMessages,
      });
      continue;
    }

    // Spread this member's addedMessages across random dates in candidateDates
    const dayWeights = candidateDates.map(() => 0.25 + rng() * 1.5);
    const perDayAmounts = allocateIntegerByWeights(
      alloc.addedMessages,
      dayWeights,
      rng,
      false
    );

    perDayAmounts.forEach((amount, idx) => {
      if (amount <= 0) return;
      const dateKey = candidateDates[idx];
      const hour = String(Math.floor(rng() * 24)).padStart(2, '0');
      const minute = String(Math.floor(rng() * 60)).padStart(2, '0');
      events.push({
        messageId: sanitizeFirestoreId(
          `dist_${alloc.memberId}_${dateKey}_${idx}_${batchNonce}`,
          'msg'
        ),
        senderId: alloc.memberId,
        senderDisplayName: alloc.displayName,
        timestamp: dhakaDateAndTimeToIso(dateKey, `${hour}:${minute}`),
        handle: member?.handle ?? alloc.handle,
        avatarUrl: member?.avatarUrl ?? alloc.avatarUrl,
        source: 'admin_manual',
        messageCount: amount,
      });
    });
  }

  return events;
}
