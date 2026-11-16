import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { auth, db, FIREBASE_PROJECT_ID, handleFirestoreError, OperationType } from '../lib/firebase';
import type {
  AuthorizedIncomingEvent,
  DailyStatisticRecord,
  GroupRecord,
  IntegrationConnectionState,
  MemberRecord,
  MessageEventRecord,
  MonthlyStatisticRecord,
} from '../types/analytics';
import { getDhakaDateKey, getDhakaMonthKey } from '../utils/dhakaTime';
import {
  GROUP_ID,
  GROUP_NAME,
  OFFICIAL_API_LIMITATION_NOTE,
  PLATFORM_NAME,
  sanitizeFirestoreId,
} from './integrationAdapter';

function requireVerifiedUid(): string {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) {
    throw new Error('Verified administrator authentication is required.');
  }
  return user.uid;
}

export async function bootstrapWorkspaceIfMissing(defaultCreationDate: string): Promise<void> {
  const uid = requireVerifiedUid();
  const groupRef = doc(db, 'groups', GROUP_ID);
  const statusRef = doc(db, 'integrationStatus', GROUP_ID);
  const settingsRef = doc(db, 'adminSettings', GROUP_ID);

  try {
    const [groupSnap, statusSnap, settingsSnap] = await Promise.all([
      getDoc(groupRef),
      getDoc(statusRef),
      getDoc(settingsRef),
    ]);

    const batch = writeBatch(db);
    let hasWrites = false;

    if (!groupSnap.exists()) {
      batch.set(groupRef, {
        groupId: GROUP_ID,
        name: GROUP_NAME,
        platform: PLATFORM_NAME,
        creationDate: defaultCreationDate,
        timezone: 'Asia/Dhaka',
        totalMembers: 0,
        totalLifetimeMessages: 0,
        totalActiveDays: 0,
        highestDailyCount: 0,
        highestDailyDate: '',
        updatedAt: serverTimestamp(),
        updatedBy: uid,
      });
      hasWrites = true;
    }

    if (!statusSnap.exists()) {
      batch.set(statusRef, {
        groupId: GROUP_ID,
        status: 'unavailable',
        adapterName: 'Authorized Webhook & Manual Ledger Adapter',
        endpointUrl: `https://us-central1-${FIREBASE_PROJECT_ID}.cloudfunctions.net/ingestMoonlightMessage`,
        limitationNote: OFFICIAL_API_LIMITATION_NOTE.slice(0, 500),
        lastHeartbeatAt: '',
        lastEventAt: '',
        eventsProcessedCount: 0,
        updatedAt: serverTimestamp(),
        updatedBy: uid,
      });
      hasWrites = true;
    }

    if (!settingsSnap.exists()) {
      batch.set(settingsRef, {
        groupId: GROUP_ID,
        groupCreationDate: defaultCreationDate,
        timezone: 'Asia/Dhaka',
        deduplicationEnabled: true,
        storeMetadataOnly: true,
        webhookHeaderName: 'x-moonlight-signature',
        updatedAt: serverTimestamp(),
        updatedBy: uid,
      });
      hasWrites = true;
    }

    if (hasWrites) {
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `groups/${GROUP_ID}`);
  }
}

export async function recordUserLogin(): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified || !user.email) {
    return;
  }

  const safeEmail = user.email.trim().slice(0, 160);
  const safeName = (user.displayName || safeEmail.split('@')[0] || 'Google User')
    .trim()
    .slice(0, 100);
  const safePhoto =
    user.photoURL && user.photoURL.startsWith('https://') ? user.photoURL.slice(0, 512) : '';
  const nowIso = new Date().toISOString().slice(0, 40);
  const loginRef = doc(db, 'userLogins', user.uid);

  try {
    const snap = await getDoc(loginRef);
    if (!snap.exists()) {
      await setDoc(loginRef, {
        uid: user.uid,
        groupId: GROUP_ID,
        email: safeEmail,
        displayName: safeName,
        photoUrl: safePhoto,
        loginCount: 1,
        firstLoginAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
        lastLoginIso: nowIso,
        updatedAt: serverTimestamp(),
      });
    } else {
      const prevCount = Number(snap.data()?.loginCount || 0);
      await updateDoc(loginRef, {
        email: safeEmail,
        displayName: safeName,
        photoUrl: safePhoto,
        loginCount: prevCount + 1,
        lastLoginAt: serverTimestamp(),
        lastLoginIso: nowIso,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `userLogins/${user.uid}`);
  }
}

export async function removeUserLoginRecord(targetUid: string): Promise<void> {
  requireVerifiedUid();
  const safeUid = sanitizeFirestoreId(targetUid, 'usr');
  try {
    await deleteDoc(doc(db, 'userLogins', safeUid));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `userLogins/${safeUid}`);
  }
}

