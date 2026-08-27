/**
 * 速度基准脚本：对比"质量地板强制修订"开/关两种配置下的单章生成耗时。
 *
 * 直接调用 ChapterPipeline.generateChapter（不落库，不污染数据），
 * 对同一部小说的相同章节各生成一次，测量墙钟耗时与触发的 LLM 阶段数。
 *
 * 用法：npx tsx scripts/bench-revision-speed.ts <novelId> <fromChapter> <toChapter>
 */
import 'dotenv/config';
import type { AgentRole, NovelAgent, AgentEvent } from '../src/agents/types.js';
import type { PipelineMemory } from '../src/pipeline/types.js';
import { WorldBuilderAgent } from '../src/agents/world-builder.js';
import { CharacterAgent } from '../src/agents/character.js';
import { OutlineAgent } from '../src/agents/outline.js';
import { OpeningSupervisorAgent } from '../src/agents/opening-supervisor.js';
import { WriterAgent } from '../src/agents/writer.js';
import { EditorAgent } from '../src/agents/editor.js';
import { ReaderAgent } from '../src/agents/reader.js';
import { ForeshadowingSchedulerAgent } from '../src/agents/foreshadowing-scheduler.js';
import { ResizerAgent } from '../src/agents/resizer.js';
import { AuthorNoteWriterAgent } from '../src/agents/author-note-writer.js';
import { ChapterPipeline } from '../src/pipeline/chapter-pipeline.js';
import { NovelManager } from '../src/novel/novel-manager.js';
import { StoryStateManager } from '../src/novel/story-state-manager.js';
import { createModelClient } from '../src/models/provider.js';
import { getConfig, reloadConfig, getNovelsDir } from '../src/config/index.js';

class NoopMemory implements PipelineMemory {
  async searchChapterContext(): Promise<string> { return ''; }
  async searchWorldContext(): Promise<string> { return ''; }
  async searchCharacterContext(): Promise<string> { return ''; }
  async searchDigestContext(): Promise<string> { return ''; }
  async searchMultiQuery(): Promise<string> { return ''; }
  async searchArcContext(): Promise<string> { return ''; }
  async searchFactContext(): Promise<string> { return ''; }
  async searchThreadContext(): Promise<string> { return ''; }
  async searchCharacterStateContext(): Promise<string> { return ''; }
}

const novelId = process.argv[2] ?? 'd5451c83-7b97-4c57-ae15-c38cf638dcf3';
const fromChapter = parseInt(process.argv[3] ?? '7', 10);
const toChapter = parseInt(process.argv[4] ?? '9', 10);

function buildAgents(): Map<AgentRole, NovelAgent> {
  return new Map<AgentRole, NovelAgent>([
    ['world-builder', new WorldBuilderAgent()],
    ['character', new CharacterAgent()],
    ['outline', new OutlineAgent()],
    ['opening-supervisor', new OpeningSupervisorAgent()],
    ['writer', new WriterAgent()],
    ['editor', new EditorAgent()],
    ['reader', new ReaderAgent()],
    ['foreshadowing-scheduler', new ForeshadowingSchedulerAgent()],
    ['resizer', new ResizerAgent()],
    ['author-note-writer', new AuthorNoteWriterAgent()],
  ]);
}

interface RunStat {
  chapterNumber: number;
  ok: boolean;
  ms: number;
  chars: number;
  agentCalls: number;
  callsByRole: Record<string, number>;
  error?: string;
}

async function buildPipeline() {
  const config = getConfig();
  const novelsDir = getNovelsDir();
  const novelManager = new NovelManager(config.dataDir);
  const modelClient = createModelClient(config);
  const agents = buildAgents();
  const pipeline = new ChapterPipeline(
    agents,
    new NoopMemory(),
    novelManager,
    modelClient,
    config.chapterEnhancement as any,
    { contractEnabled: config.worldFeatures.contractEnabled, gateMode: config.worldFeatures.gateMode, strictFallbackToWarn: config.worldFeatures.strictFallbackToWarn, retrievalV2Enabled: config.worldFeatures.retrievalV2Enabled, retrievalTopK: config.worldFeatures.retrievalTopK },
    { gateMode: config.outlineFeatures.gateMode, strictFallbackToWarn: config.outlineFeatures.strictFallbackToWarn, maxRequired: config.outlineFeatures.maxRequired },
    { gateMode: config.qualityFeatures.gateMode, strictFallbackToWarn: config.qualityFeatures.strictFallbackToWarn, passScore: config.qualityFeatures.passScore, minStructureScore: config.qualityFeatures.minStructureScore, minStyleScore: config.qualityFeatures.minStyleScore, minEmotionScore: config.qualityFeatures.minEmotionScore },
    undefined,
    { gateMode: config.continuityFeatures.gateMode, strictFallbackToWarn: config.continuityFeatures.strictFallbackToWarn },
    { gateMode: config.powerRuleFeatures.gateMode, strictFallbackToWarn: config.powerRuleFeatures.strictFallbackToWarn },
  );
  const storyStateManager = new StoryStateManager(novelsDir);
  pipeline.setStoryStateManager(storyStateManager);
  return pipeline;
}

