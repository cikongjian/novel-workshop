import {
  RITUAL_MECHANIC_DRIFT_KEYWORDS,
  WAR_STATECRAFT_PAYOFF_KEYWORDS,
  WAR_STATECRAFT_SCENE_KEYWORDS,
} from './domain-drift-keywords.js';
import { SHOWBIZ_TOPIC_PROFILE } from './topic-profile-showbiz.js';
import { FANTASY_UPGRADE_TOPIC_PROFILE } from './topic-profile-fantasy-upgrade.js';

export type ChapterGenreFocus = 'showbiz' | 'romance' | 'career' | 'upgrade' | 'system' | 'food' | 'survival' | 'war-statecraft' | 'sports' | 'scifi-engineering' | 'campus-club-comedy' | 'civilization-upgrade' | 'generic';
export type TopicOpeningDimension = 'first-screen' | 'goal' | 'obstacle' | 'early-payoff' | 'ending-hook' | 'platform-fit' | 'word-count';
export type TopicKeywordRule = { label: string; keywords: string[] };
export type TopicStartupHints = { title: string; directionHint: string; openingHint: string; payoffHint: string; chapterNumbers?: number[] };
export type TopicOpeningRule = { dimension: TopicOpeningDimension; instruction: string; priority: number };
export type TopicFunctionalBlockTemplate = { title: string; summaryTemplate: string; location: string; tension: number; notes?: string };

export type TopicProfile = {
  id: string;
  priority: number;
  genreFocus: ChapterGenreFocus;
  patterns: RegExp[];
  requiredPayoffKeywords: string[];
  requiredSceneKeywords: string[];
  suspenseDriftKeywords?: string[];
  maxSuspenseShare: number;
  directionHint: string;
  openingHint?: string;
  payoffHint?: string;
  antiDriftHint?: string;
  forbiddenSubstitutions?: TopicKeywordRule[];
  preferredEndingFocus?: string[];
  antiDelayRule?: string;
  informationBoundaryRule?: string;
  delayedPayoff?: {
    anchorKeywords?: string[];
    executionKeywords?: string[];
    backstageKeywords?: string[];
  };
  startupHints?: TopicStartupHints;
  openingRules?: TopicOpeningRule[];
  startupBlocks?: TopicFunctionalBlockTemplate[];
  skillSignals?: string[];
  genreAliases?: string[];
  baselineGenre?: string;
};

const GENERIC_SUSPENSE = ['真相', '秘密', '线索', '调查', '监控', '匿名', '幕后', '来源'];

