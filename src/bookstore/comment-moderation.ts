import type { AuditResultDetail } from './types.js';
import type { ContentAuditService } from './content-audit-service.js';
import {
  auditPublicTextContent,
  buildPublicTextBlockMessage,
} from '../compliance/public-text-moderation.js';

export async function auditCommentContent(params: {
  content: string;
  contentAuditService?: ContentAuditService;
  novelId?: string;
}): Promise<AuditResultDetail> {
  return auditPublicTextContent({
    content: params.content,
    contentAuditService: params.contentAuditService,
    novelId: params.novelId,
    operationKey: 'system.comment-audit',
    operationLabel: '评论审核',
  });
}

export function buildCommentBlockMessage(result: AuditResultDetail): string {
  return buildPublicTextBlockMessage(result, {
    subjectLabel: '评论',
    actionLabel: '发布',
  });
}
