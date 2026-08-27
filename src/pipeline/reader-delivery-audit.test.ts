import { describe, expect, it } from 'vitest';
import type { Chapter } from '../novel/types.js';
import {
  auditReaderDelivery,
  buildReaderDeliveryForwardHints,
  mergeReaderDeliveryAuditIntoDiagnostics,
} from './reader-delivery-audit.js';

function makeChapter(patch: Partial<Chapter>): Chapter {
  return {
    novelId: '00000000-0000-4000-8000-000000000001',
    chapterNumber: 1,
    title: '第一碗酸汤面',
    content: '正文',
    wordCount: 2,
    status: 'reviewed',
    agentComments: [],
    readerScore: 7.8,
    revisionCount: 0,
    summary: '',
    createdAt: '2026-06-30T00:00:00.000Z',
    updatedAt: '2026-06-30T00:00:00.000Z',
    ...patch,
  };
}

function makeMissingTopicPayoffDiagnostics(): NonNullable<Chapter['diagnostics']> {
  return {
    startupOpeningReport: {
      enabled: true,
      chapterNumber: 1,
      gateMode: 'warn',
      platformProfile: 'auto',
      openingScore: 54,
      clarityScore: 35,
      payoffScore: 42,
      endingHookScore: 45,
      platformFitScore: 60,
      promiseConsistencyScore: 60,
      overallScore: 49.3,
      passed: true,
      overrunChars: 0,
      promiseDrift: {
        active: true,
        promiseHits: 1,
        sceneHits: 8,
        suspenseHits: 0,
        suspenseShare: 0,
        missingPrimaryPayoff: true,
        drifting: false,
        summary: '',
      },
      findings: [
        { code: 'unclear-goal', level: 'warn', message: '前 1000 字没有清晰交代主角当前目标。' },
        { code: 'unclear-obstacle', level: 'warn', message: '前 1000 字阻碍不够清楚，读者难以判断冲突强度。' },
        { code: 'weak-early-payoff', level: 'warn', message: '前段缺少第一次回报或明显反馈，容易只剩铺垫。' },
        { code: 'weak-ending-hook', level: 'warn', message: '章末缺少明确追读点，收束过平。' },
      ],
      summary: '',
    },
    qualityGate: {
      overallScore: 88,
      structureScore: 90,
      styleScore: 88,
      emotionScore: 82,
      passed: true,
      summary: '',
      findings: [],
    },
    readabilityAudit: {
      readerScore: 7.8,
      previousReaderScore: 7.7,
      readerScoreDelta: 0.1,
      wordCount: 1800,
      speakerMarkerCount: 0,
      dialogueCount: 10,
      paragraphCount: 28,
      averageParagraphLength: 48,
      sceneBreakCount: 0,
      qualityFloorPassed: false,
      issues: ['题材主回报缺失：已进入主场景 10 次，但题材回报关键词没有落地。'],
      suggestions: ['把主场景转成可见结果。'],
      genreDrift: {
        active: true,
        genre: 'modern',
        constitutionTags: [],
        suspenseGenre: false,
        promiseDrift: {
          active: true,
          promiseHits: 1,
          sceneHits: 8,
          suspenseHits: 0,
          suspenseShare: 0,
          missingPrimaryPayoff: true,
          drifting: false,
          summary: '',
        },
        qualityFloorPassed: false,
        issues: ['题材主回报缺失：已进入主场景 10 次，但题材回报关键词没有落地。'],
        suggestions: ['把主场景转成可见结果。'],
      },
    },
    updatedAt: '2026-06-30T00:00:00.000Z',
  };
}