export const TOPIC_PROFILES: TopicProfile[] = [
  SHOWBIZ_TOPIC_PROFILE,
  FANTASY_UPGRADE_TOPIC_PROFILE,
  {
    id: 'war-statecraft',
    priority: 110,
    genreFocus: 'war-statecraft',
    patterns: [/(战争|争霸|架空历史|架空|天朝|残兵|攻城|破城|军功爵|废奴|科举|国子监|旧贵族|兵权|军令|军营|战场|诸侯|王朝|域主|狼主|邪尊|毒王)/],
    requiredPayoffKeywords: WAR_STATECRAFT_PAYOFF_KEYWORDS,
    requiredSceneKeywords: WAR_STATECRAFT_SCENE_KEYWORDS,
    suspenseDriftKeywords: RITUAL_MECHANIC_DRIFT_KEYWORDS,
    maxSuspenseShare: 0.28,
    directionHint: '战争/权谋/建国题材必须优先兑现攻城、练兵、兵权、政令、旧贵族反扑和秩序扩张。',
    openingHint: '开头优先进入战场、城门、军营、朝堂、政令执行或贵族反扑现场。',
    payoffHint: '本章至少让一次军事或政权格局发生可见变化：破城、收编、夺兵权、颁政令、废奴落地、科举推进等。',
    antiDriftHint: '祭坛、钥匙、坐标、碎片、第三门只能做极小背景，不能替代战争推进和制度落地。',
    forbiddenSubstitutions: [
      { label: '祭坛 / 钥匙 / 坐标 / 秘门型伪主线', keywords: RITUAL_MECHANIC_DRIFT_KEYWORDS },
      { label: '修仙解谜 / 神秘遗迹替代战争推进', keywords: ['神使', '邪神', '神谕', '秘境', '传承', '法器', '灵宝', '天机'] },
    ],
    preferredEndingFocus: ['战场或城门结果', '兵权或政令变化', '旧贵族/诸侯反扑的下一步'],
    antiDelayRule: '军令、攻城、政令或贵族反扑一旦立起，就要尽快写出破城/收编/站队/制度落地的结果。',
    informationBoundaryRule: '神明、预言、遗迹和异常物只能驱动军政行动，所有超常信息都必须落回兵权、城防、政令、盟约或战场代价。',
    delayedPayoff: {
      anchorKeywords: ['军令', '攻城', '破城', '政令', '兵权', '城门', '旧贵族'],
      executionKeywords: ['破城', '收编', '夺下', '颁下', '站队', '反扑', '改策'],
      backstageKeywords: ['营帐', '沙盘', '朝堂', '府衙', '军帐'],
    },
    startupHints: {
      title: '战争/权谋建国',
      directionHint: '首章必须让军政主线可见：攻城、军令、兵权、政令、贵族反扑至少落一项。',
      openingHint: '前 500 字进入战场、城门、军营、朝堂或政令执行，不要先写祭坛、钥匙、坐标和秘门。',
      payoffHint: '首章主回报必须是战场结果、兵权变化、政令落地或势力站队变化。',
    },
    openingRules: [
      { dimension: 'first-screen', instruction: '战争/权谋开篇前段必须出现军政现场：战场、城门、军营、朝堂、政令执行至少一项。', priority: 105 },
      { dimension: 'early-payoff', instruction: '首章回报必须改变战场、兵权、城防、政令或势力站队，不能只解锁秘物。', priority: 106 },
    ],
    startupBlocks: [
      { title: '军政现场先压上来', summaryTemplate: '先把主角放进战场、城门、军营或朝堂压力里，让军令、兵权、城防或政令成为本章现实麻烦。{anchor0}', location: '战场 / 城门 / 军营 / 朝堂', tension: 8 },
      { title: '当场改变量级', summaryTemplate: '主角必须做出影响军政局势的动作，优先兑现：{sceneLabel}，不要转去解谜。{anchor1}', location: '城墙 / 营帐 / 府衙 / 校场', tension: 9 },
      { title: '结果落到格局上', summaryTemplate: '把“{payoffLabel}”落成破城、收编、站队、政令或旧贵族反制，并用“{endingFocus}”收尾。{anchor2}', location: '城门 / 朝堂 / 军帐', tension: 8 },
    ],
    skillSignals: ['historical'],
    genreAliases: ['historical', 'history', 'mouzhi', 'lishi'],
    baselineGenre: 'mouzhi',
  },
  {
    id: 'scifi-engineering',
    priority: 100,
    genreFocus: 'scifi-engineering',
    patterns: [/(科幻|硬科幻|工程|太空|星环|空间站|轨道|气闸|冷却阀|维修臂|推进模块|实验|读数|参数|信标)/],
    requiredPayoffKeywords: ['实验', '读数', '参数', '修正', '反馈', '验证', '回稳', '闭合', '信标', '故障解除', '维修完成'],
    requiredSceneKeywords: ['气闸', '冷却阀', '维修臂', '推进模块', '备用电池', '氧压', '舱门', '控制台', '外壁', '轨道', '模块'],
    maxSuspenseShare: 0.28,
    directionHint: '科幻/工程题材主驱动力必须是故障、读数、试错、参数修正和现场反馈。',
    openingHint: '开头优先进入具体工程事故现场：报警、读数、阀门、气闸、氧压、维修臂至少落地两项。',
    payoffHint: '本章至少完成一次“读数异常 -> 方案试错 -> 参数/机械修正 -> 可见反馈”的闭环。',
    antiDriftHint: '异常信号和来源只能触发下一次维修任务，不能把主线改成追查来源或幕后阴谋。',
    preferredEndingFocus: ['下一处工程故障', '读数回稳后的新风险', '维修完成后的更高门槛'],
    antiDelayRule: '故障、读数或实验一旦立起，就必须尽快进入试错和现场反馈，不能连续只讨论来源。',
    delayedPayoff: {
      anchorKeywords: ['读数', '参数', '气闸', '氧压', '模块', '信标'],
      executionKeywords: ['修正', '回稳', '闭合', '解除', '验证', '维修完成'],
      backstageKeywords: ['控制台', '实验室', '维修舱', '外壁'],
    },
    startupHints: {
      title: '科幻工程',
      directionHint: '首章必须把科技设定写成现场问题和工程反馈，不要先做谜团铺陈。',
      openingHint: '前 500 字进入事故现场，报警/读数/氧压/阀门/舱门至少出现两项。',
      payoffHint: '首章至少给一次工程闭环：异常读数、试错方案、机械或参数修正、可见反馈。',
    },
    openingRules: [
      { dimension: 'first-screen', instruction: '科幻工程首屏必须有工程事故或设备异常，读数、报警、氧压、阀门、舱门至少落一项。', priority: 105 },
      { dimension: 'early-payoff', instruction: '早期回报必须是一次可验证的工程反馈，不要只确认异常来源。', priority: 106 },
    ],
    startupBlocks: [
      { title: '故障现场报警', summaryTemplate: '开场直接进入工程事故，读数、报警、氧压、阀门或舱门必须可见。{anchor0}', location: '空间站 / 外壁 / 控制台 / 维修舱', tension: 8 },
      { title: '试错修正参数', summaryTemplate: '主角用具体动作试错，围绕{sceneLabel}推进修正，不要转成追查来源。{anchor1}', location: '控制台 / 设备舱 / 外壁', tension: 8 },
      { title: '反馈回到设备状态', summaryTemplate: '把“{payoffLabel}”落成信标、舱门、氧压、温度或轨道状态变化，并抛出下一处工程风险。{anchor2}', location: '控制台 / 舱门 / 轨道外壁', tension: 7 },
    ],
    skillSignals: ['scifi'],
    genreAliases: ['scifi', 'sci-fi', 'science-fiction', 'kehuan'],
    baselineGenre: 'kehuan',
  },
  {
    id: 'sports-competition',
    priority: 98,
    genreFocus: 'sports',
    patterns: [/(体育|竞技|篮球|足球|校队|替补|训练|选拔赛|比赛|比分|计时|防守|传球|篮板|战术|教练|队友|膝伤)/],
    requiredPayoffKeywords: ['得分', '防住', '封盖', '助攻', '反超', '抢断', '篮板', '传球', '站位', '修正', '入选', '名单'],
    requiredSceneKeywords: ['球场', '体育馆', '替补席', '记分牌', '比分', '第三节', '第四节', '计时', '弧顶', '底角', '防守', '挡拆', '教练'],
    maxSuspenseShare: 0.22,
    directionHint: '体育竞技题材主驱动力必须是训练、比赛回合、比分压力、动作修正和队友信任。',
    openingHint: '开头优先进入训练赛、选拔赛、跑道或球场对抗，用比分、计时、身体状态和教练指令建立压力。',
    payoffHint: '本章至少闭环一次“失误/落后 -> 技术或战术修正 -> 分数/回合结果 -> 队友或教练反应”。',
    antiDriftHint: '不要把体育文写成调查秘密、社团招新、经营订单或职场审批。',
    preferredEndingFocus: ['比分或名单变化', '教练/队友信任变化', '下一场对抗压力'],
    antiDelayRule: '训练、选拔或比赛一旦立起，就要给回合结果、分数变化或名单变化，不能连续只写赛前准备。',
    delayedPayoff: {
      anchorKeywords: ['比赛', '训练', '选拔赛', '比分', '记分牌', '替补席'],
      executionKeywords: ['得分', '防住', '助攻', '反超', '入选', '抢断', '封盖'],
      backstageKeywords: ['更衣室', '替补席', '赛前', '训练馆'],
    },
    startupHints: {
      title: '体育竞技',
      directionHint: '首章必须把竞技卖点写到场上：训练、比赛、比分、身体状态、队友/教练反应至少两项。',
      openingHint: '前 500 字进入球场、跑道、训练赛或选拔赛，不要先写校园闲聊和身世铺垫。',
      payoffHint: '首章至少给一次回合结果：防住、得分、助攻、反超、入选或被教练重新评价。',
    },
    openingRules: [
      { dimension: 'first-screen', instruction: '体育竞技开篇前段必须进入运动现场，用比分、计时、身体极限或教练指令建立压力。', priority: 105 },
      { dimension: 'early-payoff', instruction: '首章早期回报必须是回合结果、技术修正、比分变化或名单/信任变化。', priority: 106 },
    ],
    startupBlocks: [
      { title: '场上压力先成立', summaryTemplate: '直接进入训练赛、选拔赛或正式比赛，用比分、计时、身体状态和教练指令建立压力。{anchor0}', location: '球场 / 体育馆 / 跑道', tension: 8 },
      { title: '失误后修正动作', summaryTemplate: '主角先受阻再修正技术或战术，围绕{sceneLabel}给出具体回合。{anchor1}', location: '场上 / 替补席边', tension: 9 },
      { title: '结果打到比分和关系', summaryTemplate: '把“{payoffLabel}”落成分数、回合、名单或队友/教练反应，并以“{endingFocus}”收尾。{anchor2}', location: '记分牌前 / 替补席 / 更衣室外', tension: 8 },
    ],
    skillSignals: ['sports'],
    genreAliases: ['sports', 'tiyu'],
    baselineGenre: 'tiyu',
  },
  {
    id: 'campus-club-comedy',
    priority: 94,
    genreFocus: 'campus-club-comedy',
    patterns: [/(校园|大学|大一|社团|招新|废社|模型社|手作|轻喜剧|活动室|同学|学长|学姐|报名)/],
    requiredPayoffKeywords: ['招新', '报名', '社团', '留下', '加入', '社长', '误会', '笑', '修好', '凑满', '保住社团'],
    requiredSceneKeywords: ['摊位', '传单', '活动室', '登记表', '社团楼', '校道', '模型', '高达', '招新表'],
    maxSuspenseShare: 0.24,
    directionHint: '校园社团轻喜剧主驱动力必须是招新、误会笑点、同学互动和小技能兑现。',
    openingHint: '开头优先进入招新现场、社团摊位、活动室或课堂社交场。',
    payoffHint: '本章至少兑现一次校园社团回报：报名、误会成笑点、技能吸引围观、人数或关系位置变化。',
    antiDriftHint: '不要把校园轻喜剧写成查线索、签合同、谈预算或经营订单。',
    preferredEndingFocus: ['报名人数变化', '误会升级', '社团关系下一步'],
    antiDelayRule: '招新、废社或活动室危机一旦立起，就要给报名、留下、误会升级或社团位置变化。',
    startupBlocks: [
      { title: '招新现场先出糗', summaryTemplate: '开场放到招新摊位、校道或活动室，让废社危机和尴尬误会同时出现。{anchor0}', location: '招新摊位 / 活动室 / 校道', tension: 7 },
      { title: '技能变成笑点', summaryTemplate: '用模型、手作或社团技能制造互动，优先兑现：{sceneLabel}。{anchor1}', location: '摊位前 / 活动室', tension: 8 },
      { title: '第一位同学留下', summaryTemplate: '把“{payoffLabel}”落成报名、留下、误会升级或社团关系变化，并用“{endingFocus}”收尾。{anchor2}', location: '登记表前 / 社团楼', tension: 7 },
    ],
    skillSignals: ['campus'],
    genreAliases: ['campus', 'modern', 'urban'],
    baselineGenre: 'dushi',
  },
  {
    id: 'food-business',
    priority: 92,
    genreFocus: 'food',
    patterns: [/(美食|一碗面|酸汤面|面馆|面摊|饭摊|小饭摊|小吃|摆摊|开摊|开店|食肆|酒楼|饭馆|掌勺|下厨|做菜|食客|馋哭)/],
    requiredPayoffKeywords: [
      '开张',
      '铜板',
      '问价',
      '试吃',
      '续碗',
      '排队',
      '卖光',
      '售罄',
      '回头客',
      '复购',
      '添面粉',
      '摊子钱',
      '馋哭',
      '五块',
      '掏钱',
      '付钱',
      '收钱',
      '微信',
      '转账',
      '带走',
      '打包',
      '卖出',
      '数钱',
      '带一队人来',
    ],
    requiredSceneKeywords: ['灶台', '锅边', '锅里', '摊子', '摊前', '破庙', '庙口', '集市', '街边', '食肆', '酒楼', '面汤', '酸汤', '葱香'],
    maxSuspenseShare: 0.32,
    directionHint: '美食/经营题材必须先把手艺写成现实收益，不要把回报让给苦情铺垫或神秘贵人赏识。',
    openingHint: '开头优先写主角动手做、卖、试吃、出锅。',
    payoffHint: '前段至少给一次食物带来的公开反馈：闻香围拢、有人掏钱、有人争着尝、口碑起量。',
    antiDriftHint: '不要长期停在挨饿、回忆、猜测身份；做饭和成交必须尽快落地。',
    preferredEndingFocus: ['第一笔生意后的更大机会', '口碑扩散', '下一锅/下一摊更大场面'],
    antiDelayRule: '食物一出锅就要尽快写闻香、试吃、成交或口碑扩散。',
    startupHints: {
      title: '美食/种田求生',
      directionHint: '被逐、断粮、挨饿只能做起跳板，首章必须尽快转成找食材、生火、和面、开灶、摆摊等动作，并让吃食带来现实收益。',
      openingHint: '前 300 字先让主角处理食材、起火、下锅或准备开张，不要连续写寒风、破庙和苦情回忆。',
      payoffHint: '至少给一次公开反馈：有人被香气勾住、有人掏铜板、有人争着尝、有人当场给下一步机会。',
    },
    skillSignals: ['farming'],
    genreAliases: ['food', 'farming', 'historical', 'urban'],
    baselineGenre: 'dushi',
  },
  {
    id: 'farming-survival',
    priority: 90,
    genreFocus: 'food',
    patterns: [/(种田|农女|农家|被逐|赶出家门|荒年|逃荒|开荒|山村|田地|庄子|粗面|野菜)/],
    requiredPayoffKeywords: ['活下来', '生火', '火苗', '做成', '找到粮', '换粮', '换几文钱', '铜钱', '五文', '撑一天', '留一碗', '摆摊', '开张', '翻身'],
    requiredSceneKeywords: ['灶台', '田里', '溪边', '山脚', '集市', '院里', '庙门'],
    maxSuspenseShare: 0.34,
    directionHint: '种田/求生题材必须尽快把困境转成求生动作和翻身路径。',
    openingHint: '开头先写主角如何活命、找吃的、动手做事。',
    payoffHint: '首章至少出现一次“靠手活命”的现实反馈：活下来、换到粮、摆成摊、拿到下一步机会。',
    antiDriftHint: '若正文大半还停在受苦和回忆，没有行动与收益，说明节奏失速。',
    startupHints: {
      title: '美食/种田求生',
      directionHint: '被逐、断粮、挨饿只能做起跳板，首章必须尽快转成找食材、生火、开灶、摆摊、找粮或换粮。',
      openingHint: '前 300 字先让主角处理食材、找粮、生火或准备活路，苦情背景点到为止。',
      payoffHint: '至少给一次现实反馈：活下来、换到粮、有人被香气勾住、第一笔铜板或下一步翻身机会。',
    },
    skillSignals: ['farming'],
    genreAliases: ['farming', 'historical'],
    baselineGenre: 'lishi',
  },
  {
    id: 'romance-rivals',
    priority: 88,
    genreFocus: 'romance',
    patterns: [/(死对头|欢喜冤家|冤家|宿敌|对家|针锋相对|互怼|水火不容|死敌|协议同居|先动心|动心|甜宠|甜文)/],
    requiredPayoffKeywords: ['互怼', '同框', '逼近', '拉住', '拽住', '拉回', '牵手', '护短', '吃醋', '心跳', '关心', '嘴硬', '触碰', '体温', '旧伤', '旧疤', '疤痕', '推拿', '按摩', '星星', '刻字', '四目相对', '签字', '共享合约', '手套'],
    requiredSceneKeywords: ['当面', '堵在', '门口', '电梯', '会场', '宴会', '并肩', '同桌', '厨房', '客厅', '同居', '副驾', '沙发'],
    maxSuspenseShare: 0.3,
    directionHint: '死对头/欢喜冤家题材必须尽快让两人正面碰撞，把张力写在互动里。',
    openingHint: '开头优先安排双方进入同一现场，尽快完成互怼、压制、护短或被迫合作。',
    payoffHint: '前段至少给一次关系回报：互怼火花、强制同框、牵手压力、嘴硬关心、护短失控、误会升级。',
    antiDriftHint: '不要把首章大半写成单线筹备、旁人议论或身份悬念。',
    preferredEndingFocus: ['关系推进的下一步', '心动后的选择', '护短后的站位变化'],
    antiDelayRule: '关系对象一旦立起，就要尽快同场碰撞和关系推进，不能连续只写旁人转述。',
    startupHints: {
      title: '死对头拉扯',
      directionHint: '死对头题材首章必须让双方尽快进入同一现场，正面碰撞比身份猜测和旁人评价更重要。',
      openingHint: '前 800-1200 字内让两人当面交锋，至少完成一次正面压制、互呛或被迫并肩。',
      payoffHint: '至少落一次关系型回报：互呛上头、公开护短、肢体拉扯、误会升级、被迫合作。',
    },
    skillSignals: ['romance'],
    genreAliases: ['romance', 'yanqing'],
    baselineGenre: 'yanqing',
  },
  {
    id: 'shame-system',
    priority: 87,
    genreFocus: 'system',
    patterns: [/(羞耻系统|社死系统|羞耻任务|社死任务|公开处刑|社死发言|指定台词|当众.{0,12}任务|任务.{0,12}(羞耻|社死)|系统.{0,12}(羞耻|社死)|围观反应)/],
    requiredPayoffKeywords: ['任务完成', '奖励', '积分', '台词完整', '指定台词', '羞耻任务', '社死任务', '公开任务', '惩罚', '社死', '脸红', '尴尬', '围观', '憋笑', '起哄', '公开处刑'],
    requiredSceneKeywords: ['早会', '办公室', '会议室', '教室', '大厅', '同事', '同学', '主管', '围观', '倒计时', '任务栏', '现场'],
    suspenseDriftKeywords: ['系统来源', '幕后操控', '绑定原因', '真相', '秘密', '线索', '调查'],
    maxSuspenseShare: 0.28,
    directionHint: '羞耻/社死系统题材必须优先兑现任务执行、公开翻车、围观反应和奖励惩罚，不要把主线改成研究系统来源。',
    openingHint: '开头优先让任务在真实公共场景触发，并立刻逼主角执行指定动作或台词。',
    payoffHint: '本章至少给一次社死回报：任务完成、奖励/惩罚落地、围观起哄或关系位置变化。',
    antiDriftHint: '系统解释、来源猜测和幕后线索只能点到，不能替代社死动作和公开反馈。',
    preferredEndingFocus: ['下一次更难的公开任务', '奖励惩罚后的关系变化', '围观者或上级的新条件'],
    antiDelayRule: '羞耻任务一旦触发，就要尽快执行并给围观反应，不能连续讲规则。',
    startupHints: {
      title: '羞耻/社死系统',
      directionHint: '首章必须让任务触发、公共场景、执行动作、围观反应和奖励惩罚尽早可见。',
      openingHint: '前 500 字进入早会、教室、办公室、大厅或直播现场，不要先解释系统来历。',
      payoffHint: '首章至少完成一次社死任务，并让奖励、惩罚、围观或关系变化当场落地。',
    },
    openingRules: [
      { dimension: 'goal', instruction: '羞耻系统开篇必须明确当前任务、指定台词或动作目标。', priority: 104 },
      { dimension: 'obstacle', instruction: '阻碍必须来自公共场景和围观压力，例如同事、同学、主管、弹幕或倒计时。', priority: 105 },
      { dimension: 'early-payoff', instruction: '早期回报必须是任务完成、奖励惩罚、围观反应或关系变化，不能只解释系统。', priority: 106 },
    ],
    startupBlocks: [
      { title: '任务当场弹出', summaryTemplate: '开场放进早会、教室、办公室或直播现场，让羞耻任务和倒计时立刻压到主角身上。{anchor0}', location: '办公室 / 教室 / 大厅 / 直播现场', tension: 8 },
      { title: '公开执行翻车', summaryTemplate: '主角必须在围观中执行指定台词或动作，围绕{sceneLabel}制造社死反应。{anchor1}', location: '众人视线中央', tension: 9 },
      { title: '奖励惩罚落地', summaryTemplate: '把“{payoffLabel}”落成任务完成、积分奖励、惩罚升级、关系变化或下一次更难任务。{anchor2}', location: '公共场景尾声', tension: 8 },
    ],
    skillSignals: ['system'],
    genreAliases: ['system', 'modern', 'urban'],
    baselineGenre: 'dushi',
  },
  {
    id: 'civilization-upgrade',
    priority: 86,
    genreFocus: 'civilization-upgrade',
    patterns: [/(文明升级|蛮荒|部落|教.*知识|教.*变强|获得.*异能|神罚|神兽|制陶|炼铁|造城|钻木取火)/],
    requiredPayoffKeywords: ['教学', '教会', '做成', '烧成', '火候', '慢点加柴', '陶碗', '装水', '没漏', '喝水', '粘土坑', '获得能力', '异能', '文明升级', '部落进步', '工具', '储粮', '烧个缸', '击退神兽', '破解诅咒'],
    requiredSceneKeywords: ['篝火', '河边', '河滩', '制陶', '陶碗', '围栏', '储粮', '净水', '矿洞', '炼铁', '神罚', '神兽'],
    maxSuspenseShare: 0.36,
    directionHint: '文明升级题材必须把知识教学写成可见能力和部落进步，再用神罚或环境压力验证。',
    openingHint: '开头优先落在教学、制作、部落生存或神罚压迫现场。',
    payoffHint: '本章至少闭环一次“具体知识/工具 -> 部落反馈 -> 主角能力或防御增强”。',
    antiDriftHint: '世界秘密只能作为教学或对抗副产品，不能替代文明升级卖点。',
    preferredEndingFocus: ['工具/知识带来的部落变化', '神罚压力下的下一次验证', '新技术门槛'],
    skillSignals: ['fantasy'],
    genreAliases: ['fantasy', 'xuanhuan', 'qihuan'],
    baselineGenre: 'qihuan',
  },
  {
    id: 'apocalypse-survival',
    priority: 84,
    genreFocus: 'survival',
    patterns: [/(末世|丧尸|尸潮|废土|安全屋|避难所|补给|物资|感染|灾变|极寒|天灾|求生|生存物资)/],
    requiredPayoffKeywords: ['加固', '挡住', '清水', '工具箱', '活下来', '补给', '物资', '水瓶', '食物', '药', '堵住', '安全屋', '换到', '拿到', '撑到天亮', '救下'],
    requiredSceneKeywords: ['安全屋', '避难所', '地下车库', '便利店', '超市', '楼道', '门缝', '铁门', '尸群', '尸潮', '广播', '补给点'],
    suspenseDriftKeywords: ['真相', '秘密', '线索', '调查', '来源', '幕后', '实验档案', '旧钥匙'],
    maxSuspenseShare: 0.3,
    directionHint: '末世/生存题材必须把危险压成资源选择、路线选择、加固防守和活命反馈，不要改成追查实验来源。',
    openingHint: '开头优先进入缺水、缺药、尸群、封门、补给点或避难所压力现场。',
    payoffHint: '本章至少完成一次求生闭环：拿到物资、加固入口、救下人、撑过倒计时或换到安全位置。',
    antiDriftHint: '档案、旧钥匙、实验来源只能触发下一次生存风险，不能替代物资和安全反馈。',
    preferredEndingFocus: ['新一波尸群或天灾压力', '补给不足后的下一处目标', '安全屋被打破后的选择'],
    antiDelayRule: '缺水、尸群、封门或补给目标一旦立起，就要尽快给资源或安全状态变化。',
    startupHints: {
      title: '末世/生存求生',
      directionHint: '首章必须让危险、资源、行动和短回报形成闭环，不能只讲灾变背景。',
      openingHint: '前 500 字进入缺水、缺药、尸群、门缝、补给点或安全屋，不要先解释世界崩坏史。',
      payoffHint: '首章至少给一次现实回报：拿到水/药/工具、挡住尸群、救下人或撑到下一阶段。',
    },
    openingRules: [
      { dimension: 'goal', instruction: '末世生存开篇必须明确当下求生目标：水、药、工具、避难所、封门或路线。', priority: 104 },
      { dimension: 'obstacle', instruction: '阻碍必须是即时危险或资源压力，例如尸群、感染、夜晚、断电、门破或物资不足。', priority: 105 },
      { dimension: 'early-payoff', instruction: '早期回报必须改变资源或安全状态，不能只发现档案、钥匙或旧线索。', priority: 106 },
    ],
    startupBlocks: [
      { title: '资源压力先见底', summaryTemplate: '开场让缺水、缺药、尸群或门缝危险立刻出现，目标必须是活到下一阶段。{anchor0}', location: '楼道 / 便利店 / 安全屋 / 地下车库', tension: 9 },
      { title: '动手换安全', summaryTemplate: '主角用工具、路线或临时防御处理{sceneLabel}，不要转成查档案。{anchor1}', location: '门后 / 货架间 / 车边', tension: 9 },
      { title: '资源或防线落地', summaryTemplate: '把“{payoffLabel}”落成拿到物资、封住入口、救下人或撑过倒计时，并抛出下一波压力。{anchor2}', location: '安全屋门口 / 补给点外', tension: 8 },
    ],
    skillSignals: ['survival'],
    genreAliases: ['apocalypse', 'survival', 'kehuan', 'urban'],
    baselineGenre: 'kehuan',
  },
  {
    id: 'historical-power',
    priority: 72,
    genreFocus: 'war-statecraft',
    patterns: [/(权谋|朝堂|门阀|女帝|皇帝|太后|王朝|府衙|朝臣|兵权|城门|戍卫|阵|幡|印|卷轴)/],
    requiredPayoffKeywords: ['站队', '布局', '反制', '夺权', '兵权', '门阀', '朝堂', '太后', '皇帝', '府衙', '戍卫', '阵型', '城门'],
    requiredSceneKeywords: ['城门', '府衙', '河滩', '药铺', '铁门', '白幡', '卷轴', '印', '兵', '刀鞘'],
    maxSuspenseShare: 0.4,
    directionHint: '历史/权谋题材的世界要素必须改变站队、兵权、门阀筹码或城门控制。',
    payoffHint: '本章至少让一次权力格局当场变化。',
    antiDriftHint: '不能把权谋主回报写成单纯查线索。',
    skillSignals: ['historical'],
    genreAliases: ['historical', 'history', 'mouzhi', 'lishi'],
    baselineGenre: 'mouzhi',
  },
];

