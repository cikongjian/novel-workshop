import { describe, expect, it } from 'vitest';
import { auditChapterReadability, buildReadabilityForwardHints } from './readability-audit.js';
import { auditGenreDrift } from './genre-drift-audit.js';

describe('auditChapterReadability', () => {
  it('tracks mild reaction repetition without failing the quality floor', () => {
    const text = [
      '沈渊没有回答。',
      '苏清月看着门缝：“不是火光，是金色的光。”',
      '沈渊没回头。他把手按在门上。',
      '赵铁山蹲下，把绳索系紧。',
    ].join('\n\n');

    const audit = auditChapterReadability({
      chapterContent: text,
      readerScore: 7.7,
      previousReaderScore: 7.6,
      qualityGate: {
        overallScore: 88,
        structureScore: 90,
        emotionScore: 72,
        passed: true,
        summary: '',
        findings: [],
      },
    });

    expect(audit.silentReactionCount).toBe(2);
    expect(audit.explanationContrastCount).toBe(1);
    expect(audit.issues).not.toEqual(expect.arrayContaining([
      expect.stringContaining('静默反应句式偏密'),
    ]));
  });

  it('fails the floor when silent reactions become mechanically dense', () => {
    const text = Array.from({ length: 9 }, (_, index) =>
      index % 2 === 0 ? '沈渊没有回答。' : '苏清月沉默了三息。',
    ).join('\n\n');

    const audit = auditChapterReadability({
      chapterContent: text,
      readerScore: 7.7,
      previousReaderScore: 7.7,
      qualityGate: {
        overallScore: 88,
        structureScore: 90,
        emotionScore: 72,
        passed: true,
        summary: '',
        findings: [],
      },
    });

    expect(audit.silentReactionCount).toBe(9);
    expect(audit.issues).toEqual(expect.arrayContaining([
      expect.stringContaining('静默反应句式偏密'),
    ]));
    expect(audit.qualityFloorPassed).toBe(false);
  });

  it('treats a minor reader score dip as guidance instead of a hard failure', () => {
    const text = Array.from({ length: 12 }, (_, index) =>
      `沈渊把第 ${index + 1} 步踩实，灰线压在臂骨上，苏清月跟在他身侧看着门光变化。${'他必须在西门和药铺之间做选择，左臂的冷意压着掌心，身后的人都等着他的决定。'.repeat(8)}`,
    ).join('\n\n');

    const audit = auditChapterReadability({
      chapterContent: text,
      readerScore: 7.6,
      previousReaderScore: 7.8,
      qualityGate: {
        overallScore: 88,
        structureScore: 90,
        emotionScore: 72,
        passed: true,
        summary: '',
        findings: [],
      },
    });

    expect(audit.issues).not.toEqual(expect.arrayContaining([
      expect.stringContaining('读者评分较上一章下降'),
    ]));
    expect(audit.suggestions).toEqual(expect.arrayContaining([
      expect.stringContaining('轻微回落'),
    ]));
    expect(audit.qualityFloorPassed).toBe(true);
  });

  it('shows concrete action repair reducing silent reaction density', () => {
    const before = [
      '沈渊没有回答。',
      '苏清月沉默了三息。',
      '门内没有回答。',
      '沈明河没有接话。',
      '赵铁山没有说话。',
      '沈渊沉默了三息。',
      '苏清月没有回答。',
      '门内沉默。',
      '沈忠没有接话。',
    ].join('\n\n');
    const actionParagraphs = [
      '沈渊把手按在门上，灰线沿着腕骨往上蹿了一寸。',
      '苏清月退后半步，把门缝让给他。',
      '门内的金光窄了一线，像被掌心压住。',
      '沈明河按着珠子的手指蜷了一下。',
      '赵铁山把绳楔重新扎紧，抬头看向石阶。',
      '沈忠把刀横在身前，刀鞘抵住墙面，替他们挡住身后的退路。',
      '铁门里传来石椅挪动的声音，沈渊的肩膀随之一沉。',
      '苏清月把断竹简递过去，指尖避开他掌心的焦痕。',
      '沈渊接住竹简后折成四段，扔进门缝里的金光中。',
      '珠子的光暗了一瞬，门内的人终于站直了身子。',
      '通道尽头传来白幡换向的消息，药铺那边的火把亮了三次。',
      '沈渊把卷轴抽出一半，又按回怀里，决定先借白幡设局。',
    ];
    const after = actionParagraphs
      .map(item => `${item} ${'金光压着铁门，众人都看见代价已经落到身上。'.repeat(10)}`)
      .join('\n\n');

    const qualityGate = {
      overallScore: 88,
      structureScore: 90,
      emotionScore: 72,
      passed: true,
      summary: '',
      findings: [],
    };
    const beforeAudit = auditChapterReadability({
      chapterContent: before,
      readerScore: 7.7,
      previousReaderScore: 7.7,
      qualityGate,
    });
    const afterAudit = auditChapterReadability({
      chapterContent: after,
      readerScore: 7.7,
      previousReaderScore: 7.7,
      qualityGate,
    });

    expect(beforeAudit.qualityFloorPassed).toBe(false);
    expect(afterAudit.silentReactionCount).toBe(0);
    expect(afterAudit.qualityFloorPassed).toBe(true);
  });

  it('fails the floor when non-suspense genre drifts into investigation-led prose', () => {
    const text = [
      '她开始调查匿名短信，监控里的秘密和幕后线索不断浮出水面。',
      '新的证据指向旧仓库，真相还藏在偷拍视频来源后面。',
      '她继续排查账号和线索，却没有回到恋爱关系的偏爱、护短或心动现场。',
    ].join('\n\n');
    const genreDrift = auditGenreDrift({
      chapterContent: text,
      title: '协议婚后，偏执总裁天天护短',
      synopsis: '甜宠先婚后爱。',
      genre: 'romance',
      constitutionTags: ['sweet'],
    });

    const audit = auditChapterReadability({
      chapterContent: `${text}\n\n${'关系回报被调查替代。'.repeat(200)}`,
      readerScore: 7.6,
      previousReaderScore: 7.6,
      qualityGate: {
        overallScore: 88,
        structureScore: 90,
        emotionScore: 72,
        passed: true,
        summary: '',
        findings: [],
      },
      genreDrift,
    });

    expect(audit.qualityFloorPassed).toBe(false);
    expect(audit.issues).toEqual(expect.arrayContaining([
      expect.stringContaining('题材漂移'),
    ]));
  });

  it('fails the floor when low emotion variance makes a chapter read like event checklist', () => {
    const text = Array.from({ length: 12 }, (_, index) =>
      `第 ${index + 1} 步完成，木桩固定，排水沟接通，系统提示能力提升。`,
    ).join('\n\n');

    const audit = auditChapterReadability({
      chapterContent: text,
      readerScore: 7.2,
      previousReaderScore: 7.2,
      qualityGate: {
        overallScore: 72,
        structureScore: 64,
        emotionScore: 50.1,
        passed: true,
        summary: '',
        findings: [
          {
            code: 'low-emotion-variance',
            level: 'warn',
            message: '情绪层次偏平，缺少有效起伏',
          },
        ],
      },
    });

    expect(audit.qualityFloorPassed).toBe(false);
    expect(audit.issues).toEqual(expect.arrayContaining([
      expect.stringContaining('情绪起伏不足'),
    ]));
  });

  it('does not fail hard sci-fi engineering prose when concrete cost and operator reaction carry the emotion', () => {
    const text = Array.from({ length: 8 }, () => [
      '叶澜拆开泵体电源模块，焊锡溅到真空服手背，烧出一个穿孔。气密损失报警响起，左手的烫伤从皮肤往骨头里钻。',
      '调度频道接入，先问生命体征，再让她汇报伤情。她封补真空服，氧压读数从0.3回升到1.0，维修臂重新锁住舱门。',
      '泵体信标从黄灯跳成绿灯，同伴在频道里松了口气，但E-7气闸又报出新的气密错误，走廊另一端的报警灯跟着亮起。',
    ].join('\n\n')).join('\n\n');

    const audit = auditChapterReadability({
      chapterContent: text,
      readerScore: 7.5,
      previousReaderScore: 7.3,
      qualityGate: {
        overallScore: 83,
        structureScore: 94,
        emotionScore: 58.5,
        passed: true,
        summary: '',
        findings: [
          {
            code: 'stalled-momentum',
            level: 'warn',
            message: '连续 3 段推进信号偏弱，容易出现“水段”感',
          },
          {
            code: 'low-emotion-variance',
            level: 'warn',
            message: '情绪层次偏平，缺少有效起伏',
          },
        ],
      },
    });

    expect(audit.qualityFloorPassed).toBe(true);
    expect(audit.issues).toEqual([]);
  });

  it('fails sports training prose when body cost replaces relationship payoff', () => {
    const text = Array.from({ length: 9 }, () => [
      '折返跑第十七秒，沈砚踩过底线，膝盖疼得像被细线勒住。他咬住牙，又把下一组冲刺压到二十一秒。',
      '队友站在边线外看计时表，教练吹哨让他继续。汗水顺着下巴砸在地板上，旧伤在每次急停时往上拧。',
      '他完成第八组，扶着膝盖喘气，记分板没有变化，分组名单也没有变化。训练继续，所有人重新排队。',
    ].join('\n\n')).join('\n\n');

    const audit = auditChapterReadability({
      chapterContent: text,
      readerScore: 7.2,
      previousReaderScore: 7.1,
      qualityGate: {
        overallScore: 81.2,
        structureScore: 100,
        emotionScore: 47.1,
        passed: true,
        summary: '',
        findings: [
          {
            code: 'low-emotion-variance',
            level: 'warn',
            message: '情绪层次偏平，缺少有效起伏',
          },
        ],
      },
    });

    expect(audit.qualityFloorPassed).toBe(false);
    expect(audit.issues).toEqual(expect.arrayContaining([
      expect.stringContaining('情绪分偏低'),
    ]));
    expect(audit.suggestions).toEqual(expect.arrayContaining([
      expect.stringContaining('不能只堆身体反应'),
    ]));
  });

  it('does not fail calm workplace prose when position change and project payoff carry the emotion', () => {
    const text = [
      '会议室里，赵宏把展陈中心项目推给林澄。白板上写着预算缺口470万，工期压缩40天。林澄没有争辩，只问客户需求有没有纪要，然后看向周维：“我需要项目组调度权。”周维点头。',
      '客户王总拍下三版方案，问为什么没有理解交互区。林澄把A4纸推过去，用接待动线、展示区和签约洽谈空间拆开预算。王总看了十秒，说：“明天上午看场地。”',
      '回到工位，林澄发出客户纪要和项目组检查点。OA通知跳出来：展陈中心改造项目负责人变更。赵宏路过她工位，第一次正常喊她林经理，并说项目交接记录明天补给她。',
      '小李发来消息：如果方案合适，王总说明天看场地就可以当场签方向确认书。林澄把手机扣下，继续把租赁分期写进预算表，先把470万缺口压下去一半。',
      ...Array.from({ length: 8 }, () => '项目组群里原本没人接话，小陈先把现场照片发出来，周维随后补了一句“按林经理的检查点走”。赵宏没有再甩锅，只把旧版预算表传给她。客户侧的小李确认明天九点开门，王总要看方案能不能把工期压回去。林澄把承重、电源、空调三个风险点拆成表格，标出责任人和截止时间。'),
    ].join('\n\n');
    const genreDrift = auditGenreDrift({
      chapterContent: text,
      title: '她把烂项目做成了样板间',
      synopsis: '无CP职场事业线，项目交付、客户反馈、公开会议和职场位置变化。',
      genre: 'modern',
      tags: ['无CP', '职场', '事业线', '项目交付'],
    });

    const audit = auditChapterReadability({
      chapterContent: text,
      readerScore: 7.7,
      qualityGate: {
        overallScore: 84,
        structureScore: 100,
        emotionScore: 47.3,
        passed: true,
        summary: '',
        findings: [
          {
            code: 'low-emotion-variance',
            level: 'warn',
            message: '情绪层次偏平，缺少有效起伏',
          },
        ],
      },
      genreDrift,
    });

    expect(audit.qualityFloorPassed).toBe(true);
    expect(audit.issues).toEqual([]);
  });

  it('fails calm workplace prose when reader score regresses with low emotion variance', () => {
    const text = [
      '林澄推开会议室门，白板上写着人力费高40%。她用物业确认单、备件清单和供货周期把问题逐项拆开，周维批准电源改造预算。',
      '小陈递来华盛客户记录，赵宏转发刘工消息，老孙确认物业通道可以提前锁库。林澄把三期付款和维保升级包写进附件，换到下周五交货。',
      'OA通知跳出项目总负责人名单，林澄看了两秒，继续写周一维保明细、周二施工图评审、周六电源改造。她拿起帆布包，准备提前见设计部刘莉。',
      ...Array.from({ length: 8 }, () => '项目节点继续推进，预算、工期、供应商和物业通道逐一确认。会议室里所有人都看见结果，但现场只剩流程落地和表格更新。'),
    ].join('\n\n');
    const genreDrift = auditGenreDrift({
      chapterContent: text,
      title: '她把烂项目做成了样板间',
      synopsis: '无CP职场事业线，项目交付、客户反馈、公开会议和职场位置变化。',
      genre: 'modern',
      tags: ['无CP', '职场', '事业线', '项目交付'],
    });

    const audit = auditChapterReadability({
      chapterContent: text,
      readerScore: 7.6,
      previousReaderScore: 7.7,
      qualityGate: {
        overallScore: 84.6,
        structureScore: 100,
        emotionScore: 54.4,
        passed: true,
        summary: '',
        findings: [
          {
            code: 'low-emotion-variance',
            level: 'warn',
            message: '情绪层次偏平，缺少有效起伏',
          },
        ],
      },
      genreDrift,
    });

    expect(audit.qualityFloorPassed).toBe(false);
    expect(audit.issues).toEqual(expect.arrayContaining([
      expect.stringContaining('读者分回落且情绪起伏不足'),
    ]));
  });

  it('fails the floor when quality gate detects writing meta leakage', () => {
    const audit = auditChapterReadability({
      chapterContent: [
        '记分牌显示第三节还剩4分12秒，沈砚从替补席起身。',
        '这段文字继续展示他的战术阅读能力，然后队友拍了他的背。',
        '最后一回合他传到底角，比分反超。',
      ].join('\n\n'),
      readerScore: 7.1,
      qualityGate: {
        overallScore: 80.1,
        structureScore: 100,
        emotionScore: 56.3,
        passed: true,
        summary: '',
        findings: [
          {
            code: 'ai-meta-leak',
            level: 'warn',
            message: '出现 AI/写作 meta 泄露',
          },
        ],
      },
    });

    expect(audit.qualityFloorPassed).toBe(false);
    expect(audit.issues).toEqual(expect.arrayContaining([
      expect.stringContaining('元信息泄露'),
    ]));
  });

  it('adds forward hints against repairing low readability with more procedural records', () => {
    const hints = buildReadabilityForwardHints({
      novelId: '00000000-0000-4000-8000-000000000001',
      chapterNumber: 15,
      title: '办公室硬仗',
      content: '项目节点继续推进。',
      wordCount: 1000,
      status: 'reviewed',
      agentComments: [],
      readerScore: 7.5,
      revisionCount: 0,
      summary: '',
      diagnostics: {
        readabilityAudit: {
          readerScore: 7.5,
          previousReaderScore: 7.7,
          readerScoreDelta: -0.2,
          wordCount: 1400,
          speakerMarkerCount: 0,
          dialogueCount: 8,
          paragraphCount: 20,
          averageParagraphLength: 70,
          sceneBreakCount: 0,
          silentReactionCount: 0,
          silentReactionPer1k: 0,
          explanationContrastCount: 0,
          explanationContrastPer1k: 0,
          qualityGateOverall: 84,
          qualityGateStructure: 100,
          qualityGateEmotion: 54,
          qualityFloorPassed: false,
          issues: ['读者分回落且情绪起伏不足。'],
          suggestions: ['下一章必须优先恢复读感。'],
        },
        updatedAt: '2026-07-03T00:00:00.000Z',
      },
      createdAt: '2026-07-03T00:00:00.000Z',
      updatedAt: '2026-07-03T00:00:00.000Z',
    });

    expect(hints).toContain('流程化读感补救硬约束');
    expect(hints).toContain('文件、记录、日志、清单、时间表、签字、截图');
    expect(hints).toContain('人的反应、站队变化、关系代价或当场选择');
  });

  it('turns low emotion forward hints into public feedback and position change requirements', () => {
    const hints = buildReadabilityForwardHints({
      novelId: '00000000-0000-4000-8000-000000000001',
      chapterNumber: 17,
      title: '签约前十分钟',
      content: '排期确认函发送成功，合同附件模板已上传。',
      wordCount: 1000,
      status: 'reviewed',
      agentComments: [],
      readerScore: 7.3,
      revisionCount: 0,
      summary: '',
      diagnostics: {
        readabilityAudit: {
          readerScore: 7.3,
          previousReaderScore: 7.7,
          readerScoreDelta: -0.4,
          wordCount: 1400,
          speakerMarkerCount: 0,
          dialogueCount: 12,
          paragraphCount: 24,
          averageParagraphLength: 58,
          sceneBreakCount: 0,
          silentReactionCount: 1,
          silentReactionPer1k: 0.7,
          explanationContrastCount: 0,
          explanationContrastPer1k: 0,
          qualityGateOverall: 80.2,
          qualityGateStructure: 100,
          qualityGateEmotion: 35.1,
          qualityFloorPassed: false,
          issues: ['情绪分偏低：35.1，人物反应和情绪递进不足。'],
          suggestions: ['每个关键设定或动作代价后必须写出关系变化、他人反馈或心理递进。'],
        },
        updatedAt: '2026-07-03T00:00:00.000Z',
      },
      createdAt: '2026-07-03T00:00:00.000Z',
      updatedAt: '2026-07-03T00:00:00.000Z',
    });

    expect(hints).toContain('结果 -> 公开反馈 -> 角色位置变化 -> 下一步选择');
    expect(hints).toContain('客户、上级、恋爱对象、队友、社员或同伴');
    expect(hints).toContain('不要只补身体反应或心理标签');
    expect(hints).toContain('关系压力、资源归属、站队变化或可执行目标');
  });
});
