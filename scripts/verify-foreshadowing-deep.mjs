
// 验证脚本：伏笔回收图推理深化 — 回温曲线 + 密度诊断
import { assessRewarmCurve } from '../src/pipeline/foreshadowing-rewarm.ts';
import {
  diagnoseForeshadowingHealth,
  buildDensityContextPrompt,
} from '../src/pipeline/foreshadowing-density.ts';
import { analyzeForeshadowingGraph, planRecoveryPaths } from '../src/pipeline/foreshadowing-graph.ts';

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

// ─── 测试数据：模拟一部 20 章小说的伏笔生态 ─────────────────────────

function makeForeshadowing(id, hint, plantedInChapter, opts = {}) {
  return {
    id,
    hint,
    plantedInChapter,
    resolution: opts.resolution ?? '',
    resolvedInChapter: opts.resolvedInChapter,
    isResolved: opts.isResolved ?? false,
    relatedPlotThreads: opts.relatedPlotThreads ?? [],
    priority: opts.priority ?? 'medium',
    scope: opts.scope,
    plannedResolveChapter: opts.plannedResolveChapter,
    prerequisites: opts.prerequisites,
    recoveryPath: opts.recoveryPath,
    planVersion: opts.planVersion,
  };
}

const testForeshadowing = [
  // 第1章埋下的长线伏笔（saga），已回收
  makeForeshadowing('f1', '主角手臂上的神秘印记', 1, { scope: 'saga', priority: 'high', isResolved: true, resolvedInChapter: 18 }),

  // 第2章埋下的中线伏笔，已回收
  makeForeshadowing('f2', '宗门禁地传出的异响', 2, { scope: 'arc', priority: 'medium', isResolved: true, resolvedInChapter: 10 }),

  // 第3章埋下的长线伏笔，未回收（距今17章，saga 类宽容度高）
  makeForeshadowing('f3', '老者临终前的预言', 3, { scope: 'saga', priority: 'high' }),

  // 第5章埋下的中线伏笔，未回收（距今15章，已逾期）
  makeForeshadowing('f4', '藏经阁暗格里的残页', 5, { scope: 'arc', priority: 'medium' }),

  // 第8章埋下的中线伏笔，未回收（距今12章，刚好到冷伏笔阈值）
  makeForeshadowing('f5', '苏白深夜独自外出', 8, { scope: 'arc', priority: 'medium' }),

  // 第10章埋下的短线伏笔，未回收（距今10章，严重逾期）
  makeForeshadowing('f6', '酒馆听到的传闻', 10, { scope: 'scene', priority: 'low' }),

  // 第12章埋下的中线伏笔，有 resolution（不算冷伏笔）
  makeForeshadowing('f7', '密信中的暗号', 12, { scope: 'arc', priority: 'high', resolution: '通过解读暗号揭示内奸身份' }),

  // 第15章埋下的中线伏笔，有 plannedResolveChapter
  makeForeshadowing('f8', '敌人撤退时留下的地图', 15, { scope: 'arc', priority: 'medium', plannedResolveChapter: 20, recoveryPath: '中线伏笔，关联1条情节线' }),

  // 第18章埋下的中线伏笔，距今2章，处于预热期（arc: 2<4=warming）
  makeForeshadowing('f9', '茶馆老人的警告', 18, { scope: 'arc', priority: 'medium' }),

  // 第19章埋下的中线伏笔，距今1章，处于刚埋下（arc: 1<=1=planted）
  makeForeshadowing('f10', '夜空中的异象', 19, { scope: 'arc', priority: 'medium' }),
];

// ─── 测试 1：回温曲线阶段判定 ───────────────────────────────────────

section('测试 1：回温曲线阶段判定');

const rewarmReport = assessRewarmCurve({
  foreshadowing: testForeshadowing,
  currentChapter: 20,
});

