import type { Router } from 'express';
import type { ChatMessage } from '../../../models/types.js';
import { safeErrorMessage } from '../../middleware/safe-error-reply.js';
import { BackfillSpeakersBody } from './types.js';
import type { GenerateDeps } from './types.js';
import { resolveUserModelAccess } from '../helpers/user-api-model-resolver.js';
import { buildCharacterAliasMap } from './speaker-backfill-character-support.js';
import { createMarkerNormalizers } from './speaker-backfill-marker-normalizer.js';
import { buildSpeakerSystemPrompt } from './speaker-backfill-prompt.js';
import { splitSpeakerSections } from './speaker-backfill-section-splitter.js';

export function registerSpeakerBackfillRoutes(router: Router, deps: GenerateDeps): void {
  const { novelManager, modelClient, authDb } = deps;

  router.post('/backfill-speakers', async (req, res) => {
    try {
      const parsed = BackfillSpeakersBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0].message });
        return;
      }
      const { novelId: nid, chapterNumber } = parsed.data;
      const novel = await novelManager.getNovel(nid);
      if (!novel) {
        res.status(404).json({ error: '小说不存在' });
        return;
      }
      const modelAccess = await resolveUserModelAccess({
        authDb,
        userId: req.auth?.id,
        headers: req.headers,
        novel,
      });
      if (modelAccess.error && novel.modelConfig?.source === 'user-profile') {
        res.status(400).json({ error: modelAccess.error, code: 'USER_API_UNAVAILABLE' });
        return;
      }
      const chapter = await novelManager.getChapter(nid, chapterNumber);
      if (!chapter) {
        res.status(404).json({ error: `第 ${chapterNumber} 章不存在` });
        return;
      }
      if (!chapter.content.trim()) {
        res.status(400).json({ error: '章节内容为空' });
        return;
      }
      const characters = await novelManager.getCharacters(nid);
      const hasCharacterProfiles = characters.length > 0;
      const { nameNormMap, charInfoLines } = buildCharacterAliasMap(characters);
      const { normalizeMarkers, fillMissingMarkers } = createMarkerNormalizers(characters, nameNormMap, hasCharacterProfiles);
      const systemPrompt = buildSpeakerSystemPrompt(hasCharacterProfiles, charInfoLines);
      const sections = splitSpeakerSections(chapter.content);

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();
      res.write(`data: ${JSON.stringify({ type: 'chunk', content: '' })}\n\n`);

      const markedSections: string[] = [];
      for (let i = 0; i < sections.length; i += 1) {
        const section = sections[i];
        if (!section.includes('“')) {
          markedSections.push(section);
          res.write(`data: ${JSON.stringify({ type: 'chunk', content: (i > 0 ? '\n\n***\n\n' : '') + section })}\n\n`);
          continue;
        }
        let contextHint = '';
        if (i > 0) {
          const prevSection = markedSections[i - 1];
          const prevLines = prevSection.split('\n').filter((l: string) => l.trim());
          const lastFewLines = prevLines.slice(-3).join('\n');
          contextHint = `\n\n【前文末尾（仅供参考，不要输出这部分）】\n${lastFewLines}\n\n`;
        }
        const userContent = `请为以下文本片段添加说话人标记，直接输出标注后的完整文本，不要添加任何前缀说明或解释：${contextHint}\n【需要标注的文本（只输出这部分的标注结果）】\n${section}`;
        const messages: ChatMessage[] = [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ];
        let sectionContent = '';
        if (i > 0) {
          res.write(`data: ${JSON.stringify({ type: 'chunk', content: '\n\n***\n\n' })}\n\n`);
        }
        await (modelAccess.client ?? modelClient).chatStream(messages, { temperature: 0.3 }, (chunk: string) => {
          sectionContent += chunk;
          res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`);
        });
        markedSections.push(sectionContent);
      }
      const fullContent = markedSections.join('\n\n***\n\n');
      const normalizedContent = fillMissingMarkers(normalizeMarkers(fullContent));
      res.write(`data: ${JSON.stringify({ type: 'done', content: normalizedContent })}\n\n`);
      res.end();
    } catch (err) {
      const message = safeErrorMessage(err, '补全说话人标记失败');
      if (!res.headersSent) {
        res.status(500).json({ error: message });
      } else {
        res.write(`data: ${JSON.stringify({ type: 'error', message })}\n\n`);
        res.end();
      }
    }
  });
}
