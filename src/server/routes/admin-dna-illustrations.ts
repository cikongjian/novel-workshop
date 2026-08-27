import { Router } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ModelClient, ImageGenerationClient } from '../../models/types.js';
import { safeFetch, SAFE_FETCH_RESPONSE_LIMITS } from '../../utils/safe-fetch.js';
import { requireAdmin } from '../middleware/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface IllustrationMeta {
  questionId: number;
  prompt: string;
  hasImage: boolean;
  imagePath?: string;
  generatedAt?: string;
}

const ILLUSTRATIONS_DIR = path.resolve(__dirname, '../../../data/dna-illustrations');

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

async function readMeta(questionId: number): Promise<IllustrationMeta | null> {
  try {
    const raw = await fs.readFile(path.join(ILLUSTRATIONS_DIR, `${questionId}.json`), 'utf-8');
    return JSON.parse(raw);
  } catch { return null; }
}

async function writeMeta(meta: IllustrationMeta): Promise<void> {
  await ensureDir(ILLUSTRATIONS_DIR);
  await fs.writeFile(path.join(ILLUSTRATIONS_DIR, `${meta.questionId}.json`), JSON.stringify(meta, null, 2), 'utf-8');
}

async function imageExists(questionId: number): Promise<boolean> {
  try {
    await fs.access(path.join(ILLUSTRATIONS_DIR, `${questionId}.png`));
    return true;
  } catch { return false; }
}

export interface AdminDnaIllustrationDeps {
  modelClient: ModelClient;
  imageClient?: ImageGenerationClient;
}

// 问题标题摘要（与前端题库同步）
const QUESTION_TITLES: Record<number, string> = {};
function loadQuestionTitles() {
  // 从题库文件同步读取，避免硬编码重复
  try {
    // 运行时动态加载
  } catch { /* ignore */ }
}

