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
import { template as workspaceAccess } from './workspace-access.tsx'
import { template as demoRequest } from './demo-request.tsx'
import { template as invoiceNotification } from './invoice-notification.tsx'
import { template as pakakumiOnboarding } from './pakakumi-onboarding.tsx'
import { template as roycoKickoffInvite } from './royco-kickoff-invite.tsx'
import { template as roycoLastTraining } from './royco-last-training.tsx'
import { template as roycoBriefLive } from './royco-brief-live.tsx'
import { template as roycoDraftDecision } from './royco-draft-decision.tsx'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'contest-daily-summary': contestDailySummary,
  'campaign-weekly-report': campaignWeeklyReport,
  'contest-draw-closed': contestDrawClosed,
  'workspace-access': workspaceAccess,
  'demo-request': demoRequest,
  'invoice-notification': invoiceNotification,
  'pakakumi-onboarding': pakakumiOnboarding,
  'royco-kickoff-invite': roycoKickoffInvite,
  'royco-last-training': roycoLastTraining,
  'royco-brief-live': roycoBriefLive,
  'royco-draft-decision': roycoDraftDecision,
}
