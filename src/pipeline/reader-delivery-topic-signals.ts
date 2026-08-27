import type { Chapter } from '../novel/types.js';
import {
  inferTopicProfiles,
  type ChapterGenreFocus,
  type TopicProfile,
} from './topic-profiles.js';

const FOOD_TOPIC_IDS = ['food-business', 'farming-survival'];

const FOOD_FARMING_SIGNAL_RE = /美食|种田|农女|农家|荒年|逃荒|野菜|灰灰菜|粗面|饭摊|面摊|摆摊|开摊|酸汤|铜钱|五文/u;
const FOOD_FARMING_OPENING_GOAL_RE = /开灶|生火|起火|做汤|做菜|野菜|灰灰菜|找粮|换粮|换钱|摆摊|开摊|活下来|撑一天|明天.{0,12}多摘/u;
const FOOD_FARMING_OPENING_OBSTACLE_RE = /没钱|断粮|被赶|赶出|荒院|破庙|塌|半缸雨水|只剩|不够|挨饿|油星用光|粮袋见底/u;
const FOOD_FARMING_OPENING_FEEDBACK_RE = /铜钱|铜板|五文|五块|换到|换了|买了|够了|成交|开张|留一碗|再来一碗|回头客|撑过|撑一天|掏钱|付钱|收钱|微信|转账|带走|打包/u;
const FOOD_FARMING_PAYOFF_RE = /活下来|生火|火苗|做成|找到粮|换粮|换钱|换几文钱|铜钱|铜板|五文|五块|撑一天|留一碗|摆摊|开张|成交|回头客|复购|掏钱|付钱|收钱|微信|转账|带走|打包|卖了|卖出|数钱|带一队人来/u;
const FOOD_FARMING_RESULT_RE = /够了|喝完|吃完|点头|掏出|递来|接过|端走|留下|再来|带走|打包|排在后面|排成|卖光|售罄|明天.{0,12}来|明天.{0,12}多摘|明天.{0,12}带|明天.{0,12}别带少|吃不上/u;
const FOOD_FARMING_ENDING_RE = /明天|下一锅|下回|再来|多摘|摆摊|集市|开张|还差|粮|雨|来买|等你|带一队人来|换个大锅|加桌|添面粉/u;

const SURVIVAL_SIGNAL_RE = /末世|丧尸|尸潮|废土|安全屋|避难所|补给|物资|感染|灾变|极寒|天灾|生存物资/u;
const SURVIVAL_OPENING_GOAL_RE = /补给券|补给|物资|换水|换药|工具箱|加固|封门|堵门|车门|安全屋|避难所|活到|撑到|找水|找药/u;
const SURVIVAL_OPENING_OBSTACLE_RE = /尸群|丧尸|感染|血迹|门缝|黑暗|今晚|熬不过|只剩|断电|封锁|门板.{0,8}(响|裂)|尸潮/u;
const SURVIVAL_OPENING_FEEDBACK_RE = /加固|堵住|挡住|封住|换到|拿到|清水|水瓶|药|工具|工具箱|活到|撑到|安全屋|救下/u;
const SURVIVAL_PAYOFF_RE = /活下来|补给|物资|清水|水瓶|食物|药|工具箱|加固|堵住|挡住|封住|安全屋|换到|拿到|撑到天亮|救下/u;
const SURVIVAL_RESULT_RE = /门.{0,8}(稳|锁|堵|关)|尸群.{0,12}(被挡|停下|撞不开)|喝了|分到|塞进包|换来|撑过|活到/u;
const SURVIVAL_ENDING_RE = /尸潮|尸群|广播|警报|求救|敲门|门外|倒计时|天亮前|下一处|安全屋|补给点|只剩/u;

