/**
 * 爽点 DNA 测试题库 —— 35 题池，5 类 × 7 题
 * 每题 8 个选项，随机抽 4 个展示
 * C(8,4) × C(35,8) 保证每次测试都有新鲜感
 */

export interface QuizOption {
  text: string;
  weights: Partial<Record<string, number>>;
}

export interface QuizQuestion {
  id: number;
  type: 'opening' | 'comeback' | 'trait' | 'relationship' | 'scene';
  question: string;
  illustrationPrompt?: string;
  options: QuizOption[];
}

export const DNA_DIMENSIONS = [
  { key: 'fantasy-upgrade', label: '玄幻升级' },
  { key: 'showbiz', label: '娱乐圈逆袭' },
  { key: 'collapse-warning', label: '塌房预警爆红' },
  { key: 'rebirth', label: '重生改命' },
  { key: 'faceslap', label: '打脸反杀' },
  { key: 'sweet', label: '爽甜拉扯' },
  { key: 'female-career', label: '大女主事业线' },
  { key: 'shame-system', label: '社死系统' },
] as const;

const Q: QuizQuestion[] = [

  // ====== 类型1：开局选择（7题） ======
  {
    id: 1, type: 'opening', question: '主角开局最惨的处境是？',
    illustrationPrompt: '孤独的背影站在悬崖边缘，远山暮色，国风插画',
    options: [
      { text: '被最信任的人亲手推下悬崖', weights: { rebirth: 3, 'fantasy-upgrade': 2 } },
      { text: '被全网群嘲后遭公司解约', weights: { showbiz: 3, 'collapse-warning': 2 } },
      { text: '在众人面前念出羞耻台词还被录像', weights: { 'shame-system': 3, faceslap: 2 } },
      { text: '被渣男/渣女当众羞辱还要赔钱', weights: { sweet: 2, 'female-career': 2 } },
      { text: '选秀最后一轮被资本黑幕做掉', weights: { showbiz: 3, 'female-career': 2 } },
      { text: '被师尊当着全门派废去修为', weights: { 'fantasy-upgrade': 3, faceslap: 2 } },
      { text: '重生后发现坟头草三米高', weights: { rebirth: 3, 'shame-system': 2 } },
      { text: '身为大佬却被系统判定为F级', weights: { 'fantasy-upgrade': 2, faceslap: 2, 'shame-system': 2 } },
    ],
  },
  {
    id: 2, type: 'opening', question: '如果主角一睁眼就发现处境很惨，你希望是？',
    illustrationPrompt: '破旧房间里一人惊醒，窗外雷雨交加，水墨光影',
    options: [
      { text: '满门被灭，自己是唯一幸存者', weights: { rebirth: 3, 'fantasy-upgrade': 2 } },
      { text: '全网造谣，热搜第一是"她塌房了"', weights: { showbiz: 3, 'collapse-warning': 2 } },
      { text: '穿着睡衣被锁在办公楼洗手间', weights: { 'shame-system': 3, 'female-career': 1 } },
      { text: '未婚夫当众悔婚，娘家人翻脸', weights: { sweet: 3, faceslap: 2 } },
      { text: '醒来发现契约书上写着"已签"', weights: { sweet: 2, 'female-career': 2, rebirth: 1 } },
      { text: '被赶出山门，师弟们朝你吐口水', weights: { 'fantasy-upgrade': 3, collapse: 2 } },
      { text: '前世记忆回来时，敌人已布好杀局', weights: { rebirth: 3, faceslap: 2 } },
      { text: '不小心把老板的假发当众扯掉', weights: { 'shame-system': 3, showbiz: 2 } },
    ],
  },
  {
    id: 3, type: 'opening', question: '主角在最低谷时，唯一的慰藉是？',
    illustrationPrompt: '暗室中一本书被光笼罩，四周尘埃飞舞，神秘氛围',
    options: [
      { text: '一本神秘古籍，藏着上古传承', weights: { 'fantasy-upgrade': 3, rebirth: 1 } },
      { text: '一个从未露面的圈内前辈发来的私信', weights: { showbiz: 3, 'collapse-warning': 2 } },
      { text: '自己偷偷备份的真相录音', weights: { 'female-career': 3, faceslap: 2 } },
      { text: '那个嘴最毒的人，偷偷在你家门口放了药', weights: { sweet: 3, 'shame-system': 1 } },
      { text: '一本账本，记录着所有人的把柄', weights: { 'collapse-warning': 3, faceslap: 2 } },
      { text: '前世日记里夹着的一张救命纸条', weights: { rebirth: 3, sweet: 1 } },
      { text: '你写的小说稿子，被神秘人翻到了最后一页', weights: { 'shame-system': 2, 'fantasy-upgrade': 2 } },
      { text: '街边算命老头递来一句："等风来"', weights: { 'fantasy-upgrade': 2, faceslap: 2, sweet: 1 } },
    ],
  },
  {
    id: 4, type: 'opening', question: '开局哪句话最能让你代入？',
    illustrationPrompt: '古老城门下一人独行，风起袍角扬，电影感构图',
    options: [
      { text: '"三年之期已到，请少主归位"', weights: { 'fantasy-upgrade': 3, faceslap: 2 } },
      { text: '"今晚的热搜，你自己看看"', weights: { showbiz: 3, 'collapse-warning': 2 } },
      { text: '"前世杀了你的人，这一世又来敲门了"', weights: { rebirth: 3, faceslap: 2 } },
      { text: '"这个月的房租，你打算怎么还？"', weights: { 'shame-system': 2, 'female-career': 2 } },
      { text: '"离婚协议签好了，净身出户"', weights: { sweet: 2, 'female-career': 2, faceslap: 1 } },
      { text: '"你的修为已被废除，从此不再是弟子"', weights: { 'fantasy-upgrade': 2, rebirth: 2 } },
      { text: '"提名名单出来了——没有你"', weights: { showbiz: 2, 'collapse-warning': 2, faceslap: 1 } },
      { text: '"系统已绑定，第一个任务：在广场跳科目三"', weights: { 'shame-system': 3, sweet: 1 } },
    ],
  },
  {
    id: 5, type: 'opening', question: '主角开局最缺的资源是？',
    illustrationPrompt: '空荡宝库中一件发光的小物件悬浮，周围黑暗深邃',
    options: [
      { text: '修为/境界（废柴体质）', weights: { 'fantasy-upgrade': 3, faceslap: 2 } },
      { text: '曝光/流量（糊穿地心）', weights: { showbiz: 3, 'collapse-warning': 2 } },
      { text: '时间（灾难只剩100天）', weights: { rebirth: 3, faceslap: 2 } },
      { text: '钱（负债三百万）', weights: { 'shame-system': 2, 'female-career': 2 } },
      { text: '人脉（所有人都在等着看笑话）', weights: { 'collapse-warning': 3, sweet: 1 } },
      { text: '真相（所有人都冤枉了你）', weights: { faceslap: 3, sweet: 1 } },
      { text: '美貌（穿越成了丑女/丑男）', weights: { sweet: 2, 'shame-system': 2, rebirth: 1 } },
      { text: '力量（技能栏全灰，只亮了一个"嗑瓜子"）', weights: { 'shame-system': 3, 'fantasy-upgrade': 1 } },
    ],
  },
  {
    id: 6, type: 'opening', question: '开局后主角做的第一件事？',
    illustrationPrompt: '深山中一人打坐修炼，周身灵气环绕，仙侠写意',
    options: [
      { text: '躲进山洞，疯狂修炼', weights: { 'fantasy-upgrade': 3, faceslap: 1 } },
      { text: '注册一个新号，改名换姓重新出道', weights: { showbiz: 3, rebirth: 2 } },
      { text: '找出前世害死自己的真凶', weights: { rebirth: 3, 'collapse-warning': 2 } },
      { text: '默默记录所有人的黑料', weights: { 'collapse-warning': 3, faceslap: 2 } },
      { text: '主动上门退婚，把休书拍在桌上', weights: { faceslap: 3, sweet: 1 } },
      { text: '去找那个唯一没拉黑你的闺蜜/兄弟', weights: { sweet: 2, 'shame-system': 2 } },
      { text: '梳理系统任务清单，选最不社死的一个', weights: { 'shame-system': 3, 'female-career': 1 } },
      { text: '去人才市场投了 100 份简历', weights: { 'female-career': 2, 'shame-system': 2 } },
    ],
  },
  {
    id: 7, type: 'opening', question: '开局后第一个冲突对象是？',
    illustrationPrompt: '两人对峙，一人胜券在握嘴角微扬，一人目光坚定',
    options: [
      { text: '当年废你修为的师尊/掌门', weights: { 'fantasy-upgrade': 3, faceslap: 2 } },
      { text: '抢你资源的对家小花/小生', weights: { showbiz: 3, 'collapse-warning': 2 } },
      { text: '前世那个笑着捅你的人', weights: { rebirth: 3, faceslap: 2 } },
      { text: '给你布置社死任务的系统', weights: { 'shame-system': 3, sweet: 1 } },
      { text: '表面和善背后插刀的同事', weights: { 'female-career': 3, 'collapse-warning': 2 } },
      { text: '退你婚的前任，带着新欢招摇过市', weights: { sweet: 3, faceslap: 2 } },
      { text: '说你是废物的同门师兄', weights: { 'fantasy-upgrade': 2, faceslap: 2 } },
      { text: '一个什么都不知道却莫名帮你的人', weights: { sweet: 2, 'shame-system': 2 } },
    ],
  },

  // ====== 类型2：翻盘方式（7题） ======
  {
    id: 8, type: 'comeback', question: '翻盘的第一把火怎么烧？',
    illustrationPrompt: '一人从火焰中走出，身后废墟燃烧，逆光的剪影',
    options: [
      { text: '当众突破，震撼全场', weights: { 'fantasy-upgrade': 3, faceslap: 2 } },
      { text: '一条视频爆火，全网舆论反转', weights: { showbiz: 3, 'collapse-warning': 2 } },
      { text: '用前世记忆抢先截胡史上最大机缘', weights: { rebirth: 3, 'fantasy-upgrade': 2 } },
      { text: '花三天写了一份行业颠覆方案，被大老板看中', weights: { 'female-career': 3, faceslap: 2 } },
      { text: '在死对头最志得意满的时候，拿出铁证', weights: { 'collapse-warning': 3, faceslap: 2 } },
      { text: '完成第一个社死任务，奖励高得离谱', weights: { 'shame-system': 3, faceslap: 1 } },
      { text: '主动约前未婚夫/前女友吃饭，当面说"我不欠你了"', weights: { sweet: 3, faceslap: 2 } },
      { text: '在比赛里用最朴素的一招，赢了最华丽的对手', weights: { 'fantasy-upgrade': 2, faceslap: 2, rebirth: 1 } },
    ],
  },
  {
    id: 9, type: 'comeback', question: '翻盘路上最强的助力来自？',
    illustrationPrompt: '一只发光的手从虚空中伸出，托起一颗明珠，神话场景',
    options: [
      { text: '上古传承/神器/灵脉', weights: { 'fantasy-upgrade': 3, rebirth: 1 } },
      { text: '一个顶级制作人/导演的赏识', weights: { showbiz: 3, 'female-career': 2 } },
      { text: '前世积累的知识和人脉记忆', weights: { rebirth: 3, 'fantasy-upgrade': 2 } },
      { text: '职场导师/创业伙伴的倾囊相授', weights: { 'female-career': 3, sweet: 1 } },
      { text: '那个所有人以为是你敌人的人', weights: { sweet: 3, 'collapse-warning': 2 } },
      { text: '一个看似无用的系统技能，用出了神操作', weights: { 'shame-system': 3, faceslap: 2 } },
      { text: '群众的眼睛——舆论战打得对手毫无还手之力', weights: { showbiz: 2, faceslap: 2 } },
      { text: '自己藏了十几年的底牌', weights: { faceslap: 3, 'fantasy-upgrade': 1 } },
    ],
  },
  {
    id: 10, type: 'comeback', question: '赢了以后，怎么做最爽？',
    illustrationPrompt: '一人站在山巅俯瞰云海，朝阳初升，氛围壮阔',
    options: [
      { text: '站在世界之巅，所有对手仰望你', weights: { 'fantasy-upgrade': 3, faceslap: 2 } },
      { text: '颁奖典礼上念获奖感言，台下前同事脸都绿了', weights: { showbiz: 3, faceslap: 2 } },
      { text: '平静地路过曾经害你的人，一个眼神都没给', weights: { rebirth: 3, faceslap: 2 } },
      { text: '把前公司告得倾家荡产，顺便收购了它', weights: { 'female-career': 3, faceslap: 2 } },
      { text: '什么也不说，把当年的真相写成一本书', weights: { sweet: 2, 'collapse-warning': 2, faceslap: 1 } },
      { text: '在所有社死任务中活下来，还反赚了一大笔', weights: { 'shame-system': 3, faceslap: 2 } },
      { text: '拿着第一名奖金，带全家去旅行', weights: { sweet: 3, 'female-career': 1 } },
      { text: '在主城巨大荧幕上循环播放对手的黑历史', weights: { faceslap: 3, showbiz: 2 } },
    ],
  },
  {
    id: 11, type: 'comeback', question: '翻盘路上一句话，最燃的是？',
    illustrationPrompt: '一人握拳抬头，眼中燃烧斗志，背景风起云涌',
    options: [
      { text: '"三十年河东三十年河西"', weights: { 'fantasy-upgrade': 3, faceslap: 2 } },
      { text: '"谁说糊咖不能翻身？"', weights: { showbiz: 3, 'collapse-warning': 2 } },
      { text: '"这一次，我不会再信错人"', weights: { rebirth: 3, faceslap: 2 } },
      { text: '"公司是我开的，你辞职吧"', weights: { 'female-career': 3, faceslap: 2 } },
      { text: '"不是你赢了，是我让了"', weights: { faceslap: 3, sweet: 1 } },
      { text: '"对，就是我干的，你能怎样？"', weights: { faceslap: 3, 'collapse-warning': 2 } },
      { text: '"你家哥哥塌房的料，我手里还有"', weights: { 'collapse-warning': 3, showbiz: 2 } },
      { text: '"系统说我这把稳了"', weights: { 'shame-system': 3, rebirth: 1 } },
    ],
  },
  {
    id: 12, type: 'comeback', question: '你的翻盘风格是？',
    illustrationPrompt: '棋盘上黑白子交错，一人执子落定，暗处有人观察',
    options: [
      { text: '霸气碾压型：一招秒，话都懒得说', weights: { 'fantasy-upgrade': 3, faceslap: 2 } },
      { text: '先抑后扬型：先隐忍几十章，最后一口气全爆', weights: { faceslap: 3, 'fantasy-upgrade': 2 } },
      { text: '暗中布局型：所有人都不知道是你布的局', weights: { rebirth: 3, 'collapse-warning': 2 } },
      { text: '人设崩塌型：让别人自己揭穿自己', weights: { 'collapse-warning': 3, showbiz: 2 } },
      { text: '独立逆袭型：不靠男人不靠运气，靠自己', weights: { 'female-career': 3, faceslap: 2 } },
      { text: '从社死里开出花：越丢人越强', weights: { 'shame-system': 3, sweet: 1 } },
      { text: '以情动人型：用真诚收服所有对手', weights: { sweet: 3, 'female-career': 1 } },
      { text: '组合拳型：打脸之后立刻公布真相，一套带走', weights: { faceslap: 2, showbiz: 2, 'collapse-warning': 2 } },
    ],
  },
  {
    id: 13, type: 'comeback', question: '翻盘时最不能没有的元素？',
    illustrationPrompt: '万人仰头望向高台，一人缓缓走来，场面宏大',
    options: [
      { text: '围观的群众（没人看算啥翻盘）', weights: { faceslap: 3, showbiz: 2 } },
      { text: '境界突破的特效', weights: { 'fantasy-upgrade': 3, rebirth: 1 } },
      { text: '死对头震惊到下巴脱臼的表情', weights: { faceslap: 3, 'fantasy-upgrade': 2 } },
      { text: '弹幕/评论区疯狂刷"啊啊啊啊"', weights: { showbiz: 3, 'shame-system': 2 } },
      { text: '当年看不起你的人排队打电话求原谅', weights: { faceslap: 3, sweet: 1 } },
      { text: '系统飘过一行"恭喜宿主完成成就"', weights: { 'shame-system': 3, 'fantasy-upgrade': 1 } },
      { text: '一个默默支持你的人，终于笑了', weights: { sweet: 3, 'female-career': 2 } },
      { text: '公司股价因为你的新闻涨了三倍', weights: { 'female-career': 3, showbiz: 2 } },
    ],
  },
  {
    id: 14, type: 'comeback', question: '翻盘后的庆祝方式是？',
    illustrationPrompt: '深夜独自饮酒，对月举杯，身影被拉长，寂寥感',
    options: [
      { text: '连夜突破下一个大境界', weights: { 'fantasy-upgrade': 3, faceslap: 1 } },
      { text: '发朋友圈：谢谢大家（仅对手可见）', weights: { showbiz: 2, faceslap: 2 } },
      { text: '去前世命陨的地方，说一句"我回来了"', weights: { rebirth: 3, sweet: 2 } },
      { text: '给自己买了个公司', weights: { 'female-career': 3, faceslap: 2 } },
      { text: '什么也不做，和那个人看了场电影', weights: { sweet: 3, 'shame-system': 1 } },
      { text: '把系统任务全刷完了', weights: { 'shame-system': 3, 'fantasy-upgrade': 1 } },
      { text: '开了一场直播，在线人数破亿', weights: { showbiz: 3, 'collapse-warning': 2 } },
      { text: '买下当年开除你的那家公司', weights: { 'female-career': 2, faceslap: 2 } },
    ],
  },

  // ====== 类型3：人设偏好（7题） ======
  {
    id: 15, type: 'trait', question: '主角最让你心动的特质？',
    illustrationPrompt: '一人抚剑而立，月光洒在剑身上，锋芒内敛',
    options: [
      { text: '天赋异禀但低调到尘埃里', weights: { 'fantasy-upgrade': 3, faceslap: 2 } },
      { text: '颜值天花板，但全凭实力说话', weights: { showbiz: 3, 'female-career': 2 } },
      { text: '表面冷淡内心藏着没人知道的温柔', weights: { sweet: 3, rebirth: 2 } },
      { text: '嘴上一句不说，背地里把所有事都安排好了', weights: { sweet: 2, 'female-career': 2, faceslap: 1 } },
      { text: '不择手段的狠人，但对在乎的人毫无底线', weights: { 'collapse-warning': 3, sweet: 2 } },
      { text: '明明怕得要死，还是站了出来', weights: { rebirth: 2, 'shame-system': 2, faceslap: 1 } },
      { text: '从底层杀出一条血路，眼神里全是不服', weights: { 'female-career': 3, faceslap: 2 } },
      { text: '社死到麻木之后反而无敌了', weights: { 'shame-system': 3, 'fantasy-upgrade': 1 } },
    ],
  },
  {
    id: 16, type: 'trait', question: '主角的核心魅力是什么？',
    illustrationPrompt: '人群中一人回眸，目光如炬，四周人脸模糊唯ta清晰',
    options: [
      { text: '绝对的实力碾压', weights: { 'fantasy-upgrade': 3, faceslap: 2 } },
      { text: '致命的吸引力（人人都想蹭）', weights: { showbiz: 3, sweet: 2 } },
      { text: '先知般的布局能力', weights: { rebirth: 3, 'collapse-warning': 2 } },
      { text: '不服输的韧劲', weights: { 'female-career': 3, faceslap: 2 } },
      { text: '刀尖跳舞的疯劲', weights: { faceslap: 3, 'collapse-warning': 2 } },
      { text: '独一无二的幽默感', weights: { 'shame-system': 3, sweet: 1 } },
      { text: '无论何时都保持善良的底色', weights: { sweet: 3, 'female-career': 2 } },
      { text: '不动声色的城府', weights: { 'collapse-warning': 3, rebirth: 2 } },
    ],
  },
  {
    id: 17, type: 'trait', question: '你最不能接受的主角弱点？',
    illustrationPrompt: '一人推开施舍的手，转身离去，背影倔强而孤独',
    options: [
      { text: '圣母心泛滥（该死的不该救）', weights: { faceslap: 3, 'collapse-warning': 1 } },
      { text: '恋爱脑上头（为了爱情放弃一切）', weights: { 'female-career': 3, 'fantasy-upgrade': 2 } },
      { text: '优柔寡断（机会来了犹豫不决）', weights: { rebirth: 3, faceslap: 2 } },
      { text: '社恐到影响进度', weights: { 'shame-system': -3, faceslap: 1 } },
      { text: '对敌人仁慈', weights: { faceslap: 3, 'fantasy-upgrade': 2 } },
      { text: '自卑到自我怀疑', weights: { 'female-career': 2, showbiz: 2 } },
      { text: '完全信任不该信任的人', weights: { 'collapse-warning': 3, rebirth: 2 } },
      { text: '太清高，不屑用手段', weights: { 'collapse-warning': 2, 'female-career': 2 } },
    ],
  },
  {
    id: 18, type: 'trait', question: '主角说话的风格？',
    illustrationPrompt: '一人开口说话，声音化成金色文字在空气中浮现',
    options: [
      { text: '言简意赅，一字千金', weights: { 'fantasy-upgrade': 3, faceslap: 2 } },
      { text: '金句频出，热搜预订', weights: { showbiz: 3, faceslap: 2 } },
      { text: '话里有话，句句是坑', weights: { rebirth: 3, 'collapse-warning': 2 } },
      { text: '毒舌吐槽，让人又爱又恨', weights: { faceslap: 3, sweet: 2 } },
      { text: '温柔但有力量，每一句都治愈', weights: { sweet: 3, 'female-career': 2 } },
      { text: '表面自嘲，实则超清醒', weights: { 'shame-system': 3, 'female-career': 1 } },
      { text: '擅长洗脑，三句话让对方怀疑人生', weights: { 'collapse-warning': 3, faceslap: 2 } },
      { text: '不解释型，做就完了', weights: { 'female-career': 2, 'fantasy-upgrade': 2 } },
    ],
  },
  {
    id: 19, type: 'trait', question: '主角面对生死危机时的反应？',
    illustrationPrompt: '千钧一发之际，一人闭眼破而后立，金光从体内迸发',
    options: [
      { text: '闭眼突破，临阵升级', weights: { 'fantasy-upgrade': 3, faceslap: 2 } },
      { text: '掏出前世准备好的后手', weights: { rebirth: 3, 'collapse-warning': 2 } },
      { text: '一个冷笑："终于等到这一刻了"', weights: { faceslap: 3, 'fantasy-upgrade': 2 } },
      { text: '马上直播："家人们，今天可能是我最后一场直播"', weights: { showbiz: 2, 'shame-system': 2 } },
      { text: '先安排后事，然后冷静应对', weights: { 'female-career': 3, sweet: 1 } },
      { text: '"等等，我还有一句想对某人说的"', weights: { sweet: 3, faceslap: 1 } },
      { text: '疯狂按系统求助按钮', weights: { 'shame-system': 3, rebirth: 1 } },
      { text: '"别急，你们的人里有我的人"', weights: { 'collapse-warning': 3, faceslap: 2 } },
    ],
  },
  {
    id: 20, type: 'trait', question: '主角的隐藏属性是？',
    illustrationPrompt: '一条血脉纹路从手臂蔓延至全身，发光的图腾逐渐点亮',
    options: [
      { text: '远古血脉觉醒', weights: { 'fantasy-upgrade': 3, rebirth: 2 } },
      { text: '隐藏的顶流体质', weights: { showbiz: 3, faceslap: 2 } },
      { text: '天选之人的命运轨迹', weights: { rebirth: 3, 'fantasy-upgrade': 2 } },
      { text: '商业天才的嗅觉', weights: { 'female-career': 3, 'collapse-warning': 2 } },
      { text: '让人无法拒绝的个人魅力', weights: { sweet: 3, showbiz: 2 } },
      { text: '越挫越勇的变态体质', weights: { faceslap: 3, 'shame-system': 2 } },
      { text: '表面小白兔，内心老狐狸', weights: { 'collapse-warning': 3, sweet: 2 } },
      { text: '运气拉满的欧皇', weights: { 'shame-system': 2, 'fantasy-upgrade': 2, rebirth: 1 } },
    ],
  },
  {
    id: 21, type: 'trait', question: '主角最大的弱点是？',
    illustrationPrompt: '一人站在繁华的街市中央，却与人群格格不入',
    options: [
      { text: '太强了，感觉没意思', weights: { 'fantasy-upgrade': -2, faceslap: 2 } },
      { text: '太容易相信镜头前的善意', weights: { showbiz: 2, 'collapse-warning': 2 } },
      { text: '无法释怀前世的遗憾', weights: { rebirth: 3, sweet: 2 } },
      { text: '太重感情，总是被身边人坑', weights: { sweet: 3, 'collapse-warning': 2 } },
      { text: '工作狂，没时间谈恋爱', weights: { 'female-career': 3, sweet: -1 } },
      { text: '包袱太重，放不下面子', weights: { 'shame-system': -2, faceslap: 2 } },
      { text: '太善良，下不去狠手', weights: { faceslap: -2, sweet: 2 } },
      { text: '完美主义，过度内耗', weights: { 'female-career': 2, faceslap: 2 } },
    ],
  },

  // ====== 类型4：关系模式（7题） ======
  {
    id: 22, type: 'relationship', question: '和死对头的关系最好是？',
    illustrationPrompt: '两人背对背，一人持剑一人持扇，亦敌亦友的张力',
    options: [
      { text: '相爱相杀，谁也不服谁但谁也离不开谁', weights: { sweet: 3, faceslap: 2 } },
      { text: '表面斗了八百回合，私下帮你挡过致命一击', weights: { sweet: 2, faceslap: 2, 'fantasy-upgrade': 1 } },
      { text: '他/她其实是前世最懂你的人', weights: { rebirth: 3, sweet: 2 } },
      { text: '从死对头到最强合伙人', weights: { 'female-career': 3, 'collapse-warning': 2 } },
      { text: '在所有人面前是死敌，私下是饭搭子', weights: { 'shame-system': 2, sweet: 2 } },
      { text: '他/她是唯一配得上做你对手的人', weights: { 'fantasy-upgrade': 3, faceslap: 2 } },
      { text: '其实是他/她一手把你推上去的', weights: { 'collapse-warning': 3, sweet: 2 } },
      { text: '斗到最后一章才发现彼此是一家人', weights: { sweet: 2, 'collapse-warning': 2, rebirth: 1 } },
    ],
  },
  {
    id: 23, type: 'relationship', question: '感情线怎么发展你最爱看？',
    illustrationPrompt: '两人在雨中相望，一人撑伞走向另一人，浪漫氛围',
    options: [
      { text: '势均力敌，并肩作战天花板', weights: { 'fantasy-upgrade': 2, 'female-career': 3 } },
      { text: '先婚后爱，契约开始真心结束', weights: { sweet: 3, rebirth: 2 } },
      { text: '破镜重圆，错过一次这次绝不放手', weights: { rebirth: 3, sweet: 2 } },
      { text: '暗恋十年，终于被看见了', weights: { sweet: 3, 'shame-system': 2 } },
      { text: '你追他逃，他追你跑，就是不在一起', weights: { sweet: 2, faceslap: 2 } },
      { text: '表面互怼，背地里默默护你周全', weights: { sweet: 2, faceslap: 2 } },
      { text: '搞事业顺带谈恋爱，感情只是锦上添花', weights: { 'female-career': 3, sweet: 2 } },
      { text: '两个孤狼互相取暖，不需要说一句爱', weights: { sweet: 2, 'fantasy-upgrade': 2 } },
    ],
  },
  {
    id: 24, type: 'relationship', question: '最让你上头的角色关系名场面？',
    illustrationPrompt: '爆炸烟尘中一人挡在另一人身前，铠甲碎裂但岿然不动',
    options: [
      { text: '并肩作战时，他/她替你挡住了致命一击', weights: { sweet: 3, 'fantasy-upgrade': 2 } },
      { text: '在全行业面前，他/她公开站队了你', weights: { showbiz: 3, sweet: 2 } },
      { text: '前世你没能说出口的话，这一世当面说完了', weights: { rebirth: 3, sweet: 2 } },
      { text: '签合同的时候发现，他把最大份额的股份写给你了', weights: { 'female-career': 3, sweet: 2 } },
      { text: '他/她为了你，背叛了整个阵营', weights: { sweet: 3, faceslap: 2 } },
      { text: '你在万人中央出丑，只有他/她上去扶了你', weights: { 'shame-system': 3, sweet: 2 } },
      { text: '最后一战时，他才告诉你"从第一天起就是我的人"', weights: { 'collapse-warning': 3, sweet: 2 } },
      { text: '所有人都在骂你，他/她发了一条"我信你"', weights: { sweet: 2, faceslap: 2, showbiz: 1 } },
    ],
  },
  {
    id: 25, type: 'relationship', question: '如果主角有一个团队，你希望？',
    illustrationPrompt: '一群人围坐篝火旁，火光映在每个人脸上的温暖',
    options: [
      { text: '全是顶尖高手，主角是灵魂核心', weights: { 'fantasy-upgrade': 3, faceslap: 2 } },
      { text: '颜值天团，走到哪都是焦点', weights: { showbiz: 3, sweet: 2 } },
      { text: '前世就一起出生入死的兄弟/姐妹', weights: { rebirth: 3, sweet: 2 } },
      { text: '专业团队：经纪人/律师/公关/助理一个不少', weights: { 'female-career': 3, faceslap: 2 } },
      { text: '全是段子手，走哪笑哪', weights: { 'shame-system': 3, sweet: 1 } },
      { text: '表面各怀鬼胎，大结局才发现全员卧底', weights: { 'collapse-warning': 3, faceslap: 2 } },
      { text: '最小的团队（就是你和另一个他/她）', weights: { sweet: 3, 'fantasy-upgrade': 1 } },
      { text: '一群看似平凡的人各有一项神技', weights: { 'fantasy-upgrade': 2, 'shame-system': 2, rebirth: 1 } },
    ],
  },
  {
    id: 26, type: 'relationship', question: '主角在感情里是什么角色？',
    illustrationPrompt: '一人双手抱胸倚墙，嘴角挂着一丝不易察觉的笑意',
    options: [
      { text: '护短狂魔（我的人谁都不能碰）', weights: { 'fantasy-upgrade': 2, sweet: 3 } },
      { text: '嘴硬心软（嘴上说不在乎，行动很诚实）', weights: { sweet: 3, faceslap: 2 } },
      { text: '慢热型（需要对方追很久才开窍）', weights: { sweet: 2, 'shame-system': 2 } },
      { text: '鉴渣达人（一眼看穿所有渣男渣女）', weights: { rebirth: 3, 'collapse-warning': 2 } },
      { text: '事业优先型（恋爱？等我上市再说）', weights: { 'female-career': 3, sweet: -1 } },
      { text: '主动出击型（看上就追，绝不内耗）', weights: { sweet: 2, faceslap: 2 } },
      { text: '被攻略型（对方花了三卷才让你心动）', weights: { sweet: 3, rebirth: 2 } },
      { text: '若即若离型（你退我进你进我退）', weights: { sweet: 2, faceslap: 2 } },
    ],
  },
  {
    id: 27, type: 'relationship', question: '闺蜜/死党的人设你帮主角怎么选？',
    illustrationPrompt: '两人并肩立于屋顶，披风翻飞，兄弟情谊的剪影',
    options: [
      { text: '战力爆表的武痴，口头禅是"打架叫我"', weights: { 'fantasy-upgrade': 3, faceslap: 1 } },
      { text: '顶级造型师兼八卦达人，热搜没有他不知道的', weights: { showbiz: 3, 'shame-system': 2 } },
      { text: '前世就亏欠的人，这一世要加倍对ta好', weights: { rebirth: 3, sweet: 2 } },
      { text: '同部门的前辈，手把手带你入行', weights: { 'female-career': 3, sweet: 1 } },
      { text: '损友天花板，每次你社死他/她笑最大声', weights: { 'shame-system': 3, sweet: 2 } },
      { text: '默默布局的智囊，帮你出谋划策从不露面', weights: { 'collapse-warning': 3, faceslap: 2 } },
      { text: '其实就是未来的恋爱对象（青梅竹马变恋人）', weights: { sweet: 3, rebirth: 2 } },
      { text: '表面塑料姐妹花，关键时候比谁都靠谱', weights: { faceslap: 2, sweet: 2, showbiz: 1 } },
    ],
  },
  {
    id: 28, type: 'relationship', question: '剧终时你希望主角身边？',
    illustrationPrompt: '一人站在花海中回望，阳光穿过发丝，温柔而坚定',
    options: [
      { text: '站着一整个时代为他/她加冕', weights: { 'fantasy-upgrade': 3, faceslap: 2 } },
      { text: '掌声雷动，镜头定格在他/她最美的笑容', weights: { showbiz: 3, sweet: 2 } },
      { text: '前世的遗憾全部弥补，这一生没有白来', weights: { rebirth: 3, sweet: 2 } },
      { text: '公司上市，团队一起敲钟', weights: { 'female-career': 3, faceslap: 2 } },
      { text: '和最爱的那个人，简简单单吃了顿饭', weights: { sweet: 3, 'shame-system': 1 } },
      { text: '系统提示"所有任务完成，恭喜宿主自由了"', weights: { 'shame-system': 3, faceslap: 2 } },
      { text: '一个人走了很远的路，终于可以缓缓', weights: { rebirth: 2, 'female-career': 2, sweet: 1 } },
      { text: '所有背叛过你的人，在你面前排成一排', weights: { faceslap: 3, 'collapse-warning': 2 } },
    ],
  },

  // ====== 类型5：骚操作/名场面（7题） ======
  {
    id: 29, type: 'scene', question: '以下哪个名场面能让你拍大腿叫好？',
    illustrationPrompt: '一人脚踏虚空，身后千军万马，气场全开',
    options: [
      { text: '主角当着十万观众的面突破极限', weights: { 'fantasy-upgrade': 3, faceslap: 2 } },
      { text: '在颁奖典礼上，主角的获奖感言怼了所有人', weights: { showbiz: 3, faceslap: 2 } },
      { text: '反派正要得意，主角拿出他前世亲手写的认罪书', weights: { rebirth: 3, faceslap: 2 } },
      { text: '商战中，主角用一招让对手股价跌停', weights: { 'female-career': 3, 'collapse-warning': 2 } },
      { text: '主角在直播里优雅拆穿对家黑料，一条一条放证据', weights: { 'collapse-warning': 3, showbiz: 2 } },
      { text: '系统发布超羞耻任务，主角反向操作把系统整懵了', weights: { 'shame-system': 3, faceslap: 2 } },
      { text: '主角被围攻，突然一抬头，天上站满了他的人', weights: { 'fantasy-upgrade': 2, faceslap: 2, sweet: 1 } },
      { text: '一本被遗忘的日记，翻开全是和那个人的对话', weights: { sweet: 3, rebirth: 2 } },
    ],
  },
  {
    id: 30, type: 'scene', question: '最离谱但你又很想看的桥段？',
    illustrationPrompt: '一只巨大的神兽懒洋洋趴着，一人无奈地靠在它旁边',
    options: [
      { text: '主角契约了一只神兽，结果神兽是最懒的那种', weights: { 'fantasy-upgrade': 2, 'shame-system': 2 } },
      { text: '和死对头一起参加真人秀，被迫组队', weights: { showbiz: 3, sweet: 2 } },
      { text: '重生后发现前世的BOSS变成了路边乞丐', weights: { rebirth: 3, 'shame-system': 2 } },
      { text: '把前公司买下来后，让所有人天天做团建游戏', weights: { 'female-career': 2, 'shame-system': 2 } },
      { text: '系统发布任务"向仇人表白"，主角照做了', weights: { 'shame-system': 3, sweet: 2 } },
      { text: '主角失忆后被对手捡回去当小弟培养', weights: { faceslap: 2, sweet: 2, 'collapse-warning': 2 } },
      { text: '所有反派开了一个会，结论是"我们打不过他"', weights: { faceslap: 3, 'fantasy-upgrade': 2 } },
      { text: '主角养了一只猫，结果这猫是上古大妖', weights: { 'fantasy-upgrade': 2, rebirth: 2, sweet: 1 } },
    ],
  },
  {
    id: 31, type: 'scene', question: '如果穿越进这本书，你希望自己是？',
    illustrationPrompt: '一只手指点向一本书，书中世界以全息投影展开',
    options: [
      { text: '主角的道侣（并肩作战那个）', weights: { 'fantasy-upgrade': 2, sweet: 3 } },
      { text: '幕后大佬（帮主角暗中解决一切障碍）', weights: { 'collapse-warning': 3, faceslap: 2 } },
      { text: '社交达人（帮主角找资源搭人脉）', weights: { showbiz: 3, 'female-career': 2 } },
      { text: '预言家（知道所有剧情走向）', weights: { rebirth: 3, faceslap: 2 } },
      { text: '系统本体（给主角发任务的那个）', weights: { 'shame-system': 3, faceslap: 2 } },
      { text: '主角的最大对手（这局有意思）', weights: { faceslap: 3, 'fantasy-upgrade': 2 } },
      { text: '投资方（看好主角，砸钱赞助）', weights: { 'female-career': 3, showbiz: 2 } },
      { text: '吃瓜路人（前排围观，安全第一）', weights: { 'shame-system': 2, sweet: 2 } },
    ],
  },
  {
    id: 32, type: 'scene', question: '全书最高能的场面应该发生在？',
    illustrationPrompt: '巨大的竞技场穹顶下，一人缓步走向擂台中心',
    options: [
      { text: '天下第一武道会决赛', weights: { 'fantasy-upgrade': 3, faceslap: 2 } },
      { text: '年度颁奖盛典，主角出场时全场鸦雀无声', weights: { showbiz: 3, faceslap: 2 } },
      { text: '前世决战场地，同样的地点，不同的结局', weights: { rebirth: 3, faceslap: 2 } },
      { text: '股东大会，主角一个人对阵所有老股东', weights: { 'female-career': 3, faceslap: 2 } },
      { text: '系统最终任务——在10亿人面前完成不可能', weights: { 'shame-system': 3, faceslap: 2 } },
      { text: '婚礼当天，反派联盟倾巢出动', weights: { sweet: 3, faceslap: 2 } },
      { text: '法院门口，主角面对记者一字一句说出真相', weights: { 'collapse-warning': 3, 'female-career': 2 } },
      { text: '其实不是高能，是所有人坐下来好好谈了一次', weights: { sweet: 2, 'female-career': 2 } },
    ],
  },
  {
    id: 33, type: 'scene', question: '如果给本书加一个标签，你最想看到？',
    illustrationPrompt: '一本书的封面缓缓打开，光从书页中溢出',
    options: [
      { text: '逆袭爽文', weights: { faceslap: 3, 'fantasy-upgrade': 2 } },
      { text: '甜到窒息', weights: { sweet: 3, faceslap: 1 } },
      { text: '反转反转再反转', weights: { 'collapse-warning': 3, rebirth: 2 } },
      { text: '大女主搞钱实录', weights: { 'female-career': 3, faceslap: 2 } },
      { text: '重生复仇', weights: { rebirth: 3, faceslap: 2 } },
      { text: '笑到肚子痛', weights: { 'shame-system': 3, sweet: 2 } },
      { text: '内娱真相', weights: { showbiz: 3, 'collapse-warning': 2 } },
      { text: '修仙从入门到放弃（然后真香）', weights: { 'fantasy-upgrade': 2, 'shame-system': 2 } },
    ],
  },
  {
    id: 34, type: 'scene', question: '你最想看到的"因果报应"桥段？',
    illustrationPrompt: '反派跪倒在地，一人居高临下地看着ta，面无表情',
    options: [
      { text: '反派机关算尽，被主角一拳打回原形', weights: { 'fantasy-upgrade': 3, faceslap: 2 } },
      { text: '抢你角色的人，被你用演技碾压到退圈', weights: { showbiz: 3, faceslap: 2 } },
      { text: '前世杀你的人，这一世被自己人出卖', weights: { rebirth: 3, 'collapse-warning': 2 } },
      { text: '偷你方案的上司，在全员大会上被当场揭穿', weights: { 'female-career': 3, faceslap: 2 } },
      { text: '渣了你的前任，发现你的新对象比他强一万倍', weights: { sweet: 3, faceslap: 2 } },
      { text: '系统发布"惩罚背叛者"任务，主角优雅完成', weights: { 'shame-system': 3, faceslap: 2 } },
      { text: '他们的联盟在主角面前一个月就散架了', weights: { 'collapse-warning': 3, faceslap: 2 } },
      { text: '主角放过了他，但他自己把自己玩没了', weights: { faceslap: 2, 'collapse-warning': 2, rebirth: 1 } },
    ],
  },
  {
    id: 35, type: 'scene', question: '大结局最后一行字你希望是？',
    illustrationPrompt: '一本合上的书放在窗台上，窗外正好升起一轮朝阳',
    options: [
      { text: '"新的传说，从今天开始"', weights: { 'fantasy-upgrade': 3, faceslap: 2 } },
      { text: '"他的名字，将被这个时代永远记住"', weights: { showbiz: 3, faceslap: 2 } },
      { text: '"这一次，她没有回头"', weights: { rebirth: 3, 'female-career': 2 } },
      { text: '"她关掉电脑，窗外正好放起烟花"', weights: { 'female-career': 3, sweet: 2 } },
      { text: '"然后他笑了——那是一种被爱着的人才有的松弛"', weights: { sweet: 3, 'shame-system': 1 } },
      { text: '"系统提示：主线已完成，是否开启二周目？"', weights: { 'shame-system': 3, rebirth: 2 } },
      { text: '"终。"', weights: { faceslap: 2, 'fantasy-upgrade': 2 } },
      { text: '"有人问后来呢。后来，就是平平淡淡的每一天"', weights: { sweet: 2, 'female-career': 2 } },
    ],
  },
];

/** 打乱数组 */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 从题库中随机抽 8 题，保证至少覆盖 3 个类型 */
export function pickRandomQuestions(): QuizQuestion[] {
  const types = ['opening', 'comeback', 'trait', 'relationship', 'scene'] as const;
  const pool = shuffle(Q);

  // 按类型分组
  const byType = new Map<string, QuizQuestion[]>();
  for (const q of pool) {
    const list = byType.get(q.type) ?? [];
    list.push(q);
    byType.set(q.type, list);
  }

  const picked: QuizQuestion[] = [];
  // 先每种类型至少抽 1 题
  for (const t of types) {
    const list = byType.get(t);
    if (list && list.length > 0) {
      picked.push(list[0]);
    }
  }
  // 剩余从全池补足 8 题
  const rest = pool.filter(q => !picked.includes(q));
  while (picked.length < 8 && rest.length > 0) {
    picked.push(rest.shift()!);
  }

  return shuffle(picked);
}

/** 从 8 个选项池中随机抽 4 个 */
export function pickRandomOptions(options: QuizOption[]): QuizOption[] {
  return shuffle(options).slice(0, 4);
}

export { Q as QUIZ_QUESTIONS_FULL };
export const TOTAL_QUESTION_POOL = Q.length;
