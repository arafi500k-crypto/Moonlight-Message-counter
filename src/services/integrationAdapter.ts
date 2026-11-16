import type { AuthorizedIncomingEvent, IntegrationConnectionState, MessageSource } from '../types/analytics';

export const GROUP_ID = 'moonlight-gang';
export const GROUP_NAME = 'MoonLight Gang';
export const PLATFORM_NAME = 'TikTok Group Chat';

export const OFFICIAL_API_LIMITATION_NOTE =
  'TikTok does not expose an official public API for reading private or ordinary TikTok Group Chat messages. ' +
  'MoonLight Gang Analytics prohibits unofficial scraping, browser automation, session cookie extraction, or reverse-engineered endpoints. ' +
  'This adapter remains ready to accept signed metadata-only events from an official webhook bridge, authorized export import, or admin manual logging.';

export function sanitizeFirestoreId(raw: string, prefix: string = 'id'): string {
  const cleaned = raw
    .trim()
    .replace(/[^a-zA-Z0-9_\-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 110);
  if (!cleaned) {
    return `${prefix}_${Date.now().toString(36)}`;
  }
  return cleaned;
}

export function normalizeEventPayload(
  raw: Record<string, unknown>,
  defaultSource: MessageSource = 'authorized_import'
): AuthorizedIncomingEvent | null {
  const rawSenderName = String(
    raw.senderDisplayName ?? raw.senderName ?? raw.displayName ?? raw.sender ?? ''
  ).trim();
  const rawSenderId = String(raw.senderId ?? raw.userId ?? raw.authorId ?? rawSenderName).trim();

  if (!rawSenderName || !rawSenderId) {
    return null;
  }

  const rawTimestamp = String(raw.timestamp ?? raw.sentAt ?? raw.createdAt ?? new Date().toISOString()).trim();
  const parsedDate = new Date(rawTimestamp);
  const isoTimestamp = Number.isNaN(parsedDate.getTime())
    ? new Date().toISOString()
    : parsedDate.toISOString();

  const rawMsgId = String(raw.messageId ?? raw.id ?? '').trim();
  const messageId = rawMsgId
    ? sanitizeFirestoreId(rawMsgId, 'msg')
    : sanitizeFirestoreId(`msg_${rawSenderId}_${parsedDate.getTime()}_${Math.random().toString(36).slice(2, 7)}`, 'msg');

  const sourceVal = String(raw.source ?? defaultSource);
  const source: MessageSource =
    sourceVal === 'official_webhook' || sourceVal === 'authorized_import' || sourceVal === 'admin_manual'
      ? sourceVal
      : defaultSource;

  const handle = typeof raw.handle === 'string' ? raw.handle.trim().slice(0, 80) : '';
  const avatarUrl = typeof raw.avatarUrl === 'string' && raw.avatarUrl.startsWith('https://')
    ? raw.avatarUrl.trim().slice(0, 512)
    : '';

  // Strictly metadata-only: discard any message body/text fields if present in import payload.
  return {
    messageId,
    senderId: sanitizeFirestoreId(rawSenderId, 'mem'),
    senderDisplayName: rawSenderName.slice(0, 80),
    timestamp: isoTimestamp.slice(0, 40),
    handle,
    avatarUrl,
    source,
  };
}

export function parseAuthorizedImportText(text: string): {
  events: AuthorizedIncomingEvent[];
  skipped: number;
  error?: string;
} {
  const trimmed = text.trim();
  if (!trimmed) {
    return { events: [], skipped: 0, error: 'Input is empty.' };
  }

  // Try JSON array or { events: [...] }
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      const list = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === 'object' && Array.isArray((parsed as { events?: unknown }).events)
          ? (parsed as { events: unknown[] }).events
          : [parsed];

      const events: AuthorizedIncomingEvent[] = [];
      let skipped = 0;
      for (const item of list) {
        if (item && typeof item === 'object') {
          const normalized = normalizeEventPayload(item as Record<string, unknown>, 'authorized_import');
          if (normalized) events.push(normalized);
          else skipped += 1;
        } else {
          skipped += 1;
        }
      }
      return { events, skipped };
    } catch {
      return { events: [], skipped: 0, error: 'Invalid JSON syntax.' };
    }
  }

  // Parse CSV (expects headers: messageId,senderId,senderDisplayName,timestamp[,handle])
  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return { events: [], skipped: 0, error: 'CSV must include a header row and at least one event row.' };
  }

  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  const events: AuthorizedIncomingEvent[] = [];
  let skipped = 0;

  for (let i = 1; i < lines.length; i += 1) {
    const cols = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    const rowObj: Record<string, unknown> = {};
    headers.forEach((header, idx) => {
      rowObj[header] = cols[idx] ?? '';
    });
    const normalized = normalizeEventPayload(rowObj, 'authorized_import');
    if (normalized) events.push(normalized);
    else skipped += 1;
  }

  return { events, skipped };
}

export function getStatusLabel(status: IntegrationConnectionState): string {
  switch (status) {
    case 'connected':
      return 'Connected';
    case 'disconnected':
      return 'Disconnected';
    case 'unavailable':
    default:
      return 'Integration unavailable';
  }
}
