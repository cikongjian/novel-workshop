import { inferTopicProfiles } from './topic-profiles.js';

export type StartupRetentionHints = {
  directionHint?: string;
  openingHint?: string;
  payoffHint?: string;
};

export const STARTUP_PLATFORM_PROFILE_VALUES = ['auto', 'fanqie', 'qidian'] as const;
export type StartupPlatformProfile = typeof STARTUP_PLATFORM_PROFILE_VALUES[number];

function isTrue(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function isStartupRetentionEnabled(): boolean {
  return isTrue(process.env.STARTUP_RETENTION_ENABLED);
}

function joinProtagonists(names: string[]): string {
  if (names.length === 0) return '主角';
  return names.join(' / ');
}

export function normalizeStartupPlatformProfile(value?: string | null): StartupPlatformProfile {
  if (!value) return 'auto';
  const normalized = value.trim().toLowerCase();
  if (normalized === 'fanqie' || normalized === '番茄' || normalized === 'tomato') return 'fanqie';
  if (normalized === 'qidian' || normalized === '起点') return 'qidian';
  return 'auto';
}

function mergeText(parts: Array<string | undefined>): string | undefined {
  const merged = parts.filter(Boolean).join('\n\n').trim();
  return merged || undefined;
}

function mergeHints(...items: StartupRetentionHints[]): StartupRetentionHints {
  return {
    directionHint: mergeText(items.map(item => item.directionHint)),
    openingHint: mergeText(items.map(item => item.openingHint)),
    payoffHint: mergeText(items.map(item => item.payoffHint)),
  };
}

function buildPlatformStartupHints(params: {
  chapterNumber: number;
  protagonistNames: string[];
  platformProfile?: string | null;
}): StartupRetentionHints {
  const { chapterNumber, protagonistNames, platformProfile } = params;
  if (chapterNumber < 1 || chapterNumber > 3) return {};

  const protagonistLabel = joinProtagonists(protagonistNames);
  const profile = normalizeStartupPlatformProfile(platformProfile);
  if (profile === 'auto') return {};

  if (profile === 'fanqie') {
    if (chapterNumber === 1) {
      return {
        directionHint: [
          '## 番茄首章平台范式（硬约束，必须满足）',
          '- 开头 200 字内必须抛出可感知事件：危险、羞辱、利益诱因、强反差四选一，禁止天气/回忆/百科式起手。',
          `- 前 800 字内必须说清${protagonistLabel}“此刻最想要什么”和“眼下最大阻碍是什么”。`,
          '- 前 1500 字内必须给出一次短回报：反击得手、反转入口、情绪爆点或危险升级四选一，不能只铺垫不兑现。',
          '- 世界观说明必须附着在冲突里，单段设定说明不超过 90 字，禁止连续两段资料卡式讲解。',
          '- 章末必须停在“马上点下一章才知道后果”的位置，不接受纯氛围收束。',
        ].join('\n'),
        openingHint: [
          '番茄首章开头执行清单',
          '- 第一屏先上事，不准先讲背景、设定、历史沿革。',
          '- 3 段内必须出现：主角动作、阻力来源、更大麻烦。',
          '- 句子偏短，信息密度偏高，优先使用动作和结果带读者往下滑。',
        ].join('\n'),
        payoffHint: [
          '番茄首章回报节拍',
          '- 本章至少 1 次爽点/反制/情绪爆点兑现，避免读者只看到受苦和解释。',
          '- 情报一出现就要跟动作反馈，不要让人物一直听、一直想、一直判断。',
        ].join('\n'),
      };
    }

    if (chapterNumber === 2) {
      return {
        directionHint: [
          '## 番茄第二章续读范式（硬约束，必须满足）',
          '- 直接承接第一章后果，开头就让读者看到“选了以后发生了什么”。',
          `- 前 1000 字内，${protagonistLabel}必须完成一次反击、改策或关系裂变，不能原地解释。`,
          '- 本章末尾必须新增更大的好处或更危险的代价，形成继续追读的斜坡。',
        ].join('\n'),
        openingHint: '第二章开头先写后果落地和局势变化，不重复介绍人设与世界观。',
        payoffHint: '第二章至少兑现一次“主角主动出手后的立即反馈”，把追更感做出来。',
      };
    }

    return {
      directionHint: [
        '## 番茄第三章定型范式（硬约束，必须满足）',
        '- 三章读完后，读者必须一眼说出：主角标签、核心卖点、当前最大矛盾。',
        '- 本章必须给出首轮阶段性回报或大反噬，禁止三章后仍然只有铺垫。',
        '- 章末抛出更大局面、更大敌人或更高收益，让读者明确“后面会更猛”。',
      ].join('\n'),
      openingHint: '第三章开头直接进入兑现或反噬场景，避免复盘前两章。',
      payoffHint: '第三章必须出现结果性信息：得手、翻车、背刺、曝光、站队变化至少一项。',
    };
  }

  if (chapterNumber === 1) {
    return {
      directionHint: [
        '## 起点首章平台范式（硬约束，必须满足）',
        `- 开头 600 字内必须亮出${protagonistLabel}的差异化身份、能力、困局之一，让读者知道“这人/这书特殊在哪”。`,
        '- 前 1200 字内必须交代一个可持续追读的设定抓手：世界规则、修炼路径、职业机制、组织体系至少一项。',
        '- 前 2000 字内必须给出长线承诺：主目标、潜在大敌、机缘入口、升级路线四选一，说明这书为什么能往后写。',
        '- 允许设定，但设定必须绑定当前事件与选择，禁止百科全书式讲解。',
        '- 章末要留下“下一步怎么变强/怎么破局”的明确问题，而不是只做悬念摆拍。',
      ].join('\n'),
      openingHint: [
        '起点首章开头执行清单',
        '- 起手可以稳，但不能空。第一屏就要给读者一个抓手：身份、能力、困局、规则其一。',
        '- 3-5 段内出现一个让人愿意继续验证的设定点，不能只靠情绪推读。',
      ].join('\n'),
      payoffHint: [
        '起点首章回报节拍',
        '- 本章至少出现一次能力验证、规则反馈或地位变化，证明设定不是空壳。',
        '- 读者看完首章后，应知道主角接下来为什么必须继续行动。',
      ].join('\n'),
    };
  }

  if (chapterNumber === 2) {
    return {
      directionHint: [
        '## 起点第二章承接范式（硬约束，必须满足）',
        '- 围绕首章抛出的设定抓手，推进第一次试错、验证或应用，不可退回纯解释。',
        '- 本章必须新增一个长期可追的变量：组织、敌人、副本、资源门槛、成长天花板至少一项。',
        `- ${protagonistLabel}要在执行中看见代价或规则反馈，体现成长线不是空喊。`,
      ].join('\n'),
      openingHint: '第二章开头先接设定落地后的第一轮反馈，别重讲概念。',
      payoffHint: '第二章至少给出一次“试了以后发生什么”的验证结果，让设定转成故事。',
    };
  }

  return {
    directionHint: [
      '## 起点第三章定型范式（硬约束，必须满足）',
      '- 三章读完后，读者必须明白主角凭什么成长、对手是谁、升级路径第一阶段是什么。',
      '- 本章必须展示首轮阶段结果，并抛出下一阶段门槛，告诉读者“为什么这书能写长”。',
      '- 禁止三章后仍然只在介绍设定，没有主线推进和阶段性结果。',
    ].join('\n'),
    openingHint: '第三章开头直接切入首轮结果或更高门槛，别再重新介绍卖点。',
    payoffHint: '第三章至少兑现一次“设定推动剧情”的结果，让读者看到长线潜力。',
  };
}

function buildBaseStartupRetentionHints(params: {
  chapterNumber: number;
  protagonistNames: string[];
  genre?: string;
}): StartupRetentionHints {
  const { chapterNumber, protagonistNames, genre } = params;
  if (chapterNumber < 1 || chapterNumber > 3) return {};

  const protagonistLabel = joinProtagonists(protagonistNames);
  const isHistoricalPowerGenre = /(权谋|历史|朝堂|争霸|宫廷|王朝|古代|架空)/.test(genre ?? '');

  if (!isStartupRetentionEnabled()) {
    if (!isHistoricalPowerGenre) return {};
    if (chapterNumber === 1) {
      return {
        directionHint: [
          '## 首章签约向执行清单（软约束）',
          `- 开场 300 字内：${protagonistLabel}必须出场并执行可视化动作，禁止先做大段势力总览。`,
          `- 前 1200 字内：${protagonistLabel}必须做一次改变局势的选择，并承担可见代价（损失/暴露/错判/背锅其一）。`,
          '- 设定通过冲突带出：单段设定说明不超过 120 字，连续设定段不超过 2 段。',
          '- 本章至少推进两件事：主角当下任务 + 一个外部势力的实质动向。',
          '- 章末必须落在新危机/新任务上，避免纯抒情收束。',
        ].join('\n'),
        openingHint: [
          '首章开头提示（软约束）',
          '- 开头先写“人在事中”，3 段内交代阻力来源。',
          '- 先给目标与阻碍，再补世界观背景，避免资料卡式铺陈。',
        ].join('\n'),
        payoffHint: [
          '首章回报提示（软约束）',
          '- 至少 1 个短回报（小胜/反制）+ 1 个硬代价（失去筹码/关系受损/风险升级）。',
          '- 避免主角“全知全对”：补 1 处信息盲区或判断偏差。',
        ].join('\n'),
      };
    }
    if (chapterNumber === 2) {
      return {
        directionHint: [
          '## 第二章续航清单（软约束）',
          '- 直接承接第一章选择的后果，不要重置局势。',
          `- ${protagonistLabel}要在执行中遭遇升级阻力，并做一次改策。`,
          '- 章末给出阶段结果 + 新变量。',
        ].join('\n'),
        openingHint: '第二章开头先写第一章行动造成的直接后果，避免重新介绍设定。',
        payoffHint: '第二章至少出现一次“受挫后改策”的连招，保持主角主动性。',
      };
    }
    return {
      directionHint: [
        '## 第三章破局清单（软约束）',
        '- 三章读完后，读者应明确：主角目标、主要对手、当前最紧迫危机。',
        '- 本章必须给出第一阶段博弈的结果性信息（得手/失手/背叛/站队变化）。',
      ].join('\n'),
      openingHint: '第三章开头直接进入冲突兑现场，避免长段复述。',
      payoffHint: '第三章章末抛出下一阶段主问题，而不是重复同类危机。',
    };
  }

  if (chapterNumber === 1) {
    return {
      directionHint: [
        '## 首章留存硬约束（必须满足）',
        `- 开场 450 字内：${protagonistLabel}必须出场，并完成一个可视化动作（不是纯听汇报/纯思考）。`,
        `- 前 1200 字内：${protagonistLabel}必须做出一次不可逆选择（会付出代价或制造新风险）。`,
        '- 前 2000 字内：要出现该选择的第一波后果（成功/失败/被迫改道都可以，但必须可见）。',
        `- 本章至少给出一个情感锚点：说明${protagonistLabel}“为什么值得被读者关心”（软肋/执念/关系牵引三选一）。`,
        '- 结尾必须是“新危机已落地”的钩子，不要只做氛围收束。',
      ].join('\n'),
      openingHint: [
        '首章黄金开头检查',
        `- 先写${protagonistLabel}在做事，再解释世界观；避免连续背景交代超过 220 字。`,
        '- 句式偏短，3 段内给出冲突对象和阻力来源。',
      ].join('\n'),
      payoffHint: [
        '首章情绪回报检查',
        '- 本章至少出现一次“绝境决断”或“代价落地”场景。',
        '- 禁止全章仅靠汇报推进；每一轮情报后都要跟一个动作性回应。',
      ].join('\n'),
    };
  }

  if (chapterNumber === 2) {
    return {
      directionHint: [
        '## 第二章续航硬约束（必须满足）',
        '- 必须承接第一章的核心选择，不能重置情势。',
        `- ${protagonistLabel}需要执行第一章决定，并在执行中遇到升级阻力（不是重复讨论）。`,
        '- 本章结尾前要给出“阶段性结果 + 新变量”，形成追更惯性。',
      ].join('\n'),
      openingHint: '第二章开头先接“上章行动的直接后果”，避免重新铺垫设定。',
      payoffHint: '第二章至少出现一次“行动受挫后立即改策”的连招，强调主角主导性。',
    };
  }

  return {
    directionHint: [
      '## 第三章破局硬约束（必须满足）',
      '- 三章读完后，读者必须明确：主角目标、主要对手、当前最紧迫危机。',
      '- 本章必须展示第一阶段博弈结果（哪怕是局部失败），禁止继续只铺垫不落地。',
      '- 在章末抛出下一阶段主问题，而不是重复同类危机。',
    ].join('\n'),
    openingHint: '第三章开头直接进入冲突兑现场，不做长段复述。',
    payoffHint: '第三章必须出现“结果性信息”，例如损失、得手、背叛揭示或阵营站队变化。',
  };
}

function buildGenreStartupHints(params: {
  chapterNumber: number;
  genre?: string;
  novelTitle?: string;
  novelSynopsis?: string;
  novelTags?: string[];
  constitutionTags?: string[];
}): StartupRetentionHints {
  if (params.chapterNumber < 1 || params.chapterNumber > 3) return {};
  const items: StartupRetentionHints[] = [];
  const seenTitles = new Set<string>();
  for (const profile of inferTopicProfiles(params)) {
    const hints = profile.startupHints;
    if (!hints) continue;
    if (!(hints.chapterNumbers ?? [1]).includes(params.chapterNumber)) continue;
    if (seenTitles.has(hints.title)) continue;
    seenTitles.add(hints.title);
    items.push({
      directionHint: [`## 首章题材加速提示（${hints.title}）`, `- ${hints.directionHint}`].join('\n'),
      openingHint: [`首章开头提示（${hints.title}）`, `- ${hints.openingHint}`].join('\n'),
      payoffHint: [`首章回报提示（${hints.title}）`, `- ${hints.payoffHint}`].join('\n'),
    });
  }

  return mergeHints(...items);
}

export function buildStartupRetentionHints(params: {
  chapterNumber: number;
  protagonistNames: string[];
  genre?: string;
  novelTitle?: string;
  novelSynopsis?: string;
  novelTags?: string[];
  constitutionTags?: string[];
  platformProfile?: string | null;
}): StartupRetentionHints {
  return mergeHints(
    buildBaseStartupRetentionHints(params),
    buildPlatformStartupHints(params),
    buildGenreStartupHints(params),
  );
}
