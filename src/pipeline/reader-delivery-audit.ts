import { inspectGeneratedTitle } from '../agents/title-generation-strategy.js';
import type { Chapter } from '../novel/types.js';
import {
  isCampusClubComedyLikeChapter,
  isFoodOrFarmingLikeChapter,
  isShameSystemLikeChapter,
  isSportsCompetitionLikeChapter,
  isSurvivalLikeChapter,
  isWarStatecraftLikeChapter,
  scoreCampusClubEndingHookFromText,
  scoreCampusClubOpeningFromText,
  scoreCampusClubPromisePayoffFromText,
  scoreFoodFarmingEndingHookFromText,
  scoreFoodFarmingOpeningFromText,
  scoreFoodFarmingPromisePayoffFromText,
  scoreShameSystemEndingHookFromText,
  scoreShameSystemOpeningFromText,
  scoreShameSystemPromisePayoffFromText,
  scoreSportsEndingHookFromText,
  scoreSportsOpeningFromText,
  scoreSportsPromisePayoffFromText,
  scoreSurvivalEndingHookFromText,
  scoreSurvivalOpeningFromText,
  scoreSurvivalPromisePayoffFromText,
  scoreWarStatecraftEndingHookFromText,
  scoreWarStatecraftOpeningFromText,
  scoreWarStatecraftPromisePayoffFromText,
} from './reader-delivery-topic-signals.js';
import {
  isShowbizLikeChapter,
  scoreShowbizEndingHookFromText,
  scoreShowbizOpeningFromText,
  scoreShowbizPromisePayoffFromText,
} from './reader-delivery-showbiz-signals.js';

export type ReaderDeliveryAudit = {
  score: number;
  passed: boolean;
  readerScore?: number;
  previousReaderScore?: number;
  issues: string[];
  suggestions: string[];
  dimensions: {
    title: number;
    opening: number;
    promisePayoff: number;
    readability: number;
    endingHook: number;
    publicSurface: number;
  };
};

const AUTHOR_META_RE = /作者|写这|写第|写.{0,12}那段|今天这章|这章写|我觉得|我比|我写|我自己|我本来写|我一开始写|我那时候|我第一次|我问|我家|我才知道|我见过|我去|我再也没|我一直记着|小时候我|要是我|比我|我得去|反复想象|现实里|原型|实不相瞒|别问我为什么|写[\u4e00-\u9fa5]{0,8}文|不能剧透|不剧透|(?<!检)查了|脑补|读者朋友|追更|追读|后台问|谢谢.*你们|纪录员|敬上/u;
const AUTHOR_NOTE_MAX_CHARS = 420;
const AUTHOR_NOTE_MAX_PARAGRAPHS = 5;
const OPENING_GOAL_RE = /今日|今天|明日|目标|赌约|二十碗|三十碗|必须|得先|得把|要把|要卖|卖够|保住|试摆|开摊|摆摊|押碗|预订|成交|得分|助攻|防住|签约|复购|排队|站队/u;
const OPENING_OBSTACLE_RE = /但是|却|可偏偏|不够|没了|没钱|堵|拦|挡|挤|压|抢|断了|瓶颈|限制|施压|不让|麻烦|危机|落后|犯规|受伤|失误/u;
const OPENING_FEEDBACK_RE = /铜板|押金|净利|收入|排队|复购|成交|站队|接过|端走|空碗|喝完|吃完|点头|退让|赢下|得分|助攻|防住|签下/u;
const OPENING_ACTION_RE = /蹲|站|摸|掏|倒|添|拨|端|拍|推|拉|拦|堵|揉|捞|浇|撒|冲|跑|投|传|断|签|递|接|问|说|喊|看/u;
const ENDING_HOOK_RE = /明日|明天|下一|三十碗|还差|不够|够不够|怎么办|突然|竟|却|不能|必须|得|新|来人|换个位置|赌约|追问|转身|回头|沉默|盯着/u;
const ROMANCE_SIGNAL_RE = /恋爱|言情|同居|死对头|牵手|心动|暧昧|厨房|沙发|拖鞋|红糖水|胃疼|锁骨|马场|直播|品牌方|Lisa/u;
const ROMANCE_OPENING_SCENE_RE = /凌晨|厨房|冰箱|客厅|沙发|卧室|水杯|牛奶|拖鞋|红糖|门把/u;
const ROMANCE_OPENING_TENSION_RE = /你管我|我不管你|死对头|梦到|胃疼|锁骨|骑马|直播|逞强|看穿|同时开口|沉默/u;
const ROMANCE_OPENING_FEEDBACK_RE = /笑|低笑|顿住|停了一下|没说话|呼吸|换手|放在.{0,8}脚边|记得|红糖|拖鞋/u;
const ROMANCE_ENDING_HOOK_RE = /明天|明早|牵手|同居|直播|马场|障碍区|临时加|品牌方|已同步|要一起|同床|见家长|约会|吻|抱|心跳/u;
const ROMANCE_PAYOFF_RELATION_RE = /牵手|心跳|关心|护短|偏爱|吃醋|嘴硬|记得|旧伤|锁骨|吊饰|拖鞋|红糖|安全带|靠近|放软|手抖|收紧|松开/u;
const ROMANCE_PAYOFF_PRESSURE_RE = /同居|合同|直播|品牌方|马场|障碍区|已同步|还有.{0,8}分钟|必须牵手|要一起/u;
const ROMANCE_PAYOFF_REACTION_RE = /笑|低笑|沉默|顿住|停了一瞬|没回答|没看我|呼吸|脸热|不敢|愣|声音.{0,10}软/u;
const ENGINEERING_SIGNAL_RE = /科幻|工程|维修|检修|气闸|氧压|氧分压|催化单元|散热面板|读数|参数|校准|传感器|模块|配电柜|纹波|阀|泵|工单|分析仪|CRC|接地|阻抗|报警/u;
const WORKPLACE_SIGNAL_RE = /职场|事业线|项目交付|客户|验收|会议室|工程部|供应商|合同|预算|方案|复测|站队|样板间/u;
const SCIFI_ENGINEERING_STRONG_RE = /科幻|硬科幻|星环|太空|空间站|气闸|氧压|氧分压|催化单元|散热面板|推进模块|备用电池|维修臂|传感器|配电柜|纹波|阀|泵|分析仪|CRC|接地|阻抗|报警/u;
const ENGINEERING_WEAK_TAIL_RE = /迟早|只是时间问题|建议[:：]|普查|等待确认|确认(?:来源|签名|身份|操作者|时间链)|来源|到底是什么|日志签名|HUD缓存|文件名|时间链|能调原文/u;
const ENGINEERING_CLUE_OPENING_RE = /^(?:[\s\S]{0,320})?(?:HUD缓存|文件图标|启动日志|日志签名|文件名|时间戳|波形|时间链|来源|信号源|确认(?:来源|签名|身份|操作者|时间链))/u;
const ENGINEERING_ACTIVE_TAIL_RE = /报警|锁死|失压|压降|红灯|黄灯|指示灯(?:跳变|异常|变红|变黄)|氧压(?:回落|下降|异常)|读数(?:跳变|归零|异常)|参数(?:漂移|异常)|备用电池(?:压降|异常|报警)|模块(?:锁死|报警|离线|异常)|传感器(?:错误|失效|异常)|工单(?:弹出|转入|升级)|倒计时|必须|立刻|马上/u;
const ENGINEERING_CLUE_TAIL_RE = /HUD缓存|文件名|启动日志|日志(?:完整版|签名|来源)|信号源|波形片段|签名|时间戳|时间链|确认(?:来源|签名|身份|操作者|时间链)|来源/u;
const ENGINEERING_DEVICE_PRESSURE_TAIL_RE = /报警|锁死|失压|泄漏|微泄漏|压降|红灯|黄灯|指示灯(?:跳变|异常|变红|变黄|从黄灯.{0,12}红)|压力(?:波动|超标|回落|下降|异常)|氧压(?:回落|下降|异常)|读数(?:跳变|归零|异常)|备用电池(?:压降|异常|报警)|阀(?:门)?(?:卡死|锁死|异常)|泵(?:组)?(?:停机|过热|异常)|模块(?:锁死|报警|离线|异常)|传感器(?:错误|失效|异常)|轴承(?:报警|异常|更换|磨损|疲劳)|振动(?:异常|读数|频谱|加速度)|频谱(?:异常|重叠)|垫圈(?:错配|错误|异常)|阀杆(?:变形|偏心|卡滞)|执行器(?:异常|试切|卡滞)|万用表|工单(?:弹出|转入|升级)|倒计时|必须(?:立刻|马上)?(?:更换|复位|拆|修)/u;
const WORKPLACE_PAYOFF_RE = /验收(?:口径|清单|确认)|复测时间表|结构确认单|现场照片|方案拆解|责任分配|替代供应商|供应商资质|预算责任|签约|签字|站队|公开会议|客户追加|首期300万|300万|样板间/u;
const WORKPLACE_RESULT_RE = /确认|签字|签下|通过|驳回|划掉|接过|站起来|开口|支持|定下来|交出|发你|押后|延期|负责|收吧|拿到|给出/u;
const WORKPLACE_ENDING_HOOK_RE = /今晚|8点|七点|限时|签约押后|押后签约|首期300万|300万签约|客户追加|追加要求|替代供应商|供应商名单|预算责任|资质(?:暂停|核验|结果)|供货周期|出图|复测时间表|能不能|是否/u;

