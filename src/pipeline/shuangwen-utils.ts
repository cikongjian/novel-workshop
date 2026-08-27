import { OutlineData, type OutlineData as OutlineDataType } from '../novel/types.js';
import type { ShuangwenBlueprint, ShuangwenAudience } from './shuangwen-types.js';

const GENERATED_CHAPTER_TITLE_RE = /^\s*(?:#{1,6}\s*)?第\s*[一二三四五六七八九十百千万零〇\d]+\s*章[^\n]*(?:\r?\n)+/;
const TERMINAL_HOOK_NOTE_LINE_RE = /^(?:#{1,6}\s*)?(?:在末尾留下钩子|章末钩子|钩子|下一章看点|悬念提示)\s*[：:]/;

function stripGeneratedChapterArtifacts(text: string): string {
  let result = text.trim();
  while (GENERATED_CHAPTER_TITLE_RE.test(result)) {
    result = result.replace(GENERATED_CHAPTER_TITLE_RE, '').trimStart();
  }

  const lines = result.split(/\r?\n/);
  const lastLine = lines.at(-1)?.trim() ?? '';
  if (TERMINAL_HOOK_NOTE_LINE_RE.test(lastLine) || /^(?:在末尾留下钩子|下一章看点|悬念提示)/.test(lastLine)) {
    result = lines.slice(0, -1).join('\n').trimEnd();
  }

  return result.trim();
}

export function parseEditorOutput(raw: string): { polishedText: string; editorNotes: string; statusUpdate: string } {
  let text = raw;
  let editorNotes = '';
  let statusUpdate = '';

  // 1. 处理 ---EDITOR_NOTES--- 分隔符
  const separatorIdx = text.indexOf('---EDITOR_NOTES---');
  if (separatorIdx !== -1) {
    editorNotes = text.slice(separatorIdx + '---EDITOR_NOTES---'.length).trim();
    text = text.slice(0, separatorIdx).trim();
  }

  // 2. 处理 "修改说明" 标题
  const notesMatch = text.match(/\n#{1,3}\s*修改说明\s*\n/);
  if (notesMatch && notesMatch.index !== undefined) {
    if (!editorNotes) editorNotes = text.slice(notesMatch.index).trim();
    text = text.slice(0, notesMatch.index).trim();
  }

  // 3. 提取并移除 AI 添加的元数据块（章末状态更新等）
  // 这些内容不应该出现在正文中，但保存到 statusUpdate 供下一章参考
  const metadataPatterns = [
    // 章末状态更新块（提取整个块）
    /\n*---+\s*\n*(\*{0,2}章末状态更新\*{0,2}[\s\S]*?)$/i,
    // 末尾的分隔线和后续内容
    /\n*---+\s*\n*((?:#{1,3}\s*)?(?:状态|更新|总结)[\s\S]*?)$/i,
  ];

  for (const pattern of metadataPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      statusUpdate = match[1].trim();
      text = text.replace(pattern, '');
      break; // 只提取一次
    }
  }

  // 4. 提取并移除正文中的"状态备注行"（常见为整行加粗的数值/等级变化提示）
  // 例如：**军心稳定度-15。** / **威胁等级：极高。**
  // 这些内容不应出现在正文中，移入 statusUpdate 供下一章参考。
  const extractedInlineMeta = new Set<string>();
  const inlineMetaKeywords = /等级|稳定度|好感度|忠诚度|声望|军心|威胁|秘密|风险|收益|危机|状态|数值|触发|提示/;
  const inlineMetaLevelHint = /[：:]\s*(?:极高|很高|高|中|低|未知)/;
  const inlineMetaDelta = /[+-]\s*\d+/;

  const lines = text.split(/\r?\n/);
  const keptLines: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      keptLines.push(line);
      continue;
    }

    const boldLine = trimmed.match(/^(?:[-*]\s*)?\*{2}\s*(.+?)\s*\*{2}\s*$/);
    if (!boldLine) {
      keptLines.push(line);
      continue;
    }

    const inner = boldLine[1]?.trim() ?? '';
    const isMeta = Boolean(inner)
      && (inlineMetaKeywords.test(inner) || inlineMetaLevelHint.test(inner) || inlineMetaDelta.test(inner));

    if (!isMeta) {
      keptLines.push(line);
      continue;
    }

    extractedInlineMeta.add(inner);
  }

  text = keptLines.join('\n').trim();

  if (extractedInlineMeta.size > 0) {
    const payload = Array.from(extractedInlineMeta).map(item => `- ${item}`).join('\n');
    const block = `章内状态备注（已从正文移除）：
${payload}`;
    statusUpdate = statusUpdate
      ? `${statusUpdate}\n\n${block}`.trim()
      : block;
  }

  // 5. 清理正文中残留的状态行（这些不应该在正文中间出现）
  const inlineStatusPatterns = [
    // 权力威望、危机等级等状态行
    /\n+(?:\*{1,2})?(?:权力威望|危机等级|关键收获|下一步行动触发器|状态更新|章末总结)(?:\*{1,2})?[：:].*/gi,
    // 带有 emoji 的状态行
    /\n+[📊🎯⚡💰🔥✨🌟⭐]+\s*(?:权力|威望|等级|收获|触发器|状态).*/gi,
  ];

  for (const pattern of inlineStatusPatterns) {
    text = text.replace(pattern, '');
  }

  text = stripGeneratedChapterArtifacts(text);

  return { polishedText: text.trim(), editorNotes, statusUpdate };
}

export function getAudienceRules(audience: ShuangwenAudience): string {
  if (audience === 'male') {
    return [
      '【男频爽文规则】',
      '- 核心是"变强/变有钱/变有权"的可见增量，爽点要可量化、可验证。',
      '- 结构循环：受挫(或被轻视) → 得挂/信息差 → 反击打脸 → 围观震惊 → 立更大目标/更强敌人。',
      '- 章末必须留钩子：新威胁、新收益、新反转，避免平铺直叙收尾。',
    ].join('\n');
  }
  return [
    '【女频甜爽规则】',
    '- 核心是"被偏爱/情绪兑现/关系推进"的清晰节拍，甜点要落地到行为与选择。',
    '- 结构循环：误会/压抑 → 关键触发 → 明确偏爱或反转 → 情绪回落 → 抛出更强张力。',
    '- 章末必须留钩子：关系转折、身份反差、误会升级或选择题。',
  ].join('\n');
}

export function coerceOutlineData(payload: unknown, desiredChapters: number): OutlineDataType {
  const root = (payload && typeof payload === 'object') ? (payload as Record<string, unknown>) : {};
  const rawChapters = Array.isArray(root.chapters)
    ? root.chapters
    : (Array.isArray(payload) ? payload : []);

  const chapters: Array<Record<string, unknown>> = [];
  for (let i = 0; i < rawChapters.length && chapters.length < desiredChapters; i += 1) {
    const item = rawChapters[i];
    if (!item || typeof item !== 'object') continue;
    chapters.push(item as Record<string, unknown>);
  }

  const normalized = chapters.map((item, index) => {
    const chapterNumber = Number.isInteger(item.chapterNumber) && Number(item.chapterNumber) > 0
      ? Number(item.chapterNumber)
      : index + 1;
    const tension = typeof item.tensionTarget === 'number'
      ? Math.max(0, Math.min(10, item.tensionTarget))
      : 5;
    const keyEvents = Array.isArray(item.keyEvents)
      ? item.keyEvents.filter(v => typeof v === 'string' && v.trim()).slice(0, 12)
      : [];
    return {
      chapterNumber,
      title: typeof item.title === 'string' ? item.title.slice(0, 80) : '',
      summary: typeof item.summary === 'string' ? item.summary.slice(0, 4000) : '',
      tensionTarget: tension,
      keyEvents,
      notes: typeof item.notes === 'string' ? item.notes.slice(0, 1200) : '',
      beats: [],
      plotThreadsAdvanced: [],
    };
  });

  const compact = normalized.filter(item => (
    item.chapterNumber > 0
  ));

  const reindexed = compact.map((item, idx) => ({ ...item, chapterNumber: idx + 1 }));

  return OutlineData.parse({
    chapters: reindexed,
    plotThreads: [],
    foreshadowing: [],
  });
}

/**
 * 根据章节在全书中的位置，返回叙事阶段信息。
 * 五幕式：开篇 → 发展 → 转折 → 高潮 → 收束
 */
export function getNarrativePhase(chapterNumber: number, totalChapters: number): {
  phase: 'opening' | 'development' | 'turning' | 'climax' | 'resolution';
  label: string;
  tensionBase: number;
} {
  const ratio = chapterNumber / totalChapters;
  if (ratio <= 0.15) return { phase: 'opening', label: '开篇', tensionBase: 7 };
  if (ratio <= 0.50) return { phase: 'development', label: '发展', tensionBase: 5 };
  if (ratio <= 0.70) return { phase: 'turning', label: '转折', tensionBase: 7 };
  if (ratio <= 0.85) return { phase: 'climax', label: '高潮', tensionBase: 9 };
  return { phase: 'resolution', label: '收束', tensionBase: 6 };
}

/**
 * 各叙事阶段的章节模板池。
 * 每个阶段提供多组 title/summaryTemplate，按 index 轮转避免重复。
 * summaryTemplate 中的占位符会在运行时替换。
 */
const PHASE_TEMPLATES: Record<string, Array<{ title: string | null; summaryTemplate: string }>> = {
  opening: [
    {
      title: null,
      summaryTemplate: '开局冲突：{opening}\n引爆事件：{inciting}\n爽点/甜点：埋下信息差与反击路径，保证读者看到"将要兑现"的承诺。\n章末钩子：遵循"{hookRule}"。',
    },
    {
      title: '升温推进',
      summaryTemplate: '开局冲突：围绕上一章的引爆事件，外部压力加码且可验证。\n爽点/甜点：按循环公式推进：{cycle}\n章末钩子：引出更强对手/更高收益/更尖锐误会。',
    },
    {
      title: '首次兑现',
      summaryTemplate: '开局冲突：{protagonist}被逼到必须出手的节点，代价与收益明确。\n爽点/甜点：兑现一次清晰的增量：{payoff}\n章末钩子：升级规则：{escalation}',
    },
  ],
  development: [
    {
      title: '势力试探',
      summaryTemplate: '{protagonist}初步接触更大的势力格局，发现当前实力远远不够。\n新信息差出现：获得关键情报或资源线索，但需要付出代价。\n按循环公式推进：{cycle}\n章末钩子：一个意想不到的盟友或敌人浮出水面。',
    },
    {
      title: '暗流涌动',
      summaryTemplate: '表面平静下暗藏危机，{protagonist}察觉到异常信号。\n副线推进：次要角色的行动开始影响主线走向。\n升级规则：{escalation}\n章末钩子：遵循"{hookRule}"。',
    },
    {
      title: '资源争夺',
      summaryTemplate: '{protagonist}与竞争者争夺关键资源/机会/地位。\n爽点兑现：通过信息差或隐藏实力赢得阶段性胜利。\n代价：胜利引来更强势力的注意。\n章末钩子：更高层级的对手正式登场。',
    },
    {
      title: '信任危机',
      summaryTemplate: '盟友之间出现裂痕或误会，{protagonist}面临信任考验。\n内外冲突交织：外部压力加剧内部矛盾。\n按循环公式推进：{cycle}\n章末钩子：一个关键秘密即将被揭露。',
    },
    {
      title: '实力跃升',
      summaryTemplate: '{protagonist}突破瓶颈，获得可量化的实力/地位/资源增长。\n爽点兑现：此前埋下的伏笔在此回收，带来超预期收益。\n升级规则：{escalation}\n章末钩子：新的、更危险的挑战随之而来。',
    },
    {
      title: '布局落子',
      summaryTemplate: '{protagonist}开始主动布局而非被动应对。\n关键决策：做出一个影响后续走向的重大选择。\n副线收束：一条副线在此阶段得到阶段性结论。\n章末钩子：遵循"{hookRule}"。',
    },
  ],
  turning: [
    {
      title: '真相浮现',
      summaryTemplate: '核心秘密被部分揭露，{protagonist}对世界/对手的认知发生根本转变。\n情感冲击：信任的人可能是敌人，或敌人有不得已的苦衷。\n升级规则：{escalation}\n章末钩子：必须立刻做出不可逆的选择。',
    },
    {
      title: '绝境逆转',
      summaryTemplate: '{protagonist}陷入前所未有的困境，所有退路被切断。\n爽点/甜点：在绝境中找到突破口，展现核心竞争力。\n按循环公式推进：{cycle}\n章末钩子：逆转成功但代价惨重，引出更大危机。',
    },
    {
      title: '阵营重组',
      summaryTemplate: '原有的敌我格局被打破，阵营发生重大变化。\n{protagonist}必须重新评估所有关系。\n关键伏笔回收：此前埋下的暗线在此爆发。\n章末钩子：遵循"{hookRule}"。',
    },
  ],
  climax: [
    {
      title: '决战前夜',
      summaryTemplate: '所有线索汇聚，{protagonist}为最终对决做准备。\n情感高点：与关键角色的关系达到最深刻的时刻。\n升级规则：{escalation}\n章末钩子：决战一触即发。',
    },
    {
      title: '终极对决',
      summaryTemplate: '{protagonist}与核心对手正面交锋，赌注是一切。\n爽点/甜点：全书最大的爽点在此兑现，所有积累的优势集中爆发。\n伏笔总回收：关键伏笔在此完成闭环。\n章末钩子：胜负已分但故事未完。',
    },
    {
      title: '代价与收获',
      summaryTemplate: '决战的余波：{protagonist}付出了什么，得到了什么。\n格局变化：世界/势力格局因这场对决而永久改变。\n按循环公式推进：{cycle}\n章末钩子：遵循"{hookRule}"。',
    },
  ],
  resolution: [
    {
      title: '新的秩序',
      summaryTemplate: '尘埃落定，{protagonist}在新格局中找到自己的位置。\n角色弧完成：主角的成长在此得到最终确认。\n副线收束：所有未完结的副线在此交代结局。\n章末钩子：留下一个开放性的悬念或展望。',
    },
    {
      title: '余波未平',
      summaryTemplate: '主线虽已解决，但新的种子已经埋下。\n{protagonist}面对胜利后的新挑战或新目标。\n升级规则：{escalation}\n章末钩子：暗示更大的世界和更远的旅程。',
    },
  ],
};

export function buildFallbackOutlineFromBlueprint(params: {
  blueprint: ShuangwenBlueprint;
  desiredChapters: number;
}): OutlineDataType {
  const desired = Math.max(1, Math.min(60, params.desiredChapters));
  const opening = params.blueprint.hook.openingScene.trim();
  const inciting = params.blueprint.hook.incitingIncident.trim();
  const payoff = params.blueprint.hook.firstPayoff.trim();
  const hookRule = params.blueprint.hook.chapterEndHookRule.trim() || '新威胁/新收益/新反转';
  const cycle = params.blueprint.engine.cycleFormula.trim() || '受挫→信息差→反击→震惊→新目标';
  const escalation = params.blueprint.engine.escalationRule.trim() || '敌人更强/资源更大/代价更高';
  const protagonist = params.blueprint.protagonist?.name?.trim() || '主角';

  const replacePlaceholders = (tpl: string): string =>
    tpl
      .replace(/\{opening\}/g, opening || `围绕${protagonist}制造一个立刻可感知的危机`)
      .replace(/\{inciting\}/g, inciting || '突发事件迫使主角立刻做出选择')
      .replace(/\{payoff\}/g, payoff || '打脸/翻盘/资源到账/关系推进')
      .replace(/\{hookRule\}/g, hookRule)
      .replace(/\{cycle\}/g, cycle)
      .replace(/\{escalation\}/g, escalation)
      .replace(/\{protagonist\}/g, protagonist);

  // 记录每个阶段已使用的模板索引
  const phaseCounters: Record<string, number> = {};

  const chapters = Array.from({ length: desired }, (_, idx) => {
    const chapterNumber = idx + 1;
    const { phase, tensionBase } = getNarrativePhase(chapterNumber, desired);
    const baseNotes = '兜底大纲：模型输出解析失败，建议稍后在"大纲"页重新生成。';

    const templates = PHASE_TEMPLATES[phase] || PHASE_TEMPLATES.development!;
    const counter = phaseCounters[phase] ?? 0;
    const tpl = templates[counter % templates.length]!;
    phaseCounters[phase] = counter + 1;

    // 紧张度在基准上做小幅波动，避免平直
    const tensionJitter = (chapterNumber % 3 === 0) ? 1 : (chapterNumber % 3 === 1) ? -1 : 0;
    const tensionTarget = Math.max(1, Math.min(10, tensionBase + tensionJitter));

    return {
      chapterNumber,
      title: tpl.title ?? '',
      summary: replacePlaceholders(tpl.summaryTemplate),
      tensionTarget,
      keyEvents: [] as string[],
      notes: baseNotes,
      beats: [],
      plotThreadsAdvanced: [],
    };
  });

  return OutlineData.parse({ chapters, plotThreads: [], foreshadowing: [] });
}
