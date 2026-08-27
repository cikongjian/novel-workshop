import type { PromiseContract } from './promise-contract.js';
import {
  inferTopicProfiles,
  type ChapterGenreFocus,
  type TopicProfile,
} from './topic-profiles.js';

export type StartupTopicOpeningSignals = {
  topicIds: string[];
  hasGoal: boolean;
  hasObstacle: boolean;
  hasPayoff: boolean;
};

type TopicOpeningMatchRule = {
  ids?: string[];
  foci?: ChapterGenreFocus[];
  pattern: RegExp;
};

const FOOD_TOPIC_IDS = ['food-business', 'farming-survival'];

const TOPIC_GOAL_RULES: TopicOpeningMatchRule[] = [
  {
    ids: ['showbiz'],
    foci: ['showbiz'],
    pattern: /试镜|拿角色|保住角色|抢资源|签约|叫停签约|叫停|热搜|直播|录制|定妆|通告|番位|截胡资源|预警|塌房预警|塌房倒计时|避雷|排雷|公开验证|直播验证|爆红|翻红|站队|压住对家|茶饮代言|代言/u,
  },
  {
    ids: FOOD_TOPIC_IDS,
    foci: ['food'],
    pattern: /开灶|生火|起火|做汤|做菜|野菜|灰灰菜|找粮|换粮|换钱|换几文钱|摆摊|开摊|活下来|撑一天|明天.{0,12}多摘/u,
  },
  {
    ids: ['romance-rivals'],
    foci: ['romance'],
    pattern: /合同|同居|规则|签字|共享合约|客厅|玄关|门口|堵在|搬进|搬走|被迫.{0,8}(合作|同住|同居)/u,
  },
  {
    ids: ['civilization-upgrade'],
    foci: ['civilization-upgrade'],
    pattern: /陶碗|碗胚|黏土|粘土|火候|慢点加柴|制陶|烧成|储粮|净水|围栏|教会|教学/u,
  },
  {
    ids: ['apocalypse-survival'],
    foci: ['survival'],
    pattern: /补给券|补给|物资|换水|换药|工具箱|加固|封门|堵门|车门|安全屋|避难所|活到|撑到|找水|找药/u,
  },
  {
    ids: ['shame-system'],
    foci: ['system'],
    pattern: /羞耻任务|社死任务|公开任务|任务栏|倒计时|指定台词|台词完整|当众.{0,12}(说|念|做|完成)|早会|办公室/u,
  },
  {
    ids: ['sports-competition'],
    foci: ['sports'],
    pattern: /比赛|选拔赛|训练赛|班赛|比分|计时|防守|传球|助攻|得分|反超|入选|首发|修正站位|战术/u,
  },
  {
    ids: ['campus-club-comedy'],
    foci: ['campus-club-comedy'],
    pattern: /招新|报名|登记表|社团|活动室|保住社团|废社|修好模型|展示|摊位/u,
  },
  {
    ids: ['war-statecraft', 'historical-power'],
    foci: ['war-statecraft'],
    pattern: /攻城|破城|守城|练兵|军令|兵权|政令|废奴|科举|军功爵|收编|改阵|夺城楼|封粮道/u,
  },
  {
    ids: ['fantasy-upgrade'],
    foci: ['upgrade'],
    pattern: /破境|突破|修炼|夺取|抢夺|斩杀|反杀|挑战|擂台|闯秘境|入秘境|赌场|坊市|灵药|灵石|功法|传承/u,
  },
];

