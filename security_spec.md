# Security Specification — MoonLight Gang Analytics

## 1. Data Invariants

1. **Default Deny**: All Firestore paths not explicitly matched are denied for reads and writes.
2. **Verified Admin Control**: Only verified administrators (`request.auth.token.email_verified == true` and either bootstrapped admin email `sazzadulislamarafi80@gmail.com` or existing `/admins/{uid}` document) can write to `groups`, `members`, `messageEvents`, `dailyStatistics`, `monthlyStatistics`, `integrationStatus`, and `adminSettings`.
3. **Referential Integrity**: Every `member`, `messageEvent`, `dailyStatistic`, `monthlyStatistic`, `integrationStatus`, and `adminSettings` document must reference an existing (or atomically created via `existsAfter`) `/groups/{groupId}` parent document.
4. **Atomicity Guarantee**: Creating a `messageEvent` requires atomic batch presence (`existsAfter`) of the parent group, sender member document, and daily statistic rollup.
5. **Deduplication & Immutability**: `messageEvents/{messageId}` uses `messageId` as the document ID, preventing duplicate creates, and forbids mutation of `messageId`, `groupId`, `senderId`, `receivedTimestamp`, and `createdBy` after creation.
6. **Temporal Integrity**: All `createdAt`, `updatedAt`, and `receivedTimestamp` fields must equal `request.time`.
7. **PII & Content Minimization**: `messageEvents` stores only structural metadata (no message body text). `adminSettings` and `admins` are never listable and readable only by verified admins (or self for `admins/{uid}`).
8. **No Blanket List Reads**: Every `allow list` rule evaluates `resource.data.groupId == 'moonlight-gang'` directly without calling `get()` or `exists()`.

## 2. The "Dirty Dozen" Adversarial Payloads

1. **Unauthenticated Read**: Anonymous user attempts `get` or `list` on `/groups/moonlight-gang` -> `PERMISSION_DENIED`.
2. **Unverified Email Spoof**: User with `email: 'sazzadulislamarafi80@gmail.com'` and `email_verified: false` attempts to write `/adminSettings/moonlight-gang` -> `PERMISSION_DENIED`.
3. **Privilege Escalation**: Non-admin signed-in user attempts to create `/admins/{theirUid}` with `role: 'admin'` -> `PERMISSION_DENIED`.
4. **Shadow Field Injection**: Admin attempts to create `/members/m1` with extra undeclared field `isSuperAdmin: true` -> `PERMISSION_DENIED`.
5. **ID Poisoning**: Admin attempts to create `/messageEvents/bad$id/with/../../1500chars` -> `PERMISSION_DENIED`.
6. **Value Poisoning**: Admin attempts to update `/groups/moonlight-gang` with `name` of 500 characters (> 100) or `totalLifetimeMessages: -5` -> `PERMISSION_DENIED`.
7. **Timestamp Forgery**: Admin attempts to create `/messageEvents/msg_1` with client-supplied `receivedTimestamp` instead of `request.time` -> `PERMISSION_DENIED`.
8. **Orphaned Message Event**: Admin attempts to create `/messageEvents/msg_orphan` when `/groups/moonlight-gang` or `/members/{senderId}` does not exist -> `PERMISSION_DENIED`.
9. **Identity Spoofing on Event**: Admin attempts to create `/messageEvents/msg_2` with `createdBy != request.auth.uid` -> `PERMISSION_DENIED`.
10. **Immutable Field Mutation**: Admin attempts to update `/messageEvents/msg_1` to change `senderId` or `messageId` -> `PERMISSION_DENIED`.
11. **Admin Settings List Scraping**: Non-admin attempts `list` on `/adminSettings` -> `PERMISSION_DENIED`.
12. **Blanket Query Without Filter**: Signed-in non-admin attempts `list` on `/messageEvents` without `where('groupId', '==', 'moonlight-gang')` -> `PERMISSION_DENIED`.

## 3. Verification Test Runner (`firestore.rules.test.ts` Reference)

Run against Firebase Emulator Suite (`@firebase/rules-unit-testing`) when testing locally:
- Asserts all 12 Dirty Dozen payloads reject with `PERMISSION_DENIED`.
- Asserts verified admin atomic batch ingestion of `group`, `member`, `dailyStatistic`, `monthlyStatistic`, and `messageEvent` succeeds.