const SHAME_SYSTEM_SIGNAL_RE = /羞耻系统|社死系统|羞耻任务|社死任务|公开处刑|社死发言|指定台词|当众.{0,12}任务|任务.{0,12}(羞耻|社死)|系统.{0,12}(羞耻|社死)|围观反应/u;
const SHAME_SYSTEM_OPENING_SCENE_RE = /早会|办公室|会议室|教室|大厅|直播间|同事|同学|主管|老师|弹幕/u;
const SHAME_SYSTEM_OPENING_TASK_RE = /羞耻任务|社死任务|公开任务|任务栏|倒计时|指定台词|台词完整|当众.{0,12}(说|念|做|完成)/u;
const SHAME_SYSTEM_OPENING_OBSTACLE_RE = /当众|围观|七八双眼睛|同事|同学|主管|老师|弹幕|社死|公开处刑|惩罚|不能失败|倒计时/u;
const SHAME_SYSTEM_OPENING_FEEDBACK_RE = /任务完成|完成任务|奖励|积分|惩罚解除|围观|憋笑|起哄|脸红|尴尬|台词完整/u;
const SHAME_SYSTEM_PAYOFF_RE = /任务完成|完成任务|奖励|积分|惩罚|惩罚解除|社死|羞耻|公开处刑|台词完整|指定台词/u;
const SHAME_SYSTEM_REACTION_RE = /脸红|尴尬|憋笑|起哄|围观|低笑|沉默|倒吸气|看过来|盯着/u;
const SHAME_SYSTEM_ENDING_RE = /下一条任务|下一次任务|新任务|倒计时|惩罚|奖励|积分|主管|同事|同学|围观|公开视频|录音/u;

const SPORTS_SIGNAL_RE = /体育|竞技|篮球|足球|校队|替补|训练|选拔赛|比赛|比分|防守|传球|助攻|得分|教练|队友/u;
const SPORTS_OPENING_GOAL_RE = /比赛|选拔赛|训练赛|班赛|比分|计时|防守|传球|助攻|得分|反超|入选|首发|修正站位|战术/u;
const SPORTS_OPENING_OBSTACLE_RE = /落后|失误|膝伤|犯规|防不住|替补|倒计时|只剩|教练|盯防|封死|体力|比分.{0,8}落后/u;
const SPORTS_OPENING_FEEDBACK_RE = /得分|防住|助攻|反超|抢断|封盖|入选|首发名单|名单|队友.{0,8}(点头|信任|补位)|教练.{0,8}(点头|改口)/u;
const SPORTS_PAYOFF_RE = /得分|防住|助攻|反超|抢断|封盖|入选|名单|首发|修正|战术|补位|队友信任|教练点头/u;
const SPORTS_RESULT_RE = /记分牌|比分.{0,12}(变|追|反超)|队友.{0,8}(点头|伸手|补位|信任)|教练.{0,8}(点头|改口|写下)|观众.{0,8}(喊|起哄)/u;
const SPORTS_ENDING_RE = /首发名单|名单|下一场|班赛|决赛|加练|最后一球|还剩|计时器|教练|队友|比分/u;

const CAMPUS_CLUB_SIGNAL_RE = /校园|社团|招新|活动室|校报|老师|同学|室友|展示|报名|登记|社长|模型社|手作|废社/u;
const CAMPUS_CLUB_OPENING_GOAL_RE = /招新|报名|登记表|社团|活动室|保住社团|废社|修好模型|展示|摊位/u;
const CAMPUS_CLUB_OPENING_OBSTACLE_RE = /没人报名|废社|解散|截止|收回活动室|被笑|误会|老师|社长|只剩|传单.{0,8}吹/u;
const CAMPUS_CLUB_OPENING_FEEDBACK_RE = /报名|登记|留下|加入|凑满|修好|保住社团|笑出声|误会升级|帮.{0,8}拉.{0,8}同学|活动室.{0,8}留下/u;
const CAMPUS_CLUB_PAYOFF_RE = /招新|报名|登记|留下|加入|社长|误会|笑|修好|凑满|保住社团|活动室|同学/u;
const CAMPUS_CLUB_RESULT_RE = /签名|写下名字|登记表|人数.{0,8}(变|凑|够)|活动室.{0,8}(留下|保住)|同学.{0,8}(留下|报名|加入)|老师.{0,8}(点头|松口)/u;
const CAMPUS_CLUB_ENDING_RE = /明天|下一场|展示|招新|报名|活动室|老师验收|人数|名单|校报|误会/u;