const TOPIC_OBSTACLE_RULES: TopicOpeningMatchRule[] = [
  {
    ids: ['showbiz'],
    foci: ['showbiz'],
    pattern: /被换角|换掉|换剧本|专属版本|加戏版|走流程|打过招呼|资源咖|蹲通告|剩最后一个|5分钟准备|五分钟准备|不提示|单出|加试|临时加试|前经纪人|压番|撤物料|撤资源|黑热搜|假通稿|爆料|营销号|抢位|抢角色|封杀|临时换|质疑|嘲|试镜失利|华丽退场|塌房倒计时|倒计时|压轴签约|没作品没流量没后台|没有话语权|签约台|签约本|不能签这个约|茶饮代言|代言人.{0,12}塌房|对家.{0,12}(抢|换|压|截|黑|爆|踩)|导演组.{0,12}(犹豫|改口|换人)|品牌方.{0,12}(撤|观望|压|签)|经纪人.{0,12}(压|抢|换)/u,
  },
  {
    ids: FOOD_TOPIC_IDS,
    foci: ['food'],
    pattern: /没钱|断粮|被赶|赶出|荒院|破庙|塌|半缸雨水|只剩|不够|挨饿|油星用光|粮袋见底/u,
  },
  {
    ids: ['romance-rivals'],
    foci: ['romance'],
    pattern: /同一套房|两份合同|违约金|不搬|不准搬|堵在门口|死对头|对家|不能退租|房东/u,
  },
  {
    ids: ['civilization-upgrade'],
    foci: ['civilization-upgrade'],
    pattern: /裂|炸开|烧坏|怀疑|长老|神罚|雨|没漏前|漏水|塌|不信/u,
  },
  {
    ids: ['apocalypse-survival'],
    foci: ['survival'],
    pattern: /尸群|丧尸|感染|血迹|门缝|黑暗|今晚|熬不过|只剩|断电|封锁|门板.{0,8}(响|裂)|尸潮/u,
  },
  {
    ids: ['shame-system'],
    foci: ['system'],
    pattern: /当众|围观|七八双眼睛|同事|同学|主管|老师|弹幕|社死|公开处刑|惩罚|不能失败|倒计时/u,
  },
  {
    ids: ['sports-competition'],
    foci: ['sports'],
    pattern: /落后|失误|膝伤|犯规|防不住|替补|倒计时|只剩|教练|盯防|封死|体力|比分.{0,8}落后/u,
  },
  {
    ids: ['campus-club-comedy'],
    foci: ['campus-club-comedy'],
    pattern: /没人报名|废社|解散|截止|收回活动室|被笑|误会|老师|社长|只剩|传单.{0,8}吹/u,
  },
  {
    ids: ['war-statecraft', 'historical-power'],
    foci: ['war-statecraft'],
    pattern: /围城|守军|旧贵族|反扑|粮道|城门|兵变|军心|叛将|压境|门阀|太后|夺兵权/u,
  },
  {
    ids: ['fantasy-upgrade'],
    foci: ['upgrade'],
    pattern: /被逐|逐出|废去|丹田.{0,8}(碎|废|裂)|追杀|追兵|封锁|受伤|伤口|境界压制|修为压制|宗门执法|资源不足|灵石不足|擅入者死/u,
  },
];