export async function upsertMember(params: {
  memberId?: string;
  displayName: string;
  handle?: string;
  avatarUrl?: string;
}): Promise<string> {
  const uid = requireVerifiedUid();
  const safeName = params.displayName.trim().slice(0, 80);
  if (!safeName) {
    throw new Error('Member display name is required.');
  }

  const memberId = params.memberId
    ? sanitizeFirestoreId(params.memberId, 'mem')
    : sanitizeFirestoreId(`mem_${safeName.toLowerCase()}`, 'mem');

  const safeHandle = (params.handle || '').trim().slice(0, 80);
  const safeAvatar =
    params.avatarUrl && params.avatarUrl.trim().startsWith('https://')
      ? params.avatarUrl.trim().slice(0, 512)
      : '';

  const memberRef = doc(db, 'members', memberId);
  const groupRef = doc(db, 'groups', GROUP_ID);

  try {
    await bootstrapWorkspaceIfMissing(getDhakaDateKey());
    const [existingMemberSnap, membersSnap] = await Promise.all([
      getDoc(memberRef),
      getDocs(query(collection(db, 'members'), where('groupId', '==', GROUP_ID))),
    ]);

    const batch = writeBatch(db);
    let nextMemberCount = membersSnap.size;

    if (existingMemberSnap.exists()) {
      batch.update(memberRef, {
        displayName: safeName,
        handle: safeHandle,
        avatarUrl: safeAvatar,
        updatedAt: serverTimestamp(),
      });
    } else {
      nextMemberCount += 1;
      batch.set(memberRef, {
        memberId,
        groupId: GROUP_ID,
        displayName: safeName,
        handle: safeHandle,
        avatarUrl: safeAvatar,
        totalMessages: 0,
        lastActiveAt: '',
        lastActiveDateDhaka: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.update(groupRef, {
        totalMembers: nextMemberCount,
        updatedAt: serverTimestamp(),
        updatedBy: uid,
      });
    }

    await batch.commit();
    return memberId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `members/${memberId}`);
  }
}

export async function removeMember(memberId: string): Promise<void> {
  const uid = requireVerifiedUid();
  const safeId = sanitizeFirestoreId(memberId, 'mem');
  const memberRef = doc(db, 'members', safeId);
  const groupRef = doc(db, 'groups', GROUP_ID);

  try {
    const [memberSnap, membersSnap] = await Promise.all([
      getDoc(memberRef),
      getDocs(query(collection(db, 'members'), where('groupId', '==', GROUP_ID))),
    ]);

    if (!memberSnap.exists()) return;

    const batch = writeBatch(db);
    batch.delete(memberRef);
    batch.update(groupRef, {
      totalMembers: Math.max(0, membersSnap.size - 1),
      updatedAt: serverTimestamp(),
      updatedBy: uid,
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `members/${safeId}`);
  }
}

export async function updateMemberWithMessageTotal(params: {
  memberId: string;
  displayName: string;
  handle: string;
  avatarUrl: string;
  targetTotalMessages: number;
  currentGroup: GroupRecord | null;
  existingMembers: MemberRecord[];
  existingDaily: DailyStatisticRecord[];
  existingMonthly: MonthlyStatisticRecord[];
  currentProcessedCount: number;
}): Promise<void> {
  const uid = requireVerifiedUid();
  const safeId = sanitizeFirestoreId(params.memberId, 'mem');
  const safeName = params.displayName.trim().slice(0, 80);
  if (!safeName) {
    throw new Error('Member display name is required.');
  }
  const safeHandle = params.handle.trim().slice(0, 80);
  const safeAvatar =
    params.avatarUrl.trim().startsWith('https://') ? params.avatarUrl.trim().slice(0, 512) : '';
  const targetTotal = Math.max(0, Math.floor(Number(params.targetTotalMessages) || 0));

  const existingMember = params.existingMembers.find((m) => m.memberId === safeId);
  const currentTotal = existingMember?.totalMessages ?? 0;
  const delta = targetTotal - currentTotal;

  // Always update profile fields first (or when delta === 0, this is the entire write)
  if (delta === 0) {
    await upsertMember({
      memberId: safeId,
      displayName: safeName,
      handle: safeHandle,
      avatarUrl: safeAvatar,
    });
    return;
  }

  // Increasing message count: update profile and append one weighted event atomically
  if (delta > 0) {
    await upsertMember({
      memberId: safeId,
      displayName: safeName,
      handle: safeHandle,
      avatarUrl: safeAvatar,
    });
    const nowIso = new Date().toISOString();
    await ingestAuthorizedEvents(
      [
        {
          messageId: sanitizeFirestoreId(
            `adj_${safeId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            'msg'
          ),
          senderId: safeId,
          senderDisplayName: safeName,
          timestamp: nowIso,
          handle: safeHandle,
          avatarUrl: safeAvatar,
          source: 'admin_manual',
          messageCount: delta,
        },
      ],
      params.currentGroup,
      params.existingMembers.map((m) =>
        m.memberId === safeId
          ? { ...m, displayName: safeName, handle: safeHandle, avatarUrl: safeAvatar }
          : m
      ),
      params.existingDaily,
      params.existingMonthly,
      params.currentProcessedCount
    );
    return;
  }

  // Decreasing message count (delta < 0): consolidate member's events and rebuild rollups cleanly
  const creationDate = params.currentGroup?.creationDate || getDhakaDateKey();
  await bootstrapWorkspaceIfMissing(creationDate);

  try {
    const [eventsSnap, dailySnap, monthlySnap] = await Promise.all([
      getDocs(query(collection(db, 'messageEvents'), where('groupId', '==', GROUP_ID))),
      getDocs(query(collection(db, 'dailyStatistics'), where('groupId', '==', GROUP_ID))),
      getDocs(query(collection(db, 'monthlyStatistics'), where('groupId', '==', GROUP_ID))),
    ]);

    const memberEventRefs = eventsSnap.docs
      .filter((d) => (d.data() as MessageEventRecord).senderId === safeId)
      .map((d) => d.ref);

    for (let i = 0; i < memberEventRefs.length; i += 400) {
      const delBatch = writeBatch(db);
      memberEventRefs.slice(i, i + 400).forEach((ref) => delBatch.delete(ref));
      await delBatch.commit();
    }

    const remainingEvents = eventsSnap.docs
      .map((d) => d.data() as MessageEventRecord)
      .filter((ev) => ev.senderId !== safeId);

    const nowIso = new Date().toISOString();
    const rawTargetIso = existingMember?.lastActiveAt || nowIso;
    const rawDateKey = getDhakaDateKey(rawTargetIso);
    const targetIso = rawDateKey >= creationDate ? rawTargetIso : nowIso;
    const targetDateKey = getDhakaDateKey(targetIso);
    const targetMonthKey = getDhakaMonthKey(targetIso);
    const replacementMsgId = sanitizeFirestoreId(
      `adj_${safeId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      'msg'
    );

    const allEventsAfter: MessageEventRecord[] =
      targetTotal > 0
        ? [
            ...remainingEvents,
            {
              messageId: replacementMsgId,
              groupId: GROUP_ID,
              senderId: safeId,
              senderDisplayName: safeName,
              timestamp: targetIso,
              dateKeyDhaka: targetDateKey,
              monthKeyDhaka: targetMonthKey,
              source: 'admin_manual',
              createdBy: uid,
              ...(targetTotal > 1 ? { messageCount: targetTotal } : {}),
            },
          ]
        : remainingEvents;

    // Rebuild daily and monthly maps from allEventsAfter
    const dailyRebuild = new Map<
      string,
      { dateKey: string; monthKey: string; totalMessages: number; senders: Set<string> }
    >();
    let totalAllEventsWeight = 0;
    let latestEventIso = '';

    for (const ev of allEventsAfter) {
      const w = ev.messageCount && ev.messageCount > 0 ? ev.messageCount : 1;
      totalAllEventsWeight += w;
      if (!latestEventIso || ev.timestamp > latestEventIso) {
        latestEventIso = ev.timestamp;
      }
      const dEntry = dailyRebuild.get(ev.dateKeyDhaka) || {
        dateKey: ev.dateKeyDhaka,
        monthKey: ev.monthKeyDhaka,
        totalMessages: 0,
        senders: new Set<string>(),
      };
      dEntry.totalMessages += w;
      dEntry.senders.add(ev.senderId);
      dailyRebuild.set(ev.dateKeyDhaka, dEntry);
    }

    const monthlyRebuild = new Map<
      string,
      { monthKey: string; totalMessages: number; activeDays: number; peakDailyMessages: number; peakDate: string }
    >();
    for (const d of dailyRebuild.values()) {
      const mEntry = monthlyRebuild.get(d.monthKey) || {
        monthKey: d.monthKey,
        totalMessages: 0,
        activeDays: 0,
        peakDailyMessages: 0,
        peakDate: '',
      };
      mEntry.totalMessages += d.totalMessages;
      if (d.totalMessages > 0) mEntry.activeDays += 1;
      if (d.totalMessages > mEntry.peakDailyMessages) {
        mEntry.peakDailyMessages = d.totalMessages;
        mEntry.peakDate = d.dateKey;
      }
      monthlyRebuild.set(d.monthKey, mEntry);
    }

    const existingDailyKeys = new Set(dailySnap.docs.map((d) => d.id));
    const existingMonthlyKeys = new Set(monthlySnap.docs.map((d) => d.id));

    const batch = writeBatch(db);

    // Update member doc
    batch.update(doc(db, 'members', safeId), {
      displayName: safeName,
      handle: safeHandle,
      avatarUrl: safeAvatar,
      totalMessages: targetTotal,
      lastActiveAt: targetTotal > 0 ? targetIso : '',
      lastActiveDateDhaka: targetTotal > 0 ? targetDateKey : '',
      updatedAt: serverTimestamp(),
    });

    // Update/create/delete dailyStatistics
    for (const dKey of existingDailyKeys) {
      if (!dailyRebuild.has(dKey)) {
        batch.delete(doc(db, 'dailyStatistics', dKey));
      }
    }
    for (const [dKey, dVal] of dailyRebuild.entries()) {
      const ref = doc(db, 'dailyStatistics', dKey);
      if (existingDailyKeys.has(dKey)) {
        batch.update(ref, {
          totalMessages: dVal.totalMessages,
          activeMemberCount: dVal.senders.size,
          updatedAt: serverTimestamp(),
        });
      } else {
        batch.set(ref, {
          dateKey: dVal.dateKey,
          groupId: GROUP_ID,
          monthKey: dVal.monthKey,
          totalMessages: dVal.totalMessages,
          activeMemberCount: dVal.senders.size,
          updatedAt: serverTimestamp(),
        });
      }
    }

    // Update/create/delete monthlyStatistics
    for (const mKey of existingMonthlyKeys) {
      if (!monthlyRebuild.has(mKey)) {
        batch.delete(doc(db, 'monthlyStatistics', mKey));
      }
    }
    for (const [mKey, mVal] of monthlyRebuild.entries()) {
      const ref = doc(db, 'monthlyStatistics', mKey);
      if (existingMonthlyKeys.has(mKey)) {
        batch.update(ref, {
          totalMessages: mVal.totalMessages,
          activeDays: mVal.activeDays,
          peakDailyMessages: mVal.peakDailyMessages,
          peakDate: mVal.peakDate,
          updatedAt: serverTimestamp(),
        });
      } else {
        batch.set(ref, {
          monthKey: mVal.monthKey,
          groupId: GROUP_ID,
          totalMessages: mVal.totalMessages,
          activeDays: mVal.activeDays,
          peakDailyMessages: mVal.peakDailyMessages,
          peakDate: mVal.peakDate,
          updatedAt: serverTimestamp(),
        });
      }
    }

    // Recompute group lifetime totals from creationDate
    const validDays = Array.from(dailyRebuild.values()).filter(
      (d) => d.dateKey >= creationDate && d.totalMessages > 0
    );
    const totalLifetimeMessages = validDays.reduce((acc, d) => acc + d.totalMessages, 0);
    const totalActiveDays = validDays.length;
    let highestDailyCount = 0;
    let highestDailyDate = '';
    for (const d of validDays) {
      if (d.totalMessages > highestDailyCount) {
        highestDailyCount = d.totalMessages;
        highestDailyDate = d.dateKey;
      }
    }

    batch.update(doc(db, 'groups', GROUP_ID), {
      totalLifetimeMessages,
      totalActiveDays,
      highestDailyCount,
      highestDailyDate,
      updatedAt: serverTimestamp(),
      updatedBy: uid,
    });

    batch.update(doc(db, 'integrationStatus', GROUP_ID), {
      lastEventAt: latestEventIso.slice(0, 40),
      eventsProcessedCount: totalAllEventsWeight,
      updatedAt: serverTimestamp(),
      updatedBy: uid,
    });

    await batch.commit();

    // Write replacement consolidated messageEvent if targetTotal > 0
    if (targetTotal > 0) {
      const msgBatch = writeBatch(db);
      msgBatch.set(doc(db, 'messageEvents', replacementMsgId), {
        messageId: replacementMsgId,
        groupId: GROUP_ID,
        senderId: safeId,
        senderDisplayName: safeName,
        timestamp: targetIso,
        receivedTimestamp: serverTimestamp(),
        dateKeyDhaka: targetDateKey,
        monthKeyDhaka: targetMonthKey,
        source: 'admin_manual',
        createdBy: uid,
        ...(targetTotal > 1 ? { messageCount: targetTotal } : {}),
      });
      await msgBatch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `members/${safeId}`);
  }
}

export interface IngestResult {
  inserted: number;
  duplicatesSkipped: number;
}

export async function ingestAuthorizedEvents(
  incomingEvents: AuthorizedIncomingEvent[],
  currentGroup: GroupRecord | null,
  existingMembers: MemberRecord[],
  existingDaily: DailyStatisticRecord[],
  existingMonthly: MonthlyStatisticRecord[],
  currentIntegrationProcessedCount: number
): Promise<IngestResult> {
  const uid = requireVerifiedUid();
  if (incomingEvents.length === 0) {
    return { inserted: 0, duplicatesSkipped: 0 };
  }

  const creationDate = currentGroup?.creationDate || getDhakaDateKey();
  await bootstrapWorkspaceIfMissing(creationDate);

  // Deduplicate within the incoming payload itself first
  const seenInBatch = new Set<string>();
  const candidateEvents: AuthorizedIncomingEvent[] = [];
  let duplicatesSkipped = 0;

  for (const ev of incomingEvents) {
    const safeMsgId = sanitizeFirestoreId(ev.messageId, 'msg');
    if (seenInBatch.has(safeMsgId)) {
      duplicatesSkipped += 1;
      continue;
    }
    seenInBatch.add(safeMsgId);
    candidateEvents.push({
      ...ev,
      messageId: safeMsgId,
      senderId: sanitizeFirestoreId(ev.senderId, 'mem'),
      senderDisplayName: ev.senderDisplayName.trim().slice(0, 80) || 'Member',
    });
  }

  // Check Firestore for existing messageIds to guarantee zero duplicate counting
  const uniqueNewEvents: AuthorizedIncomingEvent[] = [];
  try {
    // Check in parallel batches of 25
    for (let i = 0; i < candidateEvents.length; i += 25) {
      const slice = candidateEvents.slice(i, i + 25);
      const snaps = await Promise.all(
        slice.map((ev) => getDoc(doc(db, 'messageEvents', ev.messageId)))
      );
      snaps.forEach((snap, idx) => {
        if (snap.exists()) {
          duplicatesSkipped += 1;
        } else {
          uniqueNewEvents.push(slice[idx]);
        }
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, 'messageEvents');
  }

  if (uniqueNewEvents.length === 0) {
    return { inserted: 0, duplicatesSkipped };
  }

  // Build in-memory rollups over existing state
  const memberMap = new Map<string, MemberRecord>();
  existingMembers.forEach((m) => memberMap.set(m.memberId, { ...m }));

  const dailyMap = new Map<string, DailyStatisticRecord>();
  existingDaily.forEach((d) => dailyMap.set(d.dateKey, { ...d }));

  const monthlyMap = new Map<string, MonthlyStatisticRecord>();
  existingMonthly.forEach((m) => monthlyMap.set(m.monthKey, { ...m }));

  const touchedMembers = new Set<string>();
  const createdMembers = new Set<string>();
  const touchedDays = new Set<string>();
  const createdDays = new Set<string>();
  const touchedMonths = new Set<string>();
  const createdMonths = new Set<string>();
  const dayActiveSenders = new Map<string, Set<string>>();

  // Fetch existing events for affected days if we want accurate activeMemberCount on day
  const affectedDateKeys = new Set(uniqueNewEvents.map((e) => getDhakaDateKey(e.timestamp)));
  try {
    const existingEventsSnap = await getDocs(
      query(collection(db, 'messageEvents'), where('groupId', '==', GROUP_ID))
    );
    existingEventsSnap.forEach((d) => {
      const ev = d.data() as MessageEventRecord;
      if (affectedDateKeys.has(ev.dateKeyDhaka)) {
        if (!dayActiveSenders.has(ev.dateKeyDhaka)) {
          dayActiveSenders.set(ev.dateKeyDhaka, new Set());
        }
        dayActiveSenders.get(ev.dateKeyDhaka)!.add(ev.senderId);
      }
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'messageEvents');
  }

  let latestEventIso = '';

  const preparedMessageDocs: Array<{
    id: string;
    data: Omit<MessageEventRecord, 'receivedTimestamp'>;
  }> = [];

  let totalWeightAdded = 0;

  for (const ev of uniqueNewEvents) {
    const weight = Math.max(1, Math.floor(Number(ev.messageCount) || 1));
    totalWeightAdded += weight;
    const dateKey = getDhakaDateKey(ev.timestamp);
    const monthKey = getDhakaMonthKey(ev.timestamp);

    if (!latestEventIso || ev.timestamp > latestEventIso) {
      latestEventIso = ev.timestamp;
    }

    // Member update
    let member = memberMap.get(ev.senderId);
    if (!member) {
      member = {
        memberId: ev.senderId,
        groupId: GROUP_ID,
        displayName: ev.senderDisplayName,
        handle: (ev.handle || '').slice(0, 80),
        avatarUrl: (ev.avatarUrl || '').slice(0, 512),
        totalMessages: 0,
        lastActiveAt: '',
        lastActiveDateDhaka: '',
      };
      memberMap.set(ev.senderId, member);
      createdMembers.add(ev.senderId);
    }
    member.totalMessages += weight;
    if (!member.lastActiveAt || ev.timestamp >= member.lastActiveAt) {
      member.lastActiveAt = ev.timestamp;
      member.lastActiveDateDhaka = dateKey;
    }
    if (ev.senderDisplayName) {
      member.displayName = ev.senderDisplayName;
    }
    if (typeof ev.handle === 'string' && ev.handle.trim()) {
      member.handle = ev.handle.trim().slice(0, 80);
    }
    if (typeof ev.avatarUrl === 'string' && ev.avatarUrl.startsWith('https://')) {
      member.avatarUrl = ev.avatarUrl.slice(0, 512);
    }
    touchedMembers.add(ev.senderId);

    // Daily rollup
    if (!dayActiveSenders.has(dateKey)) {
      dayActiveSenders.set(dateKey, new Set());
    }
    dayActiveSenders.get(dateKey)!.add(ev.senderId);

    let daily = dailyMap.get(dateKey);
    if (!daily) {
      daily = {
        dateKey,
        groupId: GROUP_ID,
        monthKey,
        totalMessages: 0,
        activeMemberCount: 0,
      };
      dailyMap.set(dateKey, daily);
      createdDays.add(dateKey);
    }
    daily.totalMessages += weight;
    daily.activeMemberCount = Math.max(daily.activeMemberCount, dayActiveSenders.get(dateKey)!.size);
    touchedDays.add(dateKey);

    // Monthly rollup
    let monthly = monthlyMap.get(monthKey);
    if (!monthly) {
      monthly = {
        monthKey,
        groupId: GROUP_ID,
        totalMessages: 0,
        activeDays: 0,
        peakDailyMessages: 0,
        peakDate: '',
      };
      monthlyMap.set(monthKey, monthly);
      createdMonths.add(monthKey);
    }
    monthly.totalMessages += weight;
    touchedMonths.add(monthKey);

    preparedMessageDocs.push({
      id: ev.messageId,
      data: {
        messageId: ev.messageId,
        groupId: GROUP_ID,
        senderId: ev.senderId,
        senderDisplayName: ev.senderDisplayName,
        timestamp: ev.timestamp,
        dateKeyDhaka: dateKey,
        monthKeyDhaka: monthKey,
        source: ev.source || 'admin_manual',
        createdBy: uid,
        ...(weight > 1 ? { messageCount: weight } : {}),
      },
    });
  }

  // Recompute monthly activeDays & peak for touched months
  for (const monthKey of touchedMonths) {
    const monthly = monthlyMap.get(monthKey)!;
    const daysInMonth = Array.from(dailyMap.values()).filter(
      (d) => d.monthKey === monthKey && d.totalMessages > 0
    );
    monthly.activeDays = daysInMonth.length;
    let peakVal = 0;
    let peakDate = '';
    for (const d of daysInMonth) {
      if (d.totalMessages > peakVal) {
        peakVal = d.totalMessages;
        peakDate = d.dateKey;
      }
    }
    monthly.peakDailyMessages = peakVal;
    monthly.peakDate = peakDate;
  }

  // Recompute group lifetime metrics from configured creationDate
  const validDaysSinceCreation = Array.from(dailyMap.values()).filter(
    (d) => d.dateKey >= creationDate && d.totalMessages > 0
  );
  const totalLifetimeMessages = validDaysSinceCreation.reduce((acc, d) => acc + d.totalMessages, 0);
  const totalActiveDays = validDaysSinceCreation.length;
  let highestDailyCount = 0;
  let highestDailyDate = '';
  for (const d of validDaysSinceCreation) {
    if (d.totalMessages > highestDailyCount) {
      highestDailyCount = d.totalMessages;
      highestDailyDate = d.dateKey;
    }
  }

  try {
    // Firestore batch limit is 500 writes.
    // First batch: update/create rollups (members, dailyStatistics, monthlyStatistics, group, integrationStatus) + first chunk of messageEvents.
    // Remember: messageEvents create rule checks existsAfter(members) & existsAfter(dailyStatistics), so members & dailyStatistics MUST be created before or in the same batch as messageEvents!
    const rollupBatch = writeBatch(db);

    for (const memberId of touchedMembers) {
      const m = memberMap.get(memberId)!;
      const ref = doc(db, 'members', memberId);
      if (createdMembers.has(memberId)) {
        rollupBatch.set(ref, {
          memberId: m.memberId,
          groupId: GROUP_ID,
          displayName: m.displayName,
          handle: m.handle,
          avatarUrl: m.avatarUrl,
          totalMessages: m.totalMessages,
          lastActiveAt: m.lastActiveAt,
          lastActiveDateDhaka: m.lastActiveDateDhaka,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        rollupBatch.update(ref, {
          displayName: m.displayName,
          handle: m.handle,
          avatarUrl: m.avatarUrl,
          totalMessages: m.totalMessages,
          lastActiveAt: m.lastActiveAt,
          lastActiveDateDhaka: m.lastActiveDateDhaka,
          updatedAt: serverTimestamp(),
        });
      }
    }

    for (const dateKey of touchedDays) {
      const d = dailyMap.get(dateKey)!;
      const ref = doc(db, 'dailyStatistics', dateKey);
      if (createdDays.has(dateKey)) {
        rollupBatch.set(ref, {
          dateKey: d.dateKey,
          groupId: GROUP_ID,
          monthKey: d.monthKey,
          totalMessages: d.totalMessages,
          activeMemberCount: d.activeMemberCount,
          updatedAt: serverTimestamp(),
        });
      } else {
        rollupBatch.update(ref, {
          totalMessages: d.totalMessages,
          activeMemberCount: d.activeMemberCount,
          updatedAt: serverTimestamp(),
        });
      }
    }

    for (const monthKey of touchedMonths) {
      const mo = monthlyMap.get(monthKey)!;
      const ref = doc(db, 'monthlyStatistics', monthKey);
      if (createdMonths.has(monthKey)) {
        rollupBatch.set(ref, {
          monthKey: mo.monthKey,
          groupId: GROUP_ID,
          totalMessages: mo.totalMessages,
          activeDays: mo.activeDays,
          peakDailyMessages: mo.peakDailyMessages,
          peakDate: mo.peakDate,
          updatedAt: serverTimestamp(),
        });
      } else {
        rollupBatch.update(ref, {
          totalMessages: mo.totalMessages,
          activeDays: mo.activeDays,
          peakDailyMessages: mo.peakDailyMessages,
          peakDate: mo.peakDate,
          updatedAt: serverTimestamp(),
        });
      }
    }

    rollupBatch.update(doc(db, 'groups', GROUP_ID), {
      totalMembers: memberMap.size,
      totalLifetimeMessages,
      totalActiveDays,
      highestDailyCount,
      highestDailyDate,
      updatedAt: serverTimestamp(),
      updatedBy: uid,
    });

    rollupBatch.update(doc(db, 'integrationStatus', GROUP_ID), {
      lastEventAt: latestEventIso.slice(0, 40),
      eventsProcessedCount: currentIntegrationProcessedCount + totalWeightAdded,
      updatedAt: serverTimestamp(),
      updatedBy: uid,
    });

    await rollupBatch.commit();

    // Commit messageEvents in chunks of 400
    for (let i = 0; i < preparedMessageDocs.length; i += 400) {
      const chunk = preparedMessageDocs.slice(i, i + 400);
      const msgBatch = writeBatch(db);
      for (const item of chunk) {
        msgBatch.set(doc(db, 'messageEvents', item.id), {
          ...item.data,
          receivedTimestamp: serverTimestamp(),
        });
      }
      await msgBatch.commit();
    }

    return { inserted: totalWeightAdded, duplicatesSkipped };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'messageEvents');
  }
}

export async function updateGroupCreationDate(
  newCreationDate: string,
  dailyStats: DailyStatisticRecord[]
): Promise<void> {
  const uid = requireVerifiedUid();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newCreationDate)) {
    throw new Error('Creation date must be in YYYY-MM-DD format.');
  }

  await bootstrapWorkspaceIfMissing(newCreationDate);

  const validDays = dailyStats.filter((d) => d.dateKey >= newCreationDate && d.totalMessages > 0);
  const totalLifetimeMessages = validDays.reduce((acc, d) => acc + d.totalMessages, 0);
  const totalActiveDays = validDays.length;
  let highestDailyCount = 0;
  let highestDailyDate = '';
  for (const d of validDays) {
    if (d.totalMessages > highestDailyCount) {
      highestDailyCount = d.totalMessages;
      highestDailyDate = d.dateKey;
    }
  }

  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'groups', GROUP_ID), {
      creationDate: newCreationDate,
      totalLifetimeMessages,
      totalActiveDays,
      highestDailyCount,
      highestDailyDate,
      updatedAt: serverTimestamp(),
      updatedBy: uid,
    });
    batch.update(doc(db, 'adminSettings', GROUP_ID), {
      groupCreationDate: newCreationDate,
      updatedAt: serverTimestamp(),
      updatedBy: uid,
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `groups/${GROUP_ID}`);
  }
}

export async function updateIntegrationSettings(params: {
  status: IntegrationConnectionState;
  adapterName: string;
  endpointUrl: string;
  limitationNote: string;
  webhookHeaderName?: string;
}): Promise<void> {
  const uid = requireVerifiedUid();
  await bootstrapWorkspaceIfMissing(getDhakaDateKey());

  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'integrationStatus', GROUP_ID), {
      status: params.status,
      adapterName: params.adapterName.trim().slice(0, 80) || 'Authorized Webhook Adapter',
      endpointUrl: params.endpointUrl.trim().slice(0, 256),
      limitationNote: params.limitationNote.trim().slice(0, 500),
      lastHeartbeatAt: params.status === 'connected' ? new Date().toISOString().slice(0, 40) : '',
      updatedAt: serverTimestamp(),
      updatedBy: uid,
    });
    if (params.webhookHeaderName) {
      batch.update(doc(db, 'adminSettings', GROUP_ID), {
        webhookHeaderName: params.webhookHeaderName.trim().slice(0, 64),
        updatedAt: serverTimestamp(),
        updatedBy: uid,
      });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `integrationStatus/${GROUP_ID}`);
  }
}

export async function resetAnalyticsData(keepMembers: boolean): Promise<void> {
  const uid = requireVerifiedUid();

  try {
    const [eventsSnap, dailySnap, monthlySnap, membersSnap] = await Promise.all([
      getDocs(query(collection(db, 'messageEvents'), where('groupId', '==', GROUP_ID))),
      getDocs(query(collection(db, 'dailyStatistics'), where('groupId', '==', GROUP_ID))),
      getDocs(query(collection(db, 'monthlyStatistics'), where('groupId', '==', GROUP_ID))),
      getDocs(query(collection(db, 'members'), where('groupId', '==', GROUP_ID))),
    ]);

    const deleteRefs = [
      ...eventsSnap.docs.map((d) => d.ref),
      ...dailySnap.docs.map((d) => d.ref),
      ...monthlySnap.docs.map((d) => d.ref),
      ...(keepMembers ? [] : membersSnap.docs.map((d) => d.ref)),
    ];

    for (let i = 0; i < deleteRefs.length; i += 400) {
      const batch = writeBatch(db);
      deleteRefs.slice(i, i + 400).forEach((ref) => batch.delete(ref));
      await batch.commit();
    }

    if (keepMembers && membersSnap.docs.length > 0) {
      for (let i = 0; i < membersSnap.docs.length; i += 400) {
        const batch = writeBatch(db);
        membersSnap.docs.slice(i, i + 400).forEach((d) => {
          batch.update(d.ref, {
            totalMessages: 0,
            lastActiveAt: '',
            lastActiveDateDhaka: '',
            updatedAt: serverTimestamp(),
          });
        });
        await batch.commit();
      }
    }

    const summaryBatch = writeBatch(db);
    summaryBatch.update(doc(db, 'groups', GROUP_ID), {
      totalMembers: keepMembers ? membersSnap.size : 0,
      totalLifetimeMessages: 0,
      totalActiveDays: 0,
      highestDailyCount: 0,
      highestDailyDate: '',
      updatedAt: serverTimestamp(),
      updatedBy: uid,
    });
    summaryBatch.update(doc(db, 'integrationStatus', GROUP_ID), {
      lastEventAt: '',
      eventsProcessedCount: 0,
      updatedAt: serverTimestamp(),
      updatedBy: uid,
    });
    await summaryBatch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `groups/${GROUP_ID}`);
  }
}