export function createAdminDnaIllustrationRouter(deps: AdminDnaIllustrationDeps): Router {
  const router = Router();
  router.use(requireAdmin());

  // 列表：所有题目 + 插画状态
  router.get('/', async (_req, res) => {
    try {
      const list: Array<{ questionId: number; hasImage: boolean; prompt: string }> = [];
      for (let id = 1; id <= 35; id++) {
        const meta = await readMeta(id);
        const hasImg = await imageExists(id);
        list.push({
          questionId: id,
          hasImage: hasImg,
          prompt: meta?.prompt ?? '',
        });
      }
      res.json(list);
    } catch (err: unknown) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // 生成插画提示词（AI 润色原 prompt）
  router.post('/:questionId/generate-prompt', async (req, res) => {
    try {
      const questionId = parseInt(req.params.questionId, 10);
      if (isNaN(questionId) || questionId < 1 || questionId > 35) {
        res.status(400).json({ error: '无效的题目 ID' });
        return;
      }

      const { rawPrompt } = req.body ?? {};
      const base = typeof rawPrompt === 'string' && rawPrompt.trim()
        ? rawPrompt.trim()
        : '国风插画，氛围感场景';

      const messages = [
        { role: 'system' as const, content: '你是一位国风商业插画提示词设计师。请将简短描述扩展成一条适合 AI 文生图的中文提示词。要求：20-45 字，包含画面主体、构图、光线、色调和氛围，不要出现文字、题号或解释。' },
        { role: 'user' as const, content: `请扩写这条中文插画提示词：${base}` },
      ];

      console.log(`[dna-illustration] Q${questionId} generating prompt, base=${base.slice(0, 60)}`);
      const modelRes = await deps.modelClient.chat(messages, { temperature: 0.7, maxTokens: 256 });
      const content = modelRes.content;
      const optimizedPrompt = content?.trim() ?? '';

      if (!optimizedPrompt) {
        res.status(500).json({ error: '模型返回空内容，请检查模型配置或稍后重试' });
        return;
      }

      const meta: IllustrationMeta = {
        questionId,
        prompt: optimizedPrompt,
        hasImage: await imageExists(questionId),
      };
      await writeMeta(meta);

      res.json({ questionId, prompt: optimizedPrompt });
    } catch (err: unknown) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // 生成插画图片
  router.post('/:questionId/generate-image', async (req, res) => {
    try {
      if (!deps.imageClient) {
        res.status(400).json({ error: '图片服务未配置——请在系统设置中配置文生图模型（如 DALL-E / GPT image）' });
        return;
      }

      const questionId = parseInt(req.params.questionId, 10);
      if (isNaN(questionId) || questionId < 1 || questionId > 35) {
        res.status(400).json({ error: '无效的题目 ID' });
        return;
      }
      const meta = await readMeta(questionId);
      const submittedPrompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
      const prompt = submittedPrompt || meta?.prompt?.trim() || '';
      if (!prompt) {
        res.status(400).json({ error: '请先生成或设置提示词' });
        return;
      }
      const nextMeta: IllustrationMeta = {
        questionId,
        prompt,
        hasImage: await imageExists(questionId),
        imagePath: meta?.imagePath,
        generatedAt: meta?.generatedAt,
      };

      console.log(`[dna-illustration] Q${questionId} generating image, prompt=${prompt.slice(0, 80)}...`);
      const result = await deps.imageClient.generate(prompt, { size: '1024x1024' });
      console.log(`[dna-illustration] Q${questionId} result: imageUrl=${!!result.imageUrl}, b64Data=${!!result.b64Data}`);

      let bytes: Buffer;
      if (result.b64Data) {
        bytes = Buffer.from(result.b64Data, 'base64');
      } else if (result.imageUrl) {
        const resp = await safeFetch(result.imageUrl, {
          maxResponseBytes: SAFE_FETCH_RESPONSE_LIMITS.image,
        });
        if (!resp.ok) throw new Error(`下载生成图像失败: HTTP ${resp.status}`);
        bytes = Buffer.from(await resp.arrayBuffer());
      } else {
        throw new Error('图像生成失败：未返回图像内容');
      }

      await ensureDir(ILLUSTRATIONS_DIR);
      await fs.writeFile(path.join(ILLUSTRATIONS_DIR, `${questionId}.png`), bytes);

      nextMeta.hasImage = true;
      nextMeta.imagePath = path.join(ILLUSTRATIONS_DIR, `${questionId}.png`);
      nextMeta.generatedAt = new Date().toISOString();
      await writeMeta(nextMeta);

      res.json({ questionId, hasImage: true, revisedPrompt: result.revisedPrompt, b64Data: result.b64Data });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'unknown error';
      console.error(`[dna-illustration] generate-image failed:`, msg);
      res.status(500).json({ error: msg });
    }
  });

  // 预览插画
  router.get('/:questionId/preview', async (req, res) => {
    try {
      const questionId = parseInt(req.params.questionId, 10);
      const imgPath = path.join(ILLUSTRATIONS_DIR, `${questionId}.png`);
      try {
        await fs.access(imgPath);
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        const buf = await fs.readFile(imgPath);
        res.end(buf);
      } catch {
        res.status(404).json({ error: '插画未生成' });
      }
    } catch (err: unknown) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // 手动修改提示词
  router.put('/:questionId/prompt', async (req, res) => {
    try {
      const questionId = parseInt(req.params.questionId, 10);
      const { prompt } = req.body ?? {};
      if (typeof prompt !== 'string' || !prompt.trim()) {
        res.status(400).json({ error: 'prompt 不能为空' });
        return;
      }

      const meta: IllustrationMeta = {
        questionId,
        prompt: prompt.trim(),
        hasImage: await imageExists(questionId),
      };
      await writeMeta(meta);
      res.json(meta);
    } catch (err: unknown) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // 删除插画
  router.delete('/:questionId', async (req, res) => {
    try {
      const questionId = parseInt(req.params.questionId, 10);
      const imgPath = path.join(ILLUSTRATIONS_DIR, `${questionId}.png`);
      try { await fs.unlink(imgPath); } catch { /* ignore */ }
      try { await fs.unlink(path.join(ILLUSTRATIONS_DIR, `${questionId}.json`)); } catch { /* ignore */ }

      res.json({ questionId, deleted: true });
    } catch (err: unknown) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  return router;
}
