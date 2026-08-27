
// 内容驱动的智能标题生成器
//
// 核心原则：
// 1. 所有标题素材必须从章节正文中真实提取，绝不"编"标题
// 2. 宁少勿滥 —— 提取质量 > 提取数量
// 3. 内容相关性是硬门槛

// ============================================================
// 基础词表
// ============================================================

const GENRE_MAP: Record<string, string> = {
  '玄幻': 'xuanhuan', '仙侠': 'xianxia', '都市': 'urban', '言情': 'romance',
  '末世': 'postapocalyptic', '科幻': 'sci-fi', '修仙': 'xianxia', '修真': 'xianxia',
  '奇幻': 'xuanhuan', '现代': 'urban', '悬疑': 'suspense', '推理': 'suspense',
  '惊悚': 'horror', '恐怖': 'horror', '游戏': 'game', '武侠': 'wuxia',
  '历史': 'history', '古代': 'history', '军事': 'military', '校园': 'campus',
  '娱乐圈': 'entertainment', '明星': 'entertainment', '种田': 'farming',
  '宫斗': 'palace-intrigue', '无限流': 'infinite-flow', '系统': 'system',
  '轻小说': 'light-novel', '快穿': 'quick-travel', '灵异': 'supernatural',
  '机甲': 'mecha', '商战': 'business-war', '赘婿': 'son-in-law',
  '甜宠': 'sweet-pet', '御兽': 'beast-taming', '随身空间': 'space',
};

// 高置信度地点后缀（只有明确是地点的才收录）
const PLACE_SUFFIXES_STRONG = [
  '清河镇', '黑风城', '神之祭坛', // 具体地名示例（会从角色表加载）
  '城', '山', '谷', '洞', '府', '阁', '殿', '宗', '门', '派',
  '岛', '湖', '海', '渊', '崖', '峰', '岭', '原', '林',
  '荒原', '森林', '山脉', '禁地', '秘境', '遗迹', '废墟',
  '庄', '院', '楼', '台', '亭', '斋', '堂', '馆', '坊', '市',
  '寨', '堡', '关', '隘', '渡', '港', '湾', '潭', '泉', '涧',
  '密室', '议事堂', '城门', '城头', '府邸', '密室',
];

// 高置信度宝物后缀（只有明确是宝物/功法/器物的才收录）
const TREASURE_SUFFIXES_STRONG = [
  '诀', '功法', '宝典', '秘典', '真经', '神诀', '仙诀', '妖诀', '魔诀',
  '术', '阵法', '丹方', '符箓', '神兵', '灵宝', '法器', '宝器',
  '剑', '刀', '枪', '戟', '斧', '弓', '箭', '鞭',
  '塔', '鼎', '钟', '印', '令', '牌', '图', '卷', '册', '经',
  '玉佩', '玉符', '玉简', '宝珠', '神珠', '灵珠', '元珠',
  '圣物', '神器', '仙宝', '魔宝', '妖宝',
  '碑文', '祭坛',
];

// 常见姓氏（用于人物识别）
const COMMON_SURNAMES = [
  '赵', '钱', '孙', '李', '周', '吴', '郑', '王', '冯', '陈', '褚', '卫',
  '蒋', '沈', '韩', '杨', '朱', '秦', '尤', '许', '何', '吕', '施', '张',
  '孔', '曹', '严', '华', '金', '魏', '陶', '姜', '谢', '宋', '唐', '邓',
  '梁', '喻', '柏', '水', '窦', '章', '云', '苏', '潘', '葛', '奚', '范',
  '彭', '郎', '鲁', '韦', '昌', '马', '苗', '凤', '花', '方', '俞', '任',
  '袁', '柳', '薛', '雷', '贺', '倪', '汤', '滕', '殷', '罗', '毕', '郝',
  '邬', '安', '常', '乐', '于', '时', '傅', '皮', '卞', '齐', '康', '伍',
  '余', '元', '卜', '顾', '孟', '平', '黄', '和', '穆', '萧', '尹', '姚',
  '邵', '湛', '汪', '祁', '毛', '禹', '狄', '米', '贝', '明', '臧', '计',
  '伏', '成', '戴', '谈', '茅', '庞', '熊', '纪', '舒', '屈', '项', '祝',
  '董', '杜', '阮', '蓝', '闵', '席', '季', '麻', '强', '贾', '路', '娄',
  '林', '徐', '高', '夏', '蔡', '田', '樊', '胡', '凌', '霍', '虞', '万',
  '司', '上官', '欧阳', '司马', '东方', '独孤', '令狐', '慕容', '诸葛',
];

// 高价值动作词（纯动作/事件）
const HIGH_VALUE_ACTIONS = [
  '反杀', '逆袭', '突破', '打脸', '碾压', '收服', '觉醒', '复仇',
  '夺权', '上位', '登顶', '称王', '破境', '筑基', '结丹', '元婴',
  '化神', '渡劫', '飞升', '封神', '夺宝', '夺位', '夺城', '破阵',
  '破局', '破关', '破禁', '破封', '杀敌', '斩妖', '斩魔', '斩神',
  '灭族', '灭门', '灭国', '灭世', '逃亡', '逃杀', '闯关', '闯阵',
  '闯宫', '闯府', '重生', '穿越', '降临', '复活', '拜师', '收徒',
  '结盟', '背叛', '寻宝', '赌约', '誓约', '联姻', '试炼', '考核',
  '比试', '擂台', '拍卖', '交易', '救人', '救美', '救城', '救世',
  '谈判', '并购', '融资', '上市', '揭穿', '拆穿', '洗白', '翻盘',
  '表白', '求婚', '重逢', '误会', '和解', '离别', '相守',
  '通关', '团灭', '解锁', '兑换', '抽奖', '攻略', '翻车',
  '修炼', '悟道', '证道', '成仙', '成神',
  '跪降', '押解', '围杀', '伏击', '偷袭', '暗杀',
  '签约', '升职', '开除', '获胜', '拿下', '站队',
  '覆灭', '失势', '崛起', '陨落', '战死', '重伤', '濒死',
  '抢亲', '退婚', '休妻', '纳妾', '封王', '封侯', '拜将',
  '入赘', '改嫁', '私奔', '殉情', '遇袭', '中毒', '受伤',
  '脱困', '脱险', '归来', '离去', '相遇',
  '生火', '点火', '烧火', '烧陶', '烧制', '烧炼', '锻造', '铸造',
  '取水', '烧水', '做饭', '打猎', '捕鱼', '采集', '开垦', '耕种',
  '挖土', '挖坑', '砌墙', '建屋', '造房', '建造', '搭建', '修筑',
  '制作', '打造', '锻造', '烘焙', '蒸煮', '研磨', '捣碎', '编织',
  '缝纫', '雕刻', '打磨', '抛光', '修补', '修理',
  '播种', '收获', '储存', '搬运', '运输', '攀登', '攀爬',
  '奔跑', '追逐', '逃避', '躲藏', '战斗', '搏斗', '防守', '进攻',
  '寻找', '探索', '发现', '发明', '创造', '改进', '学习', '研究',
  '裂开', '破裂', '碎裂', '断裂', '崩塌', '塌陷', '震动', '地动',
  '推挤', '挤压', '升起', '下沉', '退去', '涨起', '涌出', '喷出',
  '捏制', '捏泥', '捏碗', '烧碗', '敲碗', '举碗', '摸碗', '端碗',
  '点火', '添柴', '拨火', '控火', '看火', '数火', '烧透', '烧裂',
];
const HIGH_VALUE_STATES = [
  '废物', '天才', '强者', '病秧子', '废柴', '神体', '圣体',
  '寒脉', '毒体', '废脉', '丹田破碎', '失忆', '重生', '穿越',
  '首富', '大佬', '神王', '魔尊', '仙帝', '战神', '兵王',
];

// 悬念标记词
const SUSPENSE_MARKERS = [
  '谁', '什么', '为何', '怎么', '哪里', '莫非', '难道', '竟然',
  '居然', '原来', '真相', '秘密', '神秘', '诡异', '离奇',
  '惊人', '震撼', '难以置信', '不可思议',
];

// ============================================================
// 网文标题风格词表
// ============================================================

const NETNOVEL_SUSPENSE_PREFIX = [
  '谁', '什么', '为何', '怎么', '哪里', '莫非', '难道', '竟然', '居然',
  '原来', '真相', '秘密', '神秘', '诡异', '离奇', '惊人', '震撼',
];

const NETNOVEL_REVERSAL_WORDS = [
  '反转', '打脸', '逆袭', '反杀', '翻盘', '震惊', '轰动', '沸腾',
  '傻眼', '惊呆', '吓傻', '崩溃', '炸裂', '爆了', '燃了',
];

const NETNOVEL_DIALOG_PREFIX = [
  '你', '我', '他', '她说', '他说', '我说', '有人说', '众人道',
];

const NETNOVEL_SCENE_WORDS = [
  '闯入', '闯入', '踏足', '降临', '现身', '出现', '归来', '离去',
  '对峙', '交锋', '激战', '对决', '碰撞', '碰撞', '爆发', '掀起',
];

const NETNOVEL_UPGRADE_WORDS = [
  '突破', '进阶', '飞升', '渡劫', '觉醒', '化神', '结丹', '元婴',
  '筑基', '封神', '成仙', '证道', '悟道', '蜕变', '进化', '升级',
];

const NETNOVEL_SHOCK_WORDS = [
  '震惊', '轰动', '震撼', '沸腾', '哗然', '哗然', '哗然', '哗然',
  '炸裂', '爆了', '燃了', '疯狂', '逆天', '恐怖', '无敌', '神级',
];

const NETNOVEL_GENRE_STYLES: Record<string, {
  suspense: string[];
  reversal: string[];
  upgrade: string[];
  scene: string[];
}> = {
  xuanhuan: {
    suspense: ['秘境', '禁地', '宝藏', '传承', '血脉', '武魂', '神格', '天道'],
    reversal: ['反杀', '打脸', '逆袭', '碾压', '称霸', '封神'],
    upgrade: ['突破', '飞升', '渡劫', '化神', '证道', '成神'],
    scene: ['闯入', '踏足', '降临', '现身', '激战', '对决'],
  },
  xianxia: {
    suspense: ['仙缘', '秘境', '传承', '仙器', '丹方', '阵法', '天劫'],
    reversal: ['逆袭', '打脸', '反杀', '碾压', '飞升'],
    upgrade: ['飞升', '成仙', '证道', '渡劫', '悟道', '化神'],
    scene: ['飞升', '降临', '悟道', '渡劫', '激战'],
  },
  urban: {
    suspense: ['真相', '秘密', '阴谋', '底牌', '身份', '背景'],
    reversal: ['打脸', '逆袭', '震惊', '轰动', '翻盘'],
    upgrade: ['崛起', '上位', '登顶', '称霸', '封神'],
    scene: ['闯入', '降临', '对峙', '交锋', '谈判'],
  },
  romance: {
    suspense: ['真相', '秘密', '误会', '阴谋', '身世', '婚约'],
    reversal: ['打脸', '逆袭', '重逢', '误会', '表白'],
    upgrade: ['宠', '虐', '追', '逃', '守', '离'],
    scene: ['重逢', '相遇', '表白', '求婚', '离别'],
  },
  postapocalyptic: {
    suspense: ['变异', '进化', '秘境', '宝藏', '基地', '幸存者'],
    reversal: ['逆袭', '反杀', '突破', '猎杀'],
    upgrade: ['进化', '突破', '觉醒', '蜕变'],
    scene: ['猎杀', '生存', '战斗', '突围', '占领'],
  },
  'sci-fi': {
    suspense: ['星际', '遗迹', '机甲', '基因', '人工智能', '宇宙'],
    reversal: ['逆袭', '反杀', '突破', '揭露'],
    upgrade: ['进化', '突破', '升级', '觉醒'],
    scene: ['探险', '战斗', '穿越', '降临'],
  },
  suspense: {
    suspense: ['真相', '秘密', '凶手', '阴谋', '谜团', '线索'],
    reversal: ['反转', '揭露', '揭穿', '暴露'],
    upgrade: ['解密', '破案', '追踪', '识破'],
    scene: ['调查', '追踪', '对峙', '揭露'],
  },
  wuxia: {
    suspense: ['秘籍', '宝藏', '武功', '门派', '恩怨', '江湖'],
    reversal: ['反杀', '逆袭', '打脸', '碾压'],
    upgrade: ['突破', '悟道', '称霸', '登顶'],
    scene: ['激战', '对决', '闯入', '现身'],
  },
  history: {
    suspense: ['宝藏', '阴谋', '战争', '计谋', '密道', '暗探'],
    reversal: ['逆袭', '翻盘', '反杀', '智取'],
    upgrade: ['称王', '称霸', '封侯', '拜将'],
    scene: ['征战', '攻城', '谈判', '对峙'],
  },
  default: {
    suspense: ['真相', '秘密', '阴谋', '宝藏', '传承'],
    reversal: ['反转', '打脸', '逆袭', '反杀'],
    upgrade: ['突破', '进阶', '逆袭', '崛起'],
    scene: ['闯入', '降临', '激战', '对决'],
  },
};