const byPhase = rewarmReport.byPhase;
assert(byPhase.resolved.length === 2, `已回收阶段：2 条（实际 ${byPhase.resolved.length}）`);
assert(byPhase.overdue.length > 0, `逾期阶段有伏笔（实际 ${byPhase.overdue.length}）`);
assert(byPhase.planted.length > 0, `刚埋下阶段有伏笔（实际 ${byPhase.planted.length}）`);
assert(byPhase.warming.length > 0, `预热期阶段有伏笔（实际 ${byPhase.warming.length}）`);

// 验证具体伏笔的阶段
const f10Assessment = [...byPhase.planted].find(a => a.id === 'f10');
assert(!!f10Assessment, 'f10（第19章埋下，arc类，距今1章）处于 planted 阶段');

const f9Assessment = [...byPhase.warming].find(a => a.id === 'f9');
assert(!!f9Assessment, 'f9（第18章埋下，arc类，距今2章）处于 warming 阶段');

const f6Assessment = [...byPhase.overdue].find(a => a.id === 'f6');
assert(!!f6Assessment, 'f6（第10章埋下，距今10章，scene 类）处于 overdue 阶段');

console.log(`  📝 阶段分布：刚埋下×${byPhase.planted.length}，沉默×${byPhase.silent.length}，预热×${byPhase.warming.length}，升温×${byPhase.heating.length}，到期×${byPhase.due.length}，逾期×${byPhase.overdue.length}，已回收×${byPhase.resolved.length}`);

// ─── 测试 2：回温曲线行动建议 ─────────────────────────────────────────

section('测试 2：回温曲线行动建议');

assert(rewarmReport.mustResolveThisChapter.length > 0, `有必须回收的伏笔（${rewarmReport.mustResolveThisChapter.length} 条）`);
assert(rewarmReport.mustResolveThisChapter.some(a => a.id === 'f6'), 'f6 在必须回收列表中');

// 每条评估都有 recommendedAction
const allHaveAction = [...rewarmReport.mustResolveThisChapter, ...rewarmReport.needsRewarmThisChapter]
  .every(a => a.recommendedAction.length > 0);
assert(allHaveAction, '所有行动建议都有 recommendedAction');

// 每条评估都有 chaptersUntilDue
const allHaveDue = [...rewarmReport.mustResolveThisChapter]
  .every(a => typeof a.chaptersUntilDue === 'number');
assert(allHaveDue, '所有评估都有 chaptersUntilDue 值');

// ─── 测试 3：回温曲线 prompt 渲染 ────────────────────────────────────

section('测试 3：回温曲线 prompt 渲染');

const rewarmPrompt = rewarmReport.contextPrompt;
assert(rewarmPrompt.includes('伏笔生命周期分布'), '包含阶段分布概览');
assert(rewarmPrompt.includes('本章必须回收'), '包含必须回收部分');
assert(rewarmPrompt.includes('逾期'), '包含逾期标记');
assert(rewarmPrompt.length > 200, 'prompt 内容足够丰富');
console.log(`  📝 回温曲线 prompt 长度：${rewarmPrompt.length} 字符`);

// ─── 测试 4：密度诊断 ───────────────────────────────────────────────

section('测试 4：密度诊断');

const densityReport = diagnoseForeshadowingHealth({
  foreshadowing: testForeshadowing,
  currentChapter: 20,
});

assert(densityReport.totalPlanted === 10, `已埋下 10 条（实际 ${densityReport.totalPlanted}）`);
assert(densityReport.totalResolved === 2, `已回收 2 条（实际 ${densityReport.totalResolved}）`);
assert(densityReport.totalActive === 8, `活跃 8 条（实际 ${densityReport.totalActive}）`);
assert(densityReport.resolutionRate > 0, `回收率 > 0（实际 ${(densityReport.resolutionRate * 100).toFixed(0)}%）`);
assert(densityReport.avgPlantedPerChapter > 0, `平均每章新增 > 0（实际 ${densityReport.avgPlantedPerChapter.toFixed(2)}）`);
console.log(`  📝 密度：${densityReport.avgPlantedPerChapter.toFixed(2)}/章，回收率：${(densityReport.resolutionRate * 100).toFixed(0)}%`);
console.log(`  📝 密度评估：${densityReport.densityHealth}，回收评估：${densityReport.resolutionHealth}`);

