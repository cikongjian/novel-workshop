import type { Chapter } from '../novel/types.js';
import { inferTopicProfiles, type TopicProfile } from './topic-profiles.js';

const SHOWBIZ_SIGNAL_RE = /娱乐圈|影帝|影后|顶流|试镜|热搜|剧组|番位|综艺|经纪人|片场|导演组|塌房|翻红|爆红|代言|体验官/u;
const SHOWBIZ_OPENING_GOAL_RE = /试镜|拿角色|保住角色|抢资源|签约|叫停签约|叫停|热搜|直播|录制|定妆|通告|番位|截胡资源|预警|塌房预警|塌房倒计时|避雷|排雷|公开验证|直播验证|爆红|翻红|站队|压住对家|茶饮代言|代言/u;
const SHOWBIZ_OPENING_OBSTACLE_RE = /被换角|换掉|换剧本|专属版本|加戏版|走流程|打过招呼|资源咖|蹲通告|剩最后一个|5分钟准备|五分钟准备|不提示|单出|加试|临时加试|前经纪人|压番|撤物料|撤资源|黑热搜|假通稿|爆料|营销号|抢位|抢角色|封杀|临时换|质疑|嘲|试镜失利|华丽退场|塌房倒计时|倒计时|压轴签约|没作品没流量没后台|没有话语权|签约台|签约本|不能签这个约|茶饮代言|代言人.{0,12}塌房|对家.{0,12}(抢|换|压|截|黑|爆|踩)|导演组.{0,12}(犹豫|改口|换人)|品牌方.{0,12}(撤|观望|压|签)|经纪人.{0,12}(压|抢|换)/u;
const SHOWBIZ_OPENING_FEEDBACK_RE = /冲上热搜|热搜.{0,12}(升|爆|进|压住|挂上)|直播间.{0,12}(涨|刷屏|起量)|导演.{0,12}(点头|改口|定下|站队)|张启明.{0,16}(定|回复|站起来)|留她|改合同|试镜通过|合同对接|成导.{0,12}安排|角色.{0,12}(定|保住|拿下)|女二.{0,8}定|直接试女一|签约暂停|叫停签约|提前排雷|排雷|公开验证|体验官|质检报告|供应链清单|品牌道歉|王总追上|新预警|塌房预警|品牌方.{0,12}(回电|递|改口|签|暂停|道歉|追上|开放)|站队|资源.{0,12}(回|拿|定)|评论区.{0,16}(刷屏|转向|炸|变了风向)|粉丝.{0,12}(闭嘴|改口)|弹幕.{0,16}(滚动|刷屏|截图|疯传)|弹幕墙.{0,16}(滚动|亮|炸)/u;
const SHOWBIZ_PUBLIC_SCENE_RE = /试镜|片场|导演组|节目组|直播|直播间|微博|评论区|录制现场|定妆|镜头|热搜|摄影棚|签约台|发布会|弹幕墙|官宣|代言/u;
const SHOWBIZ_PRIVATE_DEAL_RE = /休息室|会客室|办公室|私下|合同|律师函|转账|谈条件|文件夹|茶几|沙发|单独|监控/u;
const SHOWBIZ_PAYOFF_RE = /试镜|角色|热搜|资源|站队|翻红|爆红|通告|番位|压戏|截胡|预警|避雷|排雷|签约|签约暂停|叫停签约|定妆|涨粉|直播间|弹幕墙|品牌方|导演|公开验证|直播验证|体验官|质检报告|供应链清单|品牌道歉/u;
const SHOWBIZ_RESULT_RE = /冲上热搜|热搜第一|拿到角色|拿下角色|角色定下|角色保住|女二.{0,8}定|直接试女一|愿不愿意直接试女一|导演点头|导演改口|导演站队|张启明.{0,16}(定|回复|站起来)|签约暂停|叫停签约|提前排雷|公开验证|质检报告|供应链清单|体验官|品牌道歉|新预警|塌房预警|品牌方改口|品牌方.{0,16}(暂停|道歉|追上|开放|改口)|合同递来|资源回正|资源反抢|站队|粉丝转向|评论区反转|评论区.{0,16}(炸|变了风向)|直播间人数涨|弹幕.{0,16}(滚动|刷屏|截图|疯传)|弹幕墙.{0,16}(滚动|亮|炸)|通告递来|撤物料取消/u;
const SHOWBIZ_REACTION_RE = /(?:导演|张启明|经纪人|品牌方|品牌负责人|王总|负责人|对家|影帝|影后|制片|老周|副导演|刘凯|助理|工作人员|主持人).{0,16}(点头|改口|递|站|停|看|让|签|定|喊|沉默|退|脸色|僵硬|追上|暂停|开放|道歉|叫停)|(?:弹幕|弹幕墙|评论区|粉丝|观众).{0,16}(滚动|刷屏|转向|炸|改口|闭嘴|喊|疯传)/u;
const SHOWBIZ_ENDING_RE = /下一场直播|下一轮试镜|下一个塌房预警|下一个预警|新预警|塌房预警|倒计时|热搜|品牌方|通告|导演组|节目组|录制|录制现场|综艺录制现场|定妆|角色|番位|站队|签约|合同|官宣|发布会|评论区|舆论|粉丝|直播间|弹幕墙|代言|体验官/u;
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

