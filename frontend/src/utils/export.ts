import { pokerApi } from '@/services/pokerApi';

interface StoryRow {
  jiraStoryId: string | null;
  title: string;
  type: string;
  priority: string;
  finalEstimate: string | null;
  isLocked: boolean;
  rounds: Array<{ roundNumber: number; statistics: { average: number | null; consensusPercentage: number } }>;
}
interface Report {
  code: string;
  sprintName: string;
  generatedAt: string;
  totalStories: number;
  lockedStories: number;
  totalPoints: number;
  stories: StoryRow[];
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function toRows(report: Report): Array<Record<string, string | number>> {
  return report.stories.map((s) => {
    const last = s.rounds[s.rounds.length - 1];
    return {
      'Jira ID': s.jiraStoryId ?? '',
      Title: s.title,
      Type: s.type,
      Priority: s.priority,
      'Final Estimate': s.finalEstimate ?? '',
      Locked: s.isLocked ? 'Yes' : 'No',
      Rounds: s.rounds.length,
      'Last Avg': last?.statistics.average ?? '',
      'Consensus %': last?.statistics.consensusPercentage ?? '',
    };
  });
}

/** Export a session report in the requested format. Data is fetched with auth. */
export async function exportReport(sessionId: string, format: 'json' | 'csv' | 'excel' | 'pdf'): Promise<void> {
  const report = (await pokerApi.getReport(sessionId)) as Report;
  const base = `planning-poker-${report.code}`;

  if (format === 'json') {
    triggerDownload(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }), `${base}.json`);
    return;
  }

  const rows = toRows(report);
  const headers = Object.keys(rows[0] ?? { Title: '' });

  if (format === 'csv') {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [headers.map(esc).join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\n');
    triggerDownload(new Blob([csv], { type: 'text/csv' }), `${base}.csv`);
    return;
  }

  const tableRows = rows
    .map((r) => `<tr>${headers.map((h) => `<td>${r[h] ?? ''}</td>`).join('')}</tr>`)
    .join('');
  const table = `<table border="1"><thead><tr>${headers
    .map((h) => `<th>${h}</th>`)
    .join('')}</tr></thead><tbody>${tableRows}</tbody></table>`;

  if (format === 'excel') {
    // HTML-table workbook — opens natively in Excel / Google Sheets.
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body>${table}</body></html>`;
    triggerDownload(new Blob([html], { type: 'application/vnd.ms-excel' }), `${base}.xls`);
    return;
  }

  // pdf → open a print-optimised window; the user saves as PDF.
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(`
    <html><head><title>${base}</title>
    <style>
      body{font-family:Inter,Arial,sans-serif;padding:32px;color:#0f172a}
      h1{color:#4f46e5} table{border-collapse:collapse;width:100%;margin-top:16px}
      th,td{border:1px solid #cbd5e1;padding:8px;text-align:left;font-size:13px}
      th{background:#eef2ff}
    </style></head><body>
    <h1>🃏 Planning Poker Report</h1>
    <p><strong>Sprint:</strong> ${report.sprintName} &nbsp; <strong>Code:</strong> ${report.code}</p>
    <p><strong>Stories:</strong> ${report.totalStories} &nbsp; <strong>Estimated:</strong> ${report.lockedStories} &nbsp; <strong>Total points:</strong> ${report.totalPoints}</p>
    <p><small>Generated ${new Date(report.generatedAt).toLocaleString()}</small></p>
    ${table}
    </body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 300);
}