// ─── 测试 5：撞车检测 ───────────────────────────────────────────────

section('测试 5：撞车检测');

// 构造撞车场景：3 条伏笔都规划在第 25 章回收
const collisionForeshadowing = [
  makeForeshadowing('c1', '伏笔A', 10, { plannedResolveChapter: 25 }),
  makeForeshadowing('c2', '伏笔B', 12, { plannedResolveChapter: 25 }),
  makeForeshadowing('c3', '伏笔C', 15, { plannedResolveChapter: 25 }),
];
const collisionReport = diagnoseForeshadowingHealth({
  foreshadowing: collisionForeshadowing,
  currentChapter: 20,
});
assert(collisionReport.collisionChapters.length > 0, '检测到撞车章节');
assert(collisionReport.collisionChapters[0].chapterNumber === 25, `撞车在第25章（实际 ${collisionReport.collisionChapters[0].chapterNumber}）`);
assert(collisionReport.collisionChapters[0].plannedCount === 3, `撞车 3 条（实际 ${collisionReport.collisionChapters[0].plannedCount}）`);
assert(collisionReport.suggestions.some(s => s.includes('撞车') || s.includes('集中爆发')), '建议中包含撞车预警');

// ─── 测试 6：冷伏笔检测 ─────────────────────────────────────────────

section('测试 6：冷伏笔检测');

assert(densityReport.coldForeshadowing.length > 0, `检测到冷伏笔（${densityReport.coldForeshadowing.length} 条）`);
// f4（第5章埋下，距今15章，arc 类，无 resolution/prerequisites/recoveryPath）应该是冷伏笔
const coldF4 = densityReport.coldForeshadowing.find(f => f.id === 'f4');
assert(!!coldF4, 'f4 被检测为冷伏笔');
assert(coldF4.chaptersSincePlanted === 15, `f4 已 15 章未提及（实际 ${coldF4.chaptersSincePlanted}）`);

// f7 有 resolution，不算冷伏笔
const coldF7 = densityReport.coldForeshadowing.find(f => f.id === 'f7');
assert(!coldF7, 'f7 有 resolution，不算冷伏笔');

// f3 是 saga 类，宽容度高（30 章以内不算冷），距今17章不算冷
const coldF3 = densityReport.coldForeshadowing.find(f => f.id === 'f3');
assert(!coldF3, 'f3 是 saga 类且距今17章（<30），不算冷伏笔');

// ─── 测试 7：密度诊断 prompt 渲染 ────────────────────────────────────

section('测试 7：密度诊断 prompt 渲染');

const densityPrompt = buildDensityContextPrompt(densityReport);
assert(densityPrompt.includes('伏笔生态健康度'), '包含健康度概览');
assert(densityPrompt.includes('回收率'), '包含回收率');
assert(densityPrompt.includes('密度'), '包含密度评估');
assert(densityPrompt.includes('被遗忘的伏笔'), '包含冷伏笔提醒');
assert(densityPrompt.length > 200, 'prompt 内容丰富');
console.log(`  📝 密度诊断 prompt 长度：${densityPrompt.length} 字符`);

// ─── 测试 8：与现有图分析系统的兼容性 ──────────────────────────────

section('测试 8：与现有图分析系统的兼容性');

const graphAnalysis = analyzeForeshadowingGraph({
  foreshadowing: testForeshadowing,
  currentChapter: 20,
});
assert(graphAnalysis.readyToResolve.length > 0, `图分析 readyToResolve 不为空（${graphAnalysis.readyToResolve.length}）`);
assert(graphAnalysis.resolved.length === 2, `图分析 resolved 为 2（${graphAnalysis.resolved.length}）`);

