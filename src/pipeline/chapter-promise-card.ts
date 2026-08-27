import type { PromiseContract } from './promise-contract.js';
import type { NovelConstitution } from '../novel/constitution-types.js';
import type { ChapterOutline } from '../novel/types.js';
import {
  RITUAL_MECHANIC_DRIFT_KEYWORDS,
  WAR_STATECRAFT_PAYOFF_KEYWORDS,
  WAR_STATECRAFT_SCENE_KEYWORDS,
} from './domain-drift-keywords.js';
import {
  getPrimaryTopicProfile,
  inferTopicProfiles,
  type ChapterGenreFocus,
  type TopicProfile,
} from './topic-profiles.js';

export type ChapterPromiseRequirement = {
  label: string;
  keywords: string[];
};

export type ChapterPromiseCardPhase =
  | 'startup'
  | 'early'
  | 'middle'
  | 'late'
  | 'finale';

export type ChapterPromiseCard = {
  source: 'constitution' | 'promise-contract';
  chapterNumber: number;
  phase: ChapterPromiseCardPhase;
  genreFocus: ChapterGenreFocus;
  topicIds?: string[];
  mainPromise: string;
  chapterMission: string;
  requiredPayoff: ChapterPromiseRequirement;
  optionalPayoff?: ChapterPromiseRequirement;
  requiredScene: ChapterPromiseRequirement;
  forbiddenSubstitutions: ChapterPromiseRequirement[];
  allowedHookTypes: string[];
  preferredEndingFocus: string[];
  startupMustLandResult: boolean;
  summary: string;
  gateSummary: string;
};

type BuildChapterPromiseCardParams = {
  chapterNumber: number;
  totalPlannedChapters?: number;
  novelTitle: string;
  genre: string;
  constitution?: NovelConstitution;
  promiseContract: PromiseContract;
  chapterOutline?: ChapterOutline;
};

const DEFAULT_PAYOFF_KEYWORDS = ['反击', '拿下', '打脸', '翻盘'];
const DEFAULT_SCENE_KEYWORDS = ['现场', '片场', '会议室'];
const DEFAULT_FORBIDDEN_KEYWORDS = ['真相', '秘密', '线索', '调查', '监控', '匿名'];
const FOOD_PRIORITY_PAYOFF_KEYWORDS = ['开张', '铜板', '围观', '闻香', '排队', '卖光', '回头客', '摆摊'];
const FOOD_PRIORITY_SCENE_KEYWORDS = ['灶台', '锅边', '摊子', '摊前', '集市', '庙门', '街边', '食肆'];

function pickKeywords(values: string[] | undefined, limit: number, fallback: string[]): string[] {
  const picked = [...new Set((values ?? []).map(item => item.trim()).filter(Boolean))].slice(0, limit);
  return picked.length > 0 ? picked : fallback.slice(0, limit);
}

function inferPhase(chapterNumber: number, totalPlannedChapters?: number): ChapterPromiseCardPhase {
  if (chapterNumber <= 3) return 'startup';
  if (!totalPlannedChapters || totalPlannedChapters <= 0) {
    if (chapterNumber <= 10) return 'early';
    if (chapterNumber <= 40) return 'middle';
    return 'late';
  }
  const progress = chapterNumber / totalPlannedChapters;
  if (progress <= 0.25) return 'early';
  if (progress <= 0.72) return 'middle';
  if (progress <= 0.94) return 'late';
  return 'finale';
}

