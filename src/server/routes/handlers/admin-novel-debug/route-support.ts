import { z } from 'zod';
import { NovelOrganizationScopeValues } from '../../../../novel/novel-data-organizer.js';

export const NovelDebugListQuery = z.object({
  search: z.string().trim().max(100).optional(),
  ownerId: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  offset: z.coerce.number().int().min(0).default(0),
});

export const NovelDebugParams = z.object({
  novelId: z.string().uuid(),
});

export const NovelRollbackBody = z.object({
  backupId: z.string().regex(/^[a-zA-Z0-9_-]{1,160}$/u, '备份 ID 无效'),
  confirmNovelId: z.string().uuid(),
});

export const NovelOrganizeBody = z.object({
  scopes: z.array(z.enum(NovelOrganizationScopeValues)).min(1).max(NovelOrganizationScopeValues.length).optional(),
  apply: z.boolean().default(false),
  confirmNovelId: z.string().uuid().optional(),
  expectedPlanToken: z.string().regex(/^[a-f0-9]{64}$/u, '整理计划令牌无效').optional(),
}).superRefine((value, context) => {
  if (value.apply && value.confirmNovelId === undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['confirmNovelId'],
      message: '执行整理时必须确认小说 ID',
    });
  }
  if (value.apply && value.expectedPlanToken === undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['expectedPlanToken'],
      message: '执行整理时必须提供预览生成的计划令牌',
    });
  }
});

export const ChapterIntegrityRepairBody = z.object({
  apply: z.boolean().default(false),
  confirmNovelId: z.string().uuid().optional(),
  expectedPlanToken: z.string().regex(/^[a-f0-9]{64}$/u, '章节修复计划令牌无效').optional(),
}).superRefine((value, context) => {
  if (value.apply && value.confirmNovelId === undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['confirmNovelId'],
      message: '执行章节修复时必须确认小说 ID',
    });
  }
  if (value.apply && value.expectedPlanToken === undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['expectedPlanToken'],
      message: '执行章节修复时必须提供检查生成的计划令牌',
    });
  }
});

export function firstZodMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? '参数无效';
}
