import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { correctTypos } from '../src/pipeline/typo-corrector.js';
import { detectClichePatterns } from '../src/pipeline/cliche-pattern-detector.js';
import { createEmptyDB, updatePatternDB } from '../src/pipeline/pattern-frequency-extractor.js';
import type { PatternFrequencyDB } from '../src/pipeline/pattern-frequency-extractor.js';

const dataDir = resolve(process.argv[2] ?? process.env.DATA_DIR ?? './data');
const novelsDir = join(dataDir, 'novels');

function listChapterFiles(novelDir: string): Array<{ number: number; path: string }> {
  const chaptersDir = join(novelDir, 'chapters');
  try {
    const files = readdirSync(chaptersDir)
      .filter(f => f.endsWith('.md'))
      .sort((a, b) => {
        const numA = parseInt(a.match(/(\d+)/)?.[1] || '0', 10);
        const numB = parseInt(b.match(/(\d+)/)?.[1] || '0', 10);
        return numA - numB;
      });
    return files.map(f => ({
      number: parseInt(f.match(/(\d+)/)?.[1] || '0', 10),
      path: join(chaptersDir, f),
    }));
  } catch {
    return [];
  }
}

function listNovelDirs(): string[] {
  return readdirSync(novelsDir)
    .map(f => join(novelsDir, f))
    .filter(d => {
      try { return statSync(d).isDirectory(); } catch { return false; }
    });
}

function getNovelMeta(novelDir: string): any {
  const metaPath = join(novelDir, 'novel.json');
  try {
    return JSON.parse(readFileSync(metaPath, 'utf8'));
  } catch {
    return null;
  }
}

interface AuditResult {
  novelId: string;
  title: string;
  chapterCount: number;
  avgWordCount: number;
  typoCount: number;
  clicheFindings: number;
  clicheSeverity: 'low' | 'medium' | 'high';
  repetitivePatterns: string[];
  hints: string[];
}

function auditNovel(novelDir: string): AuditResult | null {
  const novelId = novelDir.split(/[\\/]/).pop()!;
  const meta = getNovelMeta(novelDir);
  const title = meta?.title || novelId.slice(0, 8);
  const chapterFiles = listChapterFiles(novelDir);

  if (chapterFiles.length === 0) return null;

  const db: PatternFrequencyDB = createEmptyDB(novelId);
  let totalWordCount = 0;
  let totalTypoCount = 0;
  let lastContent = '';

  for (const chapter of chapterFiles) {
    let content = '';
    try {
      content = readFileSync(chapter.path, 'utf8');
    } catch {
      continue;
    }

    lastContent = content;
    totalWordCount += content.length;

    const corrected = correctTypos(content);
    totalTypoCount += corrected.correctionCount;

    if (content && content.trim()) {
      updatePatternDB(db, chapter.number, content);
    }
  }

  const avgWordCount = Math.round(totalWordCount / chapterFiles.length);
  const detection = detectClichePatterns(lastContent, db);

  let clicheSeverity: 'low' | 'medium' | 'high' = 'low';
  if (detection.findings.length >= 10) clicheSeverity = 'high';
  else if (detection.findings.length >= 5) clicheSeverity = 'medium';

  const repetitivePatterns: string[] = [];
  if (detection.topPatterns) {
    detection.topPatterns.slice(0, 5).forEach(f => {
      repetitivePatterns.push(`${f.pattern} (${f.count}次)`);
    });
  }

  return {
    novelId,
    title,
    chapterCount: chapterFiles.length,
    avgWordCount,
    typoCount: totalTypoCount,
    clicheFindings: detection.findings.length,
    clicheSeverity,
    repetitivePatterns,
    hints: detection.writerHints.slice(0, 5),
  };
}

function main() {
  const novelDirs = listNovelDirs();
  console.log(`找到 ${novelDirs.length} 部小说，开始审计...\n`);

  const results: AuditResult[] = [];

  for (const novelDir of novelDirs) {
    const result = auditNovel(novelDir);
    if (result) {
      results.push(result);
    }
  }

  console.log('='.repeat(70));
  console.log('小说质量审计报告');
  console.log('='.repeat(70));
  console.log(`审计小说数: ${results.length}`);
  console.log('='.repeat(70));

  const sortedByCliche = [...results].sort((a, b) => b.clicheFindings - a.clicheFindings);

  for (const r of sortedByCliche) {
    console.log(`\n📖 ${r.title} (${r.novelId.slice(0, 8)})`);
    console.log(`   章节数: ${r.chapterCount} | 平均字数: ${r.avgWordCount}`);
    console.log(`   错别字: ${r.typoCount} | 套路化发现: ${r.clicheFindings} (${r.clicheSeverity})`);
    
    if (r.repetitivePatterns.length > 0) {
      console.log(`   重复模式: ${r.repetitivePatterns.join(', ')}`);
    }
    
    if (r.hints.length > 0) {
      console.log(`   优化建议:`);
      r.hints.forEach((h, i) => console.log(`     ${i + 1}. ${h}`));
    }
  }

  const avgCliche = results.reduce((sum, r) => sum + r.clicheFindings, 0) / results.length;
  const avgTypo = results.reduce((sum, r) => sum + r.typoCount, 0) / results.length;
  const highSeverityCount = results.filter(r => r.clicheSeverity === 'high').length;

  console.log('\n' + '='.repeat(70));
  console.log('汇总统计');
  console.log('='.repeat(70));
  console.log(`平均套路化发现数: ${avgCliche.toFixed(1)}`);
  console.log(`平均错别字数: ${avgTypo.toFixed(1)}`);
  console.log(`高套路化小说数: ${highSeverityCount} (${((highSeverityCount / results.length) * 100).toFixed(1)}%)`);

  console.log('\n说明:');
  console.log('- 套路化发现数 > 10: 需要重点优化');
  console.log('- 套路化发现数 5-10: 建议优化');
  console.log('- 套路化发现数 < 5: 良好');
}

main().catch(err => {
  console.error('审计脚本异常:', err);
  process.exit(1);
});