function inferGenreFocus(params: {
  novelTitle: string;
  genre: string;
  promiseContract: PromiseContract;
  topicProfiles?: TopicProfile[];
}): ChapterPromiseCard['genreFocus'] {
  const haystack = [
    params.novelTitle,
    params.genre,
    params.promiseContract.mainPromise,
    ...(params.promiseContract.constitutionSignals ?? []),
  ].join('\n');

  // 复合题材优先判断：娱乐圈 + 甜宠 = romance（隐婚、协议婚姻等）
  const hasShowbiz = /(娱乐圈|影帝|顶流|试镜|热搜|剧组|番位|节目组|showbiz)/.test(haystack);
  const hasRomance = /(死对头|欢喜冤家|冤家|宿敌|对家|互怼|甜宠|甜文|心动|偏爱|护短|恋爱|隐婚|协议婚姻|闪婚|契约|sweet|romance)/.test(haystack);

  if (hasShowbiz && hasRomance) {
    // 娱乐圈 + 甜宠 = 以感情线为主的娱乐圈文，使用 romance 模板
    return 'romance';
  }

  const topicFocus = getPrimaryTopicProfile(params.topicProfiles ?? [])?.genreFocus;
  if (topicFocus) return topicFocus;

  // 单一题材判断
  if (hasShowbiz) return 'showbiz';
  if (hasRomance) return 'romance';
  if (/(美食|一碗面|面馆|摆摊|开店|食肆|酒楼|种田|农女|馋哭|food-business|farming-survival)/.test(haystack)) return 'food';
  if (/(末日|永夜|列车|庇护所|求生|废土|囤货|天灾|生存|奴隶列车|world-survival|apocalypse-train)/.test(haystack)) return 'survival';
  if (/(war-statecraft|historical-power|战争|权谋|历史|架空|争霸|朝堂|王朝|天朝|攻城|破城|军功爵|废奴|科举|国子监|兵权|旧贵族)/.test(haystack)) return 'war-statecraft';
  if (/(玄幻|修仙|升级|突破|宗门|秘境|fantasy-upgrade)/.test(haystack)) return 'upgrade';
  if (/(系统|社死|羞耻|任务|shame-system)/.test(haystack)) return 'system';
  if (/(职场|升职|签约|项目|事业线|独美|female-career)/.test(haystack)) return 'career';
  return 'generic';
}

function formatRequirementLabel(keywords: string[], fallback: string): string {
  const picked = keywords.filter(Boolean).slice(0, 2);
  return picked.length > 0 ? picked.join(' / ') : fallback;
}

function buildChapterMission(params: {
  phase: ChapterPromiseCardPhase;
  chapterOutline?: ChapterOutline;
  mainPromise: string;
  payoffLabel: string;
  sceneLabel: string;
}): string {
  const outlineHint = params.chapterOutline?.summary?.trim();
  if (outlineHint) {
    return `围绕「${outlineHint}」推进，但必须把结果落成「${params.payoffLabel}」，并放在「${params.sceneLabel}」这种主场景里。`;
  }
  switch (params.phase) {
    case 'startup':
      return `冷启动阶段必须让读者第一次明确吃到「${params.payoffLabel}」这个回报，并且当章在「${params.sceneLabel}」里落地结果。`;
    case 'early':
      return `早期章节要把「${params.mainPromise}」拆成看得见的结果，本章优先兑现「${params.payoffLabel}」，不要只铺设信息。`;
    case 'middle':
      return `中段章节要继续兑现卖点，不许空转。本章至少推进一次「${params.payoffLabel}」，并保持主场景仍是「${params.sceneLabel}」。`;
    case 'late':
      return `收束前章节应把主线压力转成实质性收益或代价，本章优先给出「${params.payoffLabel}」而不是新增谜团。`;
    case 'finale':
      return `终局阶段必须集中兑现核心承诺，本章所有冲突都应服务于「${params.payoffLabel}」的集中爆发。`;
    default:
      return `本章必须先兑现「${params.payoffLabel}」，再处理解释和悬念。`;
  }
}

function inferAllowedHookTypes(maxSuspenseShare: number, phase: ChapterPromiseCardPhase): string[] {
  if (maxSuspenseShare >= 0.65) {
    return ['悬念型', '反转型', '危机型'];
  }
  if (phase === 'startup') {
    return ['期待型', '结果型', '抉择型'];
  }
  return ['期待型', '抉择型', '反转型'];
}

