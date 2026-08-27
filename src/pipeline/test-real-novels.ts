import * as fs from 'fs';
import * as path from 'path';
import { SmartGateManager } from './smart-gate-manager.js';

const manager = new SmartGateManager();

const testCases = [
  {
    novel: '乱世谋士（权谋）',
    novelId: '04625691-0577-49ff-bffc-c41e9798c437',
    chapters: [1, 10, 25, 45],
  },
  {
    novel: '体育竞技（篮球）',
    novelId: '724df82c-246f-4bb6-928b-002f2fc90931',
    chapters: [1, 10, 20, 24],
  },
];

const novelsDir = path.join(process.cwd(), 'data', 'novels');

async function run() {
  console.log('='.repeat(70));
  console.log('智能门禁 - 真实小说功能测试');
  console.log('='.repeat(70));

  for (const tc of testCases) {
    console.log(`\n📚 ${tc.novel}`);
    console.log('-'.repeat(50));

    for (const chNum of tc.chapters) {
      const chPath = path.join(novelsDir, tc.novelId, 'chapters', `${String(chNum).padStart(3, '0')}.md`);
      if (!fs.existsSync(chPath)) {
        console.log(`  第${chNum}章: 不存在，跳过`);
        continue;
      }

      const content = fs.readFileSync(chPath, 'utf-8');
      const wordCount = content.replace(/\s/g, '').length;

      const start = Date.now();
      const report = await manager.auditChapter({
        novelId: tc.novelId,
        content,
        chapterNumber: chNum,
        novelsDir,
      });
      const elapsed = Date.now() - start;

      console.log(`\n  第${chNum}章 (${wordCount}字, ${elapsed}ms)`);
      console.log(`    总结果: ${report.overallPassed ? '✅ 通过' : '❌ 未通过'}`);
      console.log(`    总计: ${report.totalFindings} 处 (错误${report.errorCount}, 警告${report.warnCount})`);
      console.log(`    钩子: ${report.hook.hookStrength} / ${report.hook.hookType} (张力${report.hook.tensionScore.toFixed(1)}) ${report.hook.passed ? '✅' : '❌'}`);
      console.log(`    代价感: ${report.cost.passed ? '✅ 通过' : '❌ ' + report.cost.findings.length + '处问题'}`);
      console.log(`    对话节奏: 对话占比${(report.dialoguePacing.dialogueRatio * 100).toFixed(0)}% ${report.dialoguePacing.passed ? '✅' : '❌'}`);
      console.log(`    连续性: ${report.continuity.passed ? '✅' : '❌ ' + report.continuity.findings.length + '处'}`);
      console.log(`    蓝图: 覆盖率${report.blueprint.coverage}% ${report.blueprint.passed ? '✅' : '❌'}`);

      if (report.cost.findings.length > 0) {
        console.log(`    代价感详情:`);
        for (const f of report.cost.findings) {
          console.log(`      - [${f.level}] ${f.code}: ${f.message} (置信度${(f.confidence * 100).toFixed(0)}%)`);
        }
      }
      if (report.hook.findings.length > 0) {
        console.log(`    钩子详情:`);
        for (const f of report.hook.findings) {
          console.log(`      - [${f.level}] ${f.code}: ${f.message} (置信度${(f.confidence * 100).toFixed(0)}%)`);
        }
      }
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('策略切换测试');
  console.log('='.repeat(70));

  const testContent = fs.readFileSync(
    path.join(novelsDir, '04625691-0577-49ff-bffc-c41e9798c437', 'chapters', '010.md'),
    'utf-8'
  );

  const strategies: Array<'balanced' | 'precision' | 'recall'> = ['balanced', 'precision', 'recall'];
  for (const strategy of strategies) {
    manager.setStrategy(strategy);
    const report = await manager.auditChapter({
      novelId: '04625691-0577-49ff-bffc-c41e9798c437',
      content: testContent,
      chapterNumber: 10,
      novelsDir,
    });
    const hookFindingCount = report.hook.findings.length;
    const costFindingCount = report.cost.findings.length;
    console.log(`  ${strategy}: 钩子${hookFindingCount}处, 代价感${costFindingCount}处, 总计${report.totalFindings}处`);
  }

  console.log('\n' + '='.repeat(70));
  console.log('检测器统计');
  console.log('='.repeat(70));
  const stats = manager.getAllDetectorStats();
  for (const [detector, stat] of Object.entries(stats)) {
    console.log(`  ${detector}:`);
    console.log(`    规则总数: ${stat.totalRules}, 启用: ${stat.enabledRules}`);
    console.log(`    总命中: ${stat.totalHits}, 平均精确率: ${(stat.avgPrecision * 100).toFixed(0)}%`);
  }

  console.log('\n✅ 功能测试完成');
}

run().catch(console.error);
