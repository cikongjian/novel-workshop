import type { Request } from 'express';
import {
  type ComplianceEventInput,
  type ComplianceEventManager,
  buildComplianceRequestContext,
} from './compliance-event-manager.js';

export async function recordComplianceEventFromRequest(
  req: Request,
  complianceEventManager: ComplianceEventManager | undefined,
  input: Omit<ComplianceEventInput, 'request'>,
): Promise<void> {
  if (!complianceEventManager) {
    return;
  }

  await complianceEventManager.record({
    ...input,
    request: buildComplianceRequestContext(req),
  });
}