export type TopicProfileId = typeof TOPIC_PROFILES[number]['id'];

export type InferTopicProfilesParams = {
  genre?: string;
  novelTitle?: string;
  novelSynopsis?: string;
  novelTags?: string[];
  constitutionTags?: string[];
  promiseSignals?: string[];
  extraText?: string;
};

export function buildTopicCorpus(params: InferTopicProfilesParams): string {
  return [
    params.novelTitle ?? '',
    params.novelSynopsis ?? '',
    ...(params.novelTags ?? []),
    ...(params.constitutionTags ?? []),
    ...(params.promiseSignals ?? []),
    params.genre ?? '',
    params.extraText ?? '',
  ].join('\n');
}

export function inferTopicProfiles(params: InferTopicProfilesParams): TopicProfile[] {
  const corpus = buildTopicCorpus(params);
  const explicitIds = new Set([...(params.constitutionTags ?? []), ...(params.promiseSignals ?? [])]);
  return TOPIC_PROFILES
    .filter(profile => explicitIds.has(profile.id) || profile.patterns.some(pattern => pattern.test(corpus)))
    .sort((a, b) => b.priority - a.priority);
}

export function getPrimaryTopicProfile(profiles: TopicProfile[]): TopicProfile | undefined {
  const hasShowbiz = profiles.some(profile => profile.genreFocus === 'showbiz');
  const romance = profiles.find(profile => profile.genreFocus === 'romance');
  if (hasShowbiz && romance) return romance;
  return profiles[0];
}