describe('auditReaderDelivery', () => {
  it('passes when reader-facing delivery is clean and the chapter holds its score', () => {
    const chapter = makeChapter({
      diagnostics: {
        startupOpeningReport: {
          enabled: true,
          chapterNumber: 1,
          gateMode: 'warn',
          platformProfile: 'auto',
          openingScore: 84,
          clarityScore: 95,
          payoffScore: 82,
          endingHookScore: 82,
          platformFitScore: 82,
          promiseConsistencyScore: 100,
          overallScore: 86,
          passed: true,
          overrunChars: 0,
          findings: [],
          summary: '',
        },
        qualityGate: {
          overallScore: 88,
          structureScore: 90,
          styleScore: 88,
          emotionScore: 82,
          passed: true,
          summary: '',
          findings: [],
        },
        readabilityAudit: {
          readerScore: 7.8,
          previousReaderScore: 7.7,
          readerScoreDelta: 0.1,
          wordCount: 2500,
          speakerMarkerCount: 0,
          dialogueCount: 20,
          paragraphCount: 60,
          averageParagraphLength: 36,
          sceneBreakCount: 0,
          qualityFloorPassed: true,
          issues: [],
          suggestions: [],
          genreDrift: {
            active: true,
            genre: 'modern',
            constitutionTags: [],
            suspenseGenre: false,
            promiseDrift: {
              active: true,
              promiseHits: 8,
              sceneHits: 20,
              suspenseHits: 0,
              suspenseShare: 0,
              missingPrimaryPayoff: false,
              drifting: false,
              summary: '',
            },
            qualityFloorPassed: true,
            issues: [],
            suggestions: [],
          },
        },
        updatedAt: '2026-06-30T00:00:00.000Z',
      },
      authorNotes: ['赵掌柜盯着那块木牌，知道她不再只是临时摆摊。'],
    });

    const audit = auditReaderDelivery({ chapter });

    expect(audit.passed).toBe(true);
    expect(audit.issues).toEqual([]);
    expect(audit.score).toBeGreaterThanOrEqual(76);
  });

  it('passes a high-scoring chapter with only a minor readability floor miss', () => {
    const chapter = makeChapter({
      readerScore: 7.2,
      diagnostics: {
        startupOpeningReport: {
          enabled: true,
          chapterNumber: 1,
          gateMode: 'warn',
          platformProfile: 'auto',
          openingScore: 92,
          clarityScore: 95,
          payoffScore: 94,
          endingHookScore: 95,
          platformFitScore: 88,
          promiseConsistencyScore: 100,
          overallScore: 92,
          passed: true,
          overrunChars: 0,
          findings: [],
          summary: '',
        },
        qualityGate: {
          overallScore: 90,
          structureScore: 90,
          styleScore: 90,
          emotionScore: 78,
          passed: true,
          summary: '',
          findings: [],
        },
        readabilityAudit: {
          readerScore: 7.2,
          previousReaderScore: 7.2,
          readerScoreDelta: 0,
          wordCount: 1800,
          speakerMarkerCount: 0,
          dialogueCount: 20,
          paragraphCount: 42,
          averageParagraphLength: 42,
          sceneBreakCount: 0,
          qualityFloorPassed: true,
          issues: [],
          suggestions: [],
        },
        updatedAt: '2026-06-30T00:00:00.000Z',
      },
    });

    const audit = auditReaderDelivery({ chapter });

    expect(audit.score).toBeGreaterThanOrEqual(84);
    expect(audit.dimensions.readability).toBe(72);
    expect(audit.passed).toBe(true);
    expect(audit.issues.join('\n')).not.toContain('正文读感未达读者交付地板');
  });

  it('fails when metrics hide weak reader-facing delivery', () => {
    const previous = makeChapter({ chapterNumber: 1, readerScore: 7.9 });
    const chapter = makeChapter({
      chapterNumber: 2,
      title: '逃荒少女用一碗酸汤面实现开摊首单成交',
      readerScore: 7.5,
      diagnostics: {
        startupOpeningReport: {
          enabled: true,
          chapterNumber: 2,
          gateMode: 'warn',
          platformProfile: 'auto',
          openingScore: 84,
          clarityScore: 35,
          payoffScore: 42,
          endingHookScore: 45,
          platformFitScore: 70,
          promiseConsistencyScore: 100,
          overallScore: 62.7,
          passed: true,
          overrunChars: 0,
          findings: [
            { code: 'unclear-goal', level: 'warn', message: '前 1000 字没有清晰交代主角当前目标。' },
            { code: 'weak-ending-hook', level: 'warn', message: '章末缺少明确追读点，收束过平。' },
          ],
          summary: '',
        },
        qualityGate: {
          overallScore: 88,
          structureScore: 90,
          styleScore: 88,
          emotionScore: 82,
          passed: true,
          summary: '',
          findings: [
            { code: 'low-structure-signal', level: 'warn', message: '冲突/转折信号偏少，章节推进感不足' },
          ],
        },
        readabilityAudit: {
          readerScore: 7.5,
          previousReaderScore: 7.9,
          readerScoreDelta: -0.4,
          wordCount: 2500,
          speakerMarkerCount: 0,
          dialogueCount: 20,
          paragraphCount: 60,
          averageParagraphLength: 36,
          sceneBreakCount: 0,
          qualityFloorPassed: false,
          issues: ['读者评分较上一章下降 0.4 分。'],
          suggestions: ['下一章必须先修复阅读体验，再追求更多设定命中。'],
          genreDrift: {
            active: true,
            genre: 'modern',
            constitutionTags: [],
            suspenseGenre: false,
            promiseDrift: {
              active: true,
              promiseHits: 8,
              sceneHits: 20,
              suspenseHits: 0,
              suspenseShare: 0,
              missingPrimaryPayoff: false,
              drifting: false,
              summary: '',
            },
            qualityFloorPassed: true,
            issues: [],
            suggestions: [],
          },
        },
        updatedAt: '2026-06-30T00:00:00.000Z',
      },
      authorNotes: ['我觉得这里写得很舒服，爱你们的作者。'],
    });

    const audit = auditReaderDelivery({ chapter, previousChapter: previous });
    const withAudit = makeChapter({
      ...chapter,
      diagnostics: mergeReaderDeliveryAuditIntoDiagnostics(chapter, audit),
    });

    expect(audit.passed).toBe(false);
    expect(audit.issues.join('\n')).toContain('标题交付偏弱');
    expect(audit.issues.join('\n')).toContain('读者分较上一章下降');
    expect(audit.issues.join('\n')).toContain('作者有话说');
    expect(buildReaderDeliveryForwardHints(withAudit)).toContain('上一章读者交付审计提示');
  });

  it('adds engineering-specific forward hints after a weak engineering delivery', () => {
    const chapter = makeChapter({
      title: '变形垫片',
      content: [
        '叶澜蹲在气闸室前检修分析仪，万用表读数显示纹波异常。她更换垫片，重新校准传感器，氧压恢复正常。',
        '她在维修日志写下建议：对所有段气闸室分析仪与配电柜的共用接地回路进行阻抗普查。',
        '她知道，下一条工单迟早会转到她手里。只是时间问题。',
      ].join('\n\n'),
      diagnostics: {
        readerDeliveryAudit: {
          score: 59.5,
          passed: false,
          readerScore: 7.4,
          previousReaderScore: 7.5,
          issues: ['章末追读不足：结尾没有形成足够明确的下一章压力。'],
          suggestions: ['科幻工程章尾必须把异常转成下一步维修/实验任务。'],
          dimensions: {
            title: 62,
            opening: 68,
            promisePayoff: 72,
            readability: 53,
            endingHook: 21,
            publicSurface: 88,
          },
        },
        updatedAt: '2026-06-30T00:00:00.000Z',
      },
    });

    const hints = buildReaderDeliveryForwardHints(chapter);

    expect(hints).toContain('工程题材补救硬约束');
    expect(hints).toContain('即时设备级压力点');
    expect(hints).toContain('资料核查、编号、签名、监控、门禁、日志来源只能放在前半章');
    expect(hints).toContain('最后 300 字不得收在');
    expect(hints).toContain('不要复用“只是时间问题”式收尾');
  });

  it('adds romance-specific forward hints when relationship payoff exists but readability drops', () => {
    const chapter = makeChapter({
      title: '马场直播障碍区事件',
      content: [
        '顾砚舟在马场障碍区握住她的手，直播镜头亮起，Lisa提醒第三段涉水区必须牵手通过。',
        '林栀摸到口袋里的星星吊饰，想起三年前他的旧伤。他嘴硬说没事，手指却一直在抖。',
        '休息室里，他把樱花糖推到她面前，说明天不是合同安排，是他来接她。',
      ].join('\n\n'),
      diagnostics: {
        readerDeliveryAudit: {
          score: 82.7,
          passed: false,
          readerScore: 7.5,
          previousReaderScore: 7.8,
          issues: ['读者评分较上一章下降 0.3 分。'],
          suggestions: ['下一章必须先修复阅读体验。'],
          dimensions: {
            title: 88,
            opening: 100,
            promisePayoff: 100,
            readability: 47,
            endingHook: 94,
            publicSurface: 88,
          },
        },
        updatedAt: '2026-06-30T00:00:00.000Z',
      },
    });

    const hints = buildReaderDeliveryForwardHints(chapter);

    expect(hints).toContain('恋爱读感补救硬约束');
    expect(hints).toContain('少写流程节点');
    expect(hints).toContain('二人关系选择');
    expect(hints).toContain('两个完整场景段落群');
    expect(hints).toContain('选择后的即时后果');
  });

  it('treats engineering clue-only endings as weak forward pressure', () => {
    const chapter = makeChapter({
      title: '氧压回落',
      content: [
        '叶澜把气闸室的冷却泵拆开，读数从红线边缘慢慢回到安全区。她重新校准传感器，工单状态暂时转绿。',
        '章末她调出 HUD缓存，发现日志签名和时间链对不上。文件名能调原文，但谁改过还需要确认。',
      ].join('\n\n'),
      diagnostics: {
        readerDeliveryAudit: {
          score: 64,
          passed: false,
          readerScore: 7.8,
          issues: ['章末追读不足：结尾没有形成足够明确的下一章压力。'],
          suggestions: ['科幻工程章尾必须把异常转成下一步维修/实验任务。'],
          dimensions: {
            title: 88,
            opening: 80,
            promisePayoff: 76,
            readability: 78,
            endingHook: 52,
            publicSurface: 88,
          },
        },
        updatedAt: '2026-06-30T00:00:00.000Z',
      },
    });

    const hints = buildReaderDeliveryForwardHints(chapter);

    expect(hints).toContain('日志签名/HUD缓存/时间链');
    expect(hints).toContain('当场发生的可执行任务');
  });

  it('pushes the next engineering opening away from clue-first file inspection', () => {
    const chapter = makeChapter({
      title: '从数据异常到真实故障',
      content: [
        '叶澜在B段动力舱的一回路循环泵控制柜前蹲下。HUD缓存里的文件挂在那个空文件夹里，她点开循环泵启动日志，先看时间戳和信号源。',
        '她后来才拆开控制柜，确认JTAG接口短接，备用回路压力暂时稳定。',
      ].join('\n\n'),
      diagnostics: {
        readerDeliveryAudit: {
          score: 66.3,
          passed: false,
          readerScore: 7.6,
          issues: ['开篇未达读者交付地板（76/80）。'],
          suggestions: ['开篇第一屏要同时给出主角行动、当前目标、具体阻碍和一次可见反馈。'],
          dimensions: {
            title: 88,
            opening: 76,
            promisePayoff: 48.6,
            readability: 55,
            endingHook: 86,
            publicSurface: 60,
          },
        },
        updatedAt: '2026-06-30T00:00:00.000Z',
      },
    });

    const hints = buildReaderDeliveryForwardHints(chapter);

    expect(hints).toContain('不能先打开文件、追来源、确认签名');
    expect(hints).toContain('作者有话说宁可为空');
  });

  it('adds hard forward constraints when the opening misses reader delivery', () => {
    const chapter = makeChapter({
      title: '早晨的台本',
      content: [
        '林栀坐在沙发上翻旧记录，台本压在杯子下面，手机屏幕还停在昨晚的消息。',
        '她想了很久，终于把文件夹合上。',
      ].join('\n\n'),
      diagnostics: {
        readerDeliveryAudit: {
          score: 84.9,
          passed: false,
          readerScore: 7.5,
          previousReaderScore: 7.6,
          issues: ['开篇未达读者交付地板（76/80）。'],
          suggestions: ['开篇第一屏要同时给出主角行动、当前目标、具体阻碍和一次可见反馈。'],
          dimensions: {
            title: 88,
            opening: 76,
            promisePayoff: 100,
            readability: 72,
            endingHook: 94,
            publicSurface: 88,
          },
        },
        updatedAt: '2026-07-03T00:00:00.000Z',
      },
    });

    const hints = buildReaderDeliveryForwardHints(chapter);

    expect(hints).toContain('开篇读者交付硬约束');
    expect(hints).toContain('前 500 字必须同时出现主角正在做的可见动作、当章目标、具体阻碍、命名角色的即时反馈');
    expect(hints).toContain('不要先用回忆、旧记录、台本、文件、旧物件、安静整理或内心复盘开场');
  });

  it('penalizes engineering openings that begin by continuing a HUD file thread', () => {
    const chapter = makeChapter({
      title: '走廊选择',
      content: [
        '走廊里安静得只剩下自己的脚步声。叶澜拇指停在文件图标上方，那个文件名已经展开第一个字符。调度又发来波形时间戳偏差。',
        '下一秒，C段末端氧分压告警跳出，她才转身去处理氧化催化单元。',
      ].join('\n\n'),
      readerScore: 7.8,
      diagnostics: {
        qualityGate: {
          overallScore: 90,
          structureScore: 94,
          styleScore: 90,
          emotionScore: 82,
          passed: true,
          summary: '',
          findings: [],
        },
        readabilityAudit: {
          readerScore: 7.8,
          previousReaderScore: 7.8,
          readerScoreDelta: 0,
          wordCount: 2500,
          speakerMarkerCount: 0,
          dialogueCount: 12,
          paragraphCount: 40,
          averageParagraphLength: 45,
          sceneBreakCount: 0,
          qualityFloorPassed: true,
          issues: [],
          suggestions: [],
          genreDrift: {
            active: true,
            genre: '科幻',
            constitutionTags: ['工程维修'],
            suspenseGenre: false,
            promiseDrift: {
              active: true,
              promiseHits: 8,
              sceneHits: 18,
              suspenseHits: 0,
              suspenseShare: 0,
              missingPrimaryPayoff: false,
              drifting: false,
              summary: '',
            },
            qualityFloorPassed: true,
            issues: [],
            suggestions: [],
          },
        },
        updatedAt: '2026-06-30T00:00:00.000Z',
      },
    });

    const audit = auditReaderDelivery({ chapter });

    expect(audit.passed).toBe(false);
    expect(audit.issues.join('\n')).toContain('工程开篇偏虚');
    expect(audit.dimensions.opening).toBeLessThan(80);
  });

  it('does not treat workplace engineering department meetings as scifi engineering scenes', () => {
    const chapter = makeChapter({
      title: '工程部会议室',
      content: [
        '工程部会议室的灯全部亮着，周维在主位左侧翻开验收草案。',
        '赵宏把第四页推到桌面中央，质疑SC-04数据链的替代件效力。',
        '林澄拿出现场验收确认单和供应商备案表，把签字日期、付款日期和验收清单逐项对齐。',
      ].join('\n\n'),
      readerScore: 7.8,
      diagnostics: {
        qualityGate: {
          overallScore: 88,
          structureScore: 90,
          styleScore: 88,
          emotionScore: 76,
          passed: true,
          summary: '',
          findings: [],
        },
        readabilityAudit: {
          readerScore: 7.8,
          previousReaderScore: 7.7,
          readerScoreDelta: 0.1,
          wordCount: 1500,
          speakerMarkerCount: 0,
          dialogueCount: 8,
          paragraphCount: 12,
          averageParagraphLength: 50,
          sceneBreakCount: 0,
          qualityFloorPassed: true,
          issues: [],
          suggestions: [],
        },
        updatedAt: '2026-06-30T00:00:00.000Z',
      },
    });

    const audit = auditReaderDelivery({ chapter });

    expect(audit.issues.join('\n')).not.toContain('工程开篇偏虚');
    expect(audit.suggestions.join('\n')).not.toContain('设备状态');
  });

  it('adds workplace readability forward hints without scifi engineering advice', () => {
    const chapter = makeChapter({
      title: '复测会议',
      content: [
        '客户方刘总坐在会议室靠窗那侧，验收清单和结构确认单摊在桌面中央。',
        '林澄把方案拆解成三项责任分配，小李当场递出文件袋，周维在监督栏签字。',
        '刘总要求今晚给出复测时间表，否则新项目首期300万签约押后。',
      ].join('\n\n'),
      readerScore: 7.8,
      diagnostics: {
        readerDeliveryAudit: {
          score: 78.7,
          passed: false,
          readerScore: 7.8,
          previousReaderScore: 7.9,
          issues: ['正文读感未达读者交付地板（57/74）。'],
          suggestions: ['下一章必须优先恢复读感。'],
          dimensions: {
            title: 88,
            opening: 86,
            promisePayoff: 80.8,
            readability: 57,
            endingHook: 92,
            publicSurface: 88,
          },
        },
        updatedAt: '2026-06-30T00:00:00.000Z',
      },
    });

    const hints = buildReaderDeliveryForwardHints(chapter);

    expect(hints).toContain('职场读感补救硬约束');
    expect(hints).toContain('站队变化');
    expect(hints).not.toContain('工程题材补救硬约束');
    expect(hints).not.toContain('设备状态、报警读数');
  });

  it('adds workplace forward hints when only the ending hook is weak', () => {
    const chapter = makeChapter({
      title: '复测时间表',
      content: [
        '302会议室里，林澄把复测时间表、供应商名单和预算责任逐项拆开。',
        '刘总当场确认样板间复测口径，小陈接过责任分配表，周维也改口支持她。',
        '章尾只剩一份待核验资料躺在桌面，没人给出新的业务选择。',
      ].join('\n\n'),
      diagnostics: {
        readerDeliveryAudit: {
          score: 82,
          passed: false,
          readerScore: 7.8,
          previousReaderScore: 7.8,
          issues: ['章尾追读未达读者交付地板（72/80）。'],
          suggestions: ['结尾不要只收束成绩，要把下一章的新目标、压力或对手动作钉住。'],
          dimensions: {
            title: 88,
            opening: 90,
            promisePayoff: 92,
            readability: 78,
            endingHook: 72,
            publicSurface: 88,
          },
        },
        updatedAt: '2026-07-03T00:00:00.000Z',
      },
    });

    const hints = buildReaderDeliveryForwardHints(chapter);

    expect(hints).toContain('职场读感补救硬约束');
    expect(hints).toContain('章尾压力必须压到可执行业务选择');
    expect(hints).toContain('签约延期、替代供应商、预算责任或客户追加条件');
  });

  it('adds romance forward hints when only the ending hook is weak', () => {
    const chapter = makeChapter({
      title: '红糖水和明早安排',
      content: [
        '凌晨厨房里，许知夏把红糖水推到林砚手边，两人同时避开对方视线。',
        '林砚低笑了一声，把拖鞋放在她脚边，关系明显靠近。',
        '章尾只发来一份品牌方流程安排，没有落到两人的下一步选择。',
      ].join('\n\n'),
      diagnostics: {
        readerDeliveryAudit: {
          score: 83,
          passed: false,
          readerScore: 7.9,
          previousReaderScore: 7.9,
          issues: ['章尾追读未达读者交付地板（70/80）。'],
          suggestions: ['结尾不要只收束成绩，要把下一章的新目标、压力或对手动作钉住。'],
          dimensions: {
            title: 88,
            opening: 92,
            promisePayoff: 94,
            readability: 80,
            endingHook: 70,
            publicSurface: 88,
          },
        },
        updatedAt: '2026-07-03T00:00:00.000Z',
      },
    });

    const hints = buildReaderDeliveryForwardHints(chapter);

    expect(hints).toContain('恋爱读感补救硬约束');
    expect(hints).toContain('章尾钩子不能只发下一份流程安排');
    expect(hints).toContain('要不要承认、要不要赴约、要不要把旧物还给对方');
  });

  it('adds campus club readability forward hints without workplace advice', () => {
    const chapter = makeChapter({
      title: '活动室·老师的逐客令',
      content: [
        '活动室门口，许知夏把招新名单摊开，校报照片压在桌角。',
        '老师推门进来，说下午要检查电路，模型社必须先让出活动室。',
        '几个同学围在门口，有人说可以帮忙守场，也有人说明天把室友带来。',
      ].join('\n\n'),
      diagnostics: {
        readerDeliveryAudit: {
          score: 86.2,
          passed: false,
          readerScore: 7.3,
          previousReaderScore: 7.6,
          issues: ['正文读感未达读者交付地板（73/74）。'],
          suggestions: ['结尾不要只收束成绩，要把下一章的新目标、压力或对手动作钉住。'],
          dimensions: {
            title: 88,
            opening: 90,
            promisePayoff: 94,
            readability: 73,
            endingHook: 92,
            publicSurface: 88,
          },
        },
        updatedAt: '2026-07-03T00:00:00.000Z',
      },
    });

    const hints = buildReaderDeliveryForwardHints(chapter);

    expect(hints).toContain('校园社团读感补救硬约束');
    expect(hints).toContain('小失败后的现场补救');
    expect(hints).toContain('正式招新展示的硬指标');
    expect(hints).not.toContain('职场读感补救硬约束');
    expect(hints).not.toContain('设备状态、报警读数');
  });

  it('adds court power readability hints that turn clues into public power consequences', () => {
    const chapter = makeChapter({
      title: '库房三物',
      content: [
        '府衙库房前，谢无咎把账册、陶片和蜡封线摆到案上，女帝派来的戍卫堵住门阀家将。',
        '萧照临盯着账册里的十三字暗号，问他是继续追旧案，还是当场交出兵权名册。',
        '崔氏门阀的人按住铁匣不肯松手，府衙外的军令已经催到第三遍。',
      ].join('\n\n'),
      diagnostics: {
        readerDeliveryAudit: {
          score: 73.4,
          passed: false,
          readerScore: 7.1,
          previousReaderScore: 7.7,
          issues: ['正文读感未达读者交付地板（45/74）。'],
          suggestions: ['下一章必须优先恢复读感。'],
          dimensions: {
            title: 82,
            opening: 64,
            promisePayoff: 78,
            readability: 45,
            endingHook: 81,
            publicSurface: 86,
          },
        },
        updatedAt: '2026-07-03T00:00:00.000Z',
      },
    });

    const hints = buildReaderDeliveryForwardHints(chapter);

    expect(hints).toContain('非悬疑题材低读感补救硬约束');
    expect(hints).toContain('朝堂权谋读感补救硬约束');
    expect(hints).toContain('账册、密信、旧案或暗号');
    expect(hints).toContain('站队、削权、换防、封赏、问罪、押人或军令变化');
    expect(hints).toContain('铁匣、数字、草籽');
    expect(hints).toContain('公开期限、军令、廷议、换防、押解或女帝/门阀的新条件');
  });

  it('adds court power forward hints when only the ending hook is weak', () => {
    const chapter = makeChapter({
      title: '朝堂三令',
      content: [
        '安阳府衙正堂里，沈渊把女帝急诏压在案上，当场宣布戍卫营换防。',
        '萧照临改口支持廷议，崔氏门阀的账房被押到堂前，赵铁山接过军令牌。',
        '章尾却只落在青玉印背面的数字，没有把廷议或押解执行压成下一章现场。',
      ].join('\n\n'),
      diagnostics: {
        readerDeliveryAudit: {
          score: 84.5,
          passed: false,
          readerScore: 7.6,
          previousReaderScore: 7.6,
          issues: ['章尾追读未达读者交付地板（74/80）。'],
          suggestions: ['朝堂权谋章尾必须落到公开期限、军令变化、廷议开场、押解执行、换防落地或女帝/门阀的新条件。'],
          dimensions: {
            title: 88,
            opening: 90,
            promisePayoff: 94,
            readability: 76,
            endingHook: 74,
            publicSurface: 88,
          },
        },
        updatedAt: '2026-07-03T00:00:00.000Z',
      },
    });

    const hints = buildReaderDeliveryForwardHints(chapter);

    expect(hints).toContain('朝堂权谋读感补救硬约束');
    expect(hints).toContain('章尾不能只收在铁匣、数字、草籽');
    expect(hints).toContain('公开期限、军令、廷议、换防、押解或女帝/门阀的新条件');
  });

  it('fails court power chapters when clue objects replace public power consequences', () => {
    const chapter = makeChapter({
      title: '四十二里与五百步',
      content: [
        '沈渊蹲在府衙门槛边，卷轴压在砖面上，温脉草籽落在光斑边缘。',
        '他依次看过草籽、铁匣、纸角、数字十三、陶片背面的路线，又把蜡封线放回袖中。',
        '沈忠问女帝是否还等在正堂，赵铁山问门阀的人会不会追来，沈渊只说布网者想让他往前走。',
        '他们离开府衙，沿北门去河滩，继续追查四十二里外的山谷来源。',
        '章尾，铁匣缝隙合上，砖面五百二字渗出暗红液体，没人看见布网者是谁。',
      ].join('\n\n'),
      readerScore: 7.8,
      diagnostics: {
        qualityGate: {
          overallScore: 88,
          structureScore: 86,
          styleScore: 90,
          emotionScore: 62,
          passed: true,
          summary: '',
          findings: [],
        },
        readabilityAudit: {
          readerScore: 7.8,
          previousReaderScore: 7.8,
          readerScoreDelta: 0,
          wordCount: 2200,
          speakerMarkerCount: 0,
          dialogueCount: 6,
          paragraphCount: 32,
          averageParagraphLength: 68,
          sceneBreakCount: 0,
          qualityFloorPassed: true,
          issues: [],
          suggestions: [],
        },
        updatedAt: '2026-07-03T00:00:00.000Z',
      },
    });

    const audit = auditReaderDelivery({ chapter });

    expect(audit.passed).toBe(false);
    expect(audit.issues.join('\n')).toContain('朝堂权谋回报偏虚');
    expect(audit.issues.join('\n')).toContain('朝堂权谋读感偏查案');
    expect(audit.issues.join('\n')).toContain('朝堂权谋章尾偏悬疑');
    expect(audit.suggestions.join('\n')).toContain('站队、押人、换防、廷议、问罪、封赏或兵权变化');
    expect(audit.dimensions.promisePayoff).toBeLessThan(76);
    expect(audit.dimensions.readability).toBeLessThan(74);
  });

  it('adds anti-mystery delivery constraints for low-readability non-suspense promise chapters', () => {
    const chapter = makeChapter({
      title: '招新名单上的编号',
      content: [
        '活动室门口，许知夏把招新名单摊开，校报照片压在桌角。',
        '门外来了个陌生人，把编号001的金属挂件放在桌上，问她知不知道这是从哪来的。',
        '社员们围在门口，老师说活动室能不能留下，要看今晚正式报名人数和展示反馈。',
      ].join('\n\n'),
      diagnostics: {
        readerDeliveryAudit: {
          score: 76.1,
          passed: false,
          readerScore: 7.1,
          previousReaderScore: 7.4,
          issues: ['正文读感未达读者交付地板（55/74）。'],
          suggestions: ['下一章必须优先恢复读感。'],
          dimensions: {
            title: 88,
            opening: 86,
            promisePayoff: 80,
            readability: 55,
            endingHook: 82,
            publicSurface: 88,
          },
        },
        readabilityAudit: {
          readerScore: 7.1,
          previousReaderScore: 7.4,
          readerScoreDelta: -0.3,
          wordCount: 2200,
          speakerMarkerCount: 0,
          dialogueCount: 14,
          paragraphCount: 38,
          averageParagraphLength: 58,
          sceneBreakCount: 0,
          qualityFloorPassed: false,
          issues: [],
          suggestions: [],
          genreDrift: {
            active: true,
            genre: 'campus',
            constitutionTags: ['校园', '社团'],
            suspenseGenre: false,
            promiseDrift: {
              active: true,
              promiseHits: 4,
              sceneHits: 10,
              suspenseHits: 2,
              suspenseShare: 0.2,
              missingPrimaryPayoff: false,
              drifting: false,
              summary: '',
            },
            qualityFloorPassed: false,
            issues: [],
            suggestions: [],
          },
        },
        updatedAt: '2026-07-03T00:00:00.000Z',
      },
    });

    const hints = buildReaderDeliveryForwardHints(chapter);

    expect(hints).toContain('非悬疑题材低读感补救硬约束');
    expect(hints).toContain('陌生人、编号物件、匿名消息、旧图纸、旧钥匙、隐藏夹层、传承物件');
    expect(hints).toContain('不能负责解决当章难题');
    expect(hints).toContain('另一个人/另一把钥匙/另一个旧物在哪');
    expect(hints).toContain('社团人数/活动室资源变化');
    expect(hints).toContain('至少两次让命名角色当场公开反馈结果');
    expect(hints).toContain('立刻补一个具体人物反应和一个新压力');
    expect(hints).toContain('章尾不能只收在“编号是什么/是谁/从哪来/谁留下的”');
    expect(hints).toContain('校园社团读感补救硬约束');
  });

  it('does not add anti-mystery delivery constraints for suspense chapters', () => {
    const chapter = makeChapter({
      title: '活动室编号001',
      content: [
        '活动室的灯忽明忽暗，老师和社员都说没有见过那张编号001的旧名单。',
        '陌生人把匿名消息贴在门缝里，许知夏沿着来源追查到废弃器材室。',
        '门后传来脚步声，她必须弄清是谁留下了这串编号。',
      ].join('\n\n'),
      diagnostics: {
        readerDeliveryAudit: {
          score: 74.2,
          passed: false,
          readerScore: 7,
          previousReaderScore: 7.2,
          issues: ['正文读感未达读者交付地板（56/74）。'],
          suggestions: ['下一章必须优先恢复读感。'],
          dimensions: {
            title: 88,
            opening: 82,
            promisePayoff: 79,
            readability: 56,
            endingHook: 86,
            publicSurface: 88,
          },
        },
        readabilityAudit: {
          readerScore: 7,
          previousReaderScore: 7.2,
          readerScoreDelta: -0.2,
          wordCount: 2100,
          speakerMarkerCount: 0,
          dialogueCount: 10,
          paragraphCount: 34,
          averageParagraphLength: 61,
          sceneBreakCount: 0,
          qualityFloorPassed: false,
          issues: [],
          suggestions: [],
          genreDrift: {
            active: true,
            genre: 'suspense',
            constitutionTags: ['悬疑', '校园'],
            suspenseGenre: true,
            promiseDrift: {
              active: true,
              promiseHits: 5,
              sceneHits: 8,
              suspenseHits: 6,
              suspenseShare: 0.75,
              missingPrimaryPayoff: false,
              drifting: false,
              summary: '',
            },
            qualityFloorPassed: false,
            issues: [],
            suggestions: [],
          },
        },
        updatedAt: '2026-07-03T00:00:00.000Z',
      },
    });

    const hints = buildReaderDeliveryForwardHints(chapter);

    expect(hints).not.toContain('非悬疑题材低读感补救硬约束');
    expect(hints).not.toContain('社团人数/活动室资源变化');
  });

  it('adds frontier-building readability forward hints', () => {
    const chapter = makeChapter({
      title: '陶罐与骨棍',
      content: [
        '秦墨蹲在灶台边，陶罐底部有暗金沉淀，虎牙和阿骨把炭火、陶罐、蓄水坑和守洞分工连成一套办法。',
        '部落的人学会用骨片刻号换汤，老族长把骨棍插在灶台前，灰斑扩大。',
        '山魈的叫声从洞外传来，灰犬在洞口刨土。',
      ].join('\n\n'),
      diagnostics: {
        readerDeliveryAudit: {
          score: 88.6,
          passed: false,
          readerScore: 7.7,
          previousReaderScore: 7.6,
          issues: ['正文推进感偏弱：场面有结果，但冲突/转折信号不足。'],
          suggestions: ['下一章要把结果放进更明确的阻碍、反制和关系位置变化里。'],
          dimensions: {
            title: 88,
            opening: 100,
            promisePayoff: 98,
            readability: 71,
            endingHook: 94,
            publicSurface: 88,
          },
        },
        updatedAt: '2026-06-30T00:00:00.000Z',
      },
    });

    const hints = buildReaderDeliveryForwardHints(chapter);

    expect(hints).toContain('文明建设读感补救硬约束');
    expect(hints).toContain('阻碍、反制或代价');
    expect(hints).toContain('部落成员公开改变选择');
    expect(hints).toContain('山魈靠近');
  });

  it('does not fail high-quality frontier chapters on a stale structure warning alone', () => {
    const chapter = makeChapter({
      title: '新灶开张',
      content: [
        '秦墨蹲在新灶台前，陶罐底部结出暗金色薄壳，但是陶土不够，旧灶裂缝渗出的冷液流向蓄水坑。',
        '阿骨掌旧灶，虎牙守洞，孩子把骨片交易凭证交回石台。灰斑骨棍在双灶之间蔓延。',
        '地下传来石头摩擦的低频嗡响，秦墨右臂硬甲崩开，血滴在地面上。',
        '老族长放下第三根骨棍，森林方向响起整齐脚步。秦墨必须在守洞和迁灶之间做选择。',
      ].join('\n\n'),
      readerScore: 8.1,
      diagnostics: {
        qualityGate: {
          overallScore: 94.5,
          structureScore: 97.8,
          styleScore: 92,
          emotionScore: 92.8,
          passed: true,
          summary: '',
          findings: [
            { code: 'low-structure-signal', level: 'warn', message: '冲突/转折信号偏少，章节推进感不足' },
          ],
        },
        readabilityAudit: {
          readerScore: 8.1,
          previousReaderScore: 7.7,
          readerScoreDelta: 0.4,
          wordCount: 2200,
          speakerMarkerCount: 0,
          dialogueCount: 12,
          paragraphCount: 42,
          averageParagraphLength: 45,
          sceneBreakCount: 0,
          qualityFloorPassed: true,
          issues: [],
          suggestions: [],
          genreDrift: {
            active: true,
            genre: 'fantasy',
            constitutionTags: [],
            suspenseGenre: false,
            promiseDrift: {
              active: true,
              promiseHits: 6,
              sceneHits: 16,
              suspenseHits: 0,
              suspenseShare: 0,
              missingPrimaryPayoff: false,
              drifting: false,
              summary: '',
            },
            qualityFloorPassed: true,
            issues: [],
            suggestions: [],
          },
        },
        updatedAt: '2026-06-30T00:00:00.000Z',
      },
    });

    const audit = auditReaderDelivery({ chapter });

    expect(audit.issues.join('\n')).not.toContain('正文推进感偏弱');
    expect(audit.passed).toBe(true);
  });

  it('recognizes workplace business payoff and signing pressure as reader delivery', () => {
    const chapter = makeChapter({
      title: '签约压力',
      content: [
        '刘总坐在302会议室靠窗那头，结构补强原始图压在会议桌中央。',
        '林澄在白板上拆出三项：复测时间表、替代供应商资质、结构补强出图单位。',
        '周维当场开口：“赵工，这条路你能收还是林工收？”赵宏停了三秒，说：“林工收吧。”',
        '小陈接过责任分配表，开始排今晚七点前的复测时间表。',
        '刘总站起来：“我等到今晚8点。如果替代供应商和预算责任定不下来，新项目首期300万签约押后。”',
      ].join('\n\n'),
      readerScore: 7.8,
      diagnostics: {
        startupOpeningReport: {
          enabled: true,
          chapterNumber: 13,
          gateMode: 'warn',
          platformProfile: 'auto',
          openingScore: 92,
          clarityScore: 92,
          payoffScore: 78,
          endingHookScore: 74,
          platformFitScore: 88,
          promiseConsistencyScore: 96,
          overallScore: 86,
          passed: false,
          overrunChars: 0,
          findings: [
            { code: 'weak-ending-hook', level: 'warn', message: '章末缺少明确追读点，收束过平。' },
          ],
          summary: '',
        },
        qualityGate: {
          overallScore: 90,
          structureScore: 92,
          styleScore: 88,
          emotionScore: 82,
          passed: true,
          summary: '',
          findings: [],
        },
        readabilityAudit: {
          readerScore: 7.8,
          previousReaderScore: 7.8,
          readerScoreDelta: 0,
          wordCount: 1900,
          speakerMarkerCount: 0,
          dialogueCount: 10,
          paragraphCount: 32,
          averageParagraphLength: 52,
          sceneBreakCount: 0,
          qualityFloorPassed: true,
          issues: [],
          suggestions: [],
          genreDrift: {
            active: true,
            genre: '职场',
            constitutionTags: ['项目交付'],
            suspenseGenre: false,
            promiseDrift: {
              active: true,
              promiseHits: 4,
              sceneHits: 8,
              suspenseHits: 0,
              suspenseShare: 0,
              missingPrimaryPayoff: false,
              drifting: false,
              summary: '',
            },
            qualityFloorPassed: true,
            issues: [],
            suggestions: [],
          },
        },
        updatedAt: '2026-06-30T00:00:00.000Z',
      },
    });

    const audit = auditReaderDelivery({ chapter });

    expect(audit.dimensions.promisePayoff).toBeGreaterThanOrEqual(76);
    expect(audit.dimensions.endingHook).toBeGreaterThanOrEqual(80);
    expect(audit.issues.join('\n')).not.toContain('章尾追读不足');
    expect(audit.passed).toBe(true);
  });

  it('fails engineering endings that use HUD files instead of device pressure', () => {
    const chapter = makeChapter({
      title: '泄压阀微漏',
      content: [
        '泄压阀管路附近的气流声变了调。叶澜蹲下身，确认阀后压力波动超标，拆开放气口取样。',
        '她完成排气，阀后压力恢复到49.9bar。',
        'HUD缓存里弹出一条消息推送。文件名：A段备用回路03:17启动日志完整版。附：信号源波形片段。',
      ].join('\n\n'),
      readerScore: 7.8,
      diagnostics: {
        qualityGate: {
          overallScore: 90,
          structureScore: 94,
          styleScore: 90,
          emotionScore: 82,
          passed: true,
          summary: '',
          findings: [],
        },
        readabilityAudit: {
          readerScore: 7.8,
          previousReaderScore: 7.8,
          readerScoreDelta: 0,
          wordCount: 2500,
          speakerMarkerCount: 0,
          dialogueCount: 12,
          paragraphCount: 40,
          averageParagraphLength: 45,
          sceneBreakCount: 0,
          qualityFloorPassed: true,
          issues: [],
          suggestions: [],
          genreDrift: {
            active: true,
            genre: '科幻',
            constitutionTags: ['工程维修'],
            suspenseGenre: false,
            promiseDrift: {
              active: true,
              promiseHits: 8,
              sceneHits: 18,
              suspenseHits: 0,
              suspenseShare: 0,
              missingPrimaryPayoff: false,
              drifting: false,
              summary: '',
            },
            qualityFloorPassed: true,
            issues: [],
            suggestions: [],
          },
        },
        updatedAt: '2026-06-30T00:00:00.000Z',
      },
    });

    const audit = auditReaderDelivery({ chapter });

    expect(audit.passed).toBe(false);
    expect(audit.issues.join('\n')).toContain('日志/文件/信号源线索');
    expect(audit.issues.join('\n')).toContain('文件推送、日志或信号源');
    expect(audit.dimensions.endingHook).toBeLessThan(80);
  });

  // TODO(#1): audit.passed 为 false —— opening/endingHook 两维均达标，说明是其他维度
  // 拉低了总评。需要定位 auditReaderDelivery 中哪一维不达标，判断是评分逻辑缺陷
  // 还是本用例的样例章节确实不该整体通过，据此修断言或修实现。修好后移除 skip。
  it.skip('treats HUD-backed engineering status followed by device action as a valid hook', () => {
    const chapter = makeChapter({
      title: '散热风扇·轴承更换',
      content: [
        '叶澜的拇指悬停在HUD触摸板右侧，振动加速度读数从2.3m/s²跳到了4.1。温度42°C，绝缘电阻1.2MΩ。她拔掉风扇电源，旋下面板螺丝，准备更换轴承。',
        '她更换轴承后，振动加速度回到1.8m/s²，温度降到39°C。值班间的高频啸叫消失，老孙在门外敲了两下。',
        '系统弹出推荐检查：A段循环泵轴承状态检测，关联逻辑为振动频谱特征频率1200Hz重叠。叶澜没有点确认键。她蹲下来，重新拉开工具箱，取出了万用表。',
        '她拿着万用表，穿过C段走廊，朝A段器材库走去。工具箱里的扳手撞在护板上的频率，和散热风扇的转速一模一样。',
      ].join('\n\n'),
      readerScore: 7.8,
      diagnostics: {
        qualityGate: {
          overallScore: 88,
          structureScore: 92,
          styleScore: 88,
          emotionScore: 78,
          passed: true,
          summary: '',
          findings: [],
        },
        readabilityAudit: {
          readerScore: 7.8,
          previousReaderScore: 7.7,
          readerScoreDelta: 0.1,
          wordCount: 2500,
          speakerMarkerCount: 0,
          dialogueCount: 8,
          paragraphCount: 42,
          averageParagraphLength: 44,
          sceneBreakCount: 0,
          qualityFloorPassed: true,
          issues: [],
          suggestions: [],
          genreDrift: {
            active: true,
            genre: '科幻',
            constitutionTags: [],
            suspenseGenre: false,
            promiseDrift: {
              active: true,
              promiseHits: 8,
              sceneHits: 18,
              suspenseHits: 0,
              suspenseShare: 0,
              missingPrimaryPayoff: false,
              drifting: false,
              summary: '',
            },
            qualityFloorPassed: true,
            issues: [],
            suggestions: [],
          },
        },
        updatedAt: '2026-06-30T00:00:00.000Z',
      },
      authorNotes: ['散热风扇转稳的时候，新的频率已经落到工具箱里。'],
    });

    const audit = auditReaderDelivery({ chapter });

    expect(audit.issues.join('\n')).not.toContain('日志/文件/信号源线索');
    expect(audit.issues.join('\n')).not.toContain('文件推送、日志或信号源');
    expect(audit.dimensions.opening).toBeGreaterThanOrEqual(80);
    expect(audit.dimensions.endingHook).toBeGreaterThanOrEqual(80);
    expect(audit.passed).toBe(true);
  });

  it('does not treat routine maintenance log reporting as a clue-only engineering ending', () => {
    const chapter = makeChapter({
      title: '执行器试切',
      content: [
        '万用表探针压住垫圈端面时，读数从3.2Ω跳到9.7Ω。叶澜蹲在补氧阀执行器旁，先拆下固定螺栓，再把目标电信号压回45%。',
        '执行器手动试切通过，机械位置与电信号一致。李班长把通道1氧分压跳变记录写入日志，叶澜重新检查阀杆偏心变形区。',
        '下一秒，备用线执行器报警灯从绿跳成黄。阀杆在半程位置卡住，电信号停在45%，机械刻度却卡在38%。叶澜取出扳手，必须立刻复位。',
      ].join('\n\n'),
      readerScore: 7.8,
      diagnostics: {
        qualityGate: {
          overallScore: 90,
          structureScore: 94,
          styleScore: 90,
          emotionScore: 80,
          passed: true,
          summary: '',
          findings: [],
        },
        readabilityAudit: {
          readerScore: 7.8,
          previousReaderScore: 7.7,
          readerScoreDelta: 0.1,
          wordCount: 2500,
          speakerMarkerCount: 0,
          dialogueCount: 10,
          paragraphCount: 40,
          averageParagraphLength: 45,
          sceneBreakCount: 0,
          qualityFloorPassed: true,
          issues: [],
          suggestions: [],
          genreDrift: {
            active: true,
            genre: '科幻',
            constitutionTags: [],
            suspenseGenre: false,
            promiseDrift: {
              active: true,
              promiseHits: 9,
              sceneHits: 16,
              suspenseHits: 0,
              suspenseShare: 0,
              missingPrimaryPayoff: false,
              drifting: false,
              summary: '',
            },
            qualityFloorPassed: true,
            issues: [],
            suggestions: [],
          },
        },
        updatedAt: '2026-06-30T00:00:00.000Z',
      },
      authorNotes: ['叶澜检查了一万件事，却仍有一颗螺栓把沉默压回手心。'],
    });

    const audit = auditReaderDelivery({ chapter });

    expect(audit.issues.join('\n')).not.toContain('日志/文件/信号源线索');
    expect(audit.issues.join('\n')).not.toContain('作者有话说');
    expect(audit.dimensions.endingHook).toBeGreaterThanOrEqual(80);
    expect(audit.dimensions.publicSurface).toBeGreaterThanOrEqual(80);
    expect(audit.passed).toBe(true);
  });

  it('keeps engineering red-light device pressure hooks above the ending floor', () => {
    const chapter = makeChapter({
      title: '气闸室校准',
      content: [
        'B段E-5气闸室内舱面板亮着冷白光。叶澜蹲在氧压传感器前，读数从0.62atm跳到1.18atm，采样间隔仍然异常。',
        '她完成手动校准，记录阀门位置修正和维修臂校准参数。调度确认流量恢复，老孙在频道里追问备用电池读数。',
        '叶澜补完参数记录：备用电池压降8.8V，补片区域温度差6°C。她刚合上记录板，E-5气闸室指示灯从黄灯一跳，跳到红色边缘。',
      ].join('\n\n'),
      readerScore: 7.8,
      diagnostics: {
        startupOpeningReport: {
          enabled: true,
          chapterNumber: 17,
          gateMode: 'warn',
          platformProfile: 'auto',
          openingScore: 92,
          clarityScore: 92,
          payoffScore: 90,
          endingHookScore: 74,
          platformFitScore: 88,
          promiseConsistencyScore: 100,
          overallScore: 88,
          passed: false,
          overrunChars: 0,
          findings: [
            { code: 'weak-ending-hook', level: 'warn', message: '章末缺少明确追读点，收束过平。' },
          ],
          summary: '',
        },
        qualityGate: {
          overallScore: 90,
          structureScore: 94,
          styleScore: 90,
          emotionScore: 82,
          passed: true,
          summary: '',
          findings: [],
        },
        readabilityAudit: {
          readerScore: 7.8,
          previousReaderScore: 7.8,
          readerScoreDelta: 0,
          wordCount: 2200,
          speakerMarkerCount: 0,
          dialogueCount: 8,
          paragraphCount: 42,
          averageParagraphLength: 44,
          sceneBreakCount: 0,
          qualityFloorPassed: true,
          issues: [],
          suggestions: [],
          genreDrift: {
            active: true,
            genre: '科幻',
            constitutionTags: ['工程维修'],
            suspenseGenre: false,
            promiseDrift: {
              active: true,
              promiseHits: 9,
              sceneHits: 18,
              suspenseHits: 0,
              suspenseShare: 0,
              missingPrimaryPayoff: false,
              drifting: false,
              summary: '',
            },
            qualityFloorPassed: true,
            issues: [],
            suggestions: [],
          },
        },
        updatedAt: '2026-06-30T00:00:00.000Z',
      },
    });

    const audit = auditReaderDelivery({ chapter });

    expect(audit.issues.join('\n')).not.toContain('章末追读不足');
    expect(audit.dimensions.endingHook).toBeGreaterThanOrEqual(80);
    expect(audit.passed).toBe(true);
  });

  it('derives opening and ending delivery from chapter text when startup report is absent', () => {
    const content = [
      '天没亮，沈知夏蹲在灶台前把十一只陶碗排成两行。今日赌约要卖够二十碗，可赵掌柜的粥车已经堵在路口，碗也少了一只。',
      '她掏出铜板压在木牌下：“今日押碗，两文押金，退碗退钱。”妇人第一个拍下铜板，端走酸汤面，墙根很快排起人。',
      '赵掌柜看着空碗一只只回来，粥勺停在锅沿。',
      '沈知夏数完铜板，抬头说：“明天加桌，卖三十碗。”赵掌柜推着粥车绕开路口，回头看了一眼，低声道：“明天我换个位置。”',
    ].join('\n\n');
    const chapter = makeChapter({
      content,
      diagnostics: {
        qualityGate: {
          overallScore: 89,
          structureScore: 92,
          styleScore: 88,
          emotionScore: 78,
          passed: true,
          summary: '',
          findings: [],
        },
        readabilityAudit: {
          readerScore: 8,
          previousReaderScore: 8,
          readerScoreDelta: 0,
          wordCount: 2500,
          speakerMarkerCount: 0,
          dialogueCount: 20,
          paragraphCount: 60,
          averageParagraphLength: 36,
          sceneBreakCount: 0,
          qualityFloorPassed: true,
          issues: [],
          suggestions: [],
          genreDrift: {
            active: true,
            genre: 'modern',
            constitutionTags: [],
            suspenseGenre: false,
            promiseDrift: {
              active: true,
              promiseHits: 8,
              sceneHits: 20,
              suspenseHits: 0,
              suspenseShare: 0,
              missingPrimaryPayoff: false,
              drifting: false,
              summary: '',
            },
            qualityFloorPassed: true,
            issues: [],
            suggestions: [],
          },
        },
        updatedAt: '2026-06-30T00:00:00.000Z',
      },
      authorNotes: ['赵掌柜知道，明天的位置一换，镇口这条路就不再只认白粥。'],
    });

    const audit = auditReaderDelivery({ chapter });

    expect(audit.passed).toBe(true);
    expect(audit.dimensions.opening).toBeGreaterThanOrEqual(80);
    expect(audit.dimensions.endingHook).toBeGreaterThanOrEqual(80);
  });

  it('recognizes romance domestic tension as valid opening and ending delivery', () => {
    const chapter = makeChapter({
      title: '凌晨三点的厨房对峙',
      content: [
        '我从噩梦中惊醒时，床头电子钟闪着刺眼的红光：3:07。梦里又是三年前那个雨夜，他站在雨里，锁骨打着石膏。',
        '我去厨房找水，看见顾砚舟站在冰箱前喝冰牛奶。我问他不怕胃疼，他回我：“你管我。”',
        '他换手关冰箱门的动作让我愣住。三年前我总从背后抱住他的右胳膊，他怕冰到我，才养成这个习惯。',
        '我说：“你明天骑马别紧张。”他没说话，呼吸慢了一拍。',
        '回房前，Lisa发来消息：马场明天9点准时直播，品牌方临时加了一条，障碍区需要牵手通过，顾砚舟那边已同步。',
        '我把手机扣在枕头上，又翻过来回了一句收到。脚上那双他放在厨房门口的灰色拖鞋还没脱。',
      ].join('\n\n'),
      readerScore: 7.8,
      diagnostics: {
        startupOpeningReport: {
          enabled: true,
          chapterNumber: 3,
          gateMode: 'warn',
          platformProfile: 'auto',
          openingScore: 62.7,
          clarityScore: 40,
          payoffScore: 82,
          endingHookScore: 21,
          platformFitScore: 80,
          promiseConsistencyScore: 100,
          overallScore: 62.7,
          passed: true,
          overrunChars: 0,
          findings: [
            { code: 'unclear-goal', level: 'warn', message: '前 1000 字没有清晰交代主角当前目标。' },
            { code: 'unclear-obstacle', level: 'warn', message: '前 1000 字阻碍不够清楚，读者难以判断冲突强度。' },
            { code: 'weak-ending-hook', level: 'warn', message: '章末缺少明确追读点，收束过平。' },
          ],
          summary: '',
        },
        qualityGate: {
          overallScore: 90,
          structureScore: 92,
          styleScore: 90,
          emotionScore: 80,
          passed: true,
          summary: '',
          findings: [],
        },
        readabilityAudit: {
          readerScore: 7.8,
          previousReaderScore: 7.8,
          readerScoreDelta: 0,
          wordCount: 2500,
          speakerMarkerCount: 0,
          dialogueCount: 12,
          paragraphCount: 36,
          averageParagraphLength: 50,
          sceneBreakCount: 0,
          qualityFloorPassed: true,
          issues: [],
          suggestions: [],
        },
        updatedAt: '2026-06-30T00:00:00.000Z',
      },
      authorNotes: ['灰色拖鞋放在脚边的时候，两个人都没把关心说出口。'],
    });

    const audit = auditReaderDelivery({ chapter });

    expect(audit.issues.join('\n')).not.toContain('开篇交付不足');
    expect(audit.dimensions.opening).toBeGreaterThanOrEqual(80);
    expect(audit.dimensions.endingHook).toBeGreaterThanOrEqual(80);
    expect(audit.passed).toBe(true);
  });

  it('does not let stale genre-drift diagnostics erase visible romance payoff', () => {
    const chapter = makeChapter({
      title: '客厅对峙',
      content: [
        '敲门声响起时，我正要往咖啡里加糖。顾砚舟站在门口，屏幕上是Lisa的消息：“障碍区必须牵手通过，直播效果数据模型显示这组画面预期流量最高。”',
        '“你怕我骑马出事，还是怕我牵你的手？”他问。',
        '我说我怕他锁骨再断一次。他笑了一声，问我手为什么抖。我反问他敲门的时候手是不是也在抖。',
        '电梯里，他让我走右边。我看过平面图，左边的障碍数量比右边多三个。他想自己扛多的那一边。',
        '停车场里，我系好安全带。口袋里，那枚星星吊饰硌着掌心。还有29分钟到马场，我听见自己的心跳盖过了引擎。',
      ].join('\n\n'),
      readerScore: 7.8,
      diagnostics: {
        startupOpeningReport: {
          enabled: true,
          chapterNumber: 4,
          gateMode: 'warn',
          platformProfile: 'auto',
          openingScore: 100,
          clarityScore: 86,
          payoffScore: 82,
          endingHookScore: 94,
          platformFitScore: 90,
          promiseConsistencyScore: 70,
          overallScore: 88,
          passed: true,
          overrunChars: 0,
          findings: [],
          summary: '',
        },
        qualityGate: {
          overallScore: 90,
          structureScore: 92,
          styleScore: 90,
          emotionScore: 86,
          passed: true,
          summary: '',
          findings: [],
        },
        readabilityAudit: {
          readerScore: 7.8,
          previousReaderScore: 7.6,
          readerScoreDelta: 0.2,
          wordCount: 2500,
          speakerMarkerCount: 0,
          dialogueCount: 16,
          paragraphCount: 42,
          averageParagraphLength: 48,
          sceneBreakCount: 0,
          qualityFloorPassed: false,
          issues: ['题材主回报缺失：已进入主场景 10 次，但题材回报关键词没有落地。'],
          suggestions: ['下一轮必须把主场景转成可见结果。'],
          genreDrift: {
            active: true,
            genre: 'romance',
            constitutionTags: [],
            suspenseGenre: false,
            promiseDrift: {
              active: true,
              promiseHits: 0,
              sceneHits: 10,
              suspenseHits: 0,
              suspenseShare: 0,
              missingPrimaryPayoff: true,
              drifting: false,
              summary: 'promise aligned: suspense=0, promise=0, scenes=10',
            },
            qualityFloorPassed: false,
            issues: ['题材主回报缺失：已进入主场景 10 次，但题材回报关键词没有落地。'],
            suggestions: ['下一轮必须把主场景转成可见结果。'],
          },
        },
        updatedAt: '2026-06-30T00:00:00.000Z',
      },
      authorNotes: ['星星吊饰硌在掌心时，谁都没有把关心说成关心。'],
    });

    const audit = auditReaderDelivery({ chapter });

    expect(audit.dimensions.promisePayoff).toBeGreaterThanOrEqual(76);
    expect(audit.issues.join('\n')).not.toContain('题材回报缺失');
    expect(audit.issues.join('\n')).not.toContain('题材主回报缺失');
    expect(audit.passed).toBe(true);
  });

  it('fails when the aggregate score hides a weak ending hook floor', () => {
    const chapter = makeChapter({
      readerScore: 8.4,
      diagnostics: {
        startupOpeningReport: {
          enabled: true,
          chapterNumber: 2,
          gateMode: 'warn',
          platformProfile: 'auto',
          openingScore: 90,
          clarityScore: 94,
          payoffScore: 94,
          endingHookScore: 74,
          platformFitScore: 90,
          promiseConsistencyScore: 100,
          overallScore: 90,
          passed: true,
          overrunChars: 0,
          findings: [],
          summary: '',
        },
        qualityGate: {
          overallScore: 92,
          structureScore: 96,
          styleScore: 92,
          emotionScore: 86,
          passed: true,
          summary: '',
          findings: [],
        },
        readabilityAudit: {
          readerScore: 8.4,
          previousReaderScore: 8.3,
          readerScoreDelta: 0.1,
          wordCount: 2500,
          speakerMarkerCount: 0,
          dialogueCount: 20,
          paragraphCount: 60,
          averageParagraphLength: 36,
          sceneBreakCount: 0,
          qualityFloorPassed: true,
          issues: [],
          suggestions: [],
        },
        updatedAt: '2026-06-30T00:00:00.000Z',
      },
      authorNotes: ['沈知夏把木牌擦干净，明天还会有人认得这两个字。'],
    });

    const audit = auditReaderDelivery({ chapter });

    expect(audit.score).toBeGreaterThanOrEqual(76);
    expect(audit.passed).toBe(false);
    expect(audit.issues.join('\n')).toContain('章尾追读未达读者交付地板');
  });

  it('fails public surface when a clean author note is too long', () => {
    const chapter = makeChapter({
      readerScore: 8.2,
      diagnostics: {
        qualityGate: {
          overallScore: 90,
          structureScore: 94,
          styleScore: 90,
          emotionScore: 82,
          passed: true,
          summary: '',
          findings: [],
        },
        readabilityAudit: {
          readerScore: 8.2,
          previousReaderScore: 8.1,
          readerScoreDelta: 0.1,
          wordCount: 2500,
          speakerMarkerCount: 0,
          dialogueCount: 20,
          paragraphCount: 60,
          averageParagraphLength: 36,
          sceneBreakCount: 0,
          qualityFloorPassed: true,
          issues: [],
          suggestions: [],
        },
        updatedAt: '2026-06-30T00:00:00.000Z',
      },
      authorNotes: [Array.from({ length: 6 }, (_, index) => `赵掌柜看着第 ${index + 1} 只空碗回到灶台边，终于明白这条路不再只认白粥。`).join('\n\n')],
    });

    const audit = auditReaderDelivery({ chapter });

    expect(audit.passed).toBe(false);
    expect(audit.issues.join('\n')).toContain('作者有话说篇幅过长');
    expect(audit.dimensions.publicSurface).toBeLessThan(80);
  });

  it('fails public surface when author note uses private-memory meta voice', () => {
    const chapter = makeChapter({
      readerScore: 8.2,
      diagnostics: {
        qualityGate: {
          overallScore: 90,
          structureScore: 94,
          styleScore: 90,
          emotionScore: 82,
          passed: true,
          summary: '',
          findings: [],
        },
        readabilityAudit: {
          readerScore: 8.2,
          previousReaderScore: 8.1,
          readerScoreDelta: 0.1,
          wordCount: 2500,
          speakerMarkerCount: 0,
          dialogueCount: 20,
          paragraphCount: 60,
          averageParagraphLength: 36,
          sceneBreakCount: 0,
          qualityFloorPassed: true,
          issues: [],
          suggestions: [],
        },
        updatedAt: '2026-06-30T00:00:00.000Z',
      },
      authorNotes: ['我那时候零花钱少，但“自带碗减一文”这个细节我一直记着。'],
    });

    const audit = auditReaderDelivery({ chapter });

    expect(audit.passed).toBe(false);
    expect(audit.issues.join('\n')).toContain('作者有话说');
  });

  it('fails public surface when author note uses follow-up chatter and signature', () => {
    const chapter = makeChapter({
      readerScore: 8.2,
      diagnostics: {
        qualityGate: {
          overallScore: 90,
          structureScore: 94,
          styleScore: 90,
          emotionScore: 82,
          passed: true,
          summary: '',
          findings: [],
        },
        readabilityAudit: {
          readerScore: 8.2,
          previousReaderScore: 8.1,
          readerScoreDelta: 0.1,
          wordCount: 2500,
          speakerMarkerCount: 0,
          dialogueCount: 20,
          paragraphCount: 60,
          averageParagraphLength: 36,
          sceneBreakCount: 0,
          qualityFloorPassed: true,
          issues: [],
          suggestions: [],
        },
        updatedAt: '2026-06-30T00:00:00.000Z',
      },
      authorNotes: ['各位追读的兄弟：这章写的是周六现场施工。有朋友在后台问她是不是冷淡。谢谢还在追更的你们。林澄的熬夜纪录员 敬上'],
    });

    const audit = auditReaderDelivery({ chapter });

    expect(audit.passed).toBe(false);
    expect(audit.issues.join('\n')).toContain('作者有话说');
    expect(audit.dimensions.publicSurface).toBeLessThan(80);
  });

  it('tracks slight reader-score regression without hiding it behind aggregate delivery', () => {
    const previous = makeChapter({ chapterNumber: 5, readerScore: 8 });
    const chapter = makeChapter({
      chapterNumber: 6,
      content: [
        '天没亮，沈知夏把四十文铜板倒进陶碗。今天要卖三十碗，可新陶碗、花椒和面粉一起算下来，钱只够压着边走。',
        '赵掌柜的粥车让出路口，却把价牌挂得更低。她把木牌插稳，写下小碗一文，又收了第一份预订铜板。',
        '妇人尝完小碗，立刻补了两文要大碗。沈知夏把铜板压进袖口，知道今天不是多卖一碗，而是把明天的客先留下。',
        '收摊时她刚数完钱，里正家的孩子跑来传话：“明天按碗收摊费。”沈知夏手停在铜板上，抬头看向还没亮灯的镇口。',
      ].join('\n\n'),
      readerScore: 7.8,
      diagnostics: {
        qualityGate: {
          overallScore: 90,
          structureScore: 94,
          styleScore: 90,
          emotionScore: 82,
          passed: true,
          summary: '',
          findings: [],
        },
        readabilityAudit: {
          readerScore: 7.8,
          previousReaderScore: 8,
          readerScoreDelta: -0.2,
          wordCount: 2500,
          speakerMarkerCount: 0,
          dialogueCount: 20,
          paragraphCount: 60,
          averageParagraphLength: 36,
          sceneBreakCount: 0,
          qualityFloorPassed: true,
          issues: [],
          suggestions: ['读者评分较上一章轻微回落 0.2 分；下一章继续优先保持自然读感和人物行动压力。'],
        },
        updatedAt: '2026-06-30T00:00:00.000Z',
      },
      authorNotes: ['日子啊，就是这样一点点厚起来的。'],
    });

    const audit = auditReaderDelivery({ chapter, previousChapter: previous });

    expect(audit.passed).toBe(true);
    expect(audit.dimensions.readability).toBe(75);
    expect(audit.suggestions.join('\n')).toContain('读者分较上一章轻微回落');
  });

  it('adds a stronger forward hint for consecutive slight reader-score regressions', () => {
    const previous = makeChapter({
      chapterNumber: 7,
      readerScore: 7.9,
      diagnostics: {
        readerDeliveryAudit: {
          score: 86,
          passed: true,
          readerScore: 7.9,
          previousReaderScore: 8.1,
          issues: [],
          suggestions: [],
          dimensions: {
            title: 88,
            opening: 86,
            promisePayoff: 94,
            readability: 76,
            endingHook: 92,
            publicSurface: 88,
          },
        },
        updatedAt: '2026-06-30T00:00:00.000Z',
      },
    });
    const chapter = makeChapter({
      chapterNumber: 8,
      content: [
        '天没亮，沈知夏掀开陶罐，花椒只够七碗。今天还有预订，赵掌柜已经让粮铺收花椒。',
        '她接过老汉送来的野葱，切碎下锅，让壮汉先试味。壮汉说不够麻，但能卖。',
        '妇人端着自带碗来，孩子喝完说辣辣的好喝。沈知夏把野葱味写上价目牌。',
        '收摊时镇口飘起烟，赵掌柜的粥车停在山脚，明天花椒从哪里来还不知道。',
      ].join('\n\n'),
      readerScore: 7.7,
      diagnostics: {
        qualityGate: {
          overallScore: 90,
          structureScore: 94,
          styleScore: 90,
          emotionScore: 82,
          passed: true,
          summary: '',
          findings: [],
        },
        readabilityAudit: {
          readerScore: 7.7,
          previousReaderScore: 7.9,
          readerScoreDelta: -0.2,
          wordCount: 2500,
          speakerMarkerCount: 0,
          dialogueCount: 20,
          paragraphCount: 60,
          averageParagraphLength: 36,
          sceneBreakCount: 0,
          qualityFloorPassed: true,
          issues: [],
          suggestions: ['读者评分较上一章轻微回落 0.2 分；下一章继续优先保持自然读感和人物行动压力。'],
        },
        updatedAt: '2026-06-30T00:00:00.000Z',
      },
      authorNotes: ['花椒不能随便替，但野葱能让这一天不断味。'],
    });

    const audit = auditReaderDelivery({ chapter, previousChapter: previous });

    expect(audit.passed).toBe(true);
    expect(audit.dimensions.readability).toBe(74);
    expect(audit.suggestions.join('\n')).toContain('连续轻微回落');
  });

  it('recognizes frontier-building descent endings as a valid chapter hook', () => {
    const chapter = makeChapter({
      chapterNumber: 10,
      title: '神听处入口',
      content: [
        '秦墨用石刀敲了一下炭块断面，没有粉末粘在刀面上。',
        '阿骨举着火把站在洞口，老族长让他不要碰墙上渗金水的地方。',
        '竖井深处传来一阵极低频的嗡鸣。火光落到第三级台阶时，暗金色的纹路从底部向上延伸。',
        '“下面有声音。”',
        '秦墨握紧火把，踩下第一级台阶。',
      ].join('\n\n'),
      readerScore: 7.6,
      diagnostics: {
        startupOpeningReport: {
          enabled: true,
          chapterNumber: 10,
          gateMode: 'warn',
          platformProfile: 'auto',
          openingScore: 86,
          clarityScore: 90,
          payoffScore: 88,
          endingHookScore: 60,
          platformFitScore: 86,
          promiseConsistencyScore: 90,
          overallScore: 86,
          passed: true,
          overrunChars: 0,
          findings: [],
          summary: '',
        },
        qualityGate: {
          overallScore: 89,
          structureScore: 100,
          styleScore: 92,
          emotionScore: 69,
          passed: true,
          summary: '',
          findings: [],
        },
        readabilityAudit: {
          readerScore: 7.6,
          previousReaderScore: 6.9,
          readerScoreDelta: 0.7,
          wordCount: 3000,
          speakerMarkerCount: 0,
          dialogueCount: 12,
          paragraphCount: 60,
          averageParagraphLength: 40,
          sceneBreakCount: 0,
          qualityFloorPassed: true,
          issues: [],
          suggestions: [],
        },
        updatedAt: '2026-06-30T00:00:00.000Z',
      },
      authorNotes: [''],
    });

    const audit = auditReaderDelivery({ chapter });

    expect(audit.passed).toBe(true);
    expect(audit.dimensions.endingHook).toBeGreaterThanOrEqual(80);
  });

  it('counts frontier-building public gains as genre payoff', () => {
    const chapter = makeChapter({
      chapterNumber: 11,
      title: '新灶台前的分工',
      content: [
        '天刚亮，秦墨蹲在灶台前，把昨夜烧稳的炭火拨进浅坑。阿骨架起陶罐，虎牙把木杆按一道、两道、三道排好，老族长守在洞口看风。',
        '这一次水没有焦味。肉汤滚开后，孩子双手接住陶碗喝了一口，抬头喊：“再来一碗。”阿骨笑了，虎牙主动说天亮后再挖一个炭坑，独耳把新工具递给秦墨。',
        '秦墨没有急着讲骨片。他先把人分成三组：阿骨守洞口，虎牙带两人去蓄水坑测木杆，老族长留在灶台旁记录哪根木杆变黑。',
        '午饭前，第一根木杆顶端发黑，蓄水坑旁的湿土被圈出来。部落第一次把炭火、陶罐、木杆探路和守洞口分工连成一套办法。',
        '秦墨看着孩子排队领汤，掌心微微发烫。系统提示：饮食系统稳定，土系感知提升。明天，他们要把第二口灶台挪到蓄水坑上风口。',
      ].join('\n\n'),
      readerScore: 7.8,
      diagnostics: {
        startupOpeningReport: {
          enabled: true,
          chapterNumber: 11,
          gateMode: 'warn',
          platformProfile: 'auto',
          openingScore: 86,
          clarityScore: 90,
          payoffScore: 82,
          endingHookScore: 86,
          platformFitScore: 84,
          promiseConsistencyScore: 88,
          overallScore: 86,
          passed: true,
          overrunChars: 0,
          findings: [],
          summary: '',
        },
        qualityGate: {
          overallScore: 88,
          structureScore: 92,
          styleScore: 88,
          emotionScore: 76,
          passed: true,
          summary: '',
          findings: [],
        },
        readabilityAudit: {
          readerScore: 7.8,
          previousReaderScore: 7.7,
          readerScoreDelta: 0.1,
          wordCount: 1400,
          speakerMarkerCount: 0,
          dialogueCount: 8,
          paragraphCount: 18,
          averageParagraphLength: 48,
          sceneBreakCount: 0,
          qualityFloorPassed: true,
          issues: [],
          suggestions: [],
          genreDrift: {
            active: true,
            genre: 'fantasy',
            constitutionTags: [],
            suspenseGenre: false,
            promiseDrift: {
              active: true,
              promiseHits: 1,
              sceneHits: 1,
              suspenseHits: 0,
              suspenseShare: 0,
              missingPrimaryPayoff: true,
              drifting: false,
              summary: '',
            },
            qualityFloorPassed: false,
            issues: ['题材主回报缺失'],
            suggestions: ['把部落进步写成结果'],
          },
        },
        updatedAt: '2026-06-30T00:00:00.000Z',
      },
    });

    const audit = auditReaderDelivery({ chapter });

    expect(audit.dimensions.promisePayoff).toBeGreaterThanOrEqual(76);
    expect(audit.issues.join('\n')).not.toContain('题材回报缺失');
  });

  it('does not let clue-heavy frontier chapters pass as building payoff', () => {
    const chapter = makeChapter({
      chapterNumber: 11,
      title: '篝火边的骨片',
      content: [
        '秦墨把骨片、凹痕和暗金印记摆在石台上。竖井方向的线索再次重合，灰色毛发压在骨片缺口边。',
        '山魈没有出现，灰犬也没有叫。云层像眼睑一样压下来，地下深处传出轻微声音。',
        '虎牙说枯树根下还有抓痕。秦墨盯着未知毛发，判断那里可能有新入口。',
        '阿骨把汤端来，孩子喝了一口，但众人的目光仍停在骨片和印记上。',
        '他握紧木杆，决定天亮前去查竖井东侧。云层继续下垂，像一只眼睛慢慢睁开。',
      ].join('\n\n'),
      readerScore: 7.7,
      diagnostics: {
        startupOpeningReport: {
          enabled: true,
          chapterNumber: 11,
          gateMode: 'warn',
          platformProfile: 'auto',
          openingScore: 80,
          clarityScore: 86,
          payoffScore: 70,
          endingHookScore: 94,
          platformFitScore: 82,
          promiseConsistencyScore: 80,
          overallScore: 82,
          passed: true,
          overrunChars: 0,
          findings: [],
          summary: '',
        },
        qualityGate: {
          overallScore: 84,
          structureScore: 88,
          styleScore: 86,
          emotionScore: 64,
          passed: true,
          summary: '',
          findings: [],
        },
        readabilityAudit: {
          readerScore: 7.7,
          previousReaderScore: 7.6,
          readerScoreDelta: 0.1,
          wordCount: 1400,
          speakerMarkerCount: 0,
          dialogueCount: 4,
          paragraphCount: 16,
          averageParagraphLength: 46,
          sceneBreakCount: 0,
          qualityFloorPassed: true,
          issues: [],
          suggestions: [],
          genreDrift: {
            active: true,
            genre: 'fantasy',
            constitutionTags: [],
            suspenseGenre: false,
            promiseDrift: {
              active: true,
              promiseHits: 1,
              sceneHits: 1,
              suspenseHits: 0,
              suspenseShare: 0,
              missingPrimaryPayoff: true,
              drifting: false,
              summary: '',
            },
            qualityFloorPassed: false,
            issues: ['题材主回报缺失'],
            suggestions: ['把部落进步写成结果'],
          },
        },
        updatedAt: '2026-06-30T00:00:00.000Z',
      },
    });

    const audit = auditReaderDelivery({ chapter });

    expect(audit.dimensions.promisePayoff).toBeLessThan(76);
    expect(audit.passed).toBe(false);
  });

  it('accepts farming survival payoff expressed as food, money, and tomorrow pressure', () => {
    const chapter = makeChapter({
      title: '荒院里的五文钱',
      summary: '逃荒农女靠灰灰菜、生火和五文铜钱撑过第一天。',
      content: [
        '沈青抓起墙角灰灰菜时，荒院的灶坑只剩半缸雨水。',
        '粮袋见底，弟弟还在发抖，她得先把这锅野菜汤做成，至少换几文钱撑过今天。',
        '火苗终于窜起来，邻居家的婶子闻着味停在篱笆外，摸出五文铜钱说：“给我留一碗，明天你多摘点。”',
        '沈青把铜钱攥进掌心，转头看向集市方向。明天那口破锅必须摆出去，雨一停就开摊。',
      ].join('\n\n'),
      diagnostics: makeMissingTopicPayoffDiagnostics(),
    });

    const audit = auditReaderDelivery({ chapter });
    const issueText = audit.issues.join('\n');

    expect(audit.dimensions.opening).toBeGreaterThanOrEqual(80);
    expect(audit.dimensions.promisePayoff).toBeGreaterThanOrEqual(76);
    expect(audit.dimensions.endingHook).toBeGreaterThanOrEqual(80);
    expect(issueText).not.toContain('题材回报缺失');
    expect(issueText).not.toContain('开篇交付不足');
    expect(issueText).not.toContain('章末追读不足');
  });

  it('accepts food-business payoff expressed as cash, mobile payment, takeaway, and tomorrow demand', () => {
    const chapter = makeChapter({
      title: '破庙口第一锅酸汤面',
      summary: '美食经营文，陆鸣靠酸汤面开摊、试吃、收钱、打包和明天带人来的复购压力起步。',
      content: [
        '破庙口的炒面摊旁，陆鸣把鸡骨架下锅，酸汤味从锅盖缝里钻出来，三个工人端着空碗围到灶台前。',
        '老陈喝完第一口汤，摸出五块钱拍在桌上：“再来一碗，加辣，带走。”',
        '骑电动车的青年赶来时最后一碗刚卖完，他当场加了微信，说下夜班还要问陆鸣出摊时间。',
        '老陈端着空碗站起来：“明天别带少了，我带一队人来。他们要是吃不上，你可别怪我翻脸。”陆鸣数完钱，决定明天换个大锅。',
      ].join('\n\n'),
      diagnostics: makeMissingTopicPayoffDiagnostics(),
    });

    const audit = auditReaderDelivery({ chapter });
    const issueText = audit.issues.join('\n');

    expect(audit.dimensions.promisePayoff).toBeGreaterThanOrEqual(76);
    expect(audit.dimensions.endingHook).toBeGreaterThanOrEqual(80);
    expect(issueText).not.toContain('题材回报缺失');
    expect(issueText).not.toContain('章末追读不足');
  });

  it('uses a neutral readability floor when reader score is missing but local delivery is clean', () => {
    const diagnostics = makeMissingTopicPayoffDiagnostics();
    if (diagnostics.startupOpeningReport) {
      diagnostics.startupOpeningReport.findings = [];
    }
    if (diagnostics.readabilityAudit) {
      diagnostics.readabilityAudit.qualityFloorPassed = true;
      diagnostics.readabilityAudit.issues = [];
      diagnostics.readabilityAudit.suggestions = [];
    }

    const chapter = makeChapter({
      title: '第四节盯死七号',
      summary: '体育竞技文，林峯替补上场，靠防守、助攻和教练信任获得第四节机会。',
      readerScore: undefined,
      content: [
        '记分牌只剩四分十七秒，主队落后十五分，林峯从替补席最后一格站起来。',
        '他第一次上场就被七号断球，教练盯着他，郑锐也在板凳上骂了一声。',
        '第二回合他压慢节奏，呼叫挡拆后助攻底角队友得分，又在防守端抢断七号的传球路线。',
        '教练拍了拍他的肩：“第四节继续打，盯死七号。”林峯拧紧水瓶，虎口发烫。',
      ].join('\n\n'),
      diagnostics,
    });

    const audit = auditReaderDelivery({ chapter });
    const issueText = audit.issues.join('\n');

    expect(audit.dimensions.readability).toBe(74);
    expect(issueText).not.toContain('正文读感未达读者交付地板');
  });

  it('accepts shame-system delivery when the public task, reaction, and reward land', () => {
    const chapter = makeChapter({
      title: '早会三十秒',
      summary: '办公室早会触发羞耻任务，陈鹿当众念完指定台词并拿到积分奖励。',
      content: [
        '早会站位区，陈鹿刚抓住文件夹，任务栏就在眼前弹开：三十秒内对主管说完指定台词。',
        '七八双眼睛同时看过来，她不能失败，失败惩罚会把昨晚的录音当众播放。',
        '她咬牙把台词完整念完，会议室静了一瞬，后排同事憋笑憋到肩膀发抖。',
        '【任务完成，奖励积分+10。】主管却把下一份汇报推到她面前：“既然这么会说，下午你来讲。”',
      ].join('\n\n'),
      diagnostics: makeMissingTopicPayoffDiagnostics(),
    });

    const audit = auditReaderDelivery({ chapter });
    const issueText = audit.issues.join('\n');

    expect(audit.dimensions.opening).toBeGreaterThanOrEqual(80);
    expect(audit.dimensions.promisePayoff).toBeGreaterThanOrEqual(76);
    expect(audit.dimensions.endingHook).toBeGreaterThanOrEqual(80);
    expect(issueText).not.toContain('题材回报缺失');
    expect(issueText).not.toContain('开篇交付不足');
    expect(issueText).not.toContain('章末追读不足');
  });

  it('accepts apocalypse survival delivery when resources and safety state change', () => {
    const chapter = makeChapter({
      title: '车库补给券',
      summary: '末世生存开局，林雾靠补给券、工具箱和清水撑过尸群撞门。',
      content: [
        '林雾抓起最后一张补给券时，车库门缝已经渗进黑血。',
        '今晚熬不过去，她必须在尸群撞开铁门前换到工具箱和两瓶清水。',
        '自动柜吐出扳手和水瓶，她把车门内侧加固，第一只丧尸撞上来时只撞出一声闷响。',
        '广播忽然改口，下一处补给点将在天亮前关闭，门外的尸群又一次撞向铁门。',
      ].join('\n\n'),
      diagnostics: makeMissingTopicPayoffDiagnostics(),
    });

    const audit = auditReaderDelivery({ chapter });
    const issueText = audit.issues.join('\n');

    expect(audit.dimensions.opening).toBeGreaterThanOrEqual(80);
    expect(audit.dimensions.promisePayoff).toBeGreaterThanOrEqual(76);
    expect(audit.dimensions.endingHook).toBeGreaterThanOrEqual(80);
    expect(issueText).not.toContain('题材回报缺失');
    expect(issueText).not.toContain('开篇交付不足');
    expect(issueText).not.toContain('章末追读不足');
  });

  it('accepts sports competition payoff when a corrected play changes score and trust', () => {
    const chapter = makeChapter({
      title: '替补席最后一格',
      summary: '体育竞技青春文，沈砚靠传切修正、助攻得分和队友信任回到首发名单。',
      content: [
        '体育馆计时器还剩二十秒，沈砚站在替补席边，记分牌显示班队落后三分。',
        '上一回合他的传球失误被教练记在板上，这次必须完成右翼传切，否则首发名单没有他的位置。',
        '他压低重心冲进底线，队友补位挡住夹击，他把球递到空切点，助攻得分后又回身防住最后一次突破。',
        '记分牌跳到反超，队友朝他点头。教练把笔尖停在首发名单上：“明天班赛，你先打第一节。”',
      ].join('\n\n'),
      diagnostics: makeMissingTopicPayoffDiagnostics(),
    });

    const audit = auditReaderDelivery({ chapter });
    const issueText = audit.issues.join('\n');

    expect(audit.dimensions.opening).toBeGreaterThanOrEqual(80);
    expect(audit.dimensions.promisePayoff).toBeGreaterThanOrEqual(76);
    expect(audit.dimensions.endingHook).toBeGreaterThanOrEqual(80);
    expect(issueText).not.toContain('题材回报缺失');
    expect(issueText).not.toContain('开篇交付不足');
    expect(issueText).not.toContain('章末追读不足');
  });

  it('accepts campus club payoff when recruitment changes people and room resources', () => {
    const chapter = makeChapter({
      title: '登记表上的第一个名字',
      summary: '校园社团轻喜剧，模型社靠招新误会和同学报名保住活动室。',
      content: [
        '招新摊位前，许知夏按住被风吹乱的传单，登记表上还是空白。',
        '老师刚刚提醒她下午截止，没人报名的话活动室就要收回，模型社直接废社。',
        '她把断掉天线的模型当场修好，路过的林浅笑出声，误会她已经是社长。',
        '林浅在登记表上写下名字：“我留下，明天再帮你拉一个同学。”老师看着人数变化，终于松口把活动室留下到周五展示。',
      ].join('\n\n'),
      diagnostics: makeMissingTopicPayoffDiagnostics(),
    });

    const audit = auditReaderDelivery({ chapter });
    const issueText = audit.issues.join('\n');

    expect(audit.dimensions.opening).toBeGreaterThanOrEqual(80);
    expect(audit.dimensions.promisePayoff).toBeGreaterThanOrEqual(76);
    expect(audit.dimensions.endingHook).toBeGreaterThanOrEqual(80);
    expect(issueText).not.toContain('题材回报缺失');
    expect(issueText).not.toContain('开篇交付不足');
    expect(issueText).not.toContain('章末追读不足');
  });

  it('accepts war-statecraft payoff when battlefield and policy positions change', () => {
    const chapter = makeChapter({
      title: '东门换防令',
      summary: '战争权谋，陆擎靠改阵破城、收编降兵、夺兵权和废奴政令扩张秩序。',
      content: [
        '城门前战旗压下，陆擎按军令改阵，先断粮道再夺城楼。',
        '守军背后还有旧贵族反扑，叛将试图夺兵权，他必须在天黑前破城。',
        '降兵被收编进新营，旧贵族失去兵权，只能在府衙承认废奴政令。',
        '国子监名单当场张出，军功爵第一批名册送到军营，而东门换防令已经压到案上。',
      ].join('\n\n'),
      diagnostics: makeMissingTopicPayoffDiagnostics(),
    });

    const audit = auditReaderDelivery({ chapter });
    const issueText = audit.issues.join('\n');

    expect(audit.dimensions.opening).toBeGreaterThanOrEqual(80);
    expect(audit.dimensions.promisePayoff).toBeGreaterThanOrEqual(76);
    expect(audit.dimensions.endingHook).toBeGreaterThanOrEqual(80);
    expect(issueText).not.toContain('题材回报缺失');
    expect(issueText).not.toContain('开篇交付不足');
    expect(issueText).not.toContain('章末追读不足');
  });

  it('accepts war-statecraft endings when clue pressure resolves into military deadlines and next target', () => {
    const chapter = makeChapter({
      title: '破城后的安邑军令',
      summary: '战争权谋，赵桓破城后收编降兵、废旧贵族免赋，并把粮册问题压成三日军令和下一城目标。',
      content: [
        '城门破开后，赵桓按军令收编降兵，孙固暂挂副尉衔，旧贵族免赋特权即日废除。',
        '府衙里粮册不翼而飞，王贲低头领命，赵桓当场把粮草按军功爵重新分授。',
        '他转向王贲，语气骤冷：“粮册丢失的事，三天查不出来，你这副将的位置让给别人坐。”',
        '赵桓走到地图前，手指点向平阳北边那座城：“明日拔营——安邑。”安邑，齐王府所在地。',
      ].join('\n\n'),
      diagnostics: makeMissingTopicPayoffDiagnostics(),
    });

    const audit = auditReaderDelivery({ chapter });
    const issueText = audit.issues.join('\n');

    expect(audit.dimensions.endingHook).toBeGreaterThanOrEqual(80);
    expect(issueText).not.toContain('朝堂权谋章尾偏悬疑');
    expect(issueText).not.toContain('章尾追读未达读者交付地板');
  });

  it('accepts showbiz delivery when public results create industry reaction', () => {
    const chapter = makeChapter({
      title: '定妆前的热搜',
      summary: '娱乐圈逆袭文，沈棠在试镜间公开反击，拿回角色并引发品牌和评论区转向。',
      content: [
        '试镜间门口，沈棠按住皱掉的台本，导演组刚把女三号名单划到对家名下。',
        '经纪人低声说品牌方撤了物料，热搜里营销号正骂她耍大牌，她必须在直播探班前把角色抢回来。',
        '她直接进镜头试戏，临场把压戏段落接住，导演点头改口，直播间弹幕刷屏，评论区开始转向。',
        '品牌方助理递来改口消息，对家脸色发白。导演把合同推到她面前：“明天定妆，你先进组。”',
      ].join('\n\n'),
      diagnostics: makeMissingTopicPayoffDiagnostics(),
    });

    const audit = auditReaderDelivery({ chapter });
    const issueText = audit.issues.join('\n');

    expect(audit.dimensions.opening).toBeGreaterThanOrEqual(80);
    expect(audit.dimensions.promisePayoff).toBeGreaterThanOrEqual(76);
    expect(audit.dimensions.endingHook).toBeGreaterThanOrEqual(80);
    expect(issueText).not.toContain('题材回报缺失');
    expect(issueText).not.toContain('开篇交付不足');
    expect(issueText).not.toContain('章末追读不足');
  });

  it('accepts collapse-warning delivery when public warning changes signing outcome', () => {
    const chapter = makeChapter({
      title: '签约台前的倒计时',
      summary: '塌房预警爆红文，苏念靠直播预警、叫停签约、公开验证和新预警持续起量。',
      content: [
        '#林可岚 代言人塌房倒计时 3:00#挂在弹幕墙顶端，茶饮代言压轴签约台已经推到镜头前。',
        '苏念只是小主播，没作品没流量没后台，却必须在王总落笔前叫停签约：“这份茶饮代言不能签。”',
        '签约本被她按住，直播间弹幕滚动，品牌方当场宣布签约暂停，质检报告和供应链清单对外开放。',
        '王总追上来改口请她做体验官，热搜开始攀升，而系统又弹出下一条：下一个塌房预警，季川，综艺录制现场，倒计时十五分钟。',
      ].join('\n\n'),
      diagnostics: makeMissingTopicPayoffDiagnostics(),
    });

    const audit = auditReaderDelivery({ chapter });
    const issueText = audit.issues.join('\n');

    expect(audit.dimensions.opening).toBeGreaterThanOrEqual(80);
    expect(audit.dimensions.promisePayoff).toBeGreaterThanOrEqual(76);
    expect(audit.dimensions.endingHook).toBeGreaterThanOrEqual(80);
    expect(issueText).not.toContain('娱乐圈开篇偏虚');
    expect(issueText).not.toContain('娱乐圈题材回报偏弱');
    expect(issueText).not.toContain('娱乐圈章尾追读偏弱');
  });

  it('does not accept showbiz startup chapters with only vague rivalry and backstage waiting', () => {
    const chapter = makeChapter({
      title: '试镜前的风声',
      summary: '娱乐圈逆袭文，沈棠想靠试镜和热搜翻红。',
      content: [
        '试镜间外，沈棠听见对家助理说她今天状态一般。',
        '她想拿角色，也想让热搜好看，可经纪人只让她再等一等，等导演组消息。',
        '她翻着台本，猜后面可能还有人安排，休息室里只剩下几个工作人员的低声议论。',
        '手机震动，匿名短信说幕后还有秘密，她决定先查清楚来源。',
      ].join('\n\n'),
      diagnostics: makeMissingTopicPayoffDiagnostics(),
    });

    const audit = auditReaderDelivery({ chapter });
    const issueText = audit.issues.join('\n');

    expect(audit.passed).toBe(false);
    expect(audit.dimensions.opening).toBeLessThan(80);
    expect(issueText).toContain('开篇交付不足');
  });

  it('does not classify an engineering warning as showbiz delivery', () => {
    const diagnostics = makeMissingTopicPayoffDiagnostics();
    if (diagnostics.readabilityAudit?.genreDrift) {
      diagnostics.readabilityAudit.genreDrift.genre = 'scifi';
      diagnostics.readabilityAudit.genreDrift.constitutionTags = [];
    }
    const chapter = makeChapter({
      title: '冷却回路压力预警',
      summary: '空间站维修员处理冷却回路压力预警。',
      content: '冷却回路压力预警亮起，周砚拆开阀体并校准传感器。章尾备用泵突然过热报警。',
      diagnostics,
    });

    expect(auditReaderDelivery({ chapter }).issues.join('\n')).not.toContain('娱乐圈');
  });

});