function buildForbiddenSubstitutions(
  keywords: string[],
  phase: ChapterPromiseCardPhase,
  genreFocus: ChapterPromiseCard['genreFocus'],
  promiseSignals: string[],
  activeTopicProfile?: TopicProfile,
): ChapterPromiseRequirement[] {
  const primary = pickKeywords(keywords, 6, DEFAULT_FORBIDDEN_KEYWORDS);
  const common: ChapterPromiseRequirement[] = [
    {
      label: '调查 / 真相 / 线索型推进',
      keywords: primary,
    },
  ];
  if (phase === 'startup') {
    common.push({
      label: '预案整理 / 幕后排查 / 纯计划推进',
      keywords: ['预案', '整理', '节点', '计划', '监听', '排查'],
    });
  }
  if (genreFocus === 'showbiz') {
    common.push({
      label: '技术潜入 / 黑邮箱 / 密码破解型主回报',
      keywords: ['邮箱', '密码', '登录', 'WiFi', 'IP', '黑进', '入侵', '破解'],
    });
    common.push({
      label: '黑影跟踪 / 监视危机替代资源推进',
      keywords: ['黑影', '鸭舌帽', '巷口', '盯着', '监视', '人影', '黑暗', '等待'],
    });
    if (promiseSignals.includes('collapse-warning')) {
      common.push({
        label: '深挖黑料 / 跟踪取证型推进',
        keywords: ['查证', '深挖', '取证', '跟拍', '偷拍视频', '蹲守', '录音笔', '爆料来源'],
      });
    }
  }
  if (genreFocus === 'war-statecraft') {
    common.push({
      label: '祭坛 / 钥匙 / 坐标 / 秘门型伪主线',
      keywords: RITUAL_MECHANIC_DRIFT_KEYWORDS,
    });
    common.push({
      label: '修仙解谜 / 神秘遗迹替代战争推进',
      keywords: ['神使', '邪神', '信徒', '神谕', '秘境', '传承', '法器', '灵宝', '天机', '血纹'],
    });
  }
  if (genreFocus !== 'war-statecraft' && activeTopicProfile?.forbiddenSubstitutions?.length) {
    common.push(...activeTopicProfile.forbiddenSubstitutions);
  }
  return common;
}

function buildPreferredEndingFocus(
  genreFocus: ChapterPromiseCard['genreFocus'],
  phase: ChapterPromiseCardPhase,
  requiredPayoff: ChapterPromiseRequirement,
  promiseSignals: string[],
  activeTopicProfile?: TopicProfile,
): string[] {
  if (genreFocus === 'showbiz') {
    if (promiseSignals.includes('collapse-warning')) {
      return phase === 'startup'
        ? ['公开预警后的热搜结果', '直播/试镜的即时反馈', '资源截胡的下一步']
        : ['公开预警引爆后的舆论变化', '资源反抢后的更大机会', '站队升级'];
    }
    return phase === 'startup'
      ? ['资源截胡的下一步', '盟友正式站队', '试镜/节目/热搜的执行结果']
      : ['资源兑现后的更大机会', '公开战场上的反转', '站队关系升级'];
  }
  if (genreFocus === 'career') {
    return ['项目归属落地', '站队变化', '公开反击后的下一步'];
  }
  if (genreFocus === 'romance') {
    return ['关系推进的下一步', '心动后的选择', '护短后的站位变化'];
  }
  if (genreFocus === 'food') {
    return ['第一笔生意后的更大机会', '口碑扩散', '下一锅/下一摊更大场面'];
  }
  if (genreFocus === 'survival') {
    return ['生存条件升级后的新窗口', '第一笔资源兑现后的更大机会', '近身威胁逼近'];
  }
  if (genreFocus === 'war-statecraft') {
    return ['战场或城门结果', '兵权或政令变化', '旧贵族/诸侯反扑的下一步'];
  }
  if (genreFocus === 'upgrade') {
    return ['突破后的更大机缘', '战场结果', '资源到手后的升级'];
  }
  if (activeTopicProfile?.preferredEndingFocus?.length) {
    return activeTopicProfile.preferredEndingFocus;
  }
  return [requiredPayoff.label, '下一步执行结果', '明确抉择'];
}