// 通用排除词
const GENERIC_WORDS = new Set([
  '一个', '一只', '一种', '一些', '一下', '一样', '一起', '一边',
  '自己', '他们', '我们', '你们', '这个', '那个', '这些', '那些',
  '什么', '怎么', '为什么', '哪里', '如何', '可以', '可能', '已经',
  '但是', '然后', '因为', '所以', '如果', '虽然', '不过', '只是',
  '还有', '就是', '不是', '没有', '知道', '觉得', '看到', '听到',
  '说道', '答道', '问道', '喊道', '叫道', '怒道', '笑道', '叹道',
  '心里', '心中', '脑海', '体内', '身上', '面前', '身后', '旁边',
  '同时', '此刻', '此时', '如今', '现在', '以后', '之前', '突然',
  '立刻', '马上', '赶紧', '急忙', '慢慢', '渐渐', '终于', '结果',
  '今天', '明天', '昨天', '刚才', '后来',
  '三十分钟', '十分钟', '五分钟', '一小时', '一天', '一夜',
  '第一', '第二', '第三', '第一章', '第二章', '第三章',
  '副驾驶', '桌面上', '桌子上', '椅子上', '床上', '地上',
  '张家', '李家', '王家', '赵家', '刘家', '陈家', '杨家', '黄家',
  '周吴', '徐孙',
]);

// ============================================================
// 类型定义
// ============================================================

export interface ExtractedEntities {
  characters: Array<{ name: string; score: number; positions: number[] }>;
  places: Array<{ name: string; score: number; positions: number[] }>;
  treasures: Array<{ name: string; score: number; positions: number[] }>;
  coreActions: Array<{ word: string; score: number; positions: number[] }>;
  coreStates: Array<{ word: string; score: number; positions: number[] }>;
  coreEvents: Array<{ text: string; score: number; evidence: string[] }>;
  impactQuotes: Array<{ text: string; score: number; position: number }>;
  endingHooks: Array<{ text: string; score: number }>;
}

export interface TitleCandidate {
  title: string;
  style: string;
  score: number;
  reason: string;
  evidence: string[];
}

export interface TitleGenOptions {
  content: string;
  outline?: string;
  chapterNumber: number;
  genre?: string;
  recentTitles?: string[];
  allTitles?: string[];
  knownCharacters?: string[];
  knownPlaces?: string[];
}

// ============================================================
// 工具函数
// ============================================================

function getGenreKey(genre: string | undefined): string {
  if (!genre) return 'xuanhuan';
  return GENRE_MAP[genre] || 'xuanhuan';
}

function findAllPositions(text: string, word: string): number[] {
  const positions: number[] = [];
  if (word.length === 0) return positions;
  let pos = 0;
  while ((pos = text.indexOf(word, pos)) !== -1) {
    positions.push(pos);
    pos += word.length;
  }
  return positions;
}

function positionBonus(pos: number, totalLen: number): number {
  const ratio = pos / Math.max(1, totalLen);
  if (ratio < 0.1) return 1.8;
  if (ratio < 0.25) return 1.4;
  if (ratio > 0.9) return 2.0;
  if (ratio > 0.75) return 1.5;
  return 1.0;
}

// ============================================================
// 实体提取
// ============================================================

export function extractEntities(content: string, outline = '', knownCharacters: string[] = [], knownPlaces: string[] = []): ExtractedEntities {
  const fullText = outline ? outline + '\n' + content : content;
  const totalLen = fullText.length;

  const characters = extractCharacters(fullText, totalLen, knownCharacters);
  const places = extractPlaces(fullText, totalLen, knownPlaces);
  const treasures = extractTreasures(fullText, totalLen);
  const coreActions = extractCoreActions(fullText, totalLen);
  const coreStates = extractCoreStates(fullText, totalLen);

  return {
    characters,
    places,
    treasures,
    coreActions,
    coreStates,
    coreEvents: extractCoreEvents(fullText, characters, places, treasures, coreActions),
    impactQuotes: extractImpactQuotes(fullText, totalLen),
    endingHooks: extractEndingHooks(content),
  };
}

