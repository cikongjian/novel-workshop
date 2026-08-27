import {
  buildPromiseContract,
  evaluatePromiseDrift,
  type PromiseContract,
  type PromiseDriftReport,
} from './promise-contract.js';
import {
  RITUAL_MECHANIC_DRIFT_KEYWORDS,
  WAR_STATECRAFT_ANCHOR_KEYWORDS,
} from './domain-drift-keywords.js';

export type GenreDriftAudit = {
  active: boolean;
  genre: string;
  constitutionTags: string[];
  suspenseGenre: boolean;
  promiseDrift: PromiseDriftReport;
  qualityFloorPassed: boolean;
  issues: string[];
  suggestions: string[];
};

const SUSPENSE_GENRE_RE = /悬疑|推理|侦探|探案|刑侦|mystery|detective|suspense|thriller/i;
const ENGINEERING_GENRE_RE = /科幻|硬科幻|工程|太空|星环|空间站|scifi|sci-fi|engineering/i;
const WORKPLACE_GENRE_RE = /职场|事业线|项目|客户|签约|交付|career|workplace/i;
const XIANXIA_GENRE_RE = /玄幻|仙侠|修真|修仙|武侠|奇幻|xianxia|xuanhuan|wuxia|fantasy/i;

/** 修仙/玄幻漂移关键词：非修仙题材小说中大量出现这些词，说明正在向修仙解密漂移 */
const XIANXIA_DRIFT_KEYWORDS = [
  '神使', '邪神', '信徒', '祭祀', '祭坛', '骨片', '纹路', '符文', '阵法',
  '功法', '灵宝', '法器', '法宝', '符咒', '丹药', '灵石', '灵根', '丹田',
  '经脉', '筑基', '金丹', '元婴', '化神', '渡劫', '飞升', '仙界', '魔界',
  '域外之神', '天外', '秘境', '遗迹', '传承', '血脉觉醒', '神识', '神念',
  '灵识', '神魂', '元神', '分身', '化身', '遁术', '瞬移', '空间法则',
  '时间法则', '大道', '天道', '因果', '轮回', '业力', '功德', '气运',
  '命格', '天机', '占卜', '推演', '夺舍', '转世', '契约', '钥匙碎片',
  '石门', '八芒星', '莲花纹', '黑曜石', '血纹',
];

/** 强工程/数据库术语：只保留在小说自然语境中很少成立的技术词，避免误伤授权、发布、同步等商业/娱乐圈用语。 */
const ENGINEERING_DRIFT_KEYWORDS = [
  '坐标', '锚点', '覆写', '链路', '时间戳', '握手记录', '缓存',
  '线程', '进程', '令牌', '凭证', '异步', '回调', '触发器', '事件流',
  '过滤器', '映射', '归约', '分片', '主从', '集群', '网关', '防火墙',
  '隧道', '哈希', '熔断', '幂等', '序列化', '编码', '解码', '部署',
  '回滚', '灰度',
];

function isXianxiaGenre(genre: string, tags: string[]): boolean {
  return XIANXIA_GENRE_RE.test([genre, ...tags].join(' '));
}

function countKeywordHits(text: string, keywords: string[]): number {
  let hits = 0;
  for (const kw of keywords) {
    const re = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    const matches = text.match(re);
    if (matches) hits += matches.length;
  }
  return hits;
}
const ENGINEERING_HOOK_RE = /气闸(?:报警|锁死|气密|异常)|氧压(?:下降|回落|异常)|温度(?:异常|骤降|飙升)|震动(?:异常|读数)|振动(?:异常|读数|频谱|加速度)|频谱(?:异常|重叠)|轴承(?:报警|异常|更换|磨损|疲劳)|垫圈(?:错配|错误|异常)|阀杆(?:变形|偏心|卡滞)|执行器(?:异常|试切|卡滞)|万用表|报警|警报|读数(?:跳变|异常)|参数(?:漂移|异常)|阀(?:卡死|泄漏|锁止)|模块(?:锁死|报警|异常)|舱门(?:闭合|锁死|报警)|信标(?:变红|变黄|异常)|传感器(?:校验|错误|异常)|气密(?:损失|错误|异常)|冷却(?:报警|异常)|推进(?:失效|锁止)/;
const INVESTIGATION_HOOK_RE = /来源|到底是什么|是什么|追查|调查|线索|幕后|秘密|真相|确认(?:来源|签名|身份|操作者|时间链)|定位|未登记|操作者/;