// 回温曲线 + 图分析可以共存
const combinedPrompt = [rewarmReport.contextPrompt, buildDensityContextPrompt(densityReport)].join('\n\n');
assert(combinedPrompt.length > 500, `回温+密度联合 prompt 足够丰富（${combinedPrompt.length} 字符）`);
console.log(`  📝 联合 prompt 长度：${combinedPrompt.length} 字符`);

// ─── 测试 9：健康场景 ───────────────────────────────────────────────

section('测试 9：健康场景（回收率高）');

const healthyForeshadowing = [
  makeForeshadowing('h1', '伏笔1', 1, { scope: 'arc', priority: 'medium', isResolved: true, resolvedInChapter: 5 }),
  makeForeshadowing('h2', '伏笔2', 3, { scope: 'arc', priority: 'medium', isResolved: true, resolvedInChapter: 8 }),
  makeForeshadowing('h3', '伏笔3', 5, { scope: 'arc', priority: 'medium', isResolved: true, resolvedInChapter: 10 }),
  makeForeshadowing('h4', '伏笔4', 8, { scope: 'arc', priority: 'medium', isResolved: true, resolvedInChapter: 12 }),
  makeForeshadowing('h5', '伏笔5', 10, { scope: 'arc', priority: 'medium' }), // 活跃
];
const healthyReport = diagnoseForeshadowingHealth({
  foreshadowing: healthyForeshadowing,
  currentChapter: 15,
});
assert(healthyReport.resolutionRate >= 0.4, `健康场景回收率 ≥40%（实际 ${(healthyReport.resolutionRate * 100).toFixed(0)}%）`);
assert(healthyReport.coldForeshadowing.length === 0, `健康场景无冷伏笔（实际 ${healthyReport.coldForeshadowing.length}）`);

// ─── 测试 10：幂等性 ────────────────────────────────────────────────

section('测试 10：幂等性');

const report1 = assessRewarmCurve({ foreshadowing: testForeshadowing, currentChapter: 20 });
const report2 = assessRewarmCurve({ foreshadowing: testForeshadowing, currentChapter: 20 });
assert(report1.contextPrompt === report2.contextPrompt, '回温曲线幂等：相同输入相同输出');

const density1 = diagnoseForeshadowingHealth({ foreshadowing: testForeshadowing, currentChapter: 20 });
const density2 = diagnoseForeshadowingHealth({ foreshadowing: testForeshadowing, currentChapter: 20 });
assert(density1.resolutionRate === density2.resolutionRate, '密度诊断幂等：相同输入相同输出');
assert(density1.coldForeshadowing.length === density2.coldForeshadowing.length, '冷伏笔检测幂等');

// ─── 测试 11：空伏笔列表优雅降级 ──────────────────────────────────

section('测试 11：空伏笔列表优雅降级');

const emptyRewarm = assessRewarmCurve({ foreshadowing: [], currentChapter: 10 });
assert(emptyRewarm.contextPrompt === '', '空伏笔列表回温曲线 prompt 为空');

const emptyDensity = diagnoseForeshadowingHealth({ foreshadowing: [], currentChapter: 10 });
assert(emptyDensity.totalPlanted === 0, '空伏笔列表 totalPlanted 为 0');
assert(emptyDensity.resolutionRate === 0, '空伏笔列表回收率为 0');

// ─── 总结 ─────────────────────────────────────────────────────────

section('测试结果总结');
console.log(`通过：${passed}，失败：${failed}`);
console.log(`通过率：${(passed / (passed + failed) * 100).toFixed(1)}%`);

if (failed > 0) {
  console.error('\n❌ 有测试失败，请检查代码！');
  process.exit(1);
} else {
  console.log('\n🎉 所有测试通过！伏笔回收图推理深化工作正常。');
}
