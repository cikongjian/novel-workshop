import type { Router } from 'express';
import type { NovelManager } from '../../../../novel/novel-manager.js';
import type { FinalizePipeline } from '../../../../pipeline/finalize-pipeline.js';
import type { AgentEvent, NovelAgent } from '../../../../agents/types.js';
import type { ModelClient } from '../../../../models/types.js';
import type { MomentsGenerator } from '../../../../character-moments/moments-generator.js';
import type { BookStoreManager } from '../../../../bookstore/bookstore-manager.js';
import type { UnifiedMessageService } from '../../../../services/unified-message-service.js';
import type { CharacterCardService } from '../../../../services/character-card-service.js';
import { triggerPlotMomentForChapter } from '../../../../character-moments/moments-chapter-hook.js';
import { getAiUsageContext, runWithAiUsageContextAsync } from '../../../../ai/usage-context.js';
import { safeErrorMessage } from '../../../middleware/safe-error-reply.js';
import { createLogger } from '../../../../utils/logger.js';

const logger = createLogger('FinalizePipeline');

export interface ChapterFinalizeDeps {
  novelManager: NovelManager;
  finalizePipeline?: FinalizePipeline;
  broadcast?: (event: AgentEvent) => void;
  momentsGenerator?: MomentsGenerator;
  agents?: Map<string, NovelAgent>;
  modelClient?: ModelClient;
  bookStoreManager?: BookStoreManager;
  messageService?: UnifiedMessageService;
  characterCardService?: CharacterCardService;
}