export function getTopicProfileById(id: string): TopicProfile | undefined {
  return TOPIC_PROFILES.find(profile => profile.id === id);
}

export function getTopicProfilesByFocus(focus: ChapterGenreFocus): TopicProfile[] {
  return TOPIC_PROFILES.filter(profile => profile.genreFocus === focus);
}

export function topicProfilesToConstitutionSignals(profiles = TOPIC_PROFILES): Array<{
  id: string;
  patterns: RegExp[];
  requiredPayoffKeywords: string[];
  requiredSceneKeywords: string[];
  suspenseDriftKeywords?: string[];
  maxSuspenseShare: number;
  directionHint?: string;
  openingHint?: string;
  payoffHint?: string;
  antiDriftHint?: string;
}> {
  return profiles.map(profile => ({
    id: profile.id,
    patterns: profile.patterns,
    requiredPayoffKeywords: [...profile.requiredPayoffKeywords],
    requiredSceneKeywords: [...profile.requiredSceneKeywords],
    suspenseDriftKeywords: profile.suspenseDriftKeywords ? [...profile.suspenseDriftKeywords] : undefined,
    maxSuspenseShare: profile.maxSuspenseShare,
    directionHint: profile.directionHint,
    openingHint: profile.openingHint,
    payoffHint: profile.payoffHint,
    antiDriftHint: profile.antiDriftHint,
  }));
}

export function inferTopicGenreFocus(params: InferTopicProfilesParams): ChapterGenreFocus | undefined {
  return getPrimaryTopicProfile(inferTopicProfiles(params))?.genreFocus;
}

export function getTopicSignalIds(params: InferTopicProfilesParams): string[] {
  return inferTopicProfiles(params).map(profile => profile.id);
}

export function getTopicSkillSignals(params: InferTopicProfilesParams): string[] {
  return [...new Set(inferTopicProfiles(params).flatMap(profile => profile.skillSignals ?? []))];
}

export function getTopicGenreAliases(genre: string): string[] {
  return [...new Set(inferTopicProfiles({ genre }).flatMap(profile => profile.genreAliases ?? []))];
}

export function resolveTopicBaselineGenre(genre: string): string | undefined {
  return getPrimaryTopicProfile(inferTopicProfiles({ genre }))?.baselineGenre;
}

export function getGenericSuspenseKeywords(): string[] {
  return [...GENERIC_SUSPENSE];
}