function buildAntiDelayRule(
  genreFocus: ChapterPromiseCard['genreFocus'],
  phase: ChapterPromiseCardPhase,
  activeTopicProfile?: TopicProfile,
): string {
  if (genreFocus === 'showbiz') {
    return phase === 'startup'
      ? '直播/试镜/热搜机会一旦出现，就必须尽快当章兑现，不能连续几章只写后台准备和倒计时。'
      : '已经立起的公开舞台必须尽快进入执行，禁止把同一场直播/录制/热搜拖成连续预热。';
  }
  if (genreFocus === 'food') {
    return phase === 'startup'
      ? '食物一出锅就要尽快写闻香、试吃、成交或口碑扩散，不能把首章长期停在挨饿、备料和苦情回忆。'
      : '一旦立起做吃食/做生意的机会，就要尽快给出成交、口碑或资源变化，不能一直只写准备。';
  }
  if (genreFocus === 'survival') {
    return phase === 'startup'
      ? '末日/生存冷启动章一旦拿到资源窗口，就必须当章写出兑换、到账、加固、补给或庇护所改善，不能只停在发现机会。'
      : '资源窗口出现后要尽快兑现成生存条件、武器、队友或据点优势，不能持续空转在计划阶段。';
  }
  if (genreFocus === 'war-statecraft') {
    return '军令、攻城、政令或贵族反扑一旦立起，就要尽快写出破城/收编/站队/制度落地的结果，不能连续转去找祭坛、拼钥匙、定坐标或开秘门。';
  }
  if (activeTopicProfile?.antiDelayRule) {
    return activeTopicProfile.antiDelayRule;
  }
  if (phase === 'startup') {
    return '一旦立起本章主场景，就要尽快给结果，不能把同一事件连续几章都写成准备阶段。';
  }
  return '先兑现，再解释；同一场关键事件不得长期停在预热和铺垫。';
}

function buildInformationBoundaryRule(genreFocus: ChapterPromiseCard['genreFocus'], activeTopicProfile?: TopicProfile): string {
  if (activeTopicProfile?.informationBoundaryRule) {
    return activeTopicProfile.informationBoundaryRule;
  }
  if (genreFocus === 'showbiz' || genreFocus === 'system') {
    return '若系统/预警此前只给出罪名、倒计时、风险级别这类标签级信息，正文不得直接扩写成完整黑料档案；更不能让系统播放“未来证据片段”来替代来源。金额、地址、公司、转账链等细节必须先有可见来源。';
  }
  if (genreFocus === 'war-statecraft') {
    return '神明、预言、遗迹和异常物只能驱动军政行动，不能升级成独立解谜系统；所有超常信息都必须落回兵权、城防、政令、盟约或战场代价。';
  }
  return '金手指、重生记忆、预知优势只能说到已建立的粒度，不能凭空升级成完整证据链或案卷。';
}

function buildConcessionRealityRule(phase: ChapterPromiseCardPhase): string {
  if (phase === 'startup') {
    return '对手即使被拿住，也只能局部让步；不要一场对话里无代价交出多项资源，收益必须伴随讲价、拖延、报复或新风险。';
  }
  return '对手的妥协必须保留阻力和后患，不能一句威胁就让其立刻送钱、送资源、全盘照做。';
}

function buildPublicBattleRule(
  genreFocus: ChapterPromiseCard['genreFocus'],
  phase: ChapterPromiseCardPhase,
  promiseSignals: string[],
): string | undefined {
  if (genreFocus !== 'showbiz') return undefined;
  if (phase !== 'startup' && !promiseSignals.includes('collapse-warning')) return undefined;
  return '娱乐圈冷启动章里，私下休息室谈判只能服务公开战场；直播、热搜、片场、定妆、镜头前反馈这些公开场面必须压过会客室交易戏。';
}