export function registerFinalizeRoutes(router: Router, deps: ChapterFinalizeDeps): void {
  const { novelManager, finalizePipeline, broadcast, momentsGenerator, agents, modelClient, bookStoreManager, messageService, characterCardService } = deps;

  router.post('/finalize/:num', async (req, res) => {
    try {
      const novelId = (req.params as Record<string, string>).novelId;
      const chapterNumber = parseInt(req.params.num, 10);
      if (Number.isNaN(chapterNumber) || chapterNumber < 1) {
        res.status(400).json({ error: '章节号无效' });
        return;
      }

      const chapter = await novelManager.getChapter(novelId, chapterNumber);
      if (!chapter) {
        res.status(404).json({ error: `未找到第 ${chapterNumber} 章` });
        return;
      }

      if (finalizePipeline && broadcast) {
        const aiUsageContext = getAiUsageContext();
        const force = req.query.force === 'true' || req.body?.force === true;

        res.json({ status: 'started', chapterNumber });

        void runWithAiUsageContextAsync(
          aiUsageContext ?? {
            scope: 'http',
            operationKey: 'chapter.finalize',
            operationLabel: 'Finalize chapter',
            operationRegistered: true,
            novelId,
            chapterNumber,
          },
          async () => {
            const stats = await finalizePipeline.finalize({
              novelId,
              chapterNumber,
              force,
              onEvent: (event: AgentEvent) => {
                broadcast(event);
              },
            });

            logger.info('chapter completed', { chapterNumber, stats });
            broadcast({
              type: 'pipeline:complete',
              agentRole: 'character-merger',
              novelId,
              chapterNumber,
              data: JSON.stringify(stats),
              timestamp: new Date().toISOString(),
            } as AgentEvent);
            await novelManager.syncNovelMetadataDebounced(novelId);

            // 章节定稿后自动触发角色朋友圈剧情动态（异步，不阻塞）
            if (momentsGenerator && agents && modelClient) {
              void triggerPlotMomentForChapter({
                novelManager, momentsGenerator, agents, modelClient, novelId, chapterNumber,
              }).catch((err) => {
                logger.warn('章节定稿后朋友圈动态生成失败', {
                  error: err instanceof Error ? err.message : String(err),
                });
              });
            }

            // 追更提醒：通知收藏该小说的读者（异步，不阻塞）
            if (bookStoreManager && messageService) {
              void (async () => {
                try {
                  const novel = await novelManager.getNovel(novelId);
                  if (!novel) return;
                  const book = await bookStoreManager.getBookByNovelId(novelId);
                  if (!book || !Array.isArray(book.favoritedBy) || book.favoritedBy.length === 0) return;
                  const chapterTitle = chapter.title || undefined;
                  for (const userId of book.favoritedBy) {
                    messageService.notifyChapterUpdate({
                      userId,
                      novelId,
                      novelTitle: novel.title || '未命名小说',
                      chapterNumber,
                      chapterTitle,
                    });
                  }
                  logger.info('追更提醒已发送', {
                    novelId,
                    chapterNumber,
                    recipientCount: book.favoritedBy.length,
                  });
                } catch (err) {
                  logger.warn('追更提醒发送失败', {
                    novelId,
                    chapterNumber,
                    error: err instanceof Error ? err.message : String(err),
                  });
                }
              })();
            }

            // 角色进化通知：检查本章是否有角色关键事件（isCritical=true），通知收藏该角色的用户
            if (characterCardService && messageService) {
              void (async () => {
                try {
                  const novel = await novelManager.getNovel(novelId);
                  if (!novel) return;
                  const characters = await novelManager.getCharacters(novelId);
                  const snapshots = await novelManager.getCharacterStateSnapshots(novelId);
                  // 筛选本章的关键快照
                  const criticalSnapshots = snapshots.filter(
                    (s) => s.chapterNumber === chapterNumber && s.isCritical,
                  );
                  if (criticalSnapshots.length === 0) return;
                  for (const snapshot of criticalSnapshots) {
                    const character = characters.find((c) => c.id === snapshot.characterId);
                    if (!character) continue;
                    // 获取收藏该角色的用户列表
                    const userIds = characterCardService.getUsersWhoCollectedCharacter(snapshot.characterId);
                    if (userIds.length === 0) continue;
                    // 构造进化类型描述
                    const evolutionType = buildEvolutionDescription(snapshot);
                    for (const userId of userIds) {
                      messageService.notifyCharacterEvolution({
                        userId,
                        characterId: snapshot.characterId,
                        characterName: character.name,
                        novelId,
                        novelTitle: novel.title || '未命名小说',
                        chapterNumber,
                        evolutionType,
                        portraitImagePath: character.portraitImagePath,
                      });
                    }
                    logger.info('角色进化通知已发送', {
                      novelId,
                      chapterNumber,
                      characterId: snapshot.characterId,
                      characterName: character.name,
                      recipientCount: userIds.length,
                    });
                  }
                } catch (err) {
                  logger.warn('角色进化通知发送失败', {
                    novelId,
                    chapterNumber,
                    error: err instanceof Error ? err.message : String(err),
                  });
                }
              })();
            }
          },
        ).catch((err) => {
          console.error(`[Finalize pipeline] chapter ${chapterNumber} failed`, err);
          broadcast({
            type: 'agent:error',
            agentRole: 'writing-assistant',
            novelId,
            chapterNumber,
            data: safeErrorMessage(err, '章节定稿失败'),
            timestamp: new Date().toISOString(),
          } as AgentEvent);
        });
        return;
      }

      const timestamp = new Date().toISOString();
      chapter.status = 'finalized';
      chapter.updatedAt = timestamp;
      await novelManager.saveChapter(novelId, chapter);
      await novelManager.syncNovelMetadataDebounced(novelId);

      // 简单定稿路径也触发朋友圈动态
      if (momentsGenerator && agents && modelClient) {
        void triggerPlotMomentForChapter({
          novelManager, momentsGenerator, agents, modelClient, novelId, chapterNumber,
        }).catch((err) => {
          logger.warn('简单定稿后朋友圈动态生成失败', {
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }

      res.json({
        status: 'completed',
        chapter,
        extracted: { worldEntries: 0, characters: 0 },
      });
    } catch (err) {
      const message = safeErrorMessage(err, '终稿流程执行失败');
      res.status(500).json({ error: message });
    }
  });
}

/**
 * 根据角色状态快照生成进化描述文案
 */
function buildEvolutionDescription(snapshot: { emotionState?: { primary?: string; trigger?: string }; goalProgress?: number; beliefShift?: string }): string {
  const parts: string[] = [];
  if (snapshot.emotionState?.primary && snapshot.emotionState.primary !== 'neutral') {
    const emotionLabel = EMOTION_LABEL_MAP[snapshot.emotionState.primary] || snapshot.emotionState.primary;
    parts.push(`情绪${emotionLabel}`);
    if (snapshot.emotionState.trigger) {
      parts.push(`（${snapshot.emotionState.trigger}）`);
    }
  }
  if (snapshot.goalProgress !== undefined && snapshot.goalProgress >= 80) {
    parts.push('目标接近达成');
  }
  if (snapshot.beliefShift) {
    parts.push(`信念转变：${snapshot.beliefShift.slice(0, 40)}`);
  }
  return parts.length > 0 ? parts.join('，') : '发生了关键变化';
}

const EMOTION_LABEL_MAP: Record<string, string> = {
  anger: '愤怒',
  fear: '恐惧',
  sadness: '悲伤',
  joy: '喜悦',
  calm: '平静',
  determined: '坚定',
  neutral: '中性',
};