function isSuspenseGenre(genre: string, tags: string[]): boolean {
  return SUSPENSE_GENRE_RE.test([genre, ...tags].join(' '));
}

function isEngineeringGenre(genre: string, tags: string[]): boolean {
  return ENGINEERING_GENRE_RE.test([genre, ...tags].join(' '));
}

function isWorkplaceGenre(genre: string, tags: string[], contract: PromiseContract): boolean {
  return WORKPLACE_GENRE_RE.test([
    genre,
    ...tags,
    contract.mainPromise,
    ...contract.secondaryPromises,
    ...contract.constitutionSignals,
  ].join(' '));
}

function isWarStatecraftGenre(genre: string, tags: string[], contract: PromiseContract): boolean {
  return /(战争|权谋|历史|架空|争霸|朝堂|王朝|天朝|兵权|军功爵|废奴|科举|国子监|攻城|破城|war-statecraft|historical-power)/.test([
    genre,
    ...tags,
    contract.mainPromise,
    ...contract.secondaryPromises,
    ...contract.constitutionSignals,
  ].join(' '));
}

export function auditGenreDrift(params: {
  chapterContent: string;
  title: string;
  synopsis?: string;
  genre: string;
  tags?: string[];
  constitutionTags?: string[];
  promiseContract?: PromiseContract;
  windowChars?: number;
}): GenreDriftAudit {
  const constitutionTags = params.constitutionTags ?? [];
  const suspenseGenre = isSuspenseGenre(params.genre, [...(params.tags ?? []), ...constitutionTags]);
  const promiseContract = params.promiseContract ?? buildPromiseContract({
    title: params.title,
    synopsis: params.synopsis,
    tags: params.tags,
    constitutionTags,
    genre: params.genre,
  });
  const promiseDrift = evaluatePromiseDrift(params.chapterContent, promiseContract, {
    windowChars: params.windowChars ?? 4200,
  });
  const issues: string[] = [];
  const suggestions: string[] = [];

  if (!suspenseGenre && promiseDrift.drifting) {
    issues.push(`题材漂移：悬疑/调查信号 ${promiseDrift.suspenseHits} 次，高于题材回报 ${promiseDrift.promiseHits} 次和主场景 ${promiseDrift.sceneHits} 次。`);
    suggestions.push('下一轮必须把世界要素落回本题材主场景：甜宠写关系回报，美食/经营写制作与客流反馈，科幻写实验反馈，升级写突破和资源争夺。');
    suggestions.push('秘密、真相、线索、调查只能作为辅因，不能取代题材承诺。');
  }
  const hasExplicitPromiseSignal = promiseContract.constitutionSignals.length > 0;
  if (
    !suspenseGenre
    && hasExplicitPromiseSignal
    && promiseDrift.missingPrimaryPayoff
    && promiseDrift.sceneHits >= 2
  ) {
    issues.push(`题材主回报缺失：已进入主场景 ${promiseDrift.sceneHits} 次，但题材回报关键词没有落地。`);
    suggestions.push('下一轮必须把主场景转成可见结果：美食要成交/排队/复购，体育要得分/防住/助攻，职场要签约/升职/站队，权谋要兵权/城门/阵型变化。');
  }
  // ── 修仙/玄幻漂移检测（非修仙题材）──
  const xianxiaGenre = isXianxiaGenre(params.genre, [...(params.tags ?? []), ...constitutionTags]);
  if (!xianxiaGenre) {
    const xianxiaHits = countKeywordHits(params.chapterContent, XIANXIA_DRIFT_KEYWORDS);
    if (xianxiaHits >= 3) {
      issues.push(`题材漂移：非修仙题材中出现修仙/玄幻关键词 ${xianxiaHits} 次（如神使、邪神、信徒、祭祀、骨片、符文、阵法等），小说正在向修仙解密方向漂移。`);
      suggestions.push('立即将叙事拉回题材主场景：战争文写兵法/攻城/练兵/收编，职场文写项目/谈判/站队，甜宠文写关系/心动/拉扯。');
      suggestions.push('秘密、真相、线索只能作为辅因，不能取代题材主回报。反派信息应通过正面交锋当场暴露，不要分多章调查。');
    }
  }

  const warStatecraftGenre = isWarStatecraftGenre(
    params.genre,
    [...(params.tags ?? []), ...constitutionTags],
    promiseContract,
  );
  if (warStatecraftGenre) {
    const scope = params.chapterContent.slice(0, params.windowChars ?? 4200);
    const ritualMechanicHits = countKeywordHits(scope, RITUAL_MECHANIC_DRIFT_KEYWORDS);
    const warStatecraftHits = countKeywordHits(scope, WAR_STATECRAFT_ANCHOR_KEYWORDS);
    if (ritualMechanicHits >= 4 && ritualMechanicHits >= Math.max(2, warStatecraftHits)) {
      issues.push(`题材漂移：战争/权谋承诺被祭坛/钥匙/坐标/碎片/秘门机制替代（漂移 ${ritualMechanicHits} 次，军政信号 ${warStatecraftHits} 次）。`);
      suggestions.push('下一轮必须回到战争与政权建设：攻城、练兵、收编、兵权、政令、废奴、军功爵、科举/国子监、旧贵族反扑至少落地两项。');
      suggestions.push('祭坛、钥匙、坐标、碎片、第三门、封印、传送只能做背景压力，不能成为章节主任务或章末钩子。');
    }
  }

  const engineeringGenre = isEngineeringGenre(params.genre, [...(params.tags ?? []), ...constitutionTags]);
  const workplaceGenre = isWorkplaceGenre(
    params.genre,
    [...(params.tags ?? []), ...constitutionTags],
    promiseContract,
  );

  // ── 工程术语漂移检测（非工程题材）──
  const engHits = countKeywordHits(params.chapterContent, ENGINEERING_DRIFT_KEYWORDS);
  if (!engineeringGenre && !workplaceGenre && engHits >= 2) {
    issues.push(`术语污染：小说正文中出现工程/数据库术语 ${engHits} 次（如锚点、坐标、时间戳、握手记录、缓存等），这些是软件开发词汇，不属于任何小说的世界观。`);
    suggestions.push('系统提示、面板、界面中的术语必须是该题材内自然存在的（如游戏中的「经验值」「等级」「技能」），禁止使用数据库/向量库/网络工程术语。');
  }

  const tail = params.chapterContent.slice(-700);
  if (!suspenseGenre && engineeringGenre && INVESTIGATION_HOOK_RE.test(tail) && !ENGINEERING_HOOK_RE.test(tail)) {
    issues.push('题材漂移：科幻/工程章尾落在“来源/真相/确认”式调查钩子，缺少下一处可执行工程危机。');
    suggestions.push('科幻工程章尾必须把异常转成下一步维修/实验任务，例如气闸报警、氧压回落、模块锁死、读数跳变或信标异常。');
  }

  return {
    active: promiseDrift.active,
    genre: params.genre,
    constitutionTags,
    suspenseGenre,
    promiseDrift,
    qualityFloorPassed: issues.length === 0,
    issues,
    suggestions,
  };
}

export function buildGenreDriftForwardHints(audit: GenreDriftAudit | null | undefined): string {
  if (!audit || audit.qualityFloorPassed) return '';
  return [
    '上一章题材漂移审计提示：',
    ...audit.issues.slice(0, 3).map(issue => `- ${issue}`),
    ...audit.suggestions.slice(0, 3).map(suggestion => `- ${suggestion}`),
  ].join('\n');
}
