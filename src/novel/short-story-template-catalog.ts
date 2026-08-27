import type { ShortStoryBlueprint, ShortStoryTemplate as ShortStoryTemplateId } from './short-story-types.js';

export const shortStoryTemplateIds = [
  'son-in-law',
  'rebirth-revenge',
  'fast-cultivation',
  'ceo-romance',
  'system-upgrade',
  'face-slapping',
  'custom',
] as const;

export interface ShortStoryTemplateDimension {
  label: string;
  value: string;
}

export interface ShortStoryTemplatePreset {
  value: ShortStoryTemplateId;
  label: string;
  description: string;
  tags: string[];
  recommendedWordCount: number;
  recommendedChapters: number;
  dimensions: ShortStoryTemplateDimension[];
  blueprint: Partial<ShortStoryBlueprint>;
}

const presets: ShortStoryTemplatePreset[] = [
  {
    value: 'son-in-law',
    label: '都市赘婿逆袭',
    description: '低位开局，高位身份反杀，适合连续打脸和高密度身份曝光。',
    tags: ['都市', '身份反差', '高密打脸'],
    recommendedWordCount: 25000,
    recommendedChapters: 18,
    dimensions: [
      { label: '爽点引擎', value: '身份曝光 + 商战碾压 + 众人跪求' },
      { label: '情绪走向', value: '屈辱受压 -> 连续反杀 -> 全场震惊' },
      { label: '关系张力', value: '前妻 / 岳母 / 情敌轮番施压' },
      { label: '付费抓手', value: '第 3 章前后抛出更高层身份与更大靠山' },
      { label: '商业节奏', value: '适合 18 章左右的连续升级链' },
    ],
    blueprint: {
      template: 'son-in-law',
      payoffDensity: 'extreme',
      paceMode: 'ultra-fast',
      styleGuide: '短句、强对话、强围观反应，重点放大身份反差、当场打脸和层层升级。',
      hook: {
        openingPunch: '离婚现场被当众羞辱，主角签字后隐藏身份当场曝光。',
        coreLoop: '受辱 -> 亮出一张底牌 -> 全场震惊 -> 反派失控 -> 更高一级挑战进场',
        climaxChain: '家族身份全面公开 -> 商业对手崩盘 -> 前妻后悔 -> 众人跪求原谅 -> 主角转身离场',
        chapterEndStrategy: '悬念型为主，身份升级型和新敌人进场型为辅。',
      },
      protagonist: {
        name: '林峯',
        startState: '被轻视的上门女婿，长期遭受岳家羞辱。',
        endState: '完成身份逆袭，成为人人高攀不起的顶层人物。',
        goldFinger: '隐藏豪门血统 + 商业帝国继承权',
        coreGoal: '让所有轻贱自己的人当众付出代价。',
      },
      antagonists: [
        { name: '岳母', role: '势利岳母，最先羞辱主角', defeatChapter: 3, defeatMethod: '身份初步曝光后当场失语' },
        { name: '前妻', role: '嫌贫爱富的婚姻背叛者', defeatChapter: 5, defeatMethod: '看清主角真实层级后追悔莫及' },
        { name: '情敌', role: '高调张狂的豪门公子', defeatChapter: 8, defeatMethod: '被主角以资源和地位双重碾压' },
        { name: '商界对手', role: '自认能掌控局面的集团掌门', defeatChapter: 15, defeatMethod: '在终极身份公开后全面溃败' },
      ],
      forbidden: ['支线恋爱纠缠', '长篇背景铺陈', '主角反复隐忍不爆发', '无效配角围观'],
    },
  },
  {
    value: 'rebirth-revenge',
    label: '重生复仇',
    description: '用预知优势提前布网，持续让仇人自投罗网。',
    tags: ['重生', '复仇', '反转'],
    recommendedWordCount: 28000,
    recommendedChapters: 20,
    dimensions: [
      { label: '爽点引擎', value: '预知未来 + 布局反杀 + 真相揭露' },
      { label: '情绪走向', value: '压抑记忆 -> 逐个清算 -> 最终释怀' },
      { label: '关系张力', value: '前任 / 闺蜜 / 家庭压迫形成连续背刺' },
      { label: '付费抓手', value: '每个仇人翻车前先埋一段信息差' },
      { label: '商业节奏', value: '适合 20 章分层复仇清单' },
    ],
    blueprint: {
      template: 'rebirth-revenge',
      payoffDensity: 'extreme',
      paceMode: 'ultra-fast',
      styleGuide: '复仇信息密集、对话驱动、反转要快，重点放大仇人自作自受的过程。',
      hook: {
        openingPunch: '主角重生回到悲剧发生前一天，冷静决定这次绝不再输。',
        coreLoop: '预知危险 -> 提前布置 -> 仇人主动上钩 -> 证据反咬 -> 下一个目标浮出水面',
        climaxChain: '全部仇人聚齐 -> 主角公开完整证据链 -> 仇人互相撕咬 -> 法律制裁落地 -> 主角开启新生',
        chapterEndStrategy: '反转型为主，计划推进型和真相揭露型为辅。',
      },
      protagonist: {
        name: '苏晴',
        startState: '前世被至亲和恋人合谋害死，带着记忆回到一切开始前。',
        endState: '完成复仇并挣脱旧关系网，建立自己的新秩序。',
        goldFinger: '重生记忆 + 关键事件时间线预知',
        coreGoal: '逐个清算仇人，让所有加害者付出成倍代价。',
      },
      antagonists: [
        { name: '前男友', role: '伪装深情的利益投机者', defeatChapter: 4, defeatMethod: '真面目被当众揭开，信誉崩塌' },
        { name: '闺蜜', role: '表面温柔实则算计最深的人', defeatChapter: 7, defeatMethod: '陷害链条被完整反证' },
        { name: '恶毒婆婆', role: '推动上一世悲剧的家庭压迫者', defeatChapter: 10, defeatMethod: '关键证词曝光后被彻底抛弃' },
        { name: '幕后黑手', role: '真正操盘整场阴谋的获利者', defeatChapter: 16, defeatMethod: '被证据闭环锁死，无路可退' },
      ],
      forbidden: ['圣母式原谅', '拖沓虐心回忆', '仇人毫无代价地下线', '支线救赎稀释主线'],
    },
  },
  {
    value: 'fast-cultivation',
    label: '玄幻速成',
    description: '境界升级和宗门打脸并行，强调强敌压迫下的高速突破。',
    tags: ['玄幻', '升级', '宗门'],
    recommendedWordCount: 30000,
    recommendedChapters: 20,
    dimensions: [
      { label: '爽点引擎', value: '突破升级 + 越级碾压 + 宗门震动' },
      { label: '情绪走向', value: '废柴受辱 -> 快速突破 -> 横推强敌' },
      { label: '关系张力', value: '同门轻视、长老偏见、外宗来犯' },
      { label: '付费抓手', value: '每次突破前都预埋更高境界门槛' },
      { label: '商业节奏', value: '适合 20 章连续破境与擂台赛' },
    ],
    blueprint: {
      template: 'fast-cultivation',
      payoffDensity: 'extreme',
      paceMode: 'ultra-fast',
      styleGuide: '术语要少而准，升级反馈要强，战斗场景短促有力，避免世界观讲解淹没爽点。',
      hook: {
        openingPunch: '主角在测灵台被讥为废物，却在绝境中觉醒系统当场破境。',
        coreLoop: '被轻视 -> 获得资源或系统奖励 -> 越级出手 -> 满场震惊 -> 更强敌人出现',
        climaxChain: '连续破境 -> 宗门大比封神 -> 外敌来袭 -> 一战镇压诸敌 -> 登顶更高天阶',
        chapterEndStrategy: '期待型为主，危机型和突破前夜型为辅。',
      },
      protagonist: {
        name: '叶凡',
        startState: '被宗门视作废柴的外门弟子，处处被人踩在脚下。',
        endState: '完成从底层弟子到最强天骄的飞升式逆袭。',
        goldFinger: '修炼系统 + 稀缺资源自动返还',
        coreGoal: '在最短时间内变强，踩碎所有看不起自己的人。',
      },
      antagonists: [
        { name: '同门恶霸', role: '长期欺压主角的外门师兄', defeatChapter: 2, defeatMethod: '主角初次突破后一招反杀' },
        { name: '天才弟子', role: '自认无敌的宗门明星', defeatChapter: 5, defeatMethod: '擂台上被主角跨境击败' },
        { name: '偏见长老', role: '一直打压主角晋升的高层', defeatChapter: 9, defeatMethod: '在实力铁证前公开改口' },
        { name: '敌宗首徒', role: '外宗压境的最强天才', defeatChapter: 17, defeatMethod: '终极大战中被主角彻底镇压' },
      ],
      forbidden: ['复杂设定堆砌', '连续数章闭关不动', '无意义地图跳转', '战斗复盘过长'],
    },
  },
  {
    value: 'ceo-romance',
    label: '霸总甜宠',
    description: '以宠溺兑现和公开站队为主，强调甜点和打脸双线推进。',
    tags: ['都市', '甜宠', '言情'],
    recommendedWordCount: 22000,
    recommendedChapters: 15,
    dimensions: [
      { label: '爽点引擎', value: '护短宠溺 + 公开偏爱 + 情敌失势' },
      { label: '情绪走向', value: '被轻视 -> 被坚定选择 -> 高糖官宣' },
      { label: '关系张力', value: '职场压迫、前任纠缠、豪门阻力' },
      { label: '付费抓手', value: '免费章节压在误会与偏爱反转之间' },
      { label: '商业节奏', value: '适合 15 章高糖高钩子短链路' },
    ],
    blueprint: {
      template: 'ceo-romance',
      payoffDensity: 'high',
      paceMode: 'fast',
      styleGuide: '甜宠兑现要快，人物互动要直接，打脸与撒糖交替推进，避免长时间误会拖延。',
      hook: {
        openingPunch: '女主误闯总裁禁区，本以为要被清退，结果被对方当众护住。',
        coreLoop: '女主受委屈 -> 男主偏爱出手 -> 反派翻车 -> 关系升温 -> 新阻力到来',
        climaxChain: '官宣恋情 -> 豪门对线 -> 众人改口 -> 盛大婚礼或终极守护 -> 高糖收尾',
        chapterEndStrategy: '甜点型为主，危机误会型和官宣前夜型为辅。',
      },
      protagonist: {
        name: '苏晚',
        startState: '在职场和情感里都不被珍惜的普通女孩。',
        endState: '成为被坚定选择的人，也拥有独立底气。',
        goldFinger: '意外闯入顶级权力者视野，被明确偏爱',
        coreGoal: '得到真正的尊重与爱，并让轻视自己的人后悔。',
      },
      antagonists: [
        { name: '恶毒同事', role: '借职场规则压女主的对手', defeatChapter: 3, defeatMethod: '在男主护短下被公开拆穿' },
        { name: '前任白月光', role: '伪装优雅的情感挑拨者', defeatChapter: 7, defeatMethod: '算计被戳破后彻底失势' },
        { name: '豪门千金', role: '看不起女主出身的竞争者', defeatChapter: 12, defeatMethod: '官宣场上被直接打脸' },
      ],
      forbidden: ['反复误会不解释', '虐恋拉扯过长', '第三者长期占戏', '女主持续被动不成长'],
    },
  },
  {
    value: 'system-upgrade',
    label: '系统流升级',
    description: '以任务驱动和奖励兑现为核心，适合都市、职场、直播等快反馈场景。',
    tags: ['系统', '任务流', '逆袭'],
    recommendedWordCount: 26000,
    recommendedChapters: 18,
    dimensions: [
      { label: '爽点引擎', value: '任务完成 -> 奖励到账 -> 现实打脸' },
      { label: '情绪走向', value: '底层困局 -> 接连通关 -> 资源暴涨' },
      { label: '关系张力', value: '上司、同行、平台规则共同施压' },
      { label: '付费抓手', value: '每章结尾抛出更高奖励和更难任务' },
      { label: '商业节奏', value: '适合 18 章任务链与排行榜提升' },
    ],
    blueprint: {
      template: 'system-upgrade',
      payoffDensity: 'extreme',
      paceMode: 'ultra-fast',
      styleGuide: '系统提示要简短利落，奖励反馈必须立刻落到现实收益，避免长篇解释机制。',
      hook: {
        openingPunch: '主角在最狼狈的时刻被系统绑定，第一条任务就能逆转当前羞辱场面。',
        coreLoop: '遭遇压制 -> 系统发布任务 -> 险中完成 -> 奖励即时兑现 -> 新任务抬高筹码',
        climaxChain: '主线任务连锁完成 -> 身份资源全面升级 -> 所有人意识到主角不可阻挡 -> 最终大奖兑现',
        chapterEndStrategy: '任务升级型为主，奖励预告型和排行榜反超型为辅。',
      },
      protagonist: {
        name: '陈默',
        startState: '失业又负债的底层青年，被周围人当作彻底失败者。',
        endState: '靠系统连环升级完成财富、地位和自我价值逆袭。',
        goldFinger: '成长型系统，任务完成后即时结算现实奖励',
        coreGoal: '在最短时间内翻盘人生，建立属于自己的上升通道。',
      },
      antagonists: [
        { name: '前上司', role: '习惯踩压主角的职场压迫者', defeatChapter: 3, defeatMethod: '被主角借系统奖励完成反向收购' },
        { name: '网红同行', role: '靠流量羞辱主角的竞争者', defeatChapter: 6, defeatMethod: '直播数据被全面反超后翻车' },
        { name: '资本老板', role: '试图掌控主角资源的操盘手', defeatChapter: 11, defeatMethod: '被主角用系统奖励构建的新资源链反制' },
        { name: '终局对手', role: '专门针对系统任务布局的顶级玩家', defeatChapter: 16, defeatMethod: '最终任务中被主角连续截胡' },
      ],
      forbidden: ['系统规则解释过长', '奖励兑现延迟多章', '失败惩罚缺乏压迫感', '任务与主线脱节'],
    },
  },
  {
    value: 'face-slapping',
    label: '高压打脸局',
    description: '专注于极限羞辱与极限反杀，适合直播、校园、豪门宴会等公开场景。',
    tags: ['打脸', '围观', '反杀'],
    recommendedWordCount: 24000,
    recommendedChapters: 16,
    dimensions: [
      { label: '爽点引擎', value: '公开羞辱 + 现场翻盘 + 围观炸场' },
      { label: '情绪走向', value: '高压压制 -> 极限反杀 -> 连锁跪服' },
      { label: '关系张力', value: '对手必须当众挑衅，围观者形成扩音器' },
      { label: '付费抓手', value: '付费起点必须卡在最大羞辱或最大翻盘前一拍' },
      { label: '商业节奏', value: '适合 16 章短链路高频反转' },
    ],
    blueprint: {
      template: 'face-slapping',
      payoffDensity: 'extreme',
      paceMode: 'ultra-fast',
      styleGuide: '围绕公开场合制造压迫和反转，台词要锋利，围观反应要密，打脸兑现必须当场完成。',
      hook: {
        openingPunch: '主角在公开场合被推到台前羞辱，众人等着看笑话时他反手掀桌。',
        coreLoop: '反派高调挑衅 -> 主角暂时被压 -> 关键证据或实力亮出 -> 全场失声 -> 下一轮更大场面到来',
        climaxChain: '多重羞辱局连环引爆 -> 主角一次次现场翻盘 -> 最大对手身败名裂 -> 全场态度反转',
        chapterEndStrategy: '危机型和反转型交替，保证每章末都挂住下一场公开对决。',
      },
      protagonist: {
        name: '顾言',
        startState: '被贴上失败者标签，走到哪里都被拿来取笑。',
        endState: '成为谁都不敢再轻视的强势中心人物。',
        goldFinger: '关键证据链 + 超出预期的真实能力',
        coreGoal: '在所有公开羞辱自己的场合，一次次把局面反过来。',
      },
      antagonists: [
        { name: '宴会主持人', role: '故意抬高别人踩低主角的煽动者', defeatChapter: 2, defeatMethod: '当场被主角逼出失言破绽' },
        { name: '豪门二代', role: '以出身压人的高调反派', defeatChapter: 5, defeatMethod: '在公众场面下被主角彻底压垮体面' },
        { name: '行业评委', role: '偏见深重、话语权极大的裁判者', defeatChapter: 9, defeatMethod: '被铁证推翻判断，公信力崩塌' },
        { name: '幕后主使', role: '设计所有羞辱局的策划者', defeatChapter: 14, defeatMethod: '在终局直播或发布会上身败名裂' },
      ],
      forbidden: ['暗线拖太长不兑现', '反派私下退场', '围观者没有明确态度变化', '主角连续多章只挨打不反击'],
    },
  },
  {
    value: 'custom',
    label: '自定义模板',
    description: '自行组合主角设定、钩子、反派和禁区，适合明确知道自己想写什么的作者。',
    tags: ['自由创作'],
    recommendedWordCount: 25000,
    recommendedChapters: 18,
    dimensions: [
      { label: '爽点引擎', value: '由你自行定义' },
      { label: '情绪走向', value: '由你自行定义' },
      { label: '关系张力', value: '由你自行定义' },
      { label: '付费抓手', value: '建议围绕免费章后的首次强兑现设计' },
      { label: '商业节奏', value: '默认适配 18 章左右的短篇快节奏结构' },
    ],
    blueprint: {
      template: 'custom',
      payoffDensity: 'extreme',
      paceMode: 'ultra-fast',
      styleGuide: '短句、强对话、强钩子，确保每章都有明确推进和兑现。',
      forbidden: ['支线剧情过多', '环境描写过长', '慢节奏铺垫'],
    },
  },
];

export function listShortStoryTemplatePresets(): ShortStoryTemplatePreset[] {
  return presets.map((preset) => ({
    ...preset,
    tags: [...preset.tags],
    dimensions: preset.dimensions.map((dimension) => ({ ...dimension })),
    blueprint: structuredClone(preset.blueprint),
  }));
}

export function getShortStoryTemplatePreset(
  template: string
): ShortStoryTemplatePreset | null {
  const preset = presets.find((item) => item.value === template);
  if (!preset) {
    return null;
  }

  return {
    ...preset,
    tags: [...preset.tags],
    dimensions: preset.dimensions.map((dimension) => ({ ...dimension })),
    blueprint: structuredClone(preset.blueprint),
  };
}