const WAR_STATECRAFT_SIGNAL_RE = /战争|争霸|攻城|破城|军令|兵权|军营|战场|城门|军功爵|废奴|科举|政令|旧贵族|门阀|朝堂/u;
const WAR_STATECRAFT_OPENING_GOAL_RE = /攻城|破城|守城|练兵|军令|兵权|政令|废奴|科举|军功爵|收编|改阵|夺城楼|封粮道/u;
const WAR_STATECRAFT_OPENING_OBSTACLE_RE = /围城|守军|旧贵族|反扑|粮道|城门|兵变|军心|叛将|压境|门阀|太后|夺兵权/u;
const WAR_STATECRAFT_OPENING_FEEDBACK_RE = /破城|夺城楼|收编|兵权|军令|政令|废奴|军功爵|国子监|站队|换防|封赏|问罪|粮道.{0,8}断/u;
const WAR_STATECRAFT_PAYOFF_RE = /攻城|破城|夺城楼|收编|兵权|军令|政令|废奴|科举|军功爵|国子监|站队|换防|封赏|问罪|粮道/u;
const WAR_STATECRAFT_RESULT_RE = /守军.{0,12}(退|降|交)|降兵.{0,12}收编|旧贵族.{0,12}(失去|承认|退)|兵权.{0,12}(交出|夺下|移交)|政令.{0,12}(颁|落地|张出)|名册.{0,12}(送到|张出)/u;
const WAR_STATECRAFT_ENDING_RE = /军令|换防|旧贵族|反扑|城门|粮道|兵权|政令|廷议|国子监|军功爵|下一城|天亮前/u;

