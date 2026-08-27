
// 验证脚本：角色认知边界系统
import {
  buildKnowledgeScope,
  renderKnowledgeBoundaryPrompt,
  filterChapterSummaryForCharacter,
} from '../src/novel/character-knowledge-boundary.ts';
import { buildFullSoulPrompt } from '../src/novel/character-soul-context.ts';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${message}`);
  } else {
    failed++;
    console.error(`  ❌ ${message}`);
  }
}

function section(title) {
  console.log(`\n=== ${title} ===`);
}

// ─── 测试数据 ──────────────────────────────────────────────────────────

const testCharacter = {
  id: 'char-001',
  name: '林墨',
  role: 'protagonist',
  firstAppearance: 3,
  drives: { secret: '他其实是穿越者' },
  persona: { publicPersona: '温文尔雅的书生', privatePersona: '内心吐槽役' },
};

const testEvents = [
  { id: 'e1', characterId: 'char-001', chapterNumber: 3, summary: '初入青云宗', type: 'encounter', relatedCharacterIds: ['char-002'], importance: 5, createdAt: '2024-01-01T00:00:00Z' },
  { id: 'e2', characterId: 'char-001', chapterNumber: 3, summary: '结识师兄苏白', type: 'relationship', relatedCharacterIds: ['char-002'], importance: 4, createdAt: '2024-01-01T00:00:00Z' },
  { id: 'e3', characterId: 'char-001', chapterNumber: 5, summary: '获得上古剑谱', type: 'achievement', relatedCharacterIds: [], importance: 5, createdAt: '2024-01-01T00:00:00Z' },
  { id: 'e4', characterId: 'char-001', chapterNumber: 7, summary: '与魔族首次交锋', type: 'action', relatedCharacterIds: ['char-003'], importance: 4, createdAt: '2024-01-01T00:00:00Z' },
  { id: 'e5', characterId: 'char-001', chapterNumber: 8, summary: '发现宗门内奸线索', type: 'revelation', relatedCharacterIds: ['char-004'], importance: 5, createdAt: '2024-01-01T00:00:00Z' },
  { id: 'e6', characterId: 'char-001', chapterNumber: 10, summary: '修为突破至筑基期', type: 'achievement', relatedCharacterIds: [], importance: 4, createdAt: '2024-01-01T00:00:00Z' },
];

const testFacts = [
  { chapterNumber: 3, fact: { locations: ['青云宗山门', '迎客殿'], characterPositions: [{ characterId: 'char-001', characterName: '林墨', location: '青云宗山门' }] } },
  { chapterNumber: 5, fact: { locations: ['藏经阁', '后山'], characterPositions: [{ characterId: 'char-001', characterName: '林墨', location: '藏经阁' }] } },
  { chapterNumber: 7, fact: { locations: ['魔道边境', '迷雾森林'], characterPositions: [{ characterId: 'char-001', characterName: '林墨', location: '迷雾森林' }] } },
  { chapterNumber: 10, fact: { locations: ['闭关室', '演武场'], characterPositions: [{ characterId: 'char-001', characterName: '林墨', location: '闭关室' }] } },
];

// ─── 测试 1：认知范围构建 ─────────────────────────────────────────────

section('测试 1：认知范围构建');

const scope = buildKnowledgeScope(testCharacter, testEvents, testFacts, 10);
assert(scope.firstAppearance === 3, `首次出场章节正确（第3章），实际：${scope.firstAppearance}`);
assert(scope.knowledgeUpToChapter === 10, `认知上限正确（第10章），实际：${scope.knowledgeUpToChapter}`);
assert(scope.experiencedChapters === 5, `亲历章节数正确（5章），实际：${scope.experiencedChapters}`);
assert(scope.knownCharacterIds.includes('char-002'), '认识的角色包含苏白');
assert(scope.knownCharacterIds.includes('char-003'), '认识的角色包含魔族角色');
assert(scope.visitedLocations.includes('青云宗山门'), '去过的地方包含青云宗山门');
assert(scope.visitedLocations.includes('藏经阁'), '去过的地方包含藏经阁');

// ─── 测试 2：认知上限截断 ─────────────────────────────────────────────

section('测试 2：认知上限截断（只到第 5 章）');

const scopeLimited = buildKnowledgeScope(testCharacter, testEvents, testFacts, 5);
assert(scopeLimited.knowledgeUpToChapter === 5, '认知上限被截断到第5章');
assert(scopeLimited.experiencedChapters === 2, '只统计前5章的亲历章节（2章）');
assert(!scopeLimited.visitedLocations.includes('迷雾森林'), '第7章的地点不在认知范围内');

// ─── 测试 3：详细模式 prompt 渲染 ──────────────────────────────────────

section('测试 3：完整模式 Prompt 渲染');

const fullPrompt = renderKnowledgeBoundaryPrompt({
  character: testCharacter,
  events: testEvents,
  scope,
  detailLevel: 'full',
});
assert(fullPrompt.includes('认知边界'), '包含「认知边界」标题');
assert(fullPrompt.includes('第 3 章出场'), '注明首次出场章节');
assert(fullPrompt.includes('第 10 章'), '注明认知上限章节');
assert(fullPrompt.includes('最近 3 章'), '包含最近章节事件');
assert(fullPrompt.includes('严格遵守以下规则'), '包含行为规则');
assert(fullPrompt.includes('不知道的事就说不知道'), '包含核心规则');
assert(fullPrompt.length > 500, '详细模式内容足够丰富（长度>500）');
console.log(`  📝 详细模式长度：${fullPrompt.length} 字符`);

// ─── 测试 4：摘要模式 prompt 渲染 ──────────────────────────────────────

section('测试 4：摘要模式 Prompt 渲染');

const summaryPrompt = renderKnowledgeBoundaryPrompt({
  character: testCharacter,
  events: testEvents,
  scope,
  detailLevel: 'summary',
});
assert(summaryPrompt.includes('认知边界'), '摘要模式也包含标题');
assert(summaryPrompt.includes('亲历过'), '包含亲历章节统计');
assert(summaryPrompt.includes('经历类型'), '包含事件类型聚合');
assert(summaryPrompt.includes('绝对规则'), '包含绝对规则');
assert(summaryPrompt.length < fullPrompt.length, '摘要模式比详细模式短');
console.log(`  📝 摘要模式长度：${summaryPrompt.length} 字符`);

// ─── 测试 5：简略模式 prompt 渲染 ──────────────────────────────────────

section('测试 5：简略模式 Prompt 渲染');

const briefPrompt = renderKnowledgeBoundaryPrompt({
  character: testCharacter,
  events: testEvents,
  scope,
  detailLevel: 'brief',
});
assert(briefPrompt.includes('你只知道自己亲历过的事'), '包含核心声明');
assert(briefPrompt.length < summaryPrompt.length, '简略模式比摘要模式更短');
console.log(`  📝 简略模式长度：${briefPrompt.length} 字符`);

// ─── 测试 6：章节摘要过滤 ──────────────────────────────────────────────

section('测试 6：章节摘要过滤');

const filteredBefore = filterChapterSummaryForCharacter(
  testCharacter, 1, '第一章 风起', '这是第一章的内容...', testEvents
);
assert(filteredBefore === '', '角色出场前的章节返回空');

const filteredAbsent = filterChapterSummaryForCharacter(
  testCharacter, 4, '第四章 暗流', '第四章林墨没有出场...', testEvents
);
assert(filteredAbsent.includes('本章你没有出场'), '角色没出场的章节注明没出场');
assert(!filteredAbsent.includes('第四章林墨没有出场的详细内容'), '不泄露未出场章节细节');

const filteredPresent = filterChapterSummaryForCharacter(
  testCharacter, 5, '第五章 古剑', '林墨在藏经阁发现了上古剑谱...', testEvents
);
assert(filteredPresent.includes('你亲历了本章'), '角色出场的章节注明亲历');
assert(filteredPresent.includes('上古剑谱'), '包含章节摘要内容');

// ─── 测试 7：buildFullSoulPrompt 集成 ────────────────────────────────

section('测试 7：buildFullSoulPrompt 集成认知边界');

const soulWithBoundary = buildFullSoulPrompt(testCharacter, {
  includeGrowth: false,
  includeKnowledgeBoundary: true,
  knowledgeBoundary: {
    events: testEvents,
    facts: testFacts,
    latestFinalizedChapter: 10,
    detailLevel: 'summary',
  },
});

assert(soulWithBoundary.includes('内心驱动力'), '包含灵魂深度字段（内心驱动力）');
assert(soulWithBoundary.includes('公私面具'), '包含灵魂深度字段（公私面具）');
assert(soulWithBoundary.includes('认知边界'), '包含完整认知边界');
assert(soulWithBoundary.includes('青云宗山门'), '包含去过的地点');
assert(soulWithBoundary.includes('经历类型'), '包含事件类型统计');
console.log(`  📝 完整灵魂 prompt 长度：${soulWithBoundary.length} 字符`);

// ─── 测试 8：无数据时优雅降级 ──────────────────────────────────────────

section('测试 8：无数据时优雅降级');

const soulWithoutBoundaryData = buildFullSoulPrompt(testCharacter, {
  includeGrowth: false,
  includeKnowledgeBoundary: true,
});

assert(soulWithoutBoundaryData.includes('秘密边界'), '无事件数据时回退到秘密边界');
assert(!soulWithoutBoundaryData.includes('认知边界'), '无事件数据时不生成完整认知边界');
console.log('  ✅ 无数据时回退到秘密边界模式');

// ─── 测试 9：未出场角色 ────────────────────────────────────────────────

section('测试 9：未出场角色（firstAppearance 在未来）');

const lateCharacter = { ...testCharacter, id: 'char-late', name: '晚出场', firstAppearance: 15 };
const lateScope = buildKnowledgeScope(lateCharacter, [], testFacts, 10);
assert(lateScope.firstAppearance === 15, '首次出场章节正确（第15章）');
assert(lateScope.experiencedChapters === 0, '未出场时亲历章节为 0');
assert(lateScope.visitedLocations.length === 0, '未出场时没有去过的地方');

// ─── 测试 10：幂等性 ───────────────────────────────────────────────────

section('测试 10：多次调用结果一致（幂等性）');

const prompt1 = renderKnowledgeBoundaryPrompt({ character: testCharacter, events: testEvents, scope, detailLevel: 'full' });
const prompt2 = renderKnowledgeBoundaryPrompt({ character: testCharacter, events: testEvents, scope, detailLevel: 'full' });
assert(prompt1 === prompt2, '相同输入产生相同输出（幂等）');

// ─── 总结 ─────────────────────────────────────────────────────────────

section('测试结果总结');
console.log(`通过：${passed}，失败：${failed}`);
console.log(`通过率：${(passed / (passed + failed) * 100).toFixed(1)}%`);

if (failed > 0) {
  console.error('\n❌ 有测试失败，请检查代码！');
  process.exit(1);
} else {
  console.log('\n🎉 所有测试通过！认知边界系统工作正常。');
}