const TOPIC_PAYOFF_RULES: TopicOpeningMatchRule[] = [
  {
    ids: ['showbiz'],
    foci: ['showbiz'],
    pattern: /冲上热搜|热搜.{0,12}(升|爆|进|压住|挂上)|直播间.{0,12}(涨|刷屏|起量)|导演.{0,12}(点头|改口|定下|站队)|张启明.{0,16}(定|回复|站起来)|留她|改合同|试镜通过|合同对接|成导.{0,12}安排|角色.{0,12}(定|保住|拿下)|女二.{0,8}定|直接试女一|签约暂停|叫停签约|提前排雷|排雷|公开验证|体验官|质检报告|供应链清单|品牌道歉|王总追上|新预警|塌房预警|品牌方.{0,12}(回电|递|改口|签|暂停|道歉|追上|开放)|站队|资源.{0,12}(回|拿|定)|评论区.{0,16}(刷屏|转向|炸|变了风向)|粉丝.{0,12}(闭嘴|改口)|弹幕.{0,16}(滚动|刷屏|截图|疯传)|弹幕墙.{0,16}(滚动|亮|炸)/u,
  },
  {
    ids: FOOD_TOPIC_IDS,
    foci: ['food'],
    pattern: /铜钱|铜板|五文|五块|换到|换了|买了|够了|成交|开张|留一碗|再来一碗|回头客|撑过|撑一天|掏钱|付钱|收钱|微信|转账|带走|打包|卖了|卖出|明天.{0,12}来|明天.{0,12}带|明天.{0,12}别带少/u,
  },
  {
    ids: ['romance-rivals'],
    foci: ['romance'],
    pattern: /记得|旧疤|旧伤|拉回|拽住|签字|嘴硬关心|走路小心|共享合约|手套|靠近|心跳|脸热/u,
  },
  {
    ids: ['civilization-upgrade'],
    foci: ['civilization-upgrade'],
    pattern: /没漏|装水|喝水|喝了|烧成|做成|陶碗|储粮|教会|再试一次|明天.{0,12}更好|烧个缸/u,
  },
  {
    ids: ['apocalypse-survival'],
    foci: ['survival'],
    pattern: /加固|堵住|挡住|封住|换到|拿到|清水|水瓶|药|工具|工具箱|活到|撑到|安全屋|救下/u,
  },
  {
    ids: ['shame-system'],
    foci: ['system'],
    pattern: /任务完成|完成任务|奖励|积分|惩罚解除|围观|憋笑|起哄|脸红|尴尬|台词完整|公开任务/u,
  },
  {
    ids: ['sports-competition'],
    foci: ['sports'],
    pattern: /得分|防住|助攻|反超|抢断|封盖|入选|首发名单|名单|队友.{0,8}(点头|信任|补位)|教练.{0,8}(点头|改口)/u,
  },
  {
    ids: ['campus-club-comedy'],
    foci: ['campus-club-comedy'],
    pattern: /报名|登记|留下|加入|凑满|修好|保住社团|笑出声|误会升级|帮.{0,8}拉.{0,8}同学|活动室.{0,8}留下/u,
  },
  {
    ids: ['war-statecraft', 'historical-power'],
    foci: ['war-statecraft'],
    pattern: /破城|夺城楼|收编|兵权|军令|政令|废奴|军功爵|国子监|站队|换防|封赏|问罪|粮道.{0,8}断/u,
  },
  {
    ids: ['fantasy-upgrade'],
    foci: ['upgrade'],
    pattern: /突破|破境|反杀|斩杀|击败|碾压|越级|炼气.{0,8}层|练气.{0,8}层|筑基|灵石到手|灵药到手|得到.{0,8}(功法|传承|资源)|获得.{0,8}(功法|传承|资源)|围观.{0,16}(震惊|改口|退后)/u,
  },
];

function hasTopic(rule: TopicOpeningMatchRule, profiles: TopicProfile[]): boolean {
  return profiles.some(profile =>
    (rule.ids?.includes(profile.id) ?? false)
    || (rule.foci?.includes(profile.genreFocus) ?? false),
  );
}

function matchesTopicRule(text: string, profiles: TopicProfile[], rules: TopicOpeningMatchRule[]): boolean {
  return rules.some(rule => hasTopic(rule, profiles) && rule.pattern.test(text));
}

function countKeywordHits(text: string, keywords: string[]): number {
  let total = 0;
  for (const keyword of keywords) {
    if (!keyword) continue;
    let index = text.indexOf(keyword);
    while (index >= 0) {
      total += 1;
      index = text.indexOf(keyword, index + keyword.length);
    }
  }
  return total;
}

export function evaluateStartupTopicOpeningSignals(params: {
  chapterContent: string;
  goalWindow: string;
  payoffWindow: string;
  promiseContract?: PromiseContract;
}): StartupTopicOpeningSignals {
  const { chapterContent, goalWindow, payoffWindow, promiseContract } = params;
  const profiles = inferTopicProfiles({
    promiseSignals: promiseContract?.constitutionSignals,
    extraText: chapterContent.slice(0, 3200),
  });
  const topicIds = profiles.map(profile => profile.id);
  const contractSceneHits = countKeywordHits(goalWindow, promiseContract?.requiredSceneKeywords ?? []);
  const contractPayoffHits = countKeywordHits(payoffWindow, promiseContract?.requiredPayoffKeywords ?? []);
  const hasSystemTopic = profiles.some(profile => profile.genreFocus === 'system');

  return {
    topicIds,
    hasGoal: contractSceneHits >= 1 || matchesTopicRule(goalWindow, profiles, TOPIC_GOAL_RULES),
    hasObstacle: matchesTopicRule(goalWindow, profiles, TOPIC_OBSTACLE_RULES),
    hasPayoff: contractPayoffHits >= (hasSystemTopic ? 2 : 1)
      || matchesTopicRule(payoffWindow, profiles, TOPIC_PAYOFF_RULES),
  };
}