const DIALOGUE_RE = /[“"「『][^”"」』\n]{2,120}[”"」』]/u;

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
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

function inferChapterProfiles(chapter: Chapter): TopicProfile[] {
  return inferTopicProfiles({
    novelTitle: chapter.title,
    novelSynopsis: chapter.summary,
    genre: chapter.diagnostics?.readabilityAudit?.genreDrift?.genre,
    constitutionTags: chapter.diagnostics?.readabilityAudit?.genreDrift?.constitutionTags,
    extraText: [
      chapter.content.slice(0, 1600),
      chapter.content.slice(Math.max(0, chapter.content.length - 900)),
    ].join('\n'),
  });
}

function hasProfile(chapter: Chapter, ids: string[], foci: ChapterGenreFocus[]): boolean {
  return inferChapterProfiles(chapter).some(profile =>
    ids.includes(profile.id) || foci.includes(profile.genreFocus),
  );
}

export function isFoodOrFarmingLikeChapter(chapter: Chapter): boolean {
  return hasProfile(chapter, FOOD_TOPIC_IDS, ['food']) || FOOD_FARMING_SIGNAL_RE.test([
    chapter.title,
    chapter.summary,
    chapter.content.slice(0, 1400),
    chapter.content.slice(-900),
  ].join('\n'));
}

export function isSurvivalLikeChapter(chapter: Chapter): boolean {
  return hasProfile(chapter, ['apocalypse-survival'], ['survival']) || SURVIVAL_SIGNAL_RE.test([
    chapter.title,
    chapter.summary,
    chapter.content.slice(0, 1400),
    chapter.content.slice(-900),
  ].join('\n'));
}

export function isShameSystemLikeChapter(chapter: Chapter): boolean {
  return hasProfile(chapter, ['shame-system'], ['system']) || SHAME_SYSTEM_SIGNAL_RE.test([
    chapter.title,
    chapter.summary,
    chapter.content.slice(0, 1400),
    chapter.content.slice(-900),
  ].join('\n'));
}

export function isSportsCompetitionLikeChapter(chapter: Chapter): boolean {
  return hasProfile(chapter, ['sports-competition'], ['sports']) || SPORTS_SIGNAL_RE.test([
    chapter.title,
    chapter.summary,
    chapter.content.slice(0, 1400),
    chapter.content.slice(-900),
  ].join('\n'));
}

export function isCampusClubComedyLikeChapter(chapter: Chapter): boolean {
  return hasProfile(chapter, ['campus-club-comedy'], ['campus-club-comedy']) || CAMPUS_CLUB_SIGNAL_RE.test([
    chapter.title,
    chapter.summary,
    chapter.content.slice(0, 1400),
    chapter.content.slice(-900),
  ].join('\n'));
}

export function isWarStatecraftLikeChapter(chapter: Chapter): boolean {
  return hasProfile(chapter, ['war-statecraft', 'historical-power'], ['war-statecraft']) || WAR_STATECRAFT_SIGNAL_RE.test([
    chapter.title,
    chapter.summary,
    chapter.content.slice(0, 1400),
    chapter.content.slice(-900),
  ].join('\n'));
}

export function scoreFoodFarmingOpeningFromText(content: string): number {
  const firstScreen = content.slice(0, 360);
  const firstWindow = content.slice(0, 1100);
  const hasAction = /抓|捡|洗|切|煮|烧|添|倒|端|递|挖|摘|蹲|摆/u.test(firstScreen) || DIALOGUE_RE.test(firstWindow);
  const hasGoal = FOOD_FARMING_OPENING_GOAL_RE.test(firstWindow);
  const hasObstacle = FOOD_FARMING_OPENING_OBSTACLE_RE.test(firstWindow);
  const hasFeedback = FOOD_FARMING_OPENING_FEEDBACK_RE.test(firstWindow);
  return clamp(50
    + (hasAction ? 12 : 0)
    + (hasGoal ? 14 : 0)
    + (hasObstacle ? 12 : 0)
    + (hasFeedback ? 12 : 0));
}

export function scoreFoodFarmingPromisePayoffFromText(content: string): number {
  const payoffWindow = content.slice(0, 4200);
  const payoffHits = countPatternMatches(payoffWindow, FOOD_FARMING_PAYOFF_RE);
  const resultHits = countPatternMatches(payoffWindow, FOOD_FARMING_RESULT_RE);
  const hasPublicFeedback = /邻居|婶子|掌柜|客人|孩子|路人|摊前|有人/u.test(payoffWindow);
  return clamp(50
    + Math.min(payoffHits * 4, 24)
    + Math.min(resultHits * 5, 22)
    + (hasPublicFeedback ? 8 : 0));
}

export function scoreFoodFarmingEndingHookFromText(content: string): number {
  const endingWindow = content.slice(Math.max(0, content.length - 700));
  const hasHook = FOOD_FARMING_ENDING_RE.test(endingWindow);
  const hasNextPressure = /还差|不够|只剩|明天|下一锅|集市|雨|来买|等你/u.test(endingWindow);
  const hasHumanOrResourcePressure = /掌柜|邻居|婶子|客人|粮|钱|柴|雨|摊位/u.test(endingWindow);
  return clamp(52
    + (hasHook ? 20 : 0)
    + (hasNextPressure ? 12 : 0)
    + (hasHumanOrResourcePressure ? 8 : 0));
}

export function scoreSurvivalOpeningFromText(content: string): number {
  const firstScreen = content.slice(0, 360);
  const firstWindow = content.slice(0, 1100);
  const hasAction = /抓|拖|推|堵|锁|撬|砸|跑|换|塞|背|拉/u.test(firstScreen) || DIALOGUE_RE.test(firstWindow);
  const hasGoal = SURVIVAL_OPENING_GOAL_RE.test(firstWindow);
  const hasObstacle = SURVIVAL_OPENING_OBSTACLE_RE.test(firstWindow);
  const hasFeedback = SURVIVAL_OPENING_FEEDBACK_RE.test(firstWindow);
  return clamp(50
    + (hasAction ? 12 : 0)
    + (hasGoal ? 14 : 0)
    + (hasObstacle ? 14 : 0)
    + (hasFeedback ? 10 : 0));
}

export function scoreSurvivalPromisePayoffFromText(content: string): number {
  const payoffWindow = content.slice(0, 4200);
  const payoffHits = countPatternMatches(payoffWindow, SURVIVAL_PAYOFF_RE);
  const resultHits = countPatternMatches(payoffWindow, SURVIVAL_RESULT_RE);
  const hasImmediateThreat = /尸群|丧尸|感染|血迹|门缝|警报|广播|断电/u.test(payoffWindow);
  return clamp(50
    + Math.min(payoffHits * 4, 24)
    + Math.min(resultHits * 5, 20)
    + (hasImmediateThreat ? 8 : 0));
}

export function scoreSurvivalEndingHookFromText(content: string): number {
  const endingWindow = content.slice(Math.max(0, content.length - 700));
  const hasHook = SURVIVAL_ENDING_RE.test(endingWindow);
  const hasChoicePressure = /必须|只能|要不要|还剩|天亮前|下一处|否则/u.test(endingWindow);
  const hasThreat = /尸群|丧尸|感染|门外|敲门|警报|广播|黑暗/u.test(endingWindow);
  return clamp(52
    + (hasHook ? 20 : 0)
    + (hasChoicePressure ? 12 : 0)
    + (hasThreat ? 8 : 0));
}

export function scoreShameSystemOpeningFromText(content: string): number {
  const firstWindow = content.slice(0, 1100);
  const hasScene = SHAME_SYSTEM_OPENING_SCENE_RE.test(firstWindow);
  const hasTask = SHAME_SYSTEM_OPENING_TASK_RE.test(firstWindow);
  const hasObstacle = SHAME_SYSTEM_OPENING_OBSTACLE_RE.test(firstWindow);
  const hasFeedback = SHAME_SYSTEM_OPENING_FEEDBACK_RE.test(firstWindow);
  return clamp(50
    + (hasScene ? 10 : 0)
    + (hasTask ? 14 : 0)
    + (hasObstacle ? 12 : 0)
    + (hasFeedback ? 14 : 0));
}

export function scoreShameSystemPromisePayoffFromText(content: string): number {
  const payoffWindow = content.slice(0, 4200);
  const payoffHits = countPatternMatches(payoffWindow, SHAME_SYSTEM_PAYOFF_RE);
  const reactionHits = countPatternMatches(payoffWindow, SHAME_SYSTEM_REACTION_RE);
  const hasPublicScene = SHAME_SYSTEM_OPENING_SCENE_RE.test(payoffWindow);
  const hasDialogueOrTaskLine = DIALOGUE_RE.test(payoffWindow) || /指定台词|台词完整/u.test(payoffWindow);
  return clamp(50
    + Math.min(payoffHits * 4, 24)
    + Math.min(reactionHits * 4, 20)
    + (hasPublicScene ? 8 : 0)
    + (hasDialogueOrTaskLine ? 6 : 0));
}

export function scoreShameSystemEndingHookFromText(content: string): number {
  const endingWindow = content.slice(Math.max(0, content.length - 700));
  const hasHook = SHAME_SYSTEM_ENDING_RE.test(endingWindow);
  const hasNextTaskPressure = /下一|新任务|倒计时|惩罚|奖励|积分|否则/u.test(endingWindow);
  const hasPublicReaction = /主管|同事|同学|围观|憋笑|盯着|偷拍视频|录音/u.test(endingWindow);
  return clamp(52
    + (hasHook ? 20 : 0)
    + (hasNextTaskPressure ? 12 : 0)
    + (hasPublicReaction ? 8 : 0));
}

export function scoreSportsOpeningFromText(content: string): number {
  const firstScreen = content.slice(0, 360);
  const firstWindow = content.slice(0, 1100);
  const hasAction = /跑|传|投|断|防|扑|起跳|卡位|补位|折返|压低|冲/u.test(firstScreen) || DIALOGUE_RE.test(firstWindow);
  const hasGoal = SPORTS_OPENING_GOAL_RE.test(firstWindow);
  const hasObstacle = SPORTS_OPENING_OBSTACLE_RE.test(firstWindow);
  const hasFeedback = SPORTS_OPENING_FEEDBACK_RE.test(firstWindow);
  return clamp(50
    + (hasAction ? 12 : 0)
    + (hasGoal ? 14 : 0)
    + (hasObstacle ? 12 : 0)
    + (hasFeedback ? 12 : 0));
}

export function scoreSportsPromisePayoffFromText(content: string): number {
  const payoffWindow = content.slice(0, 4200);
  const payoffHits = countPatternMatches(payoffWindow, SPORTS_PAYOFF_RE);
  const resultHits = countPatternMatches(payoffWindow, SPORTS_RESULT_RE);
  const hasCompetitivePressure = /比分|计时|教练|队友|替补席|球场|记分牌/u.test(payoffWindow);
  return clamp(50
    + Math.min(payoffHits * 4, 24)
    + Math.min(resultHits * 5, 22)
    + (hasCompetitivePressure ? 8 : 0));
}

export function scoreSportsEndingHookFromText(content: string): number {
  const endingWindow = content.slice(Math.max(0, content.length - 700));
  const hasHook = SPORTS_ENDING_RE.test(endingWindow);
  const hasNextPressure = /下一|明天|最后|还剩|必须|首发|名单|比分|教练/u.test(endingWindow);
  const hasTeamPressure = /教练|队友|替补席|记分牌|球场|首发名单/u.test(endingWindow);
  return clamp(52
    + (hasHook ? 20 : 0)
    + (hasNextPressure ? 12 : 0)
    + (hasTeamPressure ? 8 : 0));
}

export function scoreCampusClubOpeningFromText(content: string): number {
  const firstScreen = content.slice(0, 360);
  const firstWindow = content.slice(0, 1100);
  const hasAction = /贴|递|修|摆|登记|签|拉|笑|推|举|展示/u.test(firstScreen) || DIALOGUE_RE.test(firstWindow);
  const hasGoal = CAMPUS_CLUB_OPENING_GOAL_RE.test(firstWindow);
  const hasObstacle = CAMPUS_CLUB_OPENING_OBSTACLE_RE.test(firstWindow);
  const hasFeedback = CAMPUS_CLUB_OPENING_FEEDBACK_RE.test(firstWindow);
  return clamp(50
    + (hasAction ? 12 : 0)
    + (hasGoal ? 14 : 0)
    + (hasObstacle ? 12 : 0)
    + (hasFeedback ? 12 : 0));
}

export function scoreCampusClubPromisePayoffFromText(content: string): number {
  const payoffWindow = content.slice(0, 4200);
  const payoffHits = countPatternMatches(payoffWindow, CAMPUS_CLUB_PAYOFF_RE);
  const resultHits = countPatternMatches(payoffWindow, CAMPUS_CLUB_RESULT_RE);
  const hasCampusScene = /摊位|活动室|登记表|同学|老师|社团楼|校道/u.test(payoffWindow);
  return clamp(50
    + Math.min(payoffHits * 4, 24)
    + Math.min(resultHits * 5, 22)
    + (hasCampusScene ? 8 : 0));
}

export function scoreCampusClubEndingHookFromText(content: string): number {
  const endingWindow = content.slice(Math.max(0, content.length - 700));
  const hasHook = CAMPUS_CLUB_ENDING_RE.test(endingWindow);
  const hasNextPressure = /明天|下一|还差|必须|否则|验收|人数|名单|展示/u.test(endingWindow);
  const hasCampusPressure = /老师|同学|活动室|登记表|校报|社长|社团/u.test(endingWindow);
  return clamp(52
    + (hasHook ? 20 : 0)
    + (hasNextPressure ? 12 : 0)
    + (hasCampusPressure ? 8 : 0));
}

export function scoreWarStatecraftOpeningFromText(content: string): number {
  const firstScreen = content.slice(0, 360);
  const firstWindow = content.slice(0, 1100);
  const hasAction = /攻|守|夺|压|改阵|封|收编|颁|押|斩|退|降/u.test(firstScreen) || DIALOGUE_RE.test(firstWindow);
  const hasGoal = WAR_STATECRAFT_OPENING_GOAL_RE.test(firstWindow);
  const hasObstacle = WAR_STATECRAFT_OPENING_OBSTACLE_RE.test(firstWindow);
  const hasFeedback = WAR_STATECRAFT_OPENING_FEEDBACK_RE.test(firstWindow);
  return clamp(50
    + (hasAction ? 12 : 0)
    + (hasGoal ? 14 : 0)
    + (hasObstacle ? 12 : 0)
    + (hasFeedback ? 12 : 0));
}

export function scoreWarStatecraftPromisePayoffFromText(content: string): number {
  const payoffWindow = content.slice(0, 5200);
  const payoffHits = countPatternMatches(payoffWindow, WAR_STATECRAFT_PAYOFF_RE);
  const resultHits = countPatternMatches(payoffWindow, WAR_STATECRAFT_RESULT_RE);
  const hasPublicPowerScene = /城门|军营|府衙|朝堂|军帐|沙盘|国子监|旧贵族|降兵/u.test(payoffWindow);
  const ritualHits = countPatternMatches(payoffWindow, /祭坛|钥匙|坐标|秘门|碎片|封印|第三门/u);
  const ritualPenalty = ritualHits > payoffHits + resultHits ? 18 : 0;
  return clamp(50
    + Math.min(payoffHits * 4, 24)
    + Math.min(resultHits * 5, 24)
    + (hasPublicPowerScene ? 8 : 0)
    - ritualPenalty);
}

export function scoreWarStatecraftEndingHookFromText(content: string): number {
  const endingWindow = content.slice(Math.max(0, content.length - 700));
  const hasHook = WAR_STATECRAFT_ENDING_RE.test(endingWindow);
  const hasNextPressure = /下一|天亮前|反扑|换防|军令|廷议|必须|限期|旧贵族/u.test(endingWindow);
  const hasPowerPressure = /城门|军营|府衙|朝堂|兵权|政令|军功爵|旧贵族|门阀/u.test(endingWindow);
  return clamp(52
    + (hasHook ? 20 : 0)
    + (hasNextPressure ? 12 : 0)
    + (hasPowerPressure ? 8 : 0));
}