async function runOnce(label: string): Promise<RunStat[]> {
  console.log(`\n${'='.repeat(64)}\n[${label}] QUALITY_FLOOR_REVISION_ENABLED=${process.env.QUALITY_FLOOR_REVISION_ENABLED}\n${'='.repeat(64)}`);
  const pipeline = await buildPipeline();
  const stats: RunStat[] = [];
  for (let ch = fromChapter; ch <= toChapter; ch++) {
    const callsByRole: Record<string, number> = {};
    let agentCalls = 0;
    const controller = new AbortController();
    const started = Date.now();
    try {
      const result = await pipeline.generateChapter({
        novelId,
        chapterNumber: ch,
        userDirection: '',
        maxWordCount: 3000,
        signal: controller.signal,
        onEvent: (e: AgentEvent) => {
          if (e.type === 'agent:start') {
            agentCalls++;
            callsByRole[e.agentRole] = (callsByRole[e.agentRole] ?? 0) + 1;
          }
        },
      });
      const ms = Date.now() - started;
      stats.push({ chapterNumber: ch, ok: true, ms, chars: result.chapterContent?.length ?? 0, agentCalls, callsByRole });
      console.log(`  第${ch}章 ✓ ${(ms / 1000).toFixed(1)}s | ${result.chapterContent?.length ?? 0}字 | agent调用=${agentCalls} ${JSON.stringify(callsByRole)}`);
    } catch (err) {
      const ms = Date.now() - started;
      const error = err instanceof Error ? err.message : String(err);
      stats.push({ chapterNumber: ch, ok: false, ms, chars: 0, agentCalls, callsByRole, error });
      console.log(`  第${ch}章 ✗ ${(ms / 1000).toFixed(1)}s | 失败: ${error}`);
    }
  }
  return stats;
}

function summarize(label: string, stats: RunStat[]) {
  const ok = stats.filter(s => s.ok);
  const totalMs = stats.reduce((a, s) => a + s.ms, 0);
  const totalCalls = stats.reduce((a, s) => a + s.agentCalls, 0);
  const avgMs = ok.length ? ok.reduce((a, s) => a + s.ms, 0) / ok.length : 0;
  console.log(`\n[${label}] 汇总: 成功=${ok.length}/${stats.length} | 总耗时=${(totalMs / 1000).toFixed(1)}s | 平均/章=${(avgMs / 1000).toFixed(1)}s | 总agent调用=${totalCalls}`);
  return { label, okCount: ok.length, total: stats.length, totalMs, avgMs, totalCalls };
}

async function main() {
  console.log(`速度基准: novel=${novelId} 章节 ${fromChapter}-${toChapter}`);
  console.log(`模型: ${process.env.MODEL_PROVIDER} / ${process.env.MODEL_NAME}`);

  // A：旧行为（强制质量地板修订开启）
  process.env.QUALITY_FLOOR_REVISION_ENABLED = 'true';
  reloadConfig();
  const statsOld = await runOnce('A-旧行为(强制修订开)');
  const sumOld = summarize('A-旧行为(强制修订开)', statsOld);

  // B：新默认（AUTO_REVISION_ENABLED=false 时强制修订自动关闭）
  process.env.QUALITY_FLOOR_REVISION_ENABLED = 'false';
  reloadConfig();
  const statsNew = await runOnce('B-新默认(强制修订关)');
  const sumNew = summarize('B-新默认(强制修订关)', statsNew);

  console.log(`\n${'#'.repeat(64)}\n对比结果\n${'#'.repeat(64)}`);
  console.log(`A 旧行为: 平均 ${(sumOld.avgMs / 1000).toFixed(1)}s/章, 总 agent 调用 ${sumOld.totalCalls}`);
  console.log(`B 新默认: 平均 ${(sumNew.avgMs / 1000).toFixed(1)}s/章, 总 agent 调用 ${sumNew.totalCalls}`);
  if (sumOld.avgMs > 0 && sumNew.avgMs > 0) {
    const speedup = ((sumOld.avgMs - sumNew.avgMs) / sumOld.avgMs) * 100;
    const callDrop = sumOld.totalCalls - sumNew.totalCalls;
    console.log(`\n提速: ${speedup.toFixed(1)}% | agent 调用减少: ${callDrop} 次`);
  }
  process.exit(0);
}

main().catch(err => {
  console.error('基准脚本异常:', err);
  process.exit(1);
});
