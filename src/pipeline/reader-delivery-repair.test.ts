import { describe, expect, it } from 'vitest';
import type { Chapter, NovelMetadata } from '../novel/types.js';
import { buildNovelPromiseContract } from './novel-promise-contract.js';
import { buildReaderDeliveryRepairSignal } from './reader-delivery-repair.js';

function makeNovel(): NovelMetadata {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    title: 'Frontier Kiln',
    genre: 'fantasy',
    status: 'writing',
    synopsis: 'A tribe learns to build tools, food systems, and defenses.',
    description: '',
    edgeNarratorVoice: 'zh-CN-YunyangNeural',
    titleGuidance: false,
    startupPlatformProfile: 'auto',
    wordCount: 0,
    modelConfig: undefined,
    tags: [],
    constitutionTags: [],
    titleRecommendations: [],
    marketingPackages: [],
    ownerId: 'dev',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  };
}

function makePreviousChapter(): Chapter {
  return {
    novelId: '00000000-0000-4000-8000-000000000001',
    chapterNumber: 8,
    title: 'Previous',
    content: 'previous content',
    wordCount: 16,
    status: 'finalized',
    agentComments: [],
    readerScore: 7.5,
    revisionCount: 0,
    summary: '',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  };
}

describe('buildReaderDeliveryRepairSignal', () => {
  it('turns failed reader delivery into actionable repair feedback', () => {
    const novel = makeNovel();
    const content = [
      'Morning arrived. The kiln was opened.',
      'The first result was logged. The second result was logged. The third result was logged.',
      'Everyone waited. The system confirmed a new underground structure.',
    ].join('\n\n');

    const signal = buildReaderDeliveryRepairSignal({
      novel,
      promiseContract: buildNovelPromiseContract(novel),
      novelId: novel.id,
      chapterNumber: 9,
      title: 'Kiln Test 800-9',
      content,
      readerScore: 6.8,
      previousChapter: makePreviousChapter(),
      qualityReport: {
        gateMode: 'warn',
        overallScore: 80,
        structureScore: 86,
        styleScore: 84,
        emotionScore: 58,
        passed: true,
        summary: '',
        findings: [
          { code: 'stalled-momentum', level: 'warn', message: 'momentum stalls' },
        ],
      },
    });

    expect(signal.shouldRepair).toBe(true);
    expect(signal.audit.passed).toBe(false);
    expect(signal.reasons.join('\n')).toContain('reader delivery failed');
    expect(signal.feedback).toContain('Reader delivery failed before save');
    expect(signal.feedback).toContain('读者交付自动修复硬约束');
    expect(signal.feedback).toContain('至少两个“结果后的余波”节拍');
    expect(signal.feedback).toContain('流程化读感补救硬约束');
  });

  it('adds generic aftermath constraints for non-scifi reader delivery repair', () => {
    const novel = {
      ...makeNovel(),
      title: '废柴社团今天也要招满人',
      genre: 'modern',
      synopsis: '濒临解散的社团靠一次次活动、招新和成员关系变化撑过学期考核。',
    } satisfies NovelMetadata;
    const content = [
      '招新表被贴到公告栏，社团人数从三人改成四人。',
      '学生会确认活动室可以暂缓回收，老师在群里发了通过通知。',
      '大家看完通知，继续等待下一轮报名结果。',
    ].join('\n\n');

    const signal = buildReaderDeliveryRepairSignal({
      novel,
      promiseContract: buildNovelPromiseContract(novel),
      novelId: novel.id,
      chapterNumber: 11,
      title: '公告栏下的第四个名字',
      content,
      readerScore: 6.7,
      previousChapter: makePreviousChapter(),
      qualityReport: {
        gateMode: 'warn',
        overallScore: 78,
        structureScore: 82,
        styleScore: 84,
        emotionScore: 42,
        passed: true,
        summary: '',
        findings: [
          { code: 'low-emotion-variance', level: 'warn', message: '情绪层次偏平' },
        ],
      },
    });

    expect(signal.shouldRepair).toBe(true);
    expect(signal.audit.passed).toBe(false);
    expect(signal.feedback).toContain('读者交付自动修复硬约束');
    expect(signal.feedback).toContain('可见动作、身体感受、关系位置变化或即时选择后果');
    expect(signal.feedback).not.toContain('工程题材自动修复硬约束');
  });

  it('adds engineering tail constraints to auto-repair feedback', () => {
    const novel = {
      ...makeNovel(),
      title: '星环维修员',
      genre: 'scifi',
      synopsis: '维修员在星环气闸、备用电池和泵组故障中追查异常批次。',
    } satisfies NovelMetadata;
    const content = [
      '叶澜蹲在E-4气闸室备用电池柜前，电流从9.2A掉到6.1A。她拆开接线盒，冷却风扇的低频震动贴着掌心发麻。',
      '李班长把记录板递过来，LK-2403-B批次的签收栏被涂改过。叶澜没有立刻接，只让他把备用电池柜电源切到手动。',
      '维护日志显示上一次检修操作者签名是#F3A7，前一个号是#F3A8。她放大照片，确认两个编号只差一位。',
      '小刘的消息断在“收货签收人不是老刘，是——”。叶澜按下保存为待查，准备继续确认来源。',
    ].join('\n\n');

    const signal = buildReaderDeliveryRepairSignal({
      novel,
      promiseContract: buildNovelPromiseContract(novel),
      novelId: novel.id,
      chapterNumber: 21,
      title: '值班间·指令与暂停24%',
      content,
      readerScore: 7.1,
      previousChapter: makePreviousChapter(),
      qualityReport: {
        gateMode: 'warn',
        overallScore: 81.5,
        structureScore: 94.3,
        styleScore: 92,
        emotionScore: 46.3,
        passed: true,
        summary: '',
        findings: [
          { code: 'low-emotion-variance', level: 'warn', message: '情绪层次偏平' },
        ],
      },
    });

    expect(signal.shouldRepair).toBe(true);
    expect(signal.feedback).toContain('工程题材自动修复硬约束');
    expect(signal.feedback).toContain('最后 300 字必须落到一个可执行设备压力点');
    expect(signal.feedback).toContain('不能把“谁签的/谁改的/来源是谁”当最终钩子');
  });
});