// ---- 人物提取 ----
function extractCharacters(
  text: string,
  totalLen: number,
  knownNames: string[],
): ExtractedEntities['characters'] {
  const found = new Map<string, { score: number; positions: number[] }>();

  // 策略1：已知角色名（最可靠）
  for (const name of knownNames) {
    const positions = findAllPositions(text, name);
    if (positions.length > 0) {
      let score = 0;
      for (const pos of positions.slice(0, 10)) {
        score += 4 * positionBonus(pos, totalLen);
      }
      score *= Math.min(2, positions.length / 3);
      found.set(name, { score, positions: positions.slice(0, 10) });
    }
  }

  // 策略2：词频统计发现新人名（2-3字、首字为姓、出现>=2次）
  const freqMap = new Map<string, { count: number; positions: number[] }>();
  for (let len = 2; len <= 3; len++) {
    for (let i = 0; i <= text.length - len; i++) {
      const word = text.slice(i, i + len);
      if (!/^[\u4e00-\u9fa5]+$/.test(word)) continue;
      if (GENERIC_WORDS.has(word)) continue;
      if (!COMMON_SURNAMES.includes(word.charAt(0))) continue;

      // 末字是常见动词/虚词的，不是人名
      const badEnd = ['的', '了', '是', '在', '有', '和', '与', '及', '或', '也', '都', '就', '还', '又', '再', '才', '已', '曾', '正', '刚', '将', '欲', '会', '能', '可', '以', '要', '不', '没', '很', '说', '道', '问', '答', '喊', '叫', '看', '听', '想', '知', '见', '做', '打', '杀', '死', '生', '走', '来', '去', '到', '从', '向', '往', '对', '为', '把', '被', '让', '给', '使', '家', '族', '门', '派', '宗', '阁', '殿', '楼', '院', '庄', '寨', '堡', '城', '山', '峰', '谷', '洞', '府', '湖', '海', '岛', '蹲', '坐', '站', '躺', '跪', '趴', '爬', '跳', '跑', '走', '飞', '游', '钻', '挖', '砍', '劈', '刺', '斩', '拍', '打', '踢', '踩', '踏', '撞', '推', '拉', '举', '搬', '抬', '扔', '丢', '捡', '拿', '握', '抓', '提', '扛', '背', '抱', '扶', '牵', '引', '追', '赶', '逃', '躲', '藏', '守', '护', '攻', '防', '战', '斗', '搏', '争', '抢', '夺', '偷', '盗', '骗', '诈', '骗', '哄', '劝', '求', '告', '请', '求', '要', '借', '租', '买', '卖', '换', '交', '给', '送', '赠', '收', '接', '传', '递', '发', '放', '置', '放', '搁', '摆', '挂', '贴', '盖', '封', '锁', '开', '关', '启', '闭', '张', '合', '展', '卷', '折', '叠', '剪', '切', '割', '分', '划', '割', '撕', '扯', '断', '裂', '碎', '破', '烂', '坏', '毁', '灭', '烧', '烤', '煮', '蒸', '炸', '炒', '炖', '焖', '熬', '煎', '烹', '调', '拌', '腌', '酿', '泡', '浸', '洗', '刷', '擦', '扫', '拖', '抹', '洗', '漱', '梳', '剪', '剃', '刮', '修', '补', '缝', '织', '绣', '编', '织', '纺', '染', '晒', '晾', '烘', '烤', '冻', '冰', '冷', '热', '温', '暖', '凉', '寒', '暑', '阴', '晴', '雨', '雪', '风', '雷', '电', '雾', '霜', '露', '云', '虹', '霞', '光', '暗', '明', '黑', '白', '红', '绿', '蓝', '黄', '紫', '青', '橙', '粉', '灰', '褐', '金', '银', '铜', '铁', '木', '水', '火', '土', '石', '砂', '泥', '土', '尘', '烟', '雾', '气', '风', '雨', '雪', '霜', '露', '云', '雷', '电', '冰', '火', '水', '土', '金', '木', '光', '暗', '影', '声', '音', '响', '味', '香', '臭', '酸', '甜', '苦', '辣', '咸', '涩', '滑', '涩', '硬', '软', '脆', '韧', '黏', '湿', '干', '潮', '燥', '烫', '凉', '冷', '热', '温', '暖', '轻', '重', '厚', '薄', '宽', '窄', '长', '短', '高', '低', '深', '浅', '大', '小', '多', '少', '远', '近', '快', '慢', '早', '晚', '先', '后', '前', '后', '左', '右', '上', '下', '里', '外', '内', '间', '中', '旁', '边', '头', '尾', '顶', '底', '面', '背', '胸', '腹', '腰', '肩', '手', '脚', '头', '眼', '耳', '口', '鼻', '舌', '牙', '齿', '发', '肤', '肉', '骨', '血', '心', '肝', '脾', '肺', '肾', '胃', '肠', '胆', '脑', '眼', '耳', '鼻', '口', '手', '足', '身', '体', '头', '脸', '面', '额', '眉', '眼', '鼻', '口', '唇', '齿', '舌', '耳', '颈', '项', '肩', '背', '胸', '腹', '腰', '臀', '腿', '膝', '脚', '手', '掌', '指', '腕', '肘'];
      if (badEnd.includes(word.charAt(word.length - 1))) continue;

      // 3字词的中字或末字是常见副词/否定词的，不是人名（如"顾炎没"、"张三不"）
      if (len === 3) {
        const middleChar = word.charAt(1);
        const lastChar = word.charAt(2);
        const badMiddleOrLast = ['不', '没', '没', '也', '都', '就', '还', '又', '再', '才', '已', '曾', '正', '刚', '将', '欲', '会', '能', '可', '以', '要', '很', '太', '更', '最', '只', '仅仅', '大概', '大约', '差不多', '几乎', '简直'];
        if (badMiddleOrLast.includes(middleChar) || badMiddleOrLast.includes(lastChar)) continue;
      }

      // 2字词且是高价值动作词的，不是人名
      if (len === 2 && HIGH_VALUE_ACTIONS.includes(word)) continue;

      // 常见的地点/自然名词，不是人名
      const commonPlaceWords = ['水面', '水流', '水底', '水浪', '水花', '火焰', '火光', '火苗', '火星', '山石', '岩石', '沙土', '泥土', '草木', '树林', '草地', '天空', '云层', '雨水', '雷电', '风雪', '冰霜', '雾气', '阳光', '月光', '星光', '黑暗', '光明', '道路', '小径', '山路', '河岸', '河滩', '溪流', '湖泊', '池塘', '沼泽', '山谷', '山坡', '山顶', '山脚', '平原', '荒野', '沙漠', '森林', '岩洞', '洞穴', '悬崖', '峭壁', '沙滩', '礁石', '海浪', '海风', '潮汐', '风暴', '雷雨', '冰雹', '暴雪', '迷雾', '瘴气', '毒气', '火山', '岩浆', '瀑布', '泉水', '井水', '溪水', '河水', '江水', '海水', '冰川', '雪山', '冰原', '冻土', '荒原', '戈壁', '峡谷', '深渊', '绝壁', '断崖', '险峰', '密林', '灌木丛', '藤蔓', '荆棘', '沼泽', '湿地', '泥潭', '沙坑', '土坑', '水坑', '火坑'];
      if (commonPlaceWords.includes(word)) continue;

      if (!freqMap.has(word)) freqMap.set(word, { count: 0, positions: [] });
      const entry = freqMap.get(word)!;
      entry.count++;
      if (entry.positions.length < 15) entry.positions.push(i);
    }
  }

  for (const [name, data] of freqMap) {
    if (data.count < 3) continue; // 至少出现3次
    if (found.has(name)) continue; // 已在已知角色中

    let score = 0;
    for (const pos of data.positions.slice(0, 10)) {
      score += 1.5 * positionBonus(pos, totalLen);
    }
    score *= Math.min(1.8, data.count / 4);

    found.set(name, { score, positions: data.positions.slice(0, 10) });
  }

  // 策略3：人名 + "道/说/喊/叫/问/答/冷道/怒道/笑道" 模式
  const speechPatterns = [
    /([\u4e00-\u9fa5]{2,3})(?:道|说|喊|叫|问|答|冷道|怒道|笑道|叹道|沉声|淡淡|缓缓|狠狠|轻声|低声)/g,
    /([\u4e00-\u9fa5]{2,3})(?:皱眉|点头|摇头|转身|回头|抬头|低头)/g,
    /([\u4e00-\u9fa5]{2,3})(?:公子|姑娘|长老|掌门|尊者|大人|少主|小姐|师兄|师弟|家主|族长|城主|府主)/g,
  ];

  for (const pattern of speechPatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const name = match[1];
      if (name.length < 2 || name.length > 3) continue;
      if (!/^[\u4e00-\u9fa5]+$/.test(name)) continue;
      if (GENERIC_WORDS.has(name)) continue;
      if (!COMMON_SURNAMES.includes(name.charAt(0))) continue;

      // 末字是常见副词/否定词/动词的，不是人名（如"顾炎没"、"顾炎蹲"、"张三不"）
      const badEnd = ['的', '了', '是', '在', '有', '和', '与', '及', '或', '也', '都', '就', '还', '又', '再', '才', '已', '曾', '正', '刚', '将', '欲', '会', '能', '可', '以', '要', '不', '没', '很', '说', '道', '问', '答', '喊', '叫', '看', '听', '想', '知', '见', '做', '打', '杀', '死', '生', '走', '来', '去', '到', '从', '向', '往', '对', '为', '把', '被', '让', '给', '使', '蹲', '坐', '站', '躺', '跪', '趴', '爬', '跳', '跑', '飞', '游', '钻', '挖', '砍', '劈', '刺', '斩', '拍', '踢', '踩', '踏', '撞', '推', '拉', '举', '搬', '抬', '扔', '丢', '捡', '拿', '握', '抓', '提', '扛', '背', '抱', '扶', '追', '赶', '逃', '躲', '藏', '守', '护', '攻', '防', '战', '斗', '搏', '争', '抢', '夺', '偷', '盗', '骗', '诈', '劝', '求', '告', '请', '借', '租', '买', '卖', '换', '交', '送', '赠', '收', '接', '传', '递', '发', '放', '置', '摆', '挂', '贴', '盖', '封', '锁', '开', '关', '启', '闭', '张', '合', '展', '卷', '折', '叠', '剪', '切', '割', '分', '划', '撕', '扯', '断', '裂', '碎', '破', '烂', '坏', '毁', '灭', '烧', '烤', '煮', '蒸', '炸', '炒', '炖', '焖', '熬', '煎', '烹', '调', '拌', '腌', '酿', '泡', '浸', '洗', '刷', '擦', '扫', '拖', '抹', '漱', '梳', '剃', '刮', '修', '补', '缝', '织', '绣', '编', '纺', '染', '晒', '晾', '烘', '冻', '冰'];
      if (badEnd.includes(name.charAt(name.length - 1))) continue;

      // 3字词的中字或末字是常见副词/否定词的，不是人名
      if (name.length === 3) {
        const badMiddleOrLast = ['不', '没', '也', '都', '就', '还', '又', '再', '才', '已', '曾', '正', '刚', '将', '欲', '会', '能', '可', '以', '要', '很', '太', '更', '最', '只'];
        if (badMiddleOrLast.includes(name.charAt(1)) || badMiddleOrLast.includes(name.charAt(2))) continue;
      }

      // 常见的地点/自然名词，不是人名
      const commonPlaceWords = ['水面', '水流', '水底', '水浪', '水花', '火焰', '火光', '火苗', '火星', '山石', '岩石', '沙土', '泥土', '草木', '树林', '草地', '天空', '云层', '雨水', '雷电', '风雪', '冰霜', '雾气', '阳光', '月光', '星光', '黑暗', '光明', '道路', '小径', '山路', '河岸', '河滩', '溪流', '湖泊', '池塘', '沼泽', '山谷', '山坡', '山顶', '山脚', '平原', '荒野', '沙漠', '森林', '岩洞', '洞穴', '悬崖', '峭壁', '沙滩', '礁石', '海浪', '海风', '潮汐', '风暴', '雷雨', '冰雹', '暴雪', '迷雾', '瘴气', '毒气', '火山', '岩浆', '瀑布', '泉水', '井水', '溪水', '河水', '江水', '海水', '冰川', '雪山', '冰原', '冻土', '荒原', '戈壁', '峡谷', '深渊', '绝壁', '断崖', '险峰', '密林', '灌木丛', '藤蔓', '荆棘', '湿地', '泥潭', '沙坑', '土坑', '水坑', '火坑'];
      if (commonPlaceWords.includes(name)) continue;

      const pos = match.index;
      if (!found.has(name)) {
        found.set(name, { score: 0, positions: [] });
      }
      const entry = found.get(name)!;
      if (entry.positions.length < 15) entry.positions.push(pos);
      entry.score += 3 * positionBonus(pos, totalLen);
    }
  }

  return Array.from(found.entries())
    .filter(([, data]) => data.score >= 3)
    .map(([name, data]) => ({ name, score: data.score, positions: data.positions }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
}

// ---- 地点提取（只提取高置信度地点，宁缺毋滥） ----
function extractPlaces(
  text: string,
  totalLen: number,
  knownPlaces: string[],
): ExtractedEntities['places'] {
  const found = new Map<string, { score: number; positions: number[] }>();

  // 策略1：已知地名（最可靠）
  for (const place of knownPlaces) {
    const positions = findAllPositions(text, place);
    if (positions.length > 0) {
      let score = 0;
      for (const pos of positions.slice(0, 10)) {
        score += 4 * positionBonus(pos, totalLen);
      }
      score *= Math.min(1.5, positions.length / 3);
      found.set(place, { score, positions: positions.slice(0, 10) });
    }
  }

  // 策略2：只匹配2字以上的高置信度地点后缀
  const reliablePlaceSuffixes = [
    '荒原', '森林', '山脉', '禁地', '秘境', '遗迹', '废墟',
    '议事堂', '城门', '城头', '府邸', '密室', '地牢',
    '拍卖会', '竞技场', '演武场', '藏经阁', '炼丹房',
    '城主府', '将军府', '宰相府', '皇宫', '东宫', '西宫',
    '酒楼', '茶馆', '客栈', '当铺', '药铺', '铁匠铺',
    '广场', '校场', '刑场', '法场',
    '边境', '边关', '要塞', '隘口', '渡口',
    '秘境', '小世界', '洞天', '福地',
    '岩洞', '山洞', '洞穴', '山洞', '岩壁', '山崖', '山脚',
    '河滩', '河岸', '河畔', '河道', '溪流', '小溪', '河流',
    '山谷', '山脚', '山顶', '山坡', '山岗', '山腰',
    '森林', '树林', '林地', '树丛', '草地', '草原', '平原',
    '荒野', '荒地', '沙漠', '戈壁', '沼泽', '湿地',
    '湖泊', '池塘', '水坑', '水井', '泉眼', '水源',
    '营地', '据点', '住所', '巢穴', '洞穴', '窝棚',
    '道路', '小径', '山路', '土路', '桥梁', '渡口',
  ];

  for (const suffix of reliablePlaceSuffixes) {
    // 地名通常是 2-4 字，前缀 1-2 字
    const minPrefix = 1;
    const maxPrefix = 2;
    const pattern = new RegExp(`([\\u4e00-\\u9fa5]{${minPrefix},${maxPrefix}}${suffix})`, 'g');
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const place = match[1];
      if (place.length < 3 || place.length > 5) continue;
      if (!/^[\u4e00-\u9fa5]+$/.test(place)) continue;
      if (GENERIC_WORDS.has(place)) continue;
      if (found.has(place)) continue;

      const prefix = place.slice(0, place.length - suffix.length);
      if (prefix.length === 0) continue;

      // 前缀首字校验：代词/虚词/动词/量词/数词开头的跳过
      const badFirst = [
        '这', '那', '哪', '我', '你', '他', '她', '它', '们', '什', '怎', '为', '如', '何', '可', '能', '已', '但', '而', '虽', '不', '没', '也', '就', '都', '还', '又', '再', '才', '曾', '正', '刚', '将', '欲', '会', '以', '要', '把', '被', '让', '给', '使', '从', '向', '往', '对', '到', '说', '道', '问', '答', '喊', '叫', '看', '听', '想', '知', '见', '做', '打', '杀', '死', '生', '走', '来', '去', '望', '盯', '瞧', '拿', '取', '收', '放', '接', '举', '抬', '低', '转', '回', '传', '始', '于', '由', '因', '所', '之', '其', '此', '彼', '各', '每', '某', '只', '块', '幅', '根', '张', '条', '件', '本', '册', '卷', '尊', '座', '口', '面', '柄', '颗', '粒', '片', '段', '节', '章', '页', '层', '排', '列', '行', '堆', '捆', '包', '袋', '箱', '盒', '瓶', '罐', '盆', '碗', '杯', '盘', '碟', '勺', '筷', '怀', '掏', '摸', '揣', '藏', '抓', '握', '提', '拎', '扛', '背', '抱', '搂', '揽', '携', '带', '得', '失', '丢', '掉', '落', '扔', '抛', '撒', '倒', '灌', '装', '填', '塞', '挖', '探', '伸', '按', '压', '推', '拉', '拖', '拽', '扯', '撕', '拆', '解', '开', '关', '闭', '锁', '敲', '击', '撞', '碰', '摔', '砸', '砍', '劈', '切', '割', '剪', '削', '磨', '擦', '扫', '抹', '涂', '画', '写', '刻', '印', '盖', '贴', '粘', '缝', '补', '织', '编', '造', '建', '修', '理', '换', '改', '变', '化', '成', '非', '有', '无', '存', '亡', '在', '好', '坏', '大', '小', '多', '少', '高', '低', '长', '短', '新', '旧', '老', '快', '慢', '轻', '重', '软', '硬', '冷', '热', '温', '凉', '美', '丑', '善', '恶', '真', '假', '虚', '实', '全', '缺', '整', '碎', '完', '残', '先', '后', '前', '左', '右', '上', '下', '里', '外', '中', '内', '东', '西', '南', '北', '远', '近', '朝', '向', '望', '看', '盯', '瞧', '瞅', '瞄', '瞥', '眺', '观', '察', '注', '视', '探', '摸', '碰', '触', '跑', '奔', '冲', '扑', '跳', '跃', '爬', '滚', '翻', '滑', '跌', '摔', '倒', '坐', '蹲', '跪', '趴', '躺', '站', '立', '停', '留', '待', '守', '护', '卫', '保', '防', '攻', '击', '杀', '伤', '死', '活', '救', '治', '医', '疗', '养', '整', '理', '清', '洗', '刷', '造', '建', '搭', '筑', '拆', '毁', '损', '伤', '炼', '熔', '铸', '锻', '烧', '煮', '蒸', '炒', '炸', '烘', '焙', '腌', '酿', '泡', '浸', '研', '碾', '切', '剪', '撕', '扯', '开', '启', '动', '运', '输', '搬', '移', '摆', '挂', '吊', '绑', '系', '裹', '缠', '绕', '拧', '扭', '弯', '折', '叠', '卷', '藏', '储', '填', '塞', '积', '聚', '散', '弃', '废', '注', '涌', '喷', '溅', '滴', '漏', '渗', '透', '连', '合', '并', '离', '集', '汇', '淌', '飘', '浮', '沉', '降', '入', '返', '归', '经', '行', '赶', '追', '逃', '躲', '匿', '隐', '显', '露', '消', '灭', '亡', '是', '非', '对', '错', '强', '弱', '宽', '窄', '厚', '薄', '深', '浅', '早', '晚', '的', '了', '着', '过', '地', '得', '一', '两', '三', '四', '五', '六', '七', '八', '九', '十', '百', '千', '万', '几', '数', '多', '少', '置', '迟', '进', '出', '入', '踏', '踩', '登', '爬', '跳', '奔', '跑', '飞', '游', '走', '行', '走', '进', '出',
      ];
      if (badFirst.includes(prefix.charAt(0))) continue;

      // 前缀末字不能是助词/动词
      const badLast = ['的', '了', '着', '过', '地', '得', '是', '在', '有', '和', '与', '及', '或', '也', '都', '就', '还', '又', '再', '才', '已', '曾', '正', '刚', '将', '欲', '会', '能', '可', '以', '要', '不', '没', '很', '最', '更', '越', '比', '像', '如', '似', '若', '把', '被', '让', '给', '使', '从', '向', '往', '对', '为', '到', '说', '道', '问', '答', '喊', '叫', '看', '听', '想', '知', '见', '做', '打', '杀', '死', '生', '走', '来', '去'];
      if (prefix.length >= 1 && badLast.includes(prefix.charAt(prefix.length - 1))) continue;

      const pos = match.index;
      found.set(place, { score: 2 * positionBonus(pos, totalLen), positions: [pos] });
    }
  }

  return Array.from(found.entries())
    .filter(([, data]) => data.score >= 2)
    .map(([name, data]) => ({ name, score: data.score, positions: data.positions }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
}

// ---- 宝物提取（只保留高置信度的，宁缺毋滥） ----
function extractTreasures(text: string, totalLen: number): ExtractedEntities['treasures'] {
  const found = new Map<string, { score: number; positions: number[] }>();

  // 只匹配2字以上的明确宝物/功法/器物后缀
  const reliableTreasureSuffixes = [
    '功法', '宝典', '秘典', '真经', '神诀', '仙诀', '妖诀', '魔诀', '心法', '秘术',
    '阵法', '丹方', '符箓', '神兵', '灵宝', '法器', '宝器', '仙器', '神器',
    '玉佩', '玉符', '玉简', '宝珠', '神珠', '灵珠', '元珠', '圣晶',
    '圣物', '仙宝', '魔宝', '妖宝', '秘宝', '重宝',
    '碑文', '祭坛', '暗格', '传送阵', '聚灵阵',
    '储物戒', '储物袋', '纳戒', '空间戒',
  ];

  for (const suffix of reliableTreasureSuffixes) {
    // 宝物名通常是 2-4 字，所以前缀限制在 1-2 字
    const minPrefix = 1;
    const maxPrefix = 2;
    const pattern = new RegExp(`([\\u4e00-\\u9fa5]{${minPrefix},${maxPrefix}}${suffix})`, 'g');
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const treasure = match[1];
      if (treasure.length < 3 || treasure.length > 5) continue;
      if (!/^[\u4e00-\u9fa5]+$/.test(treasure)) continue;
      if (GENERIC_WORDS.has(treasure)) continue;

      const prefix = treasure.slice(0, treasure.length - suffix.length);
      if (prefix.length === 0) continue;

      // 前缀首字必须是实词（名词/形容词），不能是动词/虚词/代词
      const badFirst = [
        '这', '那', '哪', '我', '你', '他', '她', '它', '们', '什', '怎', '为', '如', '何', '可', '能', '已', '但', '而', '虽', '不', '没', '也', '就', '都', '还', '又', '再', '才', '曾', '正', '刚', '将', '欲', '会', '以', '要', '把', '被', '让', '给', '使', '从', '向', '往', '对', '到', '说', '道', '问', '答', '喊', '叫', '看', '听', '想', '知', '见', '做', '打', '杀', '死', '生', '走', '来', '去', '望', '盯', '瞧', '拿', '取', '收', '放', '接', '举', '抬', '低', '转', '回', '传', '始', '于', '由', '因', '所', '之', '其', '此', '彼', '各', '每', '某', '只', '块', '幅', '根', '张', '条', '件', '本', '册', '卷', '尊', '座', '口', '面', '柄', '颗', '粒', '片', '段', '节', '章', '页', '层', '排', '列', '行', '堆', '捆', '包', '袋', '箱', '盒', '瓶', '罐', '盆', '碗', '杯', '盘', '碟', '勺', '筷', '怀', '掏', '摸', '掏', '摸', '揣', '藏', '拿', '抓', '握', '提', '拎', '扛', '背', '抱', '搂', '揽', '携', '带', '取', '得', '失', '丢', '掉', '落', '扔', '抛', '丢', '撒', '倒', '灌', '装', '填', '塞', '挖', '掏', '探', '伸', '摸', '按', '压', '推', '拉', '拖', '拽', '扯', '撕', '扯', '撕', '拆', '解', '开', '关', '闭', '锁', '敲', '打', '击', '撞', '碰', '摔', '砸', '砍', '劈', '切', '割', '剪', '削', '磨', '擦', '扫', '抹', '涂', '画', '写', '刻', '印', '盖', '贴', '粘', '缝', '补', '织', '编', '造', '建', '修', '理', '换', '改', '变', '化', '成', '为', '是', '非', '有', '无', '存', '亡', '在', '不', '好', '坏', '大', '小', '多', '少', '高', '低', '长', '短', '新', '旧', '老', '少', '快', '慢', '轻', '重', '软', '硬', '冷', '热', '温', '凉', '甜', '苦', '酸', '辣', '咸', '香', '臭', '美', '丑', '善', '恶', '真', '假', '虚', '实', '全', '缺', '整', '碎', '完', '残', '先', '后', '前', '后', '左', '右', '上', '下', '里', '外', '中', '内', '东', '西', '南', '北',
      ];
      if (badFirst.includes(prefix.charAt(0))) continue;

      // 前缀末字不能是动词/助词
      const badLast = ['的', '了', '着', '过', '地', '得', '是', '在', '有', '和', '与', '及', '或', '也', '都', '就', '还', '又', '再', '才', '已', '曾', '正', '刚', '将', '欲', '会', '能', '可', '以', '要', '不', '没', '很', '最', '更', '越', '比', '像', '如', '似', '若', '如', '把', '被', '让', '给', '使', '从', '向', '往', '对', '为', '到', '说', '道', '问', '答', '喊', '叫', '看', '听', '想', '知', '见', '做', '打', '杀', '死', '生', '走', '来', '去'];
      if (prefix.length >= 1 && badLast.includes(prefix.charAt(prefix.length - 1))) continue;

      // 不能包含否定词
      const negWords = ['没有', '不是', '不能', '不会', '无法', '还没', '尚未'];
      let skip = false;
      for (const nw of negWords) {
        if (treasure.includes(nw)) { skip = true; break; }
      }
      if (skip) continue;

      const pos = match.index;
      if (!found.has(treasure)) {
        found.set(treasure, { score: 0, positions: [] });
      }
      const entry = found.get(treasure)!;
      entry.positions.push(pos);
      entry.score += 2 * positionBonus(pos, totalLen);
    }
  }

  return Array.from(found.entries())
    .filter(([, data]) => data.score >= 2)
    .map(([name, data]) => ({ name, score: data.score, positions: data.positions }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
}

// ---- 状态词提取 ----
function extractCoreStates(text: string, totalLen: number): ExtractedEntities['coreStates'] {
  const found = new Map<string, { score: number; positions: number[] }>();

  for (const state of HIGH_VALUE_STATES) {
    const positions = findAllPositions(text, state);
    if (positions.length === 0) continue;

    let score = 0;
    for (const pos of positions.slice(0, 10)) {
      score += positionBonus(pos, totalLen);
    }
    score *= positions.length > 1 ? 1.2 : 1;

    found.set(state, { score, positions: positions.slice(0, 10) });
  }

  return Array.from(found.entries())
    .map(([word, data]) => ({ word, score: data.score, positions: data.positions }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

// ---- 核心动作提取 ----
function extractCoreActions(text: string, totalLen: number): ExtractedEntities['coreActions'] {
  const found = new Map<string, { score: number; positions: number[] }>();

  const weakActions = new Set([
    '搭建', '建立', '建设', '建造', '构建', '构筑', '架构', '组建', '组织', '整理',
    '决定', '选择', '确定', '确认', '选定', '决断', '决策', '抉择', '决议',
    '护短', '偏袒', '维护', '保护', '守护', '守卫', '捍卫', '保卫',
    '思考', '思考', '考虑', '考量', '思索', '沉思', '冥想', '琢磨',
    '准备', '预备', '筹备', '安排', '布置', '规划', '计划', '策划',
    '等待', '等候', '期待', '盼望', '期望', '期盼', '等待',
    '观察', '观望', '观看', '查看', '审视', '注视', '凝视', '打量',
    '行动', '举动', '行为', '动作', '活动', '运动', '活动',
    '行动', '做', '进行', '开展', '实施', '执行', '实行', '运作',
    '发现', '发觉', '察觉', '看到', '看见', '得知', '了解', '知道',
    '出发', '启程', '动身', '上路', '离开', '启程',
    '到达', '抵达', '抵达', '到达',
    '出现', '显现', '呈现', '显露', '露出', '展现',
    '存在', '生存', '存活', '存在',
    '变化', '改变', '转变', '变动', '变动',
    '发展', '进展', '推进', '推进',
    '处理', '处置', '解决', '解决',
    '管理', '治理', '管制', '管控',
    '操作', '操控', '控制', '掌握',
    '联系', '联络', '沟通', '交流',
    '合作', '协作', '配合', '协同',
    '参与', '参加', '加入', '介入',
    '支持', '支援', '帮助', '援助',
    '反对', '抵制', '拒绝', '否决',
    '同意', '赞成', '认可', '批准',
    '质疑', '怀疑', '置疑', '疑问',
    '理解', '明白', '懂得', '知晓',
    '学习', '研习', '研究', '钻研',
    '工作', '劳作', '劳动', '干活',
    '休息', '歇息', '休养', '休整',
    '睡觉', '入睡', '安眠', '沉睡',
    '醒来', '苏醒', '醒来',
    '吃饭', '进食', '用餐', '就餐',
    '喝水', '饮水', '喝水',
  ]);

  for (const action of HIGH_VALUE_ACTIONS) {
    if (weakActions.has(action)) continue;

    const positions = findAllPositions(text, action);
    if (positions.length === 0) continue;

    let score = 0;
    for (const pos of positions.slice(0, 10)) {
      score += positionBonus(pos, totalLen);
    }
    score *= positions.length > 1 ? 1.2 : 1;

    found.set(action, { score, positions: positions.slice(0, 10) });
  }

  return Array.from(found.entries())
    .map(([word, data]) => ({ word, score: data.score, positions: data.positions }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
}

// ---- 核心事件提取（新增）----
function extractCoreEvents(
  text: string,
  characters: ExtractedEntities['characters'],
  places: ExtractedEntities['places'],
  treasures: ExtractedEntities['treasures'],
  coreActions: ExtractedEntities['coreActions'],
): ExtractedEntities['coreEvents'] {
  const events = new Map<string, { score: number; evidence: string[] }>();

  const charNames = characters.map(c => c.name);
  const placeNames = places.map(p => p.name);
  const treasureNames = treasures.map(t => t.name);
  const actionWords = coreActions.map(a => a.word);

  const paragraphs = text.split(/\n+/u).filter(p => p.trim().length > 0);

  for (const para of paragraphs.slice(0, 15)) {
    const sentences = para.split(/[。！？!?\n]/u).filter(s => s.trim().length > 0);
    for (const sentence of sentences.slice(0, 3)) {
      const trimmed = sentence.trim();
      if (trimmed.length < 6 || trimmed.length > 20) continue;

      let evidence: string[] = [];
      let eventScore = 0;

      for (const char of charNames) {
        if (trimmed.includes(char)) {
          evidence.push(char);
          eventScore += 5;
        }
      }
      for (const place of placeNames) {
        if (trimmed.includes(place)) {
          evidence.push(place);
          eventScore += 4;
        }
      }
      for (const treasure of treasureNames) {
        if (trimmed.includes(treasure)) {
          evidence.push(treasure);
          eventScore += 4;
        }
      }
      for (const action of actionWords) {
        if (trimmed.includes(action)) {
          evidence.push(action);
          eventScore += 6;
        }
      }

      if (eventScore >= 6 && evidence.length >= 1) {
        let clean = trimmed;
        const punctIndex = clean.search(/[，,、]/);
        if (punctIndex > 3 && punctIndex <= 10) {
          clean = clean.slice(0, punctIndex);
        }

        clean = clean.replace(/[，,。.!！?？、:：;；…—]/g, '');
        if (clean.length >= 4 && clean.length <= 10) {
          const badStartChars = ['这', '那', '哪', '我', '你', '他', '她', '它', '们', '什', '怎', '为', '如', '何', '可', '能', '已', '但', '而', '虽', '不', '没', '也', '就', '都', '还', '又', '再', '才', '曾', '正', '刚', '将', '欲', '会', '以', '要', '把', '被', '让', '给', '使', '从', '向', '往', '对', '到', '说', '道', '问', '答', '喊', '叫', '看', '听', '想', '知', '见', '做', '打', '杀', '死', '生', '走', '来', '去', '了', '着', '过', '的', '地', '得', '一', '两', '三', '四', '五', '六', '七', '八', '九', '十', '几', '只', '有', '在', '是', '和', '与', '及', '或', '很', '最', '更', '越', '比', '像', '如', '似', '若'];
          if (badStartChars.includes(clean.charAt(0))) {
            continue;
          }

          if (!events.has(clean)) {
            events.set(clean, { score: eventScore, evidence: [] });
          }
          const entry = events.get(clean)!;
          entry.score += eventScore;
          for (const e of evidence) {
            if (!entry.evidence.includes(e)) {
              entry.evidence.push(e);
            }
          }
        }
      }
    }
  }

  const nonHumanActions = new Set([
    '裂开', '破裂', '碎裂', '断裂', '崩塌', '塌陷', '震动', '地动',
    '推挤', '挤压', '升起', '下沉', '退去', '涨起', '涌出', '喷出',
    '燃烧', '熄灭', '爆炸', '炸开', '崩塌', '塌陷', '崩塌', '滑坡',
    '漂流', '流动', '凝固', '融化', '蒸发', '凝结', '冻结', '解冻',
  ]);

  if (charNames.length > 0 && actionWords.length > 0) {
    for (const char of charNames.slice(0, 2)) {
      for (const action of actionWords.slice(0, 3)) {
        if (nonHumanActions.has(action)) continue;
        
        const eventText = char + action;
        if (eventText.length >= 4 && eventText.length <= 8) {
          if (!events.has(eventText)) {
            events.set(eventText, { score: 12, evidence: [char, action] });
          } else {
            const entry = events.get(eventText)!;
            entry.score += 8;
          }
        }
      }
    }
  }

  if (actionWords.length > 0) {
    for (const action of actionWords.slice(0, 3)) {
      const eventText = action;
      if (eventText.length >= 2 && eventText.length <= 6) {
        if (!events.has(eventText)) {
          events.set(eventText, { score: 8, evidence: [action] });
        }
      }
    }
  }

  return Array.from(events.entries())
    .map(([text, data]) => ({ text, score: data.score, evidence: data.evidence }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

// ---- 金句台词提取 ----
function extractImpactQuotes(text: string, totalLen: number): ExtractedEntities['impactQuotes'] {
  const results: Array<{ text: string; score: number; position: number }> = [];

  const patterns = [
    /「([^「」\n]{3,14})」/g,
    /"([^"\n]{3,14})"/g,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const line = match[1].trim();
      if (line.length < 3 || line.length > 12) continue;

      const onlyChinese = line.replace(/[，,。.!！?？、:：;；…—\s]/gu, '');
      if (onlyChinese.length < 2) continue;
      if (!/^[\u4e00-\u9fa5]+$/.test(onlyChinese)) continue;
      if (GENERIC_WORDS.has(onlyChinese)) continue;

      let impactScore = 0;

      for (const verb of HIGH_VALUE_ACTIONS) {
        if (line.includes(verb)) { impactScore += 3; break; }
      }
      for (const marker of SUSPENSE_MARKERS) {
        if (line.includes(marker)) { impactScore += 2; break; }
      }

      const origMatch = match[0];
      if (/[！!]$/.test(origMatch)) impactScore += 2;
      if (/[？?]$/.test(origMatch)) impactScore += 3;

      if (line.length >= 4 && line.length <= 7) impactScore += 2;

      impactScore *= positionBonus(match.index, totalLen);

      if (impactScore >= 4) {
        results.push({ text: line, score: impactScore, position: match.index });
      }
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, 5);
}

// ---- 章末钩子提取 ----
function extractEndingHooks(content: string): ExtractedEntities['endingHooks'] {
  const tail = content.slice(-3000);
  const sentences = tail.split(/[。！？!?\n]/u).filter(s => s.trim().length > 0);
  const hooks: Array<{ text: string; score: number }> = [];

  for (const sentence of sentences.slice(-20)) {
    const trimmed = sentence.trim();
    if (trimmed.length < 4 || trimmed.length > 18) continue;

    let score = 0;
    for (const marker of SUSPENSE_MARKERS) {
      if (trimmed.includes(marker)) { score += 2; break; }
    }
    for (const verb of HIGH_VALUE_ACTIONS) {
      if (trimmed.includes(verb)) { score += 2; break; }
    }

    if (score >= 3) {
      let clean = trimmed;
      const badStarts = ['但是', '然而', '不过', '只是', '而且', '并且', '所以', '因此', '于是', '然后', '接着', '随后', '这时', '此刻', '突然', '忽然', '就在', '正在', '此时'];
      for (const start of badStarts) {
        if (clean.startsWith(start)) { clean = clean.slice(start.length); break; }
      }

      let finalHook = clean;
      if (clean.length > 10) {
        const firstPunct = clean.search(/[，,、]/);
        if (firstPunct >= 4 && firstPunct <= 10) {
          finalHook = clean.slice(0, firstPunct);
        }
      }

      const finalClean = finalHook.replace(/[，,、。.!！?？]/g, '');
      if (finalClean.length >= 4 && finalClean.length <= 10
        && /^[\u4e00-\u9fa5]+$/.test(finalClean)
        && !GENERIC_WORDS.has(finalClean)) {
        hooks.push({ text: finalClean, score });
      }
    }
  }

  return hooks.sort((a, b) => b.score - a.score).slice(0, 4);
}

// ============================================================
// 标题生成（5种写法，全部基于真实素材）
// ============================================================

export function generateCandidates(entities: ExtractedEntities, genre: string | undefined, options?: { content?: string; randomSeed?: number }): TitleCandidate[] {
  const candidates: TitleCandidate[] = [];
  const genreKey = getGenreKey(genre || '');
  const seed = options?.randomSeed ?? Date.now();
  const random = mulberry32(seed);

  // === 网文风格标题（高优先级）===

  // ① 悬念型标题（网文核心吸引力）
  candidates.push(...generateSuspenseTitles(entities, genreKey));

  // ② 反转型标题（打脸/逆袭，网文爆点）
  candidates.push(...generateReversalTitles(entities, genreKey));

  // ③ 场景爆点型标题（画面感+冲击力）
  candidates.push(...generateSceneShockTitles(entities, genreKey));

  // ④ 对话型标题（代入感强）
  candidates.push(...generateDialogTitles(entities));

  // === 传统内容驱动标题 ===

  // ⑤ 核心事件（内容相关性最高）
  candidates.push(...generateCoreEventTitles(entities));

  // ⑥ 人物+动作（主力，最可靠）
  candidates.push(...generateCharacterActionTitles(entities));

  // ⑦ 人物+地点+动作（场景化，更有画面感）
  candidates.push(...generateCharacterPlaceActionTitles(entities));

  // ⑦+ 时间/环境型标题（氛围感强）
  if (options?.content) {
    candidates.push(...generateTimeEnvTitles(entities, options.content));
  }

  // ⑧ 人物+状态（悬念感强）
  candidates.push(...generateCharacterStateTitles(entities));

  // ⑨ 金句台词
  candidates.push(...generateQuoteTitles(entities));

  // ⑩ 悬念钩子
  candidates.push(...generateSuspenseHookTitles(entities));

  // ⑪ 宝物直出（宁缺毋滥）
  candidates.push(...generateTreasureTitles(entities));

  // ⑫ 人物+冲突对象（非VS模式，更自然）
  candidates.push(...generateCharacterConflictTitles(entities));

  // ⑬ 人物直出（兜底，信息量最小）
  candidates.push(...generateCharacterNameTitles(entities));

  // ⑭ 双人物（冲突/关系）- 降权处理
  candidates.push(...generateTwoCharacterTitles(entities));

  // 随机扰动：分数相近的候选增加随机性，提高多样性
  for (const cand of candidates) {
    const jitter = (random() - 0.5) * 8;
    cand.score += jitter;
  }

  return candidates;
}

function mulberry32(seed: number) {
  let a = seed;
  return function() {
    a |= 0;
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ① 人物+动作（主力）
function generateCharacterActionTitles(entities: ExtractedEntities): TitleCandidate[] {
  const results: TitleCandidate[] = [];

  if (entities.characters.length === 0 || entities.coreActions.length === 0) return results;

  const topChar = entities.characters[0];

  const nonHumanActions = new Set([
    '裂开', '破裂', '碎裂', '断裂', '崩塌', '塌陷', '震动', '地动',
    '推挤', '挤压', '升起', '下沉', '退去', '涨起', '涌出', '喷出',
    '燃烧', '熄灭', '爆炸', '炸开', '崩塌', '塌陷', '崩塌', '滑坡',
    '漂流', '流动', '凝固', '融化', '蒸发', '凝结', '冻结', '解冻',
  ]);

  for (let i = 0; i < Math.min(4, entities.coreActions.length); i++) {
    const action = entities.coreActions[i];
    
    if (nonHumanActions.has(action.word)) continue;

    const title = topChar.name + action.word;
    if (title.length >= 4 && title.length <= 8 && /^[\u4e00-\u9fa5]+$/.test(title)) {
      const bonus = i === 0 ? 8 : i === 1 ? 4 : i === 2 ? 2 : 0;
      results.push({
        title,
        style: 'action-character',
        score: 85 + bonus,
        reason: `人物+动作：${topChar.name}${action.word}`,
        evidence: [topChar.name, action.word],
      });
    }
  }

  // 动作+人物（更有动感，如"觉醒沈渊"不太自然，但"逆袭沈渊"也不行）
  // 中文网文标题一般是"人物+动作"，如"沈渊觉醒"

  return results;
}

// ① 核心事件（最高优先级，最能反映章节内容）
function generateCoreEventTitles(entities: ExtractedEntities): TitleCandidate[] {
  const results: TitleCandidate[] = [];

  for (let i = 0; i < Math.min(3, entities.coreEvents.length); i++) {
    const event = entities.coreEvents[i];
    if (event.text.length < 4 || event.text.length > 10) continue;
    if (!/^[\u4e00-\u9fa5]+$/.test(event.text)) continue;

    const bonus = i === 0 ? 15 : i === 1 ? 8 : 4;
    results.push({
      title: event.text,
      style: 'core-event',
      score: 92 + bonus,
      reason: `核心事件：${event.text}`,
      evidence: event.evidence,
    });
  }

  return results;
}

const MEANINGLESS_WORDS = new Set([
  '没', '不', '是', '在', '有', '了', '的', '和', '与', '及', '或',
  '也', '都', '又', '再', '更', '最', '很', '太', '才', '正', '刚',
  '将', '欲', '还', '尚', '曾', '已', '便', '就', '只', '仅仅',
  '大概', '大约', '差不多', '几乎', '简直', '实在', '确实', '真是',
]);

// ① 悬念型标题（网文核心吸引力）
function generateSuspenseTitles(entities: ExtractedEntities, genreKey: string): TitleCandidate[] {
  const results: TitleCandidate[] = [];
  const genreStyle = NETNOVEL_GENRE_STYLES[genreKey] || NETNOVEL_GENRE_STYLES.default;

  const suspenseWords = [...NETNOVEL_SUSPENSE_PREFIX, ...genreStyle.suspense];
  const actionWords = entities.coreActions.slice(0, 3).map(a => a.word);

  const connectiveTemplates: Record<string, string[]> = {
    '谁': ['谁在', '谁能', '谁会', '谁才', '谁知', '谁料', '谁敢'],
    '什么': ['什么人', '什么事', '什么东西', '什么秘密', '什么力量', '什么来头'],
    '怎么': ['怎么回事', '怎么可能', '怎么做到', '怎么发现', '怎么回事'],
    '为何': ['为何如此', '为何突然', '为何要', '为何而来', '为何出现'],
    '居然': ['居然是', '居然敢', '居然能', '居然在'],
    '竟然': ['竟然是', '竟然敢', '竟然能', '竟然在'],
    '原来': ['原来如此', '原来是', '原来在', '原来有'],
    '莫非': ['莫非是', '莫非有', '莫非在'],
    '难道': ['难道是', '难道敢', '难道能'],
  };

  for (const prefix of suspenseWords) {
    for (const entityType of ['characters', 'places', 'treasures'] as const) {
      const list = entities[entityType];
      for (const item of list.slice(0, 2)) {
        const name = (item as { name: string }).name;
        if (!name) continue;

        if (MEANINGLESS_WORDS.has(name)) continue;
        if (name.length < 2) continue;

        const title = prefix + name;
        if (title.length >= 4 && title.length <= 10 && /^[\u4e00-\u9fa5]+$/.test(title)) {
          const isSimpleSuspense = ['什么', '怎么', '为何', '为什么'].includes(prefix);
          results.push({
            title,
            style: 'suspense-netnovel',
            score: isSimpleSuspense ? 18 : 55,
            reason: `悬念型：${prefix}${name}`,
            evidence: [prefix, name],
          });
        }

        const title2 = name + prefix;
        if (title2.length >= 4 && title2.length <= 10 && /^[\u4e00-\u9fa5]+$/.test(title2)) {
          const isSimpleSuspense = ['什么', '怎么', '为何', '为什么'].includes(prefix);
          results.push({
            title: title2,
            style: 'suspense-netnovel',
            score: isSimpleSuspense ? 16 : 53,
            reason: `悬念型：${name}${prefix}`,
            evidence: [name, prefix],
          });
        }

        // 使用连接模板生成更自然的悬念标题
        if (connectiveTemplates[prefix]) {
          for (const template of connectiveTemplates[prefix]) {
            const needsAction = ['什么人', '什么事', '什么东西', '什么秘密', '什么力量', '什么来头'];
            if (needsAction.includes(template)) {
              for (const action of actionWords) {
                const naturalTitle = template + '在' + action;
                if (naturalTitle.length >= 6 && naturalTitle.length <= 12 && /^[\u4e00-\u9fa5]+$/.test(naturalTitle)) {
                  results.push({
                    title: naturalTitle,
                    style: 'suspense-netnovel',
                    score: 68,
                    reason: `悬念型：${naturalTitle}`,
                    evidence: [template, action],
                  });
                }
              }
            } else {
              const naturalTitle = template + name;
              if (naturalTitle.length >= 5 && naturalTitle.length <= 12 && /^[\u4e00-\u9fa5]+$/.test(naturalTitle)) {
                results.push({
                  title: naturalTitle,
                  style: 'suspense-netnovel',
                  score: 68,
                  reason: `悬念型：${naturalTitle}`,
                  evidence: [template, name],
                });
              }
            }
          }
        }

        // 组合：悬念词 + 人物 + 动作（更有内容感）
        for (const action of actionWords) {
          let comboTitle = prefix + name + action;
          let comboScore = 70;

          const whoPrefixes = ['谁', '是谁', '到底谁'];
          if (whoPrefixes.some(p => prefix.startsWith(p))) {
            comboTitle = prefix + '在' + action;
            comboScore = 72;
          }

          if (comboTitle.length >= 5 && comboTitle.length <= 12 && /^[\u4e00-\u9fa5]+$/.test(comboTitle)) {
            results.push({
              title: comboTitle,
              style: 'suspense-netnovel',
              score: comboScore,
              reason: `悬念型：${comboTitle}`,
              evidence: [prefix, name, action],
            });
          }
        }
      }
    }
  }

  // 纯悬念词+动作词（无人物时也能生成）
  if (entities.characters.length === 0 && actionWords.length > 0) {
    for (const prefix of suspenseWords) {
      for (const action of actionWords) {
        const title = prefix + action;
        if (title.length >= 4 && title.length <= 8 && /^[\u4e00-\u9fa5]+$/.test(title)) {
          results.push({
            title,
            style: 'suspense-netnovel',
            score: 82,
            reason: `悬念型：${prefix}${action}`,
            evidence: [prefix, action],
          });
        }
      }
    }
  }

  return results.slice(0, 5);
}

// ② 反转型标题（打脸/逆袭，网文爆点）
function generateReversalTitles(entities: ExtractedEntities, genreKey: string): TitleCandidate[] {
  const results: TitleCandidate[] = [];
  const genreStyle = NETNOVEL_GENRE_STYLES[genreKey] || NETNOVEL_GENRE_STYLES.default;

  const reversalWords = [...NETNOVEL_REVERSAL_WORDS, ...genreStyle.reversal];

  if (entities.characters.length === 0) return results;
  const topChar = entities.characters[0].name;

  for (const reversal of reversalWords) {
    const title = topChar + reversal;
    if (title.length >= 4 && title.length <= 8 && /^[\u4e00-\u9fa5]+$/.test(title)) {
      results.push({
        title,
        style: 'reversal-netnovel',
        score: 87,
        reason: `反转型：${topChar}${reversal}`,
        evidence: [topChar, reversal],
      });
    }

    const title2 = reversal + topChar;
    if (title2.length >= 4 && title2.length <= 8 && /^[\u4e00-\u9fa5]+$/.test(title2)) {
      results.push({
        title: title2,
        style: 'reversal-netnovel',
        score: 85,
        reason: `反转型：${reversal}${topChar}`,
        evidence: [reversal, topChar],
      });
    }
  }

  return results.slice(0, 5);
}

// ③ 场景爆点型标题（画面感+冲击力）
function generateSceneShockTitles(entities: ExtractedEntities, genreKey: string): TitleCandidate[] {
  const results: TitleCandidate[] = [];
  const genreStyle = NETNOVEL_GENRE_STYLES[genreKey] || NETNOVEL_GENRE_STYLES.default;

  const sceneWords = [...NETNOVEL_SCENE_WORDS, ...genreStyle.scene];
  const shockWords = [...NETNOVEL_SHOCK_WORDS];

  if (entities.places.length === 0) return results;
  const topPlace = entities.places[0].name;

  for (const scene of sceneWords) {
    const title = scene + topPlace;
    if (title.length >= 4 && title.length <= 10 && /^[\u4e00-\u9fa5]+$/.test(title)) {
      results.push({
        title,
        style: 'scene-shock',
        score: 84,
        reason: `场景型：${scene}${topPlace}`,
        evidence: [scene, topPlace],
      });
    }
  }

  if (entities.characters.length > 0) {
    const topChar = entities.characters[0].name;
    for (const shock of shockWords) {
      const title = topChar + shock;
      if (title.length >= 4 && title.length <= 8 && /^[\u4e00-\u9fa5]+$/.test(title)) {
        results.push({
          title,
          style: 'scene-shock',
          score: 83,
          reason: `爆点型：${topChar}${shock}`,
          evidence: [topChar, shock],
        });
      }
    }
  }

  return results.slice(0, 5);
}

// ④ 对话型标题（代入感强）
function generateDialogTitles(entities: ExtractedEntities): TitleCandidate[] {
  const results: TitleCandidate[] = [];

  for (const quote of entities.impactQuotes.slice(0, 3)) {
    const text = quote.text;
    if (text.length < 3 || text.length > 10) continue;
    if (!/^[\u4e00-\u9fa5]+$/.test(text.replace(/[，,、]/g, ''))) continue;

    for (const prefix of NETNOVEL_DIALOG_PREFIX) {
      const title = prefix + text;
      if (title.length >= 4 && title.length <= 10 && /^[\u4e00-\u9fa5]+$/.test(title)) {
        results.push({
          title,
          style: 'dialog-netnovel',
          score: 82,
          reason: `对话型：${prefix}${text}`,
          evidence: [prefix, text],
        });
      }
    }

    results.push({
      title: text,
      style: 'dialog-netnovel',
      score: 80,
      reason: `金句对话：${text}`,
      evidence: [text],
    });
  }

  return results.slice(0, 5);
}

// ③ 人物+地点+动作（场景化，更有画面感）
function generateCharacterPlaceActionTitles(entities: ExtractedEntities): TitleCandidate[] {
  const results: TitleCandidate[] = [];

  if (entities.places.length === 0 || entities.coreActions.length === 0) {
    return results;
  }

  const topPlace = entities.places[0];
  const topChar = entities.characters.length > 0 ? entities.characters[0] : null;

  for (let i = 0; i < Math.min(3, entities.coreActions.length); i++) {
    const action = entities.coreActions[i];

    if (topChar) {
      const title1 = topChar.name + topPlace.name;
      if (title1.length >= 4 && title1.length <= 8 && /^[\u4e00-\u9fa5]+$/.test(title1)) {
        const bonus = i === 0 ? 5 : i === 1 ? 2 : 0;
        results.push({
          title: title1,
          style: 'character-place',
          score: 82 + bonus,
          reason: `人物+地点：${topChar.name}${topPlace.name}`,
          evidence: [topChar.name, topPlace.name],
        });
      }
    }

    const title2 = topPlace.name + action.word;
    if (title2.length >= 4 && title2.length <= 8 && /^[\u4e00-\u9fa5]+$/.test(title2)) {
      const bonus = i === 0 ? 6 : i === 1 ? 3 : 1;
      results.push({
        title: title2,
        style: 'place-action',
        score: 84 + bonus,
        reason: `地点+动作：${topPlace.name}${action.word}`,
        evidence: [topPlace.name, action.word],
      });
    }
  }

  return results;
}

const TIME_ENV_WORDS = [
  '黎明', '清晨', '早晨', '上午', '中午', '下午', '傍晚', '黄昏', '夜晚', '深夜', '凌晨',
  '天亮', '天黑', '日出', '日落', '月明', '星稀', '风起', '雨落', '雪飘', '雷鸣', '电闪',
  '春', '夏', '秋', '冬', '初春', '盛夏', '深秋', '寒冬',
];

function generateTimeEnvTitles(entities: ExtractedEntities, text: string): TitleCandidate[] {
  const results: TitleCandidate[] = [];

  const foundTimes: string[] = [];
  for (const word of TIME_ENV_WORDS) {
    if (text.includes(word)) {
      foundTimes.push(word);
    }
  }

  if (foundTimes.length === 0) return results;

  const topTime = foundTimes[0];
  const topChar = entities.characters.length > 0 ? entities.characters[0] : null;
  const topAction = entities.coreActions.length > 0 ? entities.coreActions[0] : null;

  const nonHumanActions = new Set([
    '裂开', '破裂', '碎裂', '断裂', '崩塌', '塌陷', '震动', '地动',
    '推挤', '挤压', '升起', '下沉', '退去', '涨起', '涌出', '喷出',
    '燃烧', '熄灭', '爆炸', '炸开', '崩塌', '塌陷', '崩塌', '滑坡',
    '漂流', '流动', '凝固', '融化', '蒸发', '凝结', '冻结', '解冻',
  ]);

  if (topChar && topAction && !nonHumanActions.has(topAction.word)) {
    const title = topTime + topChar.name + topAction.word;
    if (title.length >= 5 && title.length <= 10 && /^[\u4e00-\u9fa5]+$/.test(title)) {
      results.push({
        title,
        style: 'time-event',
        score: 86,
        reason: `时间+事件：${topTime}${topChar.name}${topAction.word}`,
        evidence: [topTime, topChar.name, topAction.word],
      });
    }

    const title2 = topTime + topAction.word;
    if (title2.length >= 4 && title2.length <= 8 && /^[\u4e00-\u9fa5]+$/.test(title2)) {
      results.push({
        title: title2,
        style: 'time-action',
        score: 80,
        reason: `时间+动作：${topTime}${topAction.word}`,
        evidence: [topTime, topAction.word],
      });
    }

    const title4 = topChar.name + topTime + topAction.word;
    if (title4.length >= 5 && title4.length <= 10 && /^[\u4e00-\u9fa5]+$/.test(title4)) {
      results.push({
        title: title4,
        style: 'time-event',
        score: 88,
        reason: `人物+时间+事件：${topChar.name}${topTime}${topAction.word}`,
        evidence: [topChar.name, topTime, topAction.word],
      });
    }
  }

  if (topChar && !topAction) {
    const title3 = topTime + topChar.name;
    if (title3.length >= 4 && title3.length <= 8 && /^[\u4e00-\u9fa5]+$/.test(title3)) {
      results.push({
        title: title3,
        style: 'time-character',
        score: 35,
        reason: `时间+人物：${topTime}${topChar.name}`,
        evidence: [topTime, topChar.name],
      });
    }
  }

  if (entities.places.length > 0 && topAction) {
    const place = entities.places[0];
    const title5 = topTime + place.name + topAction.word;
    if (title5.length >= 5 && title5.length <= 12 && /^[\u4e00-\u9fa5]+$/.test(title5)) {
      results.push({
        title: title5,
        style: 'time-location-event',
        score: 84,
        reason: `时间+地点+事件：${topTime}${place.name}${topAction.word}`,
        evidence: [topTime, place.name, topAction.word],
      });
    }
  }

  return results.slice(0, 3);
}

// ⑧ 人物+冲突对象（非VS模式，更自然）
function generateCharacterConflictTitles(entities: ExtractedEntities): TitleCandidate[] {
  const results: TitleCandidate[] = [];

  if (entities.characters.length < 2 || entities.coreActions.length === 0) return results;

  const c1 = entities.characters[0];
  const c2 = entities.characters[1];

  for (let i = 0; i < Math.min(2, entities.coreActions.length); i++) {
    const action = entities.coreActions[i];

    const title = c1.name + c2.name + action.word;
    if (title.length >= 5 && title.length <= 10 && /^[\u4e00-\u9fa5]+$/.test(title)) {
      const bonus = i === 0 ? 4 : 2;
      results.push({
        title,
        style: 'character-conflict',
        score: 68 + bonus,
        reason: `人物冲突：${c1.name}${c2.name}${action.word}`,
        evidence: [c1.name, c2.name, action.word],
      });
    }
  }

  return results;
}

// ② 人物名直出
function generateCharacterNameTitles(entities: ExtractedEntities): TitleCandidate[] {
  const results: TitleCandidate[] = [];

  if (entities.characters.length === 0) return results;

  const topChar = entities.characters[0];
  if (topChar.name.length >= 2 && topChar.name.length <= 4) {
    results.push({
      title: topChar.name,
      style: 'noun-character',
      score: 72,
      reason: `人物直出：${topChar.name}`,
      evidence: [topChar.name],
    });
  }

  return results;
}

// ③ 人物+状态
function generateCharacterStateTitles(entities: ExtractedEntities): TitleCandidate[] {
  const results: TitleCandidate[] = [];

  if (entities.characters.length === 0 || entities.coreStates.length === 0) return results;

  const topChar = entities.characters[0];

  for (let i = 0; i < Math.min(3, entities.coreStates.length); i++) {
    const state = entities.coreStates[i];
    const title = topChar.name + state.word;
    if (title.length >= 4 && title.length <= 8 && /^[\u4e00-\u9fa5]+$/.test(title)) {
      const bonus = i === 0 ? 4 : i === 1 ? 2 : 0;
      results.push({
        title,
        style: 'state-character',
        score: 75 + bonus,
        reason: `人物+状态：${topChar.name}${state.word}`,
        evidence: [topChar.name, state.word],
      });
    }
  }

  return results;
}

// ④ 金句台词
function generateQuoteTitles(entities: ExtractedEntities): TitleCandidate[] {
  const results: TitleCandidate[] = [];

  for (let i = 0; i < Math.min(3, entities.impactQuotes.length); i++) {
    const quote = entities.impactQuotes[i];
    if (quote.text.length < 3 || quote.text.length > 10) continue;
    if (!/^[\u4e00-\u9fa5]+$/.test(quote.text.replace(/[，,、]/g, ''))) continue;

    const bonus = i === 0 ? 5 : i === 1 ? 3 : 1;
    results.push({
      title: quote.text,
      style: 'quote',
      score: 74 + bonus,
      reason: `金句台词：${quote.text}`,
      evidence: [quote.text],
    });
  }

  return results;
}

// ⑤ 悬念钩子
function generateSuspenseHookTitles(entities: ExtractedEntities): TitleCandidate[] {
  const results: TitleCandidate[] = [];

  for (let i = 0; i < Math.min(3, entities.endingHooks.length); i++) {
    const hook = entities.endingHooks[i];
    if (hook.text.length < 4 || hook.text.length > 10) continue;
    const bonus = i === 0 ? 4 : 2;
    results.push({
      title: hook.text,
      style: 'suspense',
      score: 73 + bonus,
      reason: `悬念钩子：${hook.text}`,
      evidence: [hook.text],
    });
  }

  return results;
}

// ⑥ 宝物直出
function generateTreasureTitles(entities: ExtractedEntities): TitleCandidate[] {
  const results: TitleCandidate[] = [];

  for (let i = 0; i < Math.min(2, entities.treasures.length); i++) {
    const tr = entities.treasures[i];
    if (tr.name.length < 2 || tr.name.length > 6) continue;
    const bonus = i === 0 ? 3 : 1;
    results.push({
      title: tr.name,
      style: 'noun-treasure',
      score: 70 + bonus,
      reason: `宝物直出：${tr.name}`,
      evidence: [tr.name],
    });
  }

  return results;
}

// ⑦ 双人物（冲突/关系）- 降权处理，避免大量XXvsXX模式
function generateTwoCharacterTitles(entities: ExtractedEntities): TitleCandidate[] {
  const results: TitleCandidate[] = [];

  if (entities.characters.length < 2) return results;

  const c1 = entities.characters[0];
  const c2 = entities.characters[1];

  // 人物VS人物 - 降低基础评分至55分，使其成为真正的兜底选项
  if (c1.name.length + c2.name.length + 2 <= 8) {
    results.push({
      title: `${c1.name}vs${c2.name}`,
      style: 'two-character',
      score: 55,
      reason: `双人物对决：${c1.name} vs ${c2.name}`,
      evidence: [c1.name, c2.name],
    });
  }

  return results;
}

// ============================================================
// 内容相关性校验
// ============================================================

const SUSPENSE_PREFIXES = ['谁', '什么', '为何', '怎么', '哪里', '莫非', '难道', '竟然', '居然', '原来', '真相', '秘密', '神秘', '诡异', '离奇', '到底', '究竟', '竟然是', '居然是', '原来是'];

export function verifyContentRelevance(title: string, content: string): {
  passed: boolean;
  coverage: number;
  evidenceWords: string[];
} {
  const cleanTitle = title.replace(/\s+/gu, '');
  if (cleanTitle.length < 2) return { passed: false, coverage: 0, evidenceWords: [] };

  const evidenceWords: string[] = [];
  const matchedPositions = new Set<number>();

  // 检查是否为悬念型标题（以悬念词开头）
  let isSuspenseTitle = false;
  let suspensePrefixLen = 0;
  for (const prefix of SUSPENSE_PREFIXES) {
    if (cleanTitle.startsWith(prefix)) {
      isSuspenseTitle = true;
      suspensePrefixLen = prefix.length;
      break;
    }
  }

  // 1. 检查高价值动作词（带否定词过滤）
  for (const action of HIGH_VALUE_ACTIONS) {
    if (action.length < 2) continue;
    if (!cleanTitle.includes(action)) continue;

    const idxInTitle = cleanTitle.indexOf(action);
    const actionPositions = findAllPositions(content, action);
    if (actionPositions.length === 0) continue;

    // 至少有一次出现不是在否定语境里才算有效
    let valid = false;
    for (const pos of actionPositions) {
      // 检查前面 12 个字范围内的否定语境
      const prefix = content.slice(Math.max(0, pos - 12), pos);
      // 直接否定前缀
      const directNeg = ['没', '不', '无', '未', '非', '别', '莫', '没有', '不会', '不能', '不是', '无法', '未曾', '尚未', '毫无', '全无', '绝无', '并无', '未有', '从不', '绝不', '决不', '从未', '也没', '都没', '还没', '就没'];
      let isNegated = false;
      for (const neg of directNeg) {
        if (prefix.endsWith(neg)) { isNegated = true; break; }
      }
      // "没有X情节" / "没有X内容" 这种结构
      if (!isNegated) {
        if (prefix.includes('没有') && prefix.indexOf('没有') >= prefix.length - 8) {
          isNegated = true;
        }
      }
      // "也没有X" / "都没有X" / "还没有X"
      if (!isNegated) {
        const patterns = ['也没有', '都没有', '还没有', '从没有', '绝没有', '并没有'];
        for (const p of patterns) {
          if (prefix.endsWith(p)) { isNegated = true; break; }
        }
      }
      // "没X" 在更前面的位置，中间隔了"有"
      // 例如 "没有突破" = "没" + "有" + "突破"
      if (!isNegated) {
        if (/[没无不未非]有$/.test(prefix)) {
          isNegated = true;
        }
      }
      if (!isNegated) { valid = true; break; }
    }

    if (valid) {
      evidenceWords.push(action);
      for (let i = idxInTitle; i < idxInTitle + action.length; i++) {
        matchedPositions.add(i);
      }
    }
  }

  // 2. 检查高价值状态词
  for (const state of HIGH_VALUE_STATES) {
    if (state.length < 2) continue;
    if (cleanTitle.includes(state) && content.includes(state)) {
      evidenceWords.push(state);
      const idx = cleanTitle.indexOf(state);
      for (let i = idx; i < idx + state.length; i++) {
        matchedPositions.add(i);
      }
    }
  }

  // 3. 检查完整的3字以上片段匹配
  for (let len = cleanTitle.length; len >= 3; len--) {
    for (let i = 0; i <= cleanTitle.length - len; i++) {
      const fragment = cleanTitle.slice(i, i + len);
      if (GENERIC_WORDS.has(fragment)) continue;
      if (content.includes(fragment)) {
        if (!evidenceWords.some(w => w.includes(fragment) || fragment.includes(w))) {
          evidenceWords.push(fragment);
        }
        for (let j = i; j < i + len; j++) {
          matchedPositions.add(j);
        }
      }
    }
  }

  // 4. 补充2-gram检查（用于覆盖率计算）
  if (matchedPositions.size < cleanTitle.length * 0.5) {
    for (let i = 0; i <= cleanTitle.length - 2; i++) {
      const gram = cleanTitle.slice(i, i + 2);
      if (GENERIC_WORDS.has(gram)) continue;
      if (content.includes(gram)) {
        if (!evidenceWords.includes(gram)) evidenceWords.push(gram);
        for (let j = i; j < i + 2; j++) {
          matchedPositions.add(j);
        }
      }
    }
  }

  const coverage = matchedPositions.size / Math.max(1, cleanTitle.length);

  // 强证据判定（满足任一即可）：
  // - 有1个3字以上的完整片段匹配
  // - 有1个高价值动作词（非否定语境）
  // - 有1个高价值状态词
  // - 有2个2字词都匹配，且覆盖率>=50%
  // - 悬念型标题：只要有1个2字词匹配且覆盖率>=50%即可（悬念词本身不需要在内容中出现）
  const hasStrongEvidence =
    evidenceWords.some(w => w.length >= 3) ||
    evidenceWords.some(w => HIGH_VALUE_ACTIONS.includes(w)) ||
    evidenceWords.some(w => HIGH_VALUE_STATES.includes(w)) ||
    (evidenceWords.filter(w => w.length === 2).length >= 2 && coverage >= 0.5) ||
    (isSuspenseTitle && evidenceWords.filter(w => w.length === 2).length >= 1 && coverage >= 0.5);

  const passed = coverage >= 0.5 && hasStrongEvidence;

  return { passed, coverage, evidenceWords: evidenceWords.slice(0, 5) };
}

// ============================================================
// 多样性评分
// ============================================================

function computeDiversityScore(
  title: string,
  recentTitles: string[],
  allTitles: string[],
): { score: number; details: string[] } {
  let penalty = 0;
  const details: string[] = [];
  const normalized = title.replace(/\s+/gu, '');

  // 检测XXvsXX模式
  const isVsPattern = /^[\u4e00-\u9fa5]{2,4}vs[\u4e00-\u9fa5]{2,4}$/.test(normalized);

  // 近期重复（最近10章）
  const recentClean = recentTitles.map(t => t.replace(/\s+/gu, '')).filter(Boolean).slice(-10);
  for (const recent of recentClean) {
    if (recent === normalized) {
      penalty += 50;
      details.push('近期完全重复 -50');
      continue;
    }
    if (normalized.slice(0, 2) === recent.slice(0, 2)) {
      penalty += 15;
      details.push('前缀相同 -15');
    }
    if (normalized.slice(-2) === recent.slice(-2)) {
      penalty += 10;
      details.push('后缀相同 -10');
    }
    if (shareHighValueAction(normalized, recent)) {
      penalty += 20;
      details.push('动作词重复 -20');
    }

    // 检测相同人物+相同动作模式重复
    const charOverlap = findCommonCharacters(normalized, recent);
    if (charOverlap.length >= 2 && shareHighValueAction(normalized, recent)) {
      penalty += 25;
      details.push('人物+动作模式重复 -25');
    }
    // XXvsXX模式重复检测
    const recentIsVsPattern = /^[\u4e00-\u9fa5]{2,4}vs[\u4e00-\u9fa5]{2,4}$/.test(recent);
    if (isVsPattern && recentIsVsPattern) {
      penalty += 25;
      details.push('XXvsXX模式重复 -25');
    }
  }

  // 全局重复（全书）
  const allClean = allTitles.map(t => t.replace(/\s+/gu, '')).filter(Boolean);
  let globalDupCount = 0;
  let globalPatternDup = 0;
  let suspensePatternCount = 0;

  const suspensePrefixes = ['谁', '什么', '为何', '怎么', '哪里', '莫非', '难道', '竟然', '居然', '原来', '真相', '秘密', '神秘', '诡异', '离奇', '到底', '究竟'];
  let currentSuspensePrefix = '';
  for (const prefix of suspensePrefixes) {
    if (normalized.startsWith(prefix)) {
      currentSuspensePrefix = prefix;
      break;
    }
  }

  for (const prev of allClean) {
    if (prev === normalized) {
      globalDupCount++;
      continue;
    }
    if (normalized.length >= 3 && prev.length >= 3) {
      const actionEnd = normalized.slice(-2);
      if (HIGH_VALUE_ACTIONS.includes(actionEnd) && prev.endsWith(actionEnd)) {
        globalPatternDup++;
      }
    }
    if (currentSuspensePrefix && prev.startsWith(currentSuspensePrefix)) {
      suspensePatternCount++;
    }
  }

  if (globalDupCount > 0) {
    penalty += globalDupCount * 30;
    details.push(`全书重复 ${globalDupCount}次 -${globalDupCount * 30}`);
  }
  if (globalPatternDup > 2) {
    penalty += Math.min(25, (globalPatternDup - 2) * 5);
    details.push(`模式重复 ${globalPatternDup}次 -${Math.min(25, (globalPatternDup - 2) * 5)}`);
  }
  if (suspensePatternCount > 1) {
    penalty += Math.min(20, suspensePatternCount * 8);
    details.push(`悬念词重复 ${suspensePatternCount}次 -${Math.min(20, suspensePatternCount * 8)}`);
  }

  return { score: -penalty, details };
}

function shareHighValueAction(s1: string, s2: string): boolean {
  for (const action of HIGH_VALUE_ACTIONS) {
    if (action.length >= 2 && s1.includes(action) && s2.includes(action)) {
      return true;
    }
  }
  return false;
}

function findCommonCharacters(s1: string, s2: string): string[] {
  const chars: string[] = [];
  const twoCharPattern = /[\u4e00-\u9fa5]{2}/g;
  const threeCharPattern = /[\u4e00-\u9fa5]{3}/g;

  const s1Chars = new Set<string>();
  let match;
  while ((match = threeCharPattern.exec(s1)) !== null) {
    s1Chars.add(match[0]);
  }
  threeCharPattern.lastIndex = 0;
  while ((match = twoCharPattern.exec(s1)) !== null) {
    s1Chars.add(match[0]);
  }

  while ((match = threeCharPattern.exec(s2)) !== null) {
    if (s1Chars.has(match[0])) {
      chars.push(match[0]);
    }
  }
  threeCharPattern.lastIndex = 0;
  while ((match = twoCharPattern.exec(s2)) !== null) {
    if (s1Chars.has(match[0])) {
      chars.push(match[0]);
    }
  }

  return [...new Set(chars)];
}

// ============================================================
// 主入口
// ============================================================

export function generateContentDrivenTitle(options: TitleGenOptions): {
  title: string;
  score: number;
  style: string;
  reason: string;
  evidence: string[];
  allCandidates: TitleCandidate[];
} {
  const { content, outline, chapterNumber, genre, recentTitles = [], allTitles = [], knownCharacters = [], knownPlaces = [] } = options;

  const entities = extractEntities(content, outline, knownCharacters, knownPlaces);
  const rawCandidates = generateCandidates(entities, genre, { content, randomSeed: chapterNumber ?? Date.now() });

  // 内容相关性硬校验
  const relevantCandidates = rawCandidates.filter(c => {
    const check = verifyContentRelevance(c.title, content);
    return check.passed;
  });

  // 评分
  const scored = relevantCandidates.map(c => {
    const contentCheck = verifyContentRelevance(c.title, content);
    const diversity = computeDiversityScore(c.title, recentTitles, allTitles);

    let qualityBonus = 0;

    // 长度最佳
    if (c.title.length >= 5 && c.title.length <= 7) qualityBonus += 6;
    else if (c.title.length === 4 || c.title.length === 8) qualityBonus += 3;
    else if (c.title.length === 3) qualityBonus += 1;
    else if (c.title.length > 10) qualityBonus -= 5;

    // 内容相关性加分
    if (contentCheck.coverage >= 0.8) qualityBonus += 8;
    else if (contentCheck.coverage >= 0.6) qualityBonus += 5;
    else if (contentCheck.coverage >= 0.5) qualityBonus += 2;

    // 悬念感加分（仅对有实际内容的悬念标题）
    const hasActionOrEvent = HIGH_VALUE_ACTIONS.some(v => c.title.includes(v)) || 
                            contentCheck.evidenceWords.some(w => w.length >= 3);
    for (const marker of SUSPENSE_MARKERS) {
      if (c.title.includes(marker) && hasActionOrEvent) { qualityBonus += 3; break; }
    }

    // 动作感加分
    let hasAction = false;
    for (const verb of HIGH_VALUE_ACTIONS) {
      if (c.title.includes(verb)) { 
        qualityBonus += 5; 
        hasAction = true;
        break; 
      }
    }

    // 状态词加分（悬念感）
    for (const state of HIGH_VALUE_STATES) {
      if (c.title.includes(state)) { qualityBonus += 3; break; }
    }

    // 信息量惩罚：简单悬念标题（只有悬念词+人物名，没有动作）
    const simpleSuspensePatterns = /^(什么|怎么|为何|为什么|谁|是谁|到底谁)[\u4e00-\u9fa5]{2,4}$/;
    if (simpleSuspensePatterns.test(c.title) && !hasAction) {
      qualityBonus -= 15;
    }

    // 信息量惩罚：纯时间+人物标题（没有动作或事件）
    const timeCharacterPattern = /^(天亮|黎明|中午|下午|傍晚|天黑|深夜|凌晨|清晨|早晨)[\u4e00-\u9fa5]{2,4}$/;
    if (timeCharacterPattern.test(c.title) && !hasAction) {
      qualityBonus -= 12;
    }

    const finalScore = c.score + diversity.score + qualityBonus;

    return {
      ...c,
      score: finalScore,
      evidence: contentCheck.evidenceWords,
      _diversityDetails: diversity.details,
      _contentCoverage: contentCheck.coverage,
    };
  });

  scored.sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    const fallback = buildFallbackTitle(content, chapterNumber);
    return {
      title: fallback,
      score: 40,
      style: 'fallback',
      reason: '无合格候选，使用兜底标题',
      evidence: [],
      allCandidates: [],
    };
  }

  const best = scored[0];
  return {
    title: best.title,
    score: best.score,
    style: best.style,
    reason: best.reason,
    evidence: best.evidence,
    allCandidates: scored,
  };
}

function buildFallbackTitle(content: string, chapterNumber: number): string {
  const paragraphs = content.split(/\n+/u).filter(p => p.trim().length > 0);
  for (const paragraph of paragraphs.slice(0, 10)) {
    const clean = paragraph
      .trim()
      .replace(/^第\s*[0-9一二三四五六七八九十百千万]+\s*章\s*[:：、，,.\-—–\s]*/u, '')
      .replace(/\s+/gu, '');

    const stopWords = ['已经', '便', '就', '才', '曾', '正', '刚', '将', '欲', '还', '尚', '也', '都', '又', '再', '在', '是', '有', '没', '不', '可以', '可能', '然后', '但是'];
    let candidate = clean;
    for (const word of stopWords) {
      const idx = clean.indexOf(word);
      if (idx > 1 && idx < clean.length - 1) {
        const trimmed = clean.slice(0, idx);
        if (trimmed.length >= 4) { candidate = trimmed; break; }
      }
    }

    if (candidate.length >= 4 && candidate.length <= 8
      && /^[\u4e00-\u9fa5]+$/.test(candidate.replace(/[，,。.!！?？、]/g, ''))
      && !GENERIC_WORDS.has(candidate)) {
      return candidate;
    }
  }
  return `第${chapterNumber}章`;
}