const CAMPUS_CLUB_SIGNAL_RE = /校园|社团|招新|活动室|校报|老师|同学|室友|展示|报名|登记|社长|模型社|手作/u;
const COURT_POWER_SIGNAL_RE = /朝堂|女帝|皇帝|陛下|殿前|门阀|府衙|诏|密诏|兵权|军权|戍卫|换防|将军|叛将|廷议|朝臣|爵位|封赏|削爵|问罪/u;
const COURT_POWER_CLUE_RE = /证据|账册|密信|旧案|暗号|铁匣|数字|草籽|卷轴|香灰|陶片|蜡封|纸角|坐标|路线|来源|布网|是谁|从哪/u;
const COURT_POWER_RESULT_RE = /站队|削权|换防|封赏|问罪|押人|押解|军令|廷议|公开期限|限期|兵权|军权|戍卫|府衙|朝臣|门阀表态|女帝下令|陛下下令|当场表态|改变态度/u;

const FRONTIER_BUILDING_SIGNAL_RE = /\u70ad|\u5751|\u9aa8|\u84c4\u6c34|\u5c71\u9b48|\u7070\u72ac|\u6d1e|\u65cf|\u7ad6\u4e95|\u706b\u628a/u;
const FRONTIER_BUILDING_ENDING_RE = /\u4e95\u53e3|\u53f0\u9636|\u7ad6\u4e95|\u5730\u4e0b|\u6697\u91d1|\u5c71\u9b48|\u7070\u72ac|\u706b\u628a|\u9ed1\u6697|\u5165\u53e3|\u5730\u8109|\u7eb9\u8def|\u8e29\u4e0b|\u63a8\u5f00|\u58f0\u97f3/u;
const FRONTIER_BUILDING_PAYOFF_RE = /\u6559|\u6559\u4f1a|\u5b66\u4f1a|\u70ad\u706b|\u70ad\u5751|\u9676\u7f50|\u9676\u7897|\u7076\u53f0|\u716e\u6c64|\u5206\u6c64|\u8089\u6c64|\u996e\u98df|\u51c0\u6c34|\u84c4\u6c34|\u56f4\u680f|\u6728\u6746|\u63a2\u8def|\u5de5\u5177|\u5206\u5de5|\u5b88\u6d1e|\u90e8\u843d|\u5b69\u5b50|\u8001\u65cf\u957f|\u864e\u7259|\u963f\u9aa8/u;
const FRONTIER_BUILDING_RESULT_RE = /\u7a33\u5b9a|\u505a\u6210|\u716e\u597d|\u716e\u5f97|\u559d\u4e86|\u63a5\u4f4f|\u518d\u6765\u4e00\u7897|\u7b11\u4e86|\u4e3b\u52a8|\u7ad9\u8d77\u6765|\u660e\u5929|\u5929\u4eae\u524d|\u5b88|\u8ddf\u6211\u53bb|\u7559\u5b88|\u6210\u679c|\u5347\u7ea7|\u63d0\u5347|\u589e\u5f3a/u;
const FRONTIER_BUILDING_CLUE_RE = /\u9aa8\u7247|\u51f9\u75d5|\u5370\u8bb0|\u7ebf\u7d22|\u6bdb\u53d1|\u6293\u75d5|\u672a\u77e5|\u7ad6\u4e95|\u5730\u4e0b|\u8c1c|\u773c\u7751|\u4e91\u5c42|\u6697\u91d1|\u5c71\u9b48|\u7070\u72ac/u;

const DIMENSION_FLOORS = {
  title: 72,
  opening: 80,
  promisePayoff: 76,
  readability: 74,
  endingHook: 80,
  publicSurface: 80,
} satisfies ReaderDeliveryAudit['dimensions'];

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function isEngineeringLikeChapter(chapter: Chapter): boolean {
  const text = [
    chapter.title,
    chapter.summary,
    chapter.content.slice(0, 1200),
    chapter.content.slice(-900),
  ].join('\n');
  if (/工程部/u.test(text) && WORKPLACE_SIGNAL_RE.test(text) && !SCIFI_ENGINEERING_STRONG_RE.test(text)) return false;
  if (WORKPLACE_SIGNAL_RE.test(text) && !SCIFI_ENGINEERING_STRONG_RE.test(text)) return false;
  return ENGINEERING_SIGNAL_RE.test(text) && SCIFI_ENGINEERING_STRONG_RE.test(text);
}

function isWorkplaceLikeChapter(chapter: Chapter): boolean {
  const text = [
    chapter.title,
    chapter.summary,
    chapter.content.slice(0, 1400),
    chapter.content.slice(-900),
  ].join('\n');
  return WORKPLACE_SIGNAL_RE.test(text) && !isEngineeringLikeChapter(chapter);
}

function isCampusClubLikeChapter(chapter: Chapter): boolean {
  const text = [
    chapter.title,
    chapter.summary,
    chapter.content.slice(0, 1400),
    chapter.content.slice(-900),
  ].join('\n');
  return CAMPUS_CLUB_SIGNAL_RE.test(text) && !isWorkplaceLikeChapter(chapter);
}

function isCourtPowerLikeChapter(chapter: Chapter): boolean {
  return COURT_POWER_SIGNAL_RE.test([
    chapter.title,
    chapter.summary,
    chapter.content.slice(0, 1400),
    chapter.content.slice(-900),
  ].join('\n'));
}

function getCourtPowerDeliveryStats(content: string): {
  clueHits: number;
  resultHits: number;
  clueDominant: boolean;
  clueTail: boolean;
} {
  const clueHits = countPatternMatches(content.slice(0, 5200), COURT_POWER_CLUE_RE);
  const resultHits = countPatternMatches(content.slice(0, 5200), COURT_POWER_RESULT_RE);
  const tail = content.slice(Math.max(0, content.length - 900));
  const clueTailIndex = lastMatchIndex(tail, COURT_POWER_CLUE_RE);
  const resultTailIndex = lastMatchIndex(tail, COURT_POWER_RESULT_RE);
  return {
    clueHits,
    resultHits,
    clueDominant: clueHits >= Math.max(6, resultHits * 2 + 4),
    clueTail: clueTailIndex >= 0 && clueTailIndex > resultTailIndex,
  };
}

function isFrontierBuildingLikeChapter(chapter: Chapter): boolean {
  return FRONTIER_BUILDING_SIGNAL_RE.test([
    chapter.title,
    chapter.summary,
    chapter.content.slice(0, 1400),
    chapter.content.slice(-900),
  ].join('\n'));
}

function hasWeakEngineeringTail(chapter: Chapter): boolean {
  if (!isEngineeringLikeChapter(chapter)) return false;
  const tail = chapter.content.slice(-420);
  const clueIndex = lastMatchIndex(tail, ENGINEERING_CLUE_TAIL_RE);
  const devicePressureIndex = lastMatchIndex(tail, ENGINEERING_DEVICE_PRESSURE_TAIL_RE);
  return ENGINEERING_WEAK_TAIL_RE.test(tail) || (clueIndex >= 0 && clueIndex > devicePressureIndex);
}

function hasClueOnlyEngineeringTail(chapter: Chapter): boolean {
  if (!isEngineeringLikeChapter(chapter)) return false;
  const tail = chapter.content.slice(-420);
  const clueIndex = lastMatchIndex(tail, ENGINEERING_CLUE_TAIL_RE);
  const devicePressureIndex = lastMatchIndex(tail, ENGINEERING_DEVICE_PRESSURE_TAIL_RE);
  return clueIndex >= 0 && clueIndex > devicePressureIndex;
}

