import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { defineSecret } from 'firebase-functions/params';
import { onRequest } from 'firebase-functions/v2/https';

initializeApp();

const DATABASE_ID = 'ai-studio-moonlightgangana-05cb7dee-3acf-45f2-a549-e0cfe08af03b';
const GROUP_ID = 'moonlight-gang';
const DHAKA_TIMEZONE = 'Asia/Dhaka';

const db = getFirestore(DATABASE_ID);
const webhookSecret = defineSecret('MOONLIGHT_WEBHOOK_SECRET');

const dhakaDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: DHAKA_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function sanitizeId(raw: string, fallbackPrefix: string): string {
  const cleaned = raw.trim().replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 128);
  return cleaned || `${fallbackPrefix}_${Date.now().toString(36)}`;
}

export const ingestMoonlightMessage = onRequest(
  { secrets: [webhookSecret], cors: false },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const providedSignature = req.header('x-moonlight-signature');
    if (!providedSignature || providedSignature !== webhookSecret.value()) {
      res.status(401).json({ error: 'Unauthorized webhook signature' });
      return;
    }

    const body = (req.body || {}) as Record<string, unknown>;
    const rawMessageId = String(body.messageId || '').trim();
    const rawSenderId = String(body.senderId || '').trim();
    const rawSenderName = String(body.senderDisplayName || '').trim();
    const rawTimestamp = String(body.timestamp || new Date().toISOString()).trim();

    if (!rawMessageId || !rawSenderId || !rawSenderName) {
      res.status(400).json({ error: 'messageId, senderId, and senderDisplayName are required' });
      return;
    }

    const parsedDate = new Date(rawTimestamp);
    if (Number.isNaN(parsedDate.getTime())) {
      res.status(400).json({ error: 'Invalid ISO timestamp' });
      return;
    }

    const messageId = sanitizeId(rawMessageId, 'msg');
    const senderId = sanitizeId(rawSenderId, 'mem');
    const senderDisplayName = rawSenderName.slice(0, 80);
    const isoTimestamp = parsedDate.toISOString();
    const dateKeyDhaka = dhakaDateFormatter.format(parsedDate);
    const monthKeyDhaka = dateKeyDhaka.slice(0, 7);

    const handle = typeof body.handle === 'string' ? body.handle.trim().slice(0, 80) : '';
    const avatarUrl =
      typeof body.avatarUrl === 'string' && body.avatarUrl.startsWith('https://')
        ? body.avatarUrl.trim().slice(0, 512)
        : '';

    try {
      const result = await db.runTransaction(async (tx) => {
        const msgRef = db.collection('messageEvents').doc(messageId);
        const existingMsg = await tx.get(msgRef);
        if (existingMsg.exists) {
          return { duplicate: true };
        }

        const groupRef = db.collection('groups').doc(GROUP_ID);
        const memberRef = db.collection('members').doc(senderId);
        const dailyRef = db.collection('dailyStatistics').doc(dateKeyDhaka);
        const monthlyRef = db.collection('monthlyStatistics').doc(monthKeyDhaka);
        const statusRef = db.collection('integrationStatus').doc(GROUP_ID);

        const [groupSnap, memberSnap, dailySnap, monthlySnap] = await Promise.all([
          tx.get(groupRef),
          tx.get(memberRef),
          tx.get(dailyRef),
          tx.get(monthlyRef),
        ]);

        const creationDate =
          (groupSnap.exists ? (groupSnap.data()?.creationDate as string) : dateKeyDhaka) ||
          dateKeyDhaka;
        const withinCreationWindow = dateKeyDhaka >= creationDate;

        // 1. Update or create member
        if (!memberSnap.exists) {
          tx.set(memberRef, {
            memberId: senderId,
            groupId: GROUP_ID,
            displayName: senderDisplayName,
            handle,
            avatarUrl,
            totalMessages: 1,
            lastActiveAt: isoTimestamp,
            lastActiveDateDhaka: dateKeyDhaka,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });
        } else {
          tx.update(memberRef, {
            displayName: senderDisplayName,
            totalMessages: FieldValue.increment(1),
            lastActiveAt: isoTimestamp,
            lastActiveDateDhaka: dateKeyDhaka,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }

        // 2. Update or create daily statistic
        const prevDailyTotal = dailySnap.exists ? Number(dailySnap.data()?.totalMessages || 0) : 0;
        const nextDailyTotal = prevDailyTotal + 1;
        if (!dailySnap.exists) {
          tx.set(dailyRef, {
            dateKey: dateKeyDhaka,
            groupId: GROUP_ID,
            monthKey: monthKeyDhaka,
            totalMessages: 1,
            activeMemberCount: 1,
            updatedAt: FieldValue.serverTimestamp(),
          });
        } else {
          tx.update(dailyRef, {
            totalMessages: FieldValue.increment(1),
            updatedAt: FieldValue.serverTimestamp(),
          });
        }

        // 3. Update or create monthly statistic
        if (!monthlySnap.exists) {
          tx.set(monthlyRef, {
            monthKey: monthKeyDhaka,
            groupId: GROUP_ID,
            totalMessages: 1,
            activeDays: 1,
            peakDailyMessages: 1,
            peakDate: dateKeyDhaka,
            updatedAt: FieldValue.serverTimestamp(),
          });
        } else {
          const prevPeak = Number(monthlySnap.data()?.peakDailyMessages || 0);
          tx.update(monthlyRef, {
            totalMessages: FieldValue.increment(1),
            ...(prevDailyTotal === 0 ? { activeDays: FieldValue.increment(1) } : {}),
            ...(nextDailyTotal > prevPeak
              ? { peakDailyMessages: nextDailyTotal, peakDate: dateKeyDhaka }
              : {}),
            updatedAt: FieldValue.serverTimestamp(),
          });
        }

        // 4. Update group totals
        if (groupSnap.exists) {
          const prevHighest = Number(groupSnap.data()?.highestDailyCount || 0);
          tx.update(groupRef, {
            ...(memberSnap.exists ? {} : { totalMembers: FieldValue.increment(1) }),
            ...(withinCreationWindow
              ? {
                  totalLifetimeMessages: FieldValue.increment(1),
                  ...(prevDailyTotal === 0 ? { totalActiveDays: FieldValue.increment(1) } : {}),
                  ...(nextDailyTotal > prevHighest
                    ? { highestDailyCount: nextDailyTotal, highestDailyDate: dateKeyDhaka }
                    : {}),
                }
              : {}),
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: 'cloud_function_webhook',
          });
        }

        // 5. Write deduplicated metadata-only message event
        tx.set(msgRef, {
          messageId,
          groupId: GROUP_ID,
          senderId,
          senderDisplayName,
          timestamp: isoTimestamp,
          receivedTimestamp: FieldValue.serverTimestamp(),
          dateKeyDhaka,
          monthKeyDhaka,
          source: 'official_webhook',
          createdBy: 'cloud_function_webhook',
        });

        // 6. Update integration status heartbeat
        tx.set(
          statusRef,
          {
            groupId: GROUP_ID,
            status: 'connected',
            lastHeartbeatAt: new Date().toISOString(),
            lastEventAt: isoTimestamp,
            eventsProcessedCount: FieldValue.increment(1),
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: 'cloud_function_webhook',
          },
          { merge: true }
        );

        return { duplicate: false };
      });

      res.status(result.duplicate ? 200 : 201).json({
        ok: true,
        duplicate: result.duplicate,
        messageId,
        dateKeyDhaka,
      });
    } catch (error) {
      console.error('Webhook ingestion failed:', error);
      res.status(500).json({ error: 'Internal ingestion failure' });
    }
  }
);
