import type { Request, Response } from 'express';
import * as reportService from '../services/report.service';
import { recordAudit, requestContext } from '../services/audit.service';

/**
 * GET /api/sessions/:id/report?format=json|csv
 * Returns a full multi-round report. PDF/Excel are produced client-side from
 * the JSON payload (see frontend export utilities).
 */
export async function sessionReport(req: Request, res: Response): Promise<void> {
  const format = (req.query.format as string | undefined)?.toLowerCase() ?? 'json';
  const report = await reportService.buildSessionReport(req.params.id, new Date().toISOString());

  await recordAudit({ userId: req.user!.id, action: 'REPORT_EXPORT', entity: 'Session', entityId: req.params.id, context: requestContext(req), metadata: { format } });

  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="report-${report.code}.csv"`);
    res.send(reportService.reportToCsv(report));
    return;
  }

  res.json(report);
}