function hasEngineeringDevicePressureTail(chapter: Chapter): boolean {
  if (!isEngineeringLikeChapter(chapter)) return false;
  const tail = chapter.content.slice(-700);
  return ENGINEERING_DEVICE_PRESSURE_TAIL_RE.test(tail);
}

function lastMatchIndex(text: string, pattern: RegExp): number {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const globalPattern = new RegExp(pattern.source, flags);
  let lastIndex = -1;
  let match: RegExpExecArray | null;
  while ((match = globalPattern.exec(text)) !== null) {
    lastIndex = match.index;
    if (match[0].length === 0) globalPattern.lastIndex += 1;
  }
  return lastIndex;
}

function hasClueFirstEngineeringOpening(chapter: Chapter): boolean {
  if (!isEngineeringLikeChapter(chapter)) return false;
  const opening = chapter.content.slice(0, 900);
  const clueIndex = opening.search(ENGINEERING_CLUE_OPENING_RE);
  if (clueIndex < 0) return false;
  const devicePressureIndex = opening.search(ENGINEERING_DEVICE_PRESSURE_TAIL_RE);
  return devicePressureIndex < 0 || clueIndex < devicePressureIndex;
}

function scoreEngineeringOpeningFromText(content: string): number {
  const openingWindow = content.slice(0, 1100);
  const hasDeviceState = /报警|警报|读数|参数|氧压|氧分压|温度|绝缘电阻|振动|震动|加速度|频谱|轴承|阀|泵|模块|传感器/u.test(openingWindow);
  const hasOperation = /蹲|拆|拔|旋下|更换|复位|校准|测|摸|取出|拉开工具箱|万用表|螺丝刀/u.test(openingWindow);
  const hasTarget = /需要|必须|目标|预计|更换|恢复|降到|回到|标准值|安全区/u.test(openingWindow);
  const hasObstacle = /异常|下降|升高|跳|卡|裂|泄漏|疲劳|断裂|超标|低于|高于/u.test(openingWindow);
  return clamp(54
    + (hasDeviceState ? 14 : 0)
    + (hasOperation ? 12 : 0)
    + (hasTarget ? 10 : 0)
    + (hasObstacle ? 10 : 0));
}

function isRomanceLikeChapter(chapter: Chapter): boolean {
  return ROMANCE_SIGNAL_RE.test([
    chapter.title,
    chapter.summary,
    chapter.content.slice(0, 1200),
    chapter.content.slice(-900),
  ].join('\n'));
}

