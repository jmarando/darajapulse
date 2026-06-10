/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'

export interface TemplateEntry {
  component: React.ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  to?: string
  displayName?: string
  previewData?: Record<string, any>
}

import { template as contestDailySummary } from './contest-daily-summary.tsx'
import { template as campaignWeeklyReport } from './campaign-weekly-report.tsx'
import { template as contestDrawClosed } from './contest-draw-closed.tsx'
import { template as orgAdminWelcome } from './org-admin-welcome.tsx'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'contest-daily-summary': contestDailySummary,
  'campaign-weekly-report': campaignWeeklyReport,
  'contest-draw-closed': contestDrawClosed,
  'org-admin-welcome': orgAdminWelcome,
}
