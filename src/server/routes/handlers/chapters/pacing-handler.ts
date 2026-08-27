import type { Router } from 'express';
import { z } from 'zod';
import type { NovelManager } from '../../../../novel/novel-manager.js';
import type { ChapterOutline } from '../../../../novel/types.js';
import { evaluateQualityGate } from '../../../../pipeline/quality-gate.js';
import { buildStyleGuide } from '../../../../pipeline/chapter-enhancement.js';
import { safeErrorMessage } from '../../../middleware/safe-error-reply.js';
import { getConfig } from '../../../../config/index.js';

const QualityTrendQuery = z.object({
  from: z.coerce.number().int().positive().optional(),
  to: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
  failedOnly: z.preprocess((value) => {
    if (value === undefined) return undefined;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true') return true;
      if (normalized === 'false') return false;
    }
    return value;
  }, z.boolean().optional()),
});

const QUALITY_TREND_DEFAULT_LIMIT = 12;

export interface ChapterPacingDeps {
  novelManager: NovelManager;
}

export function registerPacingRoutes(router: Router, deps: ChapterPacingDeps): void {
  const { novelManager } = deps;

  // 获取节奏分析
  router.get('/pacing', async (req, res) => {
    try {
      const novelId = (req.params as Record<string, string>).novelId;
      const pacing = await novelManager.getPacing(novelId);
      res.json(pacing);
    } catch (err) {
      const message = safeErrorMessage(err, '获取节奏分析失败');
      res.status(500).json({ error: message });
    }
  });

  // 获取质量趋势
  router.get('/quality-trend', async (req, res) => {
    try {
      const novelId = (req.params as Record<string, string>).novelId;
      const parsedQuery = QualityTrendQuery.safeParse(req.query);
      if (!parsedQuery.success) {
        res.status(400).json({ error: parsedQuery.error.issues[0].message });
        return;
      }
      const { from, to, limit, failedOnly = false } = parsedQuery.data;
      if (from !== undefined && to !== undefined && from > to) {
        res.status(400).json({ error: '参数错误：from 不能大于 to' });
        return;
      }
      const effectiveLimit = limit ?? QUALITY_TREND_DEFAULT_LIMIT;

      const chapterMetas = await novelManager.listChapters(novelId);
      let chapterNumbers = chapterMetas
        .filter(meta => meta.wordCount > 0)
        .map(meta => meta.chapterNumber)
        .sort((a, b) => a - b);

      if (from !== undefined) chapterNumbers = chapterNumbers.filter(num => num >= from);
      if (to !== undefined) chapterNumbers = chapterNumbers.filter(num => num <= to);
      if (chapterNumbers.length > effectiveLimit) {
        chapterNumbers = chapterNumbers.slice(-effectiveLimit);
      }

      if (chapterNumbers.length === 0) {
        res.json({
          novelId,
          items: [],
          summary: {
            count: 0,
            passCount: 0,
            avgOverall: 0,
            avgStructure: 0,
            avgStyle: 0,
            avgEmotion: 0,
          },
          generatedAt: new Date().toISOString(),
        });
        return;
      }

      const [novel, outline] = await Promise.all([
        novelManager.getNovel(novelId),
        novelManager.getOutline(novelId),
      ]);
      const stylePreset = buildStyleGuide({ genre: novel.genre }).resolvedPreset;
      const cfg = getConfig();
      const thresholds = {
        passScore: cfg.qualityFeatures.passScore,
        minStructureScore: cfg.qualityFeatures.minStructureScore,
        minStyleScore: cfg.qualityFeatures.minStyleScore,
        minEmotionScore: cfg.qualityFeatures.minEmotionScore,
      };

      const chapters = await Promise.all(
        chapterNumbers.map(chapterNumber => novelManager.getChapter(novelId, chapterNumber)),
      );

      let items = chapters
        .filter((chapter): chapter is NonNullable<typeof chapter> => Boolean(chapter && chapter.content.trim()))
        .map((chapter) => {
          const chapterOutline = outline.chapters.find(item => item.chapterNumber === chapter.chapterNumber);
          const scenePlan = buildScenePlanFromChapterOutline(chapterOutline);
          const report = evaluateQualityGate({
            chapterContent: chapter.content,
            scenePlan,
            stylePreset,
            gateMode: 'strict',
            thresholds,
          });

          return {
            chapterNumber: chapter.chapterNumber,
            title: chapter.title,
            status: chapter.status,
            wordCount: chapter.wordCount,
            stylePreset,
            overallScore: report.overallScore,
            structureScore: report.structureScore,
            styleScore: report.styleScore,
            emotionScore: report.emotionScore,
            findingsCount: report.findings.length,
            passed: report.passed,
            summary: report.summary,
          };
        });
      if (failedOnly) {
        items = items.filter(item => !item.passed);
      }

      res.json({
        novelId,
        items,
        summary: buildQualityTrendSummary(items),
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      const message = safeErrorMessage(err, '获取章节质量趋势失败');
      res.status(500).json({ error: message });
    }
  });
}

function buildScenePlanFromChapterOutline(chapterOutline?: ChapterOutline): string | undefined {
  if (!chapterOutline || chapterOutline.keyEvents.length === 0) return undefined;
  return chapterOutline.keyEvents
    .slice(0, 6)
    .map((event, index) => `场景 ${index + 1}：${event}`)
    .join('\n');
}

function buildQualityTrendSummary(items: Array<{
  overallScore: number;
  structureScore: number;
  styleScore: number;
  emotionScore: number;
  passed: boolean;
}>): {
  count: number;
  passCount: number;
  avgOverall: number;
  avgStructure: number;
  avgStyle: number;
  avgEmotion: number;
} {
  const count = items.length;
  if (count === 0) {
    return {
      count: 0,
      passCount: 0,
      avgOverall: 0,
      avgStructure: 0,
      avgStyle: 0,
      avgEmotion: 0,
    };
  }

  const sum = items.reduce(
    (acc, item) => {
      acc.overall += item.overallScore;
      acc.structure += item.structureScore;
      acc.style += item.styleScore;
      acc.emotion += item.emotionScore;
      acc.pass += item.passed ? 1 : 0;
      return acc;
    },
    { overall: 0, structure: 0, style: 0, emotion: 0, pass: 0 },
  );

  const avg = (value: number) => Math.round((value / count) * 10) / 10;
  return {
    count,
    passCount: sum.pass,
    avgOverall: avg(sum.overall),
    avgStructure: avg(sum.structure),
    avgStyle: avg(sum.style),
    avgEmotion: avg(sum.emotion),
  };
}