function scoreRomanceOpeningFromText(content: string): number {
  const firstWindow = content.slice(0, 1100);
  const hasScene = ROMANCE_OPENING_SCENE_RE.test(firstWindow);
  const hasDialogue = /[“"「『][^”"」』\n]{2,120}[”"」』]/u.test(firstWindow);
  const hasTension = ROMANCE_OPENING_TENSION_RE.test(firstWindow);
  const hasFeedback = ROMANCE_OPENING_FEEDBACK_RE.test(firstWindow);
  return clamp(54
    + (hasScene ? 10 : 0)
    + (hasDialogue ? 10 : 0)
    + (hasTension ? 14 : 0)
    + (hasFeedback ? 12 : 0));
}

function hasRomanceOpeningDelivery(content: string): boolean {
  return scoreRomanceOpeningFromText(content) >= DIMENSION_FLOORS.opening;
}

function scoreOpeningFromText(content: string): number {
  const firstScreen = content.slice(0, 360);
  const firstWindow = content.slice(0, 1000);
  const hasAction = OPENING_ACTION_RE.test(firstScreen);
  const hasDialogue = /[“"「『][^”"」』\n]{2,120}[”"」』]/u.test(firstWindow);
  const hasGoal = OPENING_GOAL_RE.test(firstWindow);
  const hasObstacle = OPENING_OBSTACLE_RE.test(firstWindow);
  const hasFeedback = OPENING_FEEDBACK_RE.test(firstWindow);
  return clamp(48
    + (hasAction || hasDialogue ? 14 : 0)
    + (hasGoal ? 14 : 0)
    + (hasObstacle ? 14 : 0)
    + (hasFeedback ? 10 : 0));
}

function scoreEndingHookFromText(content: string): number {
  const endingWindow = content.slice(Math.max(0, content.length - 360));
  const hasHook = ENDING_HOOK_RE.test(endingWindow);
  const hasOpenQuestion = /[？?！!]/u.test(endingWindow);
  const hasNextPressure = /明日|明天|下一|三十碗|不够|必须|得|新|换个位置|来人/u.test(endingWindow);
  return clamp(52 + (hasHook ? 16 : 0) + (hasOpenQuestion ? 6 : 0) + (hasNextPressure ? 18 : 0));
}

function scoreRomanceEndingHookFromText(content: string): number {
  const endingWindow = content.slice(Math.max(0, content.length - 700));
  const hasRelationshipHook = ROMANCE_ENDING_HOOK_RE.test(endingWindow);
  const hasMessageOrDialogue = /消息|发来|回了|[“"「『][^”"」』\n]{2,120}[”"」』]/u.test(endingWindow);
  const hasReaction = /心跳|停在|扣在|翻过来|收紧|没脱|脸热|笑|沉默|不敢|愣/u.test(endingWindow);
  return clamp(52
    + (hasRelationshipHook ? 22 : 0)
    + (hasMessageOrDialogue ? 8 : 0)
    + (hasReaction ? 12 : 0));
}

function scoreFrontierBuildingEndingHookFromText(content: string): number {
  const endingWindow = content.slice(Math.max(0, content.length - 700));
  const hasFrontierHook = FRONTIER_BUILDING_ENDING_RE.test(endingWindow);
  const hasDialogue = /[\u201c\u201d\u300c\u300d][^\u201c\u201d\u300c\u300d\n]{2,120}[\u201c\u201d\u300c\u300d]/u.test(endingWindow);
  const hasActionCommitment = /\u8e29\u4e0b|\u63a8\u5f00|\u4f38\u8fdb|\u63e1\u7d27|\u8d70\u8fdb|\u4e0b\u53bb|\u56de\u6765/u.test(endingWindow);
  return clamp(54
    + (hasFrontierHook ? 20 : 0)
    + (hasDialogue ? 6 : 0)
    + (hasActionCommitment ? 18 : 0));
}

function scoreFrontierBuildingPromisePayoffFromText(content: string): number {
  const payoffWindow = content.slice(0, 4200);
  const payoffHits = countPatternMatches(payoffWindow, FRONTIER_BUILDING_PAYOFF_RE);
  const resultHits = countPatternMatches(payoffWindow, FRONTIER_BUILDING_RESULT_RE);
  const clueHits = countPatternMatches(payoffWindow, FRONTIER_BUILDING_CLUE_RE);
  const resultScore = Math.min(resultHits * 6, 24);
  const payoffScore = Math.min(payoffHits * 3, 24);
  const cluePenalty = clueHits > payoffHits + resultHits ? 14 : 0;
  return clamp(50 + payoffScore + resultScore - cluePenalty);
}

function countPatternMatches(text: string, pattern: RegExp): number {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const globalPattern = new RegExp(pattern.source, flags);
  let count = 0;
  let match: RegExpExecArray | null;
  while ((match = globalPattern.exec(text)) !== null) {
    count += 1;
    if (match[0].length === 0) globalPattern.lastIndex += 1;
  }
  return count;
}

function scoreEngineeringEndingHookFromText(content: string): number {
  const endingWindow = content.slice(Math.max(0, content.length - 700));
  const hasDevicePressure = ENGINEERING_DEVICE_PRESSURE_TAIL_RE.test(endingWindow);
  const hasImmediateAction = /蹲|取出|拿着|拆|更换|复位|校准|测|走去|朝|转入|弹出|报警|必须|立刻|马上/u.test(endingWindow);
  const hasHumanOrSystemPressure = /调度|班长|老孙|小刘|工单|隔音门|敲击声|试切|交接|系统/u.test(endingWindow);
  return clamp(54
    + (hasDevicePressure ? 24 : 0)
    + (hasImmediateAction ? 12 : 0)
    + (hasHumanOrSystemPressure ? 8 : 0));
}

function scoreRomancePromisePayoffFromText(content: string): number {
  const payoffWindow = content.slice(0, 4200);
  const hasRelationPayoff = ROMANCE_PAYOFF_RELATION_RE.test(payoffWindow);
  const hasSharedPressure = ROMANCE_PAYOFF_PRESSURE_RE.test(payoffWindow);
  const hasReaction = ROMANCE_PAYOFF_REACTION_RE.test(payoffWindow);
  const hasDialogue = /[“"「『][^”"」』\n]{2,120}[”"」』]/u.test(payoffWindow);
  return clamp(52
    + (hasRelationPayoff ? 20 : 0)
    + (hasSharedPressure ? 16 : 0)
    + (hasReaction ? 12 : 0)
    + (hasDialogue ? 8 : 0));
}

function scoreWorkplacePromisePayoffFromText(content: string): number {
  const payoffWindow = content.slice(0, 4200);
  const payoffHits = countPatternMatches(payoffWindow, WORKPLACE_PAYOFF_RE);
  const resultHits = countPatternMatches(payoffWindow, WORKPLACE_RESULT_RE);
  const hasPublicPressure = /客户|刘总|周维|赵宏|小陈|小李|王总/u.test(payoffWindow);
  const hasBusinessStakes = /300万|签约|押后|预算|责任|供应商|资质|复测时间表/u.test(payoffWindow);
  return clamp(48
    + Math.min(payoffHits * 4, 24)
    + Math.min(resultHits * 3, 18)
    + (hasPublicPressure ? 8 : 0)
    + (hasBusinessStakes ? 10 : 0));
}

function scoreWorkplaceEndingHookFromText(content: string): number {
  const endingWindow = content.slice(Math.max(0, content.length - 900));
  const hasBusinessHook = WORKPLACE_ENDING_HOOK_RE.test(endingWindow);
  const hasDecisionPressure = /必须|否则|如果|能不能|是否|要不要|今晚|限时|押后|延期|责任|替代|核验/u.test(endingWindow);
  const hasHumanPressure = /客户|刘总|周维|赵宏|小陈|小李|王总|老孙/u.test(endingWindow);
  return clamp(52
    + (hasBusinessHook ? 22 : 0)
    + (hasDecisionPressure ? 12 : 0)
    + (hasHumanPressure ? 8 : 0));
}

function isStaleTopicPayoffDiagnostic(text: string): boolean {
  return /题材(?:主)?回报缺失|题材回报关键词没有落地|主场景转成可见结果/u.test(text);
}

export function auditReaderDelivery(params: {
  chapter: Chapter;
  previousChapter?: Chapter | null;
}): ReaderDeliveryAudit {
  const { chapter, previousChapter } = params;
  const diagnostics = chapter.diagnostics;
  const startup = diagnostics?.startupOpeningReport;
  const readability = diagnostics?.readabilityAudit;
  const qualityGate = diagnostics?.qualityGate;
  const titleInspection = inspectGeneratedTitle(chapter.title || '');
  const latestAuthorNote = chapter.authorNotes?.at(-1) ?? '';

  const issues: string[] = [];
  const suggestions: string[] = [];
  const readerScore = chapter.readerScore;
  const previousReaderScore = previousChapter?.readerScore;
  const readerDelta = typeof readerScore === 'number' && typeof previousReaderScore === 'number'
    ? round(readerScore - previousReaderScore)
    : undefined;
  const previousReaderDelta = previousChapter?.diagnostics?.readerDeliveryAudit
    && typeof previousChapter.diagnostics.readerDeliveryAudit.readerScore === 'number'
    && typeof previousChapter.diagnostics.readerDeliveryAudit.previousReaderScore === 'number'
    ? round(previousChapter.diagnostics.readerDeliveryAudit.readerScore - previousChapter.diagnostics.readerDeliveryAudit.previousReaderScore)
    : undefined;

  let titleScore = titleInspection.mechanical ? 62 : 88;
  if (titleInspection.mechanical) {
    issues.push(`标题交付偏弱：${titleInspection.reasons.join('、')}。`);
    suggestions.push('下一章标题必须像章节名，不要像剧情摘要、任务说明或营销小标题。');
  }

  const showbizLike = isShowbizLikeChapter(chapter);
  const romanceLike = isRomanceLikeChapter(chapter);
  const foodFarmingLike = isFoodOrFarmingLikeChapter(chapter);
  const survivalLike = isSurvivalLikeChapter(chapter);
  const shameSystemLike = isShameSystemLikeChapter(chapter);
  const sportsCompetitionLike = isSportsCompetitionLikeChapter(chapter);
  const campusClubComedyLike = isCampusClubComedyLikeChapter(chapter);
  const warStatecraftLike = isWarStatecraftLikeChapter(chapter);

  let openingScore = startup?.overallScore ?? scoreOpeningFromText(chapter.content);
  const showbizOpeningScore = showbizLike
    ? scoreShowbizOpeningFromText(chapter.content)
    : 0;
  const showbizOpeningPassed = showbizOpeningScore >= DIMENSION_FLOORS.opening;
  const romanceOpeningPassed = romanceLike && hasRomanceOpeningDelivery(chapter.content);
  const foodFarmingOpeningScore = foodFarmingLike
    ? scoreFoodFarmingOpeningFromText(chapter.content)
    : 0;
  const foodFarmingOpeningPassed = foodFarmingOpeningScore >= DIMENSION_FLOORS.opening;
  const survivalOpeningScore = survivalLike
    ? scoreSurvivalOpeningFromText(chapter.content)
    : 0;
  const survivalOpeningPassed = survivalOpeningScore >= DIMENSION_FLOORS.opening;
  const shameSystemOpeningScore = shameSystemLike
    ? scoreShameSystemOpeningFromText(chapter.content)
    : 0;
  const shameSystemOpeningPassed = shameSystemOpeningScore >= DIMENSION_FLOORS.opening;
  const sportsOpeningScore = sportsCompetitionLike
    ? scoreSportsOpeningFromText(chapter.content)
    : 0;
  const sportsOpeningPassed = sportsOpeningScore >= DIMENSION_FLOORS.opening;
  const campusClubOpeningScore = campusClubComedyLike
    ? scoreCampusClubOpeningFromText(chapter.content)
    : 0;
  const campusClubOpeningPassed = campusClubOpeningScore >= DIMENSION_FLOORS.opening;
  const warStatecraftOpeningScore = warStatecraftLike
    ? scoreWarStatecraftOpeningFromText(chapter.content)
    : 0;
  const warStatecraftOpeningPassed = warStatecraftOpeningScore >= DIMENSION_FLOORS.opening;
  const topicOpeningPassed = showbizOpeningPassed
    || romanceOpeningPassed
    || foodFarmingOpeningPassed
    || survivalOpeningPassed
    || shameSystemOpeningPassed
    || sportsOpeningPassed
    || campusClubOpeningPassed
    || warStatecraftOpeningPassed;
  if (showbizLike && showbizOpeningPassed) {
    openingScore = Math.max(openingScore, showbizOpeningScore);
  } else if (showbizLike) {
    openingScore = Math.min(openingScore, showbizOpeningScore);
  }
  if (romanceLike) {
    openingScore = Math.max(openingScore, scoreRomanceOpeningFromText(chapter.content));
  }
  if (foodFarmingLike) {
    openingScore = Math.max(openingScore, foodFarmingOpeningScore);
  }
  if (survivalLike) {
    openingScore = Math.max(openingScore, survivalOpeningScore);
  }
  if (shameSystemLike) {
    openingScore = Math.max(openingScore, shameSystemOpeningScore);
  }
  if (sportsCompetitionLike) {
    openingScore = Math.max(openingScore, sportsOpeningScore);
  }
  if (campusClubComedyLike) {
    openingScore = Math.max(openingScore, campusClubOpeningScore);
  }
  if (warStatecraftLike) {
    openingScore = Math.max(openingScore, warStatecraftOpeningScore);
  }
  if (isEngineeringLikeChapter(chapter)) {
    openingScore = Math.max(openingScore, scoreEngineeringOpeningFromText(chapter.content));
  }
  if (startup?.findings?.length) {
    const hardOpeningFindings = startup.findings.filter(finding =>
      ['weak-first-screen', 'unclear-goal', 'unclear-obstacle', 'weak-early-payoff'].includes(finding.code),
    );
    if (hardOpeningFindings.length > 0 && !topicOpeningPassed) {
      issues.push(...hardOpeningFindings.slice(0, 2).map(finding => `开篇交付不足：${finding.message}`));
      suggestions.push('下一章前 1000 字必须让读者看清目标、阻碍和第一次可见反馈。');
    }
  }
  if (showbizLike && showbizOpeningScore < DIMENSION_FLOORS.opening) {
    issues.push('娱乐圈开篇交付不足：试镜、直播、热搜或片场目标没有遇到足够明确的行业阻碍和即时反馈。');
    suggestions.push('娱乐圈开篇前 1000 字必须写清被换角、黑热搜、撤资源、对家抢位、品牌观望或导演组质疑，并给一次可见反馈。');
  }
  if (hasClueFirstEngineeringOpening(chapter)) {
    openingScore -= 18;
    issues.push('工程开篇偏虚：第一屏先接 HUD/日志/文件线索，设备现场压力进入太晚。');
    suggestions.push('下一章第一句必须是设备状态、报警读数或物理拆修动作，不能先写 HUD 文件、日志、时间戳、信号源或缓存消息。');
  }

  const promiseDrift = readability?.genreDrift?.promiseDrift ?? startup?.promiseDrift;
  let promisePayoffScore = 82;
  const showbizPayoffScore = showbizLike
    ? scoreShowbizPromisePayoffFromText(chapter.content)
    : 0;
  const showbizPayoffPassed = showbizPayoffScore >= DIMENSION_FLOORS.promisePayoff;
  const romancePayoffScore = romanceLike
    ? scoreRomancePromisePayoffFromText(chapter.content)
    : 0;
  const romancePayoffPassed = romancePayoffScore >= DIMENSION_FLOORS.promisePayoff;
  const frontierBuildingPayoffScore = isFrontierBuildingLikeChapter(chapter)
    ? scoreFrontierBuildingPromisePayoffFromText(chapter.content)
    : 0;
  const frontierBuildingPayoffPassed = frontierBuildingPayoffScore >= DIMENSION_FLOORS.promisePayoff;
  const workplacePayoffScore = isWorkplaceLikeChapter(chapter)
    ? scoreWorkplacePromisePayoffFromText(chapter.content)
    : 0;
  const workplacePayoffPassed = workplacePayoffScore >= DIMENSION_FLOORS.promisePayoff;
  const foodFarmingPayoffScore = foodFarmingLike
    ? scoreFoodFarmingPromisePayoffFromText(chapter.content)
    : 0;
  const foodFarmingPayoffPassed = foodFarmingPayoffScore >= DIMENSION_FLOORS.promisePayoff;
  const survivalPayoffScore = survivalLike
    ? scoreSurvivalPromisePayoffFromText(chapter.content)
    : 0;
  const survivalPayoffPassed = survivalPayoffScore >= DIMENSION_FLOORS.promisePayoff;
  const shameSystemPayoffScore = shameSystemLike
    ? scoreShameSystemPromisePayoffFromText(chapter.content)
    : 0;
  const shameSystemPayoffPassed = shameSystemPayoffScore >= DIMENSION_FLOORS.promisePayoff;
  const sportsPayoffScore = sportsCompetitionLike
    ? scoreSportsPromisePayoffFromText(chapter.content)
    : 0;
  const sportsPayoffPassed = sportsPayoffScore >= DIMENSION_FLOORS.promisePayoff;
  const campusClubPayoffScore = campusClubComedyLike
    ? scoreCampusClubPromisePayoffFromText(chapter.content)
    : 0;
  const campusClubPayoffPassed = campusClubPayoffScore >= DIMENSION_FLOORS.promisePayoff;
  const warStatecraftPayoffScore = warStatecraftLike
    ? scoreWarStatecraftPromisePayoffFromText(chapter.content)
    : 0;
  const warStatecraftPayoffPassed = warStatecraftPayoffScore >= DIMENSION_FLOORS.promisePayoff;
  const topicPayoffPassed = showbizPayoffPassed
    || romancePayoffPassed
    || frontierBuildingPayoffPassed
    || workplacePayoffPassed
    || foodFarmingPayoffPassed
    || survivalPayoffPassed
    || shameSystemPayoffPassed
    || sportsPayoffPassed
    || campusClubPayoffPassed
    || warStatecraftPayoffPassed;
  if (promiseDrift?.active) {
    promisePayoffScore = clamp(58 + Math.min(promiseDrift.promiseHits * 3, 18) + Math.min(promiseDrift.sceneHits * 1.2, 18));
    if (showbizPayoffPassed) {
      promisePayoffScore = Math.max(promisePayoffScore, showbizPayoffScore);
    }
    if (romancePayoffPassed) {
      promisePayoffScore = Math.max(promisePayoffScore, romancePayoffScore);
    }
    if (frontierBuildingPayoffPassed) {
      promisePayoffScore = Math.max(promisePayoffScore, frontierBuildingPayoffScore);
    }
    if (workplacePayoffPassed) {
      promisePayoffScore = Math.max(promisePayoffScore, workplacePayoffScore);
    }
    if (foodFarmingPayoffPassed) {
      promisePayoffScore = Math.max(promisePayoffScore, foodFarmingPayoffScore);
    }
    if (survivalPayoffPassed) {
      promisePayoffScore = Math.max(promisePayoffScore, survivalPayoffScore);
    }
    if (shameSystemPayoffPassed) {
      promisePayoffScore = Math.max(promisePayoffScore, shameSystemPayoffScore);
    }
    if (sportsPayoffPassed) {
      promisePayoffScore = Math.max(promisePayoffScore, sportsPayoffScore);
    }
    if (campusClubPayoffPassed) {
      promisePayoffScore = Math.max(promisePayoffScore, campusClubPayoffScore);
    }
    if (warStatecraftPayoffPassed) {
      promisePayoffScore = Math.max(promisePayoffScore, warStatecraftPayoffScore);
    }
    if (promiseDrift.missingPrimaryPayoff && !topicPayoffPassed) {
      promisePayoffScore -= 28;
      issues.push('题材回报缺失：进了主场景但没有让主卖点转成可见结果。');
      suggestions.push('下一章必须把主场景转成读者能感到的结果：成交、得分、签约、站队、关系升温或资源变化。');
    }
    if (readability?.genreDrift && !readability.genreDrift.qualityFloorPassed && !topicPayoffPassed) {
      promisePayoffScore -= 22;
      issues.push(...readability.genreDrift.issues.slice(0, 2));
      suggestions.push(...readability.genreDrift.suggestions.slice(0, 2));
    }
  }
  if (hasClueOnlyEngineeringTail(chapter)) {
    promisePayoffScore -= 16;
    issues.push('题材漂移：工程章尾落在日志/文件/信号源线索，缺少下一处可执行设备故障。');
    suggestions.push('工程章尾必须给读者一个当场要修的设备压力：报警升级、阀门卡死、压力超标、泵组过热或模块离线。');
  }
  if (showbizLike && showbizPayoffPassed) {
    promisePayoffScore = Math.max(promisePayoffScore, showbizPayoffScore);
  } else if (showbizLike) {
    promisePayoffScore = Math.min(promisePayoffScore, showbizPayoffScore);
  }
  const courtPowerStats = isCourtPowerLikeChapter(chapter)
    ? getCourtPowerDeliveryStats(chapter.content)
    : null;
  if (courtPowerStats?.clueDominant) {
    promisePayoffScore -= 18;
    issues.push('朝堂权谋回报偏虚：线索物件多于公开权力后果，读者看到的是追查而不是站队、削权、换防或问罪。');
    suggestions.push('朝堂权谋章节必须把每个关键线索当场转成公开后果：站队、押人、换防、廷议、问罪、封赏或兵权变化。');
  }
  if (showbizLike && showbizPayoffScore < DIMENSION_FLOORS.promisePayoff) {
    issues.push('娱乐圈回报偏虚：试镜、直播、热搜或资源结果没有落成角色归属、站队、品牌态度、粉丝舆论或行业反应。');
    suggestions.push('娱乐圈主回报必须让导演、经纪人、品牌方、对家、粉丝或评论区当场反应，并改变资源、站队或舆论位置。');
  }

  let readabilityScore = typeof readerScore === 'number' ? readerScore * 10 : DIMENSION_FLOORS.readability;
  if (readability && !readability.qualityFloorPassed) {
    const effectiveReadabilityIssues = topicPayoffPassed
      ? readability.issues.filter(issue => !isStaleTopicPayoffDiagnostic(issue))
      : readability.issues;
    const effectiveReadabilitySuggestions = topicPayoffPassed
      ? readability.suggestions.filter(suggestion => !isStaleTopicPayoffDiagnostic(suggestion))
      : readability.suggestions;
    if (!topicPayoffPassed || effectiveReadabilityIssues.length > 0) {
      readabilityScore -= 18;
      issues.push(...effectiveReadabilityIssues.slice(0, 3));
      suggestions.push(...effectiveReadabilitySuggestions.slice(0, 3));
    }
  }
  if (typeof readerDelta === 'number' && readerDelta <= -0.3) {
    readabilityScore -= 10;
    issues.push(`读者分较上一章下降 ${Math.abs(readerDelta).toFixed(1)} 分。`);
    suggestions.push('下一章必须先恢复阅读体验，不能只增加题材命中、数据项或设定名词。');
  } else if (typeof readerDelta === 'number' && readerDelta < 0) {
    readabilityScore -= 3;
    suggestions.push(`读者分较上一章轻微回落 ${Math.abs(readerDelta).toFixed(1)} 分；下一章要减少重复操作，增加新的选择压力和人物反应。`);
    if (typeof previousReaderDelta === 'number' && previousReaderDelta < 0) {
      suggestions.push('读者分已连续轻微回落；下一章必须优先检查正文是否变成流程推进，补强人物选择、关系反馈和章尾新压力。');
    }
  }
  const qualityGateStrongEnough = Boolean(
    qualityGate
    && typeof qualityGate.overallScore === 'number'
    && typeof qualityGate.structureScore === 'number'
    && typeof qualityGate.emotionScore === 'number'
    && qualityGate.overallScore >= 90
    && qualityGate.structureScore >= 88
    && qualityGate.emotionScore >= 75,
  );
  if (
    qualityGate?.findings?.some(finding => finding.code === 'low-structure-signal' || finding.code === 'stalled-momentum')
    && !qualityGateStrongEnough
  ) {
    readabilityScore -= 6;
    issues.push('正文推进感偏弱：场面有结果，但冲突/转折信号不足。');
    suggestions.push('下一章要把结果放进更明确的阻碍、反制和关系位置变化里。');
  }
  if (courtPowerStats?.clueDominant) {
    readabilityScore -= 16;
    issues.push('朝堂权谋读感偏查案：账册、铁匣、数字、草籽或卷轴继续牵引正文，公开表态和权力代价不足。');
    suggestions.push('下一章必须至少两名命名角色当场表态或改变态度，让主角位置被公开权力选择改变。');
  }

  let endingHookScore = startup?.endingHookScore ?? scoreEndingHookFromText(chapter.content);
  const showbizEndingScore = showbizLike
    ? scoreShowbizEndingHookFromText(chapter.content)
    : 0;
  const showbizEndingPassed = showbizEndingScore >= DIMENSION_FLOORS.endingHook;
  if (showbizLike && showbizEndingPassed) {
    endingHookScore = Math.max(endingHookScore, showbizEndingScore);
  } else if (showbizLike) {
    endingHookScore = Math.min(endingHookScore, showbizEndingScore);
  }
  const romanceEndingScore = romanceLike
    ? scoreRomanceEndingHookFromText(chapter.content)
    : 0;
  const romanceEndingPassed = romanceEndingScore >= DIMENSION_FLOORS.endingHook;
  if (romanceLike) {
    endingHookScore = Math.max(endingHookScore, romanceEndingScore);
  }
  const frontierBuildingEndingScore = isFrontierBuildingLikeChapter(chapter)
    ? scoreFrontierBuildingEndingHookFromText(chapter.content)
    : 0;
  const frontierBuildingEndingPassed = frontierBuildingEndingScore >= DIMENSION_FLOORS.endingHook;
  if (isFrontierBuildingLikeChapter(chapter)) {
    endingHookScore = Math.max(endingHookScore, frontierBuildingEndingScore);
  }
  const workplaceEndingScore = isWorkplaceLikeChapter(chapter)
    ? scoreWorkplaceEndingHookFromText(chapter.content)
    : 0;
  const workplaceEndingPassed = workplaceEndingScore >= DIMENSION_FLOORS.endingHook;
  if (isWorkplaceLikeChapter(chapter)) {
    endingHookScore = Math.max(endingHookScore, workplaceEndingScore);
  }
  const foodFarmingEndingScore = foodFarmingLike
    ? scoreFoodFarmingEndingHookFromText(chapter.content)
    : 0;
  const foodFarmingEndingPassed = foodFarmingEndingScore >= DIMENSION_FLOORS.endingHook;
  if (foodFarmingLike) {
    endingHookScore = Math.max(endingHookScore, foodFarmingEndingScore);
  }
  const survivalEndingScore = survivalLike
    ? scoreSurvivalEndingHookFromText(chapter.content)
    : 0;
  const survivalEndingPassed = survivalEndingScore >= DIMENSION_FLOORS.endingHook;
  if (survivalLike) {
    endingHookScore = Math.max(endingHookScore, survivalEndingScore);
  }
  const shameSystemEndingScore = shameSystemLike
    ? scoreShameSystemEndingHookFromText(chapter.content)
    : 0;
  const shameSystemEndingPassed = shameSystemEndingScore >= DIMENSION_FLOORS.endingHook;
  if (shameSystemLike) {
    endingHookScore = Math.max(endingHookScore, shameSystemEndingScore);
  }
  const sportsEndingScore = sportsCompetitionLike
    ? scoreSportsEndingHookFromText(chapter.content)
    : 0;
  const sportsEndingPassed = sportsEndingScore >= DIMENSION_FLOORS.endingHook;
  if (sportsCompetitionLike) {
    endingHookScore = Math.max(endingHookScore, sportsEndingScore);
  }
  const campusClubEndingScore = campusClubComedyLike
    ? scoreCampusClubEndingHookFromText(chapter.content)
    : 0;
  const campusClubEndingPassed = campusClubEndingScore >= DIMENSION_FLOORS.endingHook;
  if (campusClubComedyLike) {
    endingHookScore = Math.max(endingHookScore, campusClubEndingScore);
  }
  const warStatecraftEndingScore = warStatecraftLike
    ? scoreWarStatecraftEndingHookFromText(chapter.content)
    : 0;
  const warStatecraftEndingPassed = warStatecraftEndingScore >= DIMENSION_FLOORS.endingHook;
  if (warStatecraftLike) {
    endingHookScore = Math.max(endingHookScore, warStatecraftEndingScore);
  }
  if (isEngineeringLikeChapter(chapter)) {
    endingHookScore = Math.max(endingHookScore, scoreEngineeringEndingHookFromText(chapter.content));
  }
  const engineeringDevicePressureTail = hasEngineeringDevicePressureTail(chapter);
  const topicEndingPassed = showbizEndingPassed
    || romanceEndingPassed
    || frontierBuildingEndingPassed
    || workplaceEndingPassed
    || foodFarmingEndingPassed
    || survivalEndingPassed
    || shameSystemEndingPassed
    || sportsEndingPassed
    || campusClubEndingPassed
    || warStatecraftEndingPassed
    || engineeringDevicePressureTail;
  if (startup?.findings?.some(finding => finding.code === 'weak-ending-hook') && !topicEndingPassed) {
    endingHookScore -= 24;
    issues.push('章末追读不足：结尾没有形成足够明确的下一章压力。');
    suggestions.push('章末钩子必须落到一个具体的新麻烦、新收益门槛、新对手动作或限时选择。');
  }
  if (hasClueOnlyEngineeringTail(chapter)) {
    endingHookScore -= 22;
    issues.push('工程章尾追读偏虚：最后压力停在文件推送、日志或信号源，没有变成现场设备动作。');
    suggestions.push('下一章结尾不要用 HUD 文件、日志完整版或波形片段当最终钩子，必须让设备状态立刻恶化或逼主角当场处理。');
  }
  if (courtPowerStats?.clueTail && !warStatecraftEndingPassed) {
    endingHookScore -= 18;
    issues.push('朝堂权谋章尾偏悬疑：最后压力停在物件、暗号、路线或布网者，没有收成公开期限、军令、廷议、押解或换防。');
    suggestions.push('朝堂权谋章尾必须落到公开期限、军令变化、廷议开场、押解执行、换防落地或女帝/门阀的新条件。');
  }
  if (showbizLike && showbizEndingScore < DIMENSION_FLOORS.endingHook) {
    issues.push('娱乐圈章尾追读偏虚：结尾没有压到下一场直播/试镜、热搜反扑、品牌限时条件或对家公开动作。');
    suggestions.push('娱乐圈章尾必须把新压力落在公开战场或资源下一步，不能只收在查幕后、等消息或看文件。');
  }

  let publicSurfaceScore = 88;
  if (latestAuthorNote && AUTHOR_META_RE.test(latestAuthorNote)) {
    publicSurfaceScore -= 28;
    issues.push('作者有话说仍有创作过程或作者自我口吻，发布面不够干净。');
    suggestions.push('作者有话说只保留读者可消费的角色/剧情补充，不写“我怎么写的”。');
  }
  const authorNoteChars = Array.from(latestAuthorNote).length;
  const authorNoteParagraphs = latestAuthorNote.split(/\n+/u).map(line => line.trim()).filter(Boolean).length;
  if (authorNoteChars > AUTHOR_NOTE_MAX_CHARS || authorNoteParagraphs > AUTHOR_NOTE_MAX_PARAGRAPHS) {
    publicSurfaceScore -= 12;
    issues.push('作者有话说篇幅过长，容易稀释正文结尾的追读情绪。');
    suggestions.push('作者有话说控制在短补充体量，优先保留角色/剧情余味，不扩写成番外。');
  }

  const dimensions = {
    title: clamp(titleScore),
    opening: clamp(openingScore),
    promisePayoff: clamp(promisePayoffScore),
    readability: clamp(readabilityScore),
    endingHook: clamp(endingHookScore),
    publicSurface: clamp(publicSurfaceScore),
  };
  const score = round(
    dimensions.title * 0.12
    + dimensions.opening * 0.18
    + dimensions.promisePayoff * 0.2
    + dimensions.readability * 0.26
    + dimensions.endingHook * 0.14
    + dimensions.publicSurface * 0.1,
  );
  const floorFailures = Object.entries(DIMENSION_FLOORS).filter(([key, floor]) =>
    dimensions[key as keyof typeof dimensions] < floor,
  );
  const blockingFloorFailures = floorFailures.filter(([key, floor]) =>
    !isGraceFloorFailure(key as keyof ReaderDeliveryAudit['dimensions'], floor, dimensions, score),
  );
  for (const [key, floor] of blockingFloorFailures) {
    const dimensionName = ({
      title: '标题',
      opening: '开篇',
      promisePayoff: '题材回报',
      readability: '正文读感',
      endingHook: '章尾追读',
      publicSurface: '发布面',
    } satisfies Record<keyof ReaderDeliveryAudit['dimensions'], string>)[key as keyof ReaderDeliveryAudit['dimensions']];
    issues.push(`${dimensionName}未达读者交付地板（${dimensions[key as keyof typeof dimensions]}/${floor}）。`);
  }
  if (dimensions.opening < DIMENSION_FLOORS.opening) {
    suggestions.push('开篇第一屏要同时给出主角行动、当前目标、具体阻碍和一次可见反馈。');
  }
  if (dimensions.endingHook < DIMENSION_FLOORS.endingHook) {
    suggestions.push('结尾不要只收束成绩，要把下一章的新目标、压力或对手动作钉住。');
  }

  return {
    score,
    passed: score >= 76 && blockingFloorFailures.length === 0 && issues.length === 0,
    readerScore,
    previousReaderScore,
    issues: [...new Set(issues)].slice(0, 8),
    suggestions: [...new Set(suggestions)].slice(0, 8),
    dimensions,
  };
}

function isGraceFloorFailure(
  key: keyof ReaderDeliveryAudit['dimensions'],
  floor: number,
  dimensions: ReaderDeliveryAudit['dimensions'],
  score: number,
): boolean {
  return key === 'readability'
    && score >= 84
    && dimensions.readability >= floor - 2;
}

export function mergeReaderDeliveryAuditIntoDiagnostics(
  chapter: Chapter,
  audit: ReaderDeliveryAudit,
): Chapter['diagnostics'] {
  return {
    ...(chapter.diagnostics ?? {}),
    readerDeliveryAudit: audit,
    updatedAt: new Date().toISOString(),
  } as Chapter['diagnostics'];
}

export function buildReaderDeliveryForwardHints(chapter: Chapter | null | undefined): string {
  const audit = chapter?.diagnostics?.readerDeliveryAudit;
  if (!audit || audit.passed) return '';
  const lines = [
    `上一章读者交付审计提示（第 ${chapter.chapterNumber} 章，${audit.score}/100）：`,
    ...audit.issues.slice(0, 4).map(issue => `- ${issue}`),
    ...audit.suggestions.slice(0, 4).map(suggestion => `- ${suggestion}`),
  ];
  const needsReadabilityOrEndingRepair = audit.dimensions.readability < DIMENSION_FLOORS.readability
    || audit.dimensions.endingHook < DIMENSION_FLOORS.endingHook;

  if (isEngineeringLikeChapter(chapter)) {
    lines.push('- 工程题材补救硬约束：本章第一句必须是设备状态、报警读数或物理拆修动作；前 500 字内写清设备、异常读数、目标参数和第一步操作。');
    if (hasClueFirstEngineeringOpening(chapter)) {
      lines.push('- 上一章工程开头被日志/HUD/时间戳线索牵走：下一章第一屏必须从设备报警、拆修动作、压力读数或现场阻碍开始，不能先打开文件、追来源、确认签名，不能用“文件还在缓存里”承接。');
    }
    lines.push('- 工程题材补救硬约束：章末不能只写“迟早会处理/建议普查/等待确认/日志签名/HUD缓存/时间链”，必须落到一个即时设备级压力点，例如新工单弹出、报警升级、模块锁死、读数跳变、倒计时或必须立刻更换的部件。');
    if (audit.dimensions.readability < DIMENSION_FLOORS.readability || audit.dimensions.endingHook < DIMENSION_FLOORS.endingHook) {
      lines.push('- 工程题材读感补救硬约束：资料核查、编号、签名、监控、门禁、日志来源只能放在前半章帮助判断；后半章必须回到设备现场，让阀门、气闸、泵组、传感器、备用电池或模块状态直接恶化。');
      lines.push('- 工程题材读感补救硬约束：最后 300 字不得收在“谁签的/谁改的/监控维护/时间戳/来源确认”，必须收在报警升级、压力读数异常、阀门卡死、模块离线、倒计时维修或现场协作选择。');
    }
    if (hasWeakEngineeringTail(chapter)) {
      lines.push('- 上一章工程章尾偏平：不要复用“只是时间问题”式收尾，下一章必须把 A 段或新设备异常写成当场发生的可执行任务。');
    }
  }

  if (audit.dimensions.publicSurface < DIMENSION_FLOORS.publicSurface) {
    lines.push('- 发布面补救硬约束：作者有话说宁可为空，也不能写创作过程、作者经历、查资料、现实原型或“我怎么写的”。');
  }

  if (audit.dimensions.opening < DIMENSION_FLOORS.opening) {
    lines.push('- 开篇读者交付硬约束：前 500 字必须同时出现主角正在做的可见动作、当章目标、具体阻碍、命名角色的即时反馈；四项缺一项就重写开篇。');
    lines.push('- 开篇读者交付硬约束：不要先用回忆、旧记录、台本、文件、旧物件、安静整理或内心复盘开场；这些信息只能在当前场景动作被阻碍后插入。');
  }

  if (isNonSuspensePromiseChapter(chapter) && audit.dimensions.readability < DIMENSION_FLOORS.readability) {
    lines.push('- 非悬疑题材低读感补救硬约束：本章不得把陌生人、编号物件、匿名消息、旧图纸、旧钥匙、隐藏夹层、传承物件、来源追查或“从哪来的”当主回报；若出现，必须在同一场转成题材结果。');
    lines.push('- 非悬疑题材低读感补救硬约束：旧物件、旧记录或传承道具只能当背景道具，不能负责解决当章难题，也不能在章尾变成“另一个人/另一把钥匙/另一个旧物在哪”的追查钩子。');
    lines.push('- 非悬疑题材低读感补救硬约束：题材结果要可见，例如关系选择、项目站队、社团人数/活动室资源变化、比赛分组变化、客户反馈或部落分工变化。');
    lines.push('- 非悬疑题材低读感补救硬约束：至少两次让命名角色当场公开反馈结果，反馈必须改变支持/反对、资源归属、分工责任、关系距离或下一步条件之一。');
    lines.push('- 非悬疑题材低读感补救硬约束：每个“拿到资源/人数增加/项目推进/关系靠近”之后，立刻补一个具体人物反应和一个新压力，不能只写流程完成。');
    lines.push('- 非悬疑题材低读感补救硬约束：章尾不能只收在“编号是什么/是谁/从哪来/谁留下的”，必须收在公开反馈后的新行动指标或关系位置改变。');
  }

  if (isShowbizLikeChapter(chapter) && needsReadabilityOrEndingRepair) {
    lines.push('- 娱乐圈读感补救硬约束：本章必须把主回报放回直播、热搜、片场、试镜、定妆或节目组现场；休息室、会客室、办公室谈判只能做辅戏。');
    lines.push('- 娱乐圈读感补救硬约束：前 1000 字必须出现明确行业阻碍，例如被换角、黑热搜、撤资源、对家抢位、品牌观望或导演组质疑；普通吐槽不算阻碍。');
    lines.push('- 娱乐圈读感补救硬约束：每个角色、资源、热搜或直播结果后，下一段必须给导演、经纪人、品牌方、对家、粉丝或评论区的可见反应，并改变资源、站队或舆论位置。');
    lines.push('- 娱乐圈读感补救硬约束：章尾不能只收在查幕后、等消息或看文件，必须收在下一场直播/试镜、品牌限时条件、热搜反扑或对家公开动作。');
  }

  if (isRomanceLikeChapter(chapter) && needsReadabilityOrEndingRepair) {
    lines.push('- 恋爱读感补救硬约束：本章少写流程节点、团队调度和外部说明，优先写一场二人关系选择；每次回报后必须有新的身体反应、误会变化、主动靠近或退让代价。');
    lines.push('- 恋爱读感补救硬约束：至少写成两个完整场景段落群，第一段承担选择前压力，第二段承担选择后的即时后果；不能只写一串甜点动作或直播流程。');
    lines.push('- 恋爱读感补救硬约束：章尾钩子不能只发下一份流程安排，必须落在两人关系位置改变后的新选择，例如要不要承认、要不要赴约、要不要把旧物还给对方。');
  }

  if (isFoodOrFarmingLikeChapter(chapter) && needsReadabilityOrEndingRepair) {
    lines.push('- 美食/种田读感补救硬约束：本章每个困境必须尽快转成手上动作和现实反馈，例如生火、做成、换粮、拿铜钱、留下一碗或明天还有人来。');
    lines.push('- 美食/种田读感补救硬约束：章尾不能只收苦情或回忆，必须落到下一锅、下一摊、下一笔钱、粮食缺口或具体客人的新条件。');
  }

  if (isSurvivalLikeChapter(chapter) && needsReadabilityOrEndingRepair) {
    lines.push('- 末世生存读感补救硬约束：本章必须把危险压成资源或安全状态变化，例如拿到水药、加固门、挡住尸群、救下人或撑到天亮。');
    lines.push('- 末世生存读感补救硬约束：章尾不能只收在旧档案、来源、钥匙或实验线索，必须收在尸群、断电、广播、补给点或安全屋被破坏后的下一步选择。');
  }

  if (isShameSystemLikeChapter(chapter) && needsReadabilityOrEndingRepair) {
    lines.push('- 羞耻系统读感补救硬约束：本章必须让任务触发、公开执行、围观反应、奖励惩罚形成闭环，系统规则只能服务当场社死。');
    lines.push('- 羞耻系统读感补救硬约束：章尾必须落到下一条更难任务、惩罚倒计时、围观者新反应或关系位置变化，不能只解释系统来源。');
  }

  if (isWorkplaceLikeChapter(chapter) && needsReadabilityOrEndingRepair) {
    lines.push('- 职场读感补救硬约束：本章每个交付结果后必须立刻给出一个人的反应、站队变化或代价，不要只连续罗列清单、文件、时间表和签字。');
    lines.push('- 职场读感补救硬约束：至少安排一场当面冲突和一次公开态度变化，让同事、客户或上级的选择改变林澄的位置。');
    lines.push('- 职场读感补救硬约束：章尾压力必须压到可执行业务选择，例如签约延期、替代供应商、预算责任或客户追加条件，不能只留下资料核查。');
  }

  if (isSportsCompetitionLikeChapter(chapter) && needsReadabilityOrEndingRepair) {
    lines.push('- 体育竞技读感补救硬约束：本章必须写成场上闭环，至少完成一次失误/落后、动作或战术修正、回合结果、队友或教练反应。');
    lines.push('- 体育竞技读感补救硬约束：章尾必须落到首发名单、下一场对抗、比分门槛、教练新条件或队友信任选择，不能只写训练心得。');
  }

  if (isCampusClubLikeChapter(chapter) && needsReadabilityOrEndingRepair) {
    lines.push('- 校园社团读感补救硬约束：本章每个招新结果后必须立刻给出同学、老师或社员的公开反应，让人数变化、站队变化或活动室资源变化变成可见结果。');
    lines.push('- 校园社团读感补救硬约束：至少写一场小失败后的现场补救，不能只连续罗列报名、名单、展示安排和校报传播。');
    lines.push('- 校园社团读感补救硬约束：章尾必须落到下一场正式招新展示的硬指标，例如人数门槛、老师验收、活动室使用权或公开展示名额。');
  }

  if (isWarStatecraftLikeChapter(chapter) && needsReadabilityOrEndingRepair) {
    lines.push('- 战争权谋读感补救硬约束：本章每个军令、秘报或政令都必须当场转成战场、兵权、城防、制度或势力站队变化。');
    lines.push('- 战争权谋读感补救硬约束：章尾不能只收在祭坛、钥匙、坐标、碎片或谁留下的秘物，必须收在换防、反扑、廷议、军令、城门或兵权新条件。');
  }

  if (isCourtPowerLikeChapter(chapter) && needsReadabilityOrEndingRepair) {
    lines.push('- 朝堂权谋读感补救硬约束：本章每个证据、账册、密信、旧案或暗号出现后，必须在同一场转成公开权力后果，例如站队、削权、换防、封赏、问罪、押人或军令变化。');
    lines.push('- 朝堂权谋读感补救硬约束：至少安排两名命名角色当场表态或改变态度，让主角位置从“查到线索”变成“被迫选择阵营、兵权、门阀或女帝代价”。');
    lines.push('- 朝堂权谋读感补救硬约束：章尾不能只收在铁匣、数字、草籽、卷轴、香灰、谁布网或线索来自哪里，必须收在公开期限、军令、廷议、换防、押解或女帝/门阀的新条件。');
  }

  if (isFrontierBuildingLikeChapter(chapter) && needsReadabilityOrEndingRepair) {
    lines.push('- 文明建设读感补救硬约束：本章每个新规则、新工具或新资源必须立刻遭遇阻碍、反制或代价，不能只展示制度说明和收获提示。');
    lines.push('- 文明建设读感补救硬约束：至少让一名部落成员公开改变选择或承担新分工，让文明成果变成关系位置变化。');
    lines.push('- 文明建设读感补救硬约束：章尾压力必须落到可执行的下一步，例如缺锅、缺水、守洞、山魈靠近、灰斑骨棍扩大或神罚逼近。');
  }

  lines.push('- 本章优先让读者拿到可阅读的结果，不要只让内部指标变好。');
  return lines.join('\n');
}

function isNonSuspensePromiseChapter(chapter: Chapter): boolean {
  const readability = chapter.diagnostics?.readabilityAudit;
  if (readability?.genreDrift?.suspenseGenre === true) return false;
  return Boolean(
    isShowbizLikeChapter(chapter)
    || isRomanceLikeChapter(chapter)
    || isFoodOrFarmingLikeChapter(chapter)
    || isWorkplaceLikeChapter(chapter)
    || isSportsCompetitionLikeChapter(chapter)
    || isCampusClubLikeChapter(chapter)
    || isCourtPowerLikeChapter(chapter)
    || isWarStatecraftLikeChapter(chapter)
    || isFrontierBuildingLikeChapter(chapter)
    || isSurvivalLikeChapter(chapter)
    || isShameSystemLikeChapter(chapter)
    || readability?.genreDrift?.suspenseGenre === false,
  );
}
