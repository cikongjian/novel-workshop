export type ReaderDeliveryWritingContractParams = {
  genre?: string;
  novelTags?: string[];
  constitutionTags?: string[];
};

type DeliveryProfile = 'workplace' | 'fantasy-upgrade' | 'scifi-engineering' | 'general';

function resolveProfile(params: ReaderDeliveryWritingContractParams): DeliveryProfile {
  const signals = [
    params.genre ?? '',
    ...(params.novelTags ?? []),
    ...(params.constitutionTags ?? []),
  ].join(' ');
  if (/female-career|职场|事业线|career|workplace/iu.test(signals)) return 'workplace';
  if (/fantasy-upgrade|玄幻升级|升级|xianxia|xuanhuan/iu.test(signals)) return 'fantasy-upgrade';
  if (/scifi|sci-fi|科幻|工程|空间站|engineering/iu.test(signals)) return 'scifi-engineering';
  return 'general';
}

function profileRules(profile: DeliveryProfile): string[] {
  if (profile === 'workplace') {
    return [
      '- 职场验收：至少写一场命名角色之间的当面冲突；方案、数据、日志和文件只能做筹码，不能连续替代人物交锋。',
      '- 职场人物验收：全章至少安排 3 个具名人物反应节拍，并分别落到对手公开改口、让步或加码，盟友承担风险或改变站队，主角承担个人代价或做出非流程选择。',
      '- 职场节奏验收：流程、数据、文件或测试操作最多连续写 2 段，下一段必须回到人物冲突、当场选择或关系反馈。',
      '- 职场结果验收：每个项目结果必须改变权限、责任、关系或资源，不能只更新进度；下一段必须让同事、客户或上级公开表态或提出新条件。',
      '- 职场章尾：落到签约延期、预算责任、客户追加条件、岗位去留或替代方案等可执行压力。',
    ];
  }
  if (profile === 'fantasy-upgrade') {
    return [
      '- 升级验收：本章必须让资源、境界或战力发生可量化变化，并让具名对手当场承受结果。',
      '- 升级验收：突破或反杀后必须写围观者、宗门人物或同伴的公开反应，让身份和关系位置随结果改变。',
      '- 升级章尾：落到下一名对手、资源门槛、境界代价或限时争夺，不能只追查幕后。',
    ];
  }
  if (profile === 'scifi-engineering') {
    return [
      '- 工程验收：设备异常必须经过现场读数、拆修或参数试错，再形成可验证的设备结果。',
      '- 工程验收：每次修复结果后必须让具名同伴、调度员或负责人改变判断、分工、信任或风险承担。',
      '- 工程章尾：落到报警升级、读数跳变、模块离线、倒计时维修或现场协作选择，不能只留日志来源。',
    ];
  }
  return [
    '- 题材验收：核心结果必须改变至少一名命名角色的选择、关系位置、资源或现实代价。',
  ];
}

export function buildReaderDeliveryWritingContract(
  params: ReaderDeliveryWritingContractParams = {},
): string {
  const profile = resolveProfile(params);
  return [
    '## 读者交付合同（正文与编辑必须逐项验收）',
    '- 前 500 字必须让主角进入当前行动，明确本章目标、一个会阻止目标的具体人/期限/资源障碍，以及第一次可见反馈。',
    '- 中段至少安排两次命名角色反应节拍；用动作、对话或当场选择写出站队、关系、责任或代价变化，不能只写“沉默”。',
    '- 每个关键结果后立刻写人物反应或新压力，不能连续罗列流程、参数、清单、文件和结果。',
    '- 最后 300 字必须出现下一项具体麻烦、限时条件、对手动作或关系选择，不能只总结成绩或等待确认。',
    '- 正文绝对不能写“第 N 章/上一章/本章”等章节编号或创作术语；回指前事必须改用事件名、地点或“上次/那天”等故事内时间参照。',
    '- 若本章有命名配角出场，至少让一名配角做出不可互换的具体选择或承担具体代价，不能只把配角当信息播报器。',
    ...profileRules(profile),
  ].join('\n');
}