export function buildChapterPromiseCard(params: BuildChapterPromiseCardParams): ChapterPromiseCard {
  const source: ChapterPromiseCard['source'] = params.constitution ? 'constitution' : 'promise-contract';
  const phase = inferPhase(params.chapterNumber, params.totalPlannedChapters);
  const topicProfiles = inferTopicProfiles({
    novelTitle: params.novelTitle,
    genre: params.genre,
    promiseSignals: params.promiseContract.constitutionSignals,
    extraText: params.promiseContract.mainPromise,
  });
  const genreFocus = inferGenreFocus({
    novelTitle: params.novelTitle,
    genre: params.genre,
    promiseContract: params.promiseContract,
    topicProfiles,
  });
  const activeTopicProfile = topicProfiles.find(profile => profile.genreFocus === genreFocus) ?? topicProfiles[0];
  const mainPromise = params.constitution?.mainPromise ?? params.promiseContract.mainPromise;
  const promiseSignals = params.promiseContract.constitutionSignals ?? [];
  const basePayoffKeywords = pickKeywords(
    params.constitution?.keywords.payoffKeywords ?? params.promiseContract.requiredPayoffKeywords,
    8,
    DEFAULT_PAYOFF_KEYWORDS,
  );
  const baseSceneKeywords = pickKeywords(
    params.constitution?.keywords.sceneKeywords ?? params.promiseContract.requiredSceneKeywords,
    6,
    DEFAULT_SCENE_KEYWORDS,
  );
  const payoffKeywords = genreFocus === 'showbiz' && promiseSignals.includes('collapse-warning')
    ? pickKeywords(
        [
          '预警',
          '避雷',
          '截胡',
          '翻红',
          '爆红',
          '直播',
          '热搜',
          '资源反抢',
          ...(activeTopicProfile?.requiredPayoffKeywords ?? []),
          ...basePayoffKeywords,
        ],
        8,
        ['预警', '避雷', '截胡', '翻红', '直播', '热搜'],
      )
    : genreFocus === 'food'
    ? pickKeywords(
        [...FOOD_PRIORITY_PAYOFF_KEYWORDS, ...basePayoffKeywords],
        8,
        FOOD_PRIORITY_PAYOFF_KEYWORDS,
      )
    : genreFocus === 'war-statecraft'
      ? pickKeywords(
          [
            '攻城',
            '破城',
            '收编',
            '兵权',
            '军令',
            '军功爵',
            '废奴',
            '政令',
            '科举',
            '国子监',
            '旧贵族',
            '反扑',
            ...WAR_STATECRAFT_PAYOFF_KEYWORDS,
            ...basePayoffKeywords,
          ],
          10,
          WAR_STATECRAFT_PAYOFF_KEYWORDS,
        )
    : activeTopicProfile
      ? pickKeywords(
          [...activeTopicProfile.requiredPayoffKeywords, ...basePayoffKeywords],
          8,
          activeTopicProfile.requiredPayoffKeywords,
        )
      : basePayoffKeywords;
  const sceneKeywords = genreFocus === 'food'
    ? pickKeywords(
        [...FOOD_PRIORITY_SCENE_KEYWORDS, ...baseSceneKeywords],
        6,
        FOOD_PRIORITY_SCENE_KEYWORDS,
      )
    : genreFocus === 'war-statecraft'
      ? pickKeywords(
          [
            '战场',
            '城门',
            '军营',
            '城墙',
            '沙盘',
            '军令',
            '府衙',
            '朝堂',
            '国子监',
            '旧贵族',
            ...WAR_STATECRAFT_SCENE_KEYWORDS,
            ...baseSceneKeywords,
          ],
          8,
          WAR_STATECRAFT_SCENE_KEYWORDS,
        )
    : activeTopicProfile
      ? pickKeywords(
          [...activeTopicProfile.requiredSceneKeywords, ...baseSceneKeywords],
          6,
          activeTopicProfile.requiredSceneKeywords,
        )
      : baseSceneKeywords;
  const requiredPayoffKeywords = payoffKeywords.slice(0, Math.min(
    genreFocus === 'war-statecraft' ? 6 : 4,
    payoffKeywords.length,
  ));
  const optionalPayoffKeywords = payoffKeywords.slice(4, Math.min(8, payoffKeywords.length));
  const requiredSceneKeywords = genreFocus === 'showbiz'
    ? promiseSignals.includes('collapse-warning')
      ? pickKeywords(
          ['直播', '热搜', '录制现场', '试镜', '广告牌', ...sceneKeywords],
          4,
          ['直播', '热搜', '录制现场'],
        )
      : pickKeywords(
          ['试镜', '片场', '导演组', '节目组', '录制现场', '热搜', ...sceneKeywords],
          4,
          ['试镜', '片场', '导演组'],
        )
    : sceneKeywords.slice(0, Math.min(genreFocus === 'war-statecraft' ? 4 : 3, sceneKeywords.length));
  const suspenseKeywords = pickKeywords(
    params.constitution?.keywords.suspenseDriftKeywords ?? params.promiseContract.suspenseDriftKeywords,
    8,
    DEFAULT_FORBIDDEN_KEYWORDS,
  );
  const requiredPayoff: ChapterPromiseRequirement = {
    label: formatRequirementLabel(requiredPayoffKeywords, '题材主回报'),
    keywords: requiredPayoffKeywords,
  };
  const optionalPayoff = optionalPayoffKeywords.length > 0
    ? {
        label: formatRequirementLabel(optionalPayoffKeywords, '辅回报'),
        keywords: optionalPayoffKeywords,
      }
    : undefined;
  const requiredScene: ChapterPromiseRequirement = {
    label: formatRequirementLabel(requiredSceneKeywords, '题材主场景'),
    keywords: requiredSceneKeywords,
  };
  const forbiddenSubstitutions = buildForbiddenSubstitutions(suspenseKeywords, phase, genreFocus, promiseSignals, activeTopicProfile);
  const maxSuspenseShare = params.constitution?.keywords.maxSuspenseShare ?? params.promiseContract.maxSuspenseShare;
  const allowedHookTypes = inferAllowedHookTypes(maxSuspenseShare, phase);
  const preferredEndingFocus = buildPreferredEndingFocus(genreFocus, phase, requiredPayoff, promiseSignals, activeTopicProfile);
  const startupMustLandResult = phase === 'startup';
  const chapterMission = buildChapterMission({
    phase,
    chapterOutline: params.chapterOutline,
    mainPromise,
    payoffLabel: requiredPayoff.label,
    sceneLabel: requiredScene.label,
  });

  const summary = [
    '## 章节承诺卡（宪章驱动，优先级高于通用悬念）',
    `- 来源：${source === 'constitution' ? '小说宪章' : '题材承诺合同'}`,
    `- 当前阶段：${phase}`,
    topicProfiles.length > 0 ? `- 题材画像：${topicProfiles.map(profile => profile.id).join(' / ')}` : '',
    `- 本章主任务：${chapterMission}`,
    `- 必兑主回报：${requiredPayoff.label}（关键词：${requiredPayoff.keywords.join('、')}）`,
    optionalPayoff
      ? `- 可选辅回报：${optionalPayoff.label}（关键词：${optionalPayoff.keywords.join('、')}）`
      : '',
    `- 必到主场景：${requiredScene.label}（关键词：${requiredScene.keywords.join('、')}）`,
    `- 禁止替代：${forbiddenSubstitutions.map(item => item.label).join('；')}`,
    `- 允许章末钩子：${allowedHookTypes.join('、')}`,
    `- 章末优先收在：${preferredEndingFocus.join('、')}`,
    `- 禁止延迟兑现：${buildAntiDelayRule(genreFocus, phase, activeTopicProfile)}`,
    `- 信息边界：${buildInformationBoundaryRule(genreFocus, activeTopicProfile)}`,
    `- 对手让步真实性：${buildConcessionRealityRule(phase)}`,
    buildPublicBattleRule(genreFocus, phase, promiseSignals)
      ? `- 公开战场优先：${buildPublicBattleRule(genreFocus, phase, promiseSignals)}`
      : '',
    startupMustLandResult
      ? '- 冷启动硬约束：本章必须出现可见结果，不能只停在调查、计划、试探或解释。'
      : '- 中后段约束：先兑现结果，再补充解释，不得让信息型推进取代卖点。',
  ].filter(Boolean).join('\n');

  const gateSummary = [
    `主回报检测词：${requiredPayoff.keywords.join('、')}`,
    `主场景检测词：${requiredScene.keywords.join('、')}`,
    `禁止替代词：${forbiddenSubstitutions.flatMap(item => item.keywords).slice(0, 10).join('、')}`,
  ].join(' | ');

  return {
    source,
    chapterNumber: params.chapterNumber,
    phase,
    genreFocus,
    topicIds: topicProfiles.map(profile => profile.id),
    mainPromise,
    chapterMission,
    requiredPayoff,
    optionalPayoff,
    requiredScene,
    forbiddenSubstitutions,
    allowedHookTypes,
    preferredEndingFocus,
    startupMustLandResult,
    summary,
    gateSummary,
  };
}