export function isShowbizLikeChapter(chapter: Chapter): boolean {
  return inferChapterProfiles(chapter).some(profile => profile.id === 'showbiz' || profile.genreFocus === 'showbiz')
    || SHOWBIZ_SIGNAL_RE.test([
      chapter.title,
      chapter.summary,
      chapter.content.slice(0, 1400),
      chapter.content.slice(-900),
    ].join('\n'));
}

export function scoreShowbizOpeningFromText(content: string): number {
  const firstScreen = content.slice(0, 360);
  const firstWindow = content.slice(0, 1100);
  const hasAction = /走|站|推|递|拦|看|开播|试镜|上场|举起|按住|转身|开口|冲|切|叫停|签/u.test(firstScreen)
    || DIALOGUE_RE.test(firstWindow);
  const hasGoal = SHOWBIZ_OPENING_GOAL_RE.test(firstWindow);
  const hasObstacle = SHOWBIZ_OPENING_OBSTACLE_RE.test(firstWindow);
  const hasFeedback = SHOWBIZ_OPENING_FEEDBACK_RE.test(firstWindow);
  return clamp(50
    + (hasAction ? 12 : 0)
    + (hasGoal ? 12 : 0)
    + (hasObstacle ? 14 : 0)
    + (hasFeedback ? 14 : 0));
}

export function scoreShowbizPromisePayoffFromText(content: string): number {
  const payoffWindow = content.slice(0, 4200);
  const payoffHits = countPatternMatches(payoffWindow, SHOWBIZ_PAYOFF_RE);
  const resultHits = countPatternMatches(payoffWindow, SHOWBIZ_RESULT_RE);
  const publicSceneHits = countPatternMatches(payoffWindow, SHOWBIZ_PUBLIC_SCENE_RE);
  const privateDealHits = countPatternMatches(payoffWindow, SHOWBIZ_PRIVATE_DEAL_RE);
  const hasIndustryReaction = SHOWBIZ_REACTION_RE.test(payoffWindow);
  const privatePenalty = privateDealHits >= 4 && privateDealHits > publicSceneHits + resultHits ? 12 : 0;
  return clamp(48
    + Math.min(payoffHits * 3, 22)
    + Math.min(resultHits * 6, 24)
    + (publicSceneHits >= 2 ? 6 : 0)
    + (hasIndustryReaction ? 10 : 0)
    - privatePenalty);
}

export function scoreShowbizEndingHookFromText(content: string): number {
  const endingWindow = content.slice(Math.max(0, content.length - 700));
  const hasHook = SHOWBIZ_ENDING_RE.test(endingWindow);
  const hasNextPressure = /明天|今晚|下一|必须|否则|限时|二十四小时|十点前|开播前|进组前|临时|新条件|撤|换|追加/u.test(endingWindow);
  const hasIndustryPressure = /导演|经纪人|品牌方|对家|影帝|影后|制片|粉丝|评论区|工作人员|主持人/u.test(endingWindow);
  return clamp(52
    + (hasHook ? 20 : 0)
    + (hasNextPressure ? 12 : 0)
    + (hasIndustryPressure ? 8 : 0));
}
