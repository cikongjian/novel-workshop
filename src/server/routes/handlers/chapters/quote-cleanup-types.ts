import { z } from 'zod';
import type { NovelManager } from '../../../../novel/novel-manager.js';

export const CleanQuoteUsageBody = z.object({
  fromChapter: z.number().int().positive().optional(),
  toChapter: z.number().int().positive().optional(),
  chapterNumbers: z.array(z.number().int().positive()).max(300).optional(),
  selectedEdits: z.array(
    z.object({
      chapterNumber: z.number().int().positive(),
      editIds: z.array(z.string().min(1)).max(2000),
    }),
  ).max(300).optional(),
  rejectedQuoteTexts: z.array(z.string().min(1).max(100)).max(3000).optional(),
  maxPreview: z.number().int().positive().max(100).default(30),
}).superRefine((value, ctx) => {
  if (
    value.fromChapter !== undefined
    && value.toChapter !== undefined
    && value.fromChapter > value.toChapter
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'fromChapter 不能大于 toChapter',
      path: ['fromChapter'],
    });
  }
});

export type CleanQuoteUsageInput = z.infer<typeof CleanQuoteUsageBody>;

export interface ChapterQuoteDeps {
  novelManager: NovelManager;
}
