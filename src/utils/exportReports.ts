import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type {
  DailyStatisticRecord,
  DashboardMetrics,
  GroupRecord,
  MessageEventRecord,
  RankedMember,
} from '../types/analytics';
import { formatDhakaDateTime, getDhakaDateKey, getDhakaMonthKey } from './dhakaTime';

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportDailyReportPdf(
  group: GroupRecord | null,
  metrics: DashboardMetrics,
  rankedMembers: RankedMember[],
  todayEvents: MessageEventRecord[],
  targetDateKey: string = getDhakaDateKey()
) {
  const docPdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });

  docPdf.setFillColor(15, 15, 24);
  docPdf.rect(0, 0, 595, 92, 'F');
  docPdf.setTextColor(244, 244, 245);
  docPdf.setFont('helvetica', 'bold');
  docPdf.setFontSize(18);
  docPdf.text('MoonLight Gang Analytics — Daily Report', 40, 42);
  docPdf.setFont('helvetica', 'normal');
  docPdf.setFontSize(10);
  docPdf.setTextColor(196, 181, 253);
  docPdf.text(
    `Group: ${group?.name || 'MoonLight Gang'}  |  Date (Asia/Dhaka): ${targetDateKey}  |  Created: ${group?.creationDate || targetDateKey}`,
    40,
    64
  );

  docPdf.setTextColor(24, 24, 27);
  docPdf.setFontSize(12);
  docPdf.setFont('helvetica', 'bold');
  docPdf.text('Summary Metrics', 40, 124);

  autoTable(docPdf, {
    startY: 134,
    head: [['Metric', 'Value']],
    body: [
      ["Today's Total Messages", String(metrics.todayMessages)],
      ["Yesterday's Messages", String(metrics.yesterdayMessages)],
      ['Active Members Today', `${metrics.activeMembersToday} / ${metrics.totalMembers}`],
      ['Messages This Week', String(metrics.weekMessages)],
      ['Total Lifetime Messages', String(metrics.lifetimeMessages)],
      ['Average Daily Messages', String(metrics.averageDailyMessages)],
    ],
    theme: 'grid',
    headStyles: { fillColor: [109, 40, 217], textColor: 255 },
    styles: { fontSize: 10 },
  });

  const afterSummaryY =
    ((docPdf as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 280) + 24;

  docPdf.setFont('helvetica', 'bold');
  docPdf.setFontSize(12);
  docPdf.text('Member Activity Breakdown (Today & Lifetime)', 40, afterSummaryY);

  autoTable(docPdf, {
    startY: afterSummaryY + 10,
    head: [['Rank', 'Member', 'Today', 'Share Today', 'Lifetime', 'Last Active (Asia/Dhaka)']],
    body:
      rankedMembers.length > 0
        ? rankedMembers.map((m) => [
            `#${m.rank}`,
            m.displayName,
            String(m.messagesToday),
            `${m.shareTodayPct}%`,
            String(m.messagesLifetime),
            formatDhakaDateTime(m.lastActiveAt),
          ])
        : [['—', 'No members recorded', '0', '0%', '0', '—']],
    theme: 'striped',
    headStyles: { fillColor: [39, 39, 58], textColor: 255 },
    styles: { fontSize: 9 },
  });

  if (todayEvents.length > 0) {
    const afterMembersY =
      ((docPdf as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 460) + 24;
    docPdf.setFont('helvetica', 'bold');
    docPdf.setFontSize(11);
    docPdf.text(`Recorded Message Events on ${targetDateKey} (Latest 40)`, 40, afterMembersY);

    autoTable(docPdf, {
      startY: afterMembersY + 10,
      head: [['Event ID', 'Sender', 'Count', 'Source', 'Timestamp (Asia/Dhaka)']],
      body: todayEvents.slice(0, 40).map((e) => [
        e.messageId,
        e.senderDisplayName,
        String(e.messageCount ?? 1),
        e.source,
        formatDhakaDateTime(e.timestamp),
      ]),
      theme: 'plain',
      headStyles: { fillColor: [39, 39, 58], textColor: 255 },
      styles: { fontSize: 8 },
    });
  }

  docPdf.save(`MoonLight-Gang-Daily-Report-${targetDateKey}.pdf`);
}

export function exportMonthlyReportPdf(
  group: GroupRecord | null,
  dailyStats: DailyStatisticRecord[],
  rankedMembers: RankedMember[],
  targetMonthKey: string = getDhakaMonthKey()
) {
  const docPdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const creationDate = group?.creationDate || '0000-01-01';
  const monthDays = dailyStats
    .filter((d) => d.monthKey === targetMonthKey && d.dateKey >= creationDate)
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey));

  const monthTotal = monthDays.reduce((s, d) => s + d.totalMessages, 0);
  const activeDays = monthDays.filter((d) => d.totalMessages > 0).length;
  let peakDay = { dateKey: '—', totalMessages: 0 };
  for (const d of monthDays) {
    if (d.totalMessages > peakDay.totalMessages) peakDay = d;
  }

  docPdf.setFillColor(15, 15, 24);
  docPdf.rect(0, 0, 595, 92, 'F');
  docPdf.setTextColor(244, 244, 245);
  docPdf.setFont('helvetica', 'bold');
  docPdf.setFontSize(18);
  docPdf.text('MoonLight Gang Analytics — Monthly Report', 40, 42);
  docPdf.setFont('helvetica', 'normal');
  docPdf.setFontSize(10);
  docPdf.setTextColor(196, 181, 253);
  docPdf.text(
    `Group: ${group?.name || 'MoonLight Gang'}  |  Month (Asia/Dhaka): ${targetMonthKey}  |  Total: ${monthTotal} messages`,
    40,
    64
  );

  autoTable(docPdf, {
    startY: 118,
    head: [['Monthly Summary', 'Value']],
    body: [
      ['Total Messages This Month', String(monthTotal)],
      ['Active Days', String(activeDays)],
      ['Average per Active Day', activeDays > 0 ? (monthTotal / activeDays).toFixed(1) : '0'],
      ['Peak Single Day', peakDay.totalMessages > 0 ? `${peakDay.dateKey} (${peakDay.totalMessages})` : '—'],
    ],
    theme: 'grid',
    headStyles: { fillColor: [109, 40, 217], textColor: 255 },
    styles: { fontSize: 10 },
  });

  const yAfterSum =
    ((docPdf as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 240) + 22;

  docPdf.setFont('helvetica', 'bold');
  docPdf.setFontSize(12);
  docPdf.setTextColor(24, 24, 27);
  docPdf.text('Member Monthly Rankings', 40, yAfterSum);

  autoTable(docPdf, {
    startY: yAfterSum + 10,
    head: [['Rank', 'Member', 'Month Messages', 'Month Share', 'Lifetime Messages']],
    body:
      rankedMembers.length > 0
        ? rankedMembers.map((m) => [
            `#${m.rank}`,
            m.displayName,
            String(m.messagesThisMonth),
            `${m.shareMonthPct}%`,
            String(m.messagesLifetime),
          ])
        : [['—', 'No members recorded', '0', '0%', '0']],
    theme: 'striped',
    headStyles: { fillColor: [39, 39, 58], textColor: 255 },
    styles: { fontSize: 9 },
  });

  const yAfterMem =
    ((docPdf as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 400) + 22;

  docPdf.setFont('helvetica', 'bold');
  docPdf.setFontSize(12);
  docPdf.text(`Daily Totals (${targetMonthKey})`, 40, yAfterMem);

  autoTable(docPdf, {
    startY: yAfterMem + 10,
    head: [['Date (Asia/Dhaka)', 'Messages', 'Active Members']],
    body:
      monthDays.length > 0
        ? monthDays.map((d) => [d.dateKey, String(d.totalMessages), String(d.activeMemberCount)])
        : [['—', '0', '0']],
    theme: 'plain',
    headStyles: { fillColor: [39, 39, 58], textColor: 255 },
    styles: { fontSize: 9 },
  });

  docPdf.save(`MoonLight-Gang-Monthly-Report-${targetMonthKey}.pdf`);
}

export function exportMemberStatisticsCsv(rankedMembers: RankedMember[]) {
  const headers = [
    'Rank',
    'MemberID',
    'DisplayName',
    'Handle',
    'MessagesToday',
    'ShareTodayPct',
    'MessagesThisWeek',
    'ShareWeekPct',
    'MessagesThisMonth',
    'ShareMonthPct',
    'LifetimeMessages',
    'ShareLifetimePct',
    'LastActiveAt',
  ];

  const rows = rankedMembers.map((m) => [
    m.rank,
    m.memberId,
    `"${m.displayName.replace(/"/g, '""')}"`,
    `"${(m.handle || '').replace(/"/g, '""')}"`,
    m.messagesToday,
    m.shareTodayPct,
    m.messagesThisWeek,
    m.shareWeekPct,
    m.messagesThisMonth,
    m.shareMonthPct,
    m.messagesLifetime,
    m.shareLifetimePct,
    `"${m.lastActiveAt || ''}"`,
  ]);

  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  triggerDownload(
    new Blob([csv], { type: 'text/csv;charset=utf-8;' }),
    `moonlight-gang-members-${getDhakaDateKey()}.csv`
  );
}

export function exportLifetimeStatisticsCsv(
  group: GroupRecord | null,
  dailyStats: DailyStatisticRecord[],
  metrics: DashboardMetrics
) {
  const creationDate = group?.creationDate || getDhakaDateKey();
  const validDays = dailyStats
    .filter((d) => d.dateKey >= creationDate)
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey));

  const summaryLines = [
    `GroupName,"${group?.name || 'MoonLight Gang'}"`,
    `CreationDate,${creationDate}`,
    `Timezone,Asia/Dhaka`,
    `TotalLifetimeMessages,${metrics.lifetimeMessages}`,
    `TotalMembers,${metrics.totalMembers}`,
    `TotalActiveDays,${metrics.activeDaysSinceCreation}`,
    `AverageDailyMessages,${metrics.averageDailyMessages}`,
    `HighestDailyCount,${metrics.highestDailyCount}`,
    `HighestDailyDate,${metrics.highestDailyDate || ''}`,
    '',
    'DateKey,MonthKey,TotalMessages,ActiveMembers',
  ];

  const rows = validDays.map(
    (d) => `${d.dateKey},${d.monthKey},${d.totalMessages},${d.activeMemberCount}`
  );

  const csv = [...summaryLines, ...rows].join('\n');
  triggerDownload(
    new Blob([csv], { type: 'text/csv;charset=utf-8;' }),
    `moonlight-gang-lifetime-stats-${getDhakaDateKey()}.csv`
  );
}
