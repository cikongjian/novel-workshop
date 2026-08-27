import type { NovelManager } from './novel-manager.js';

const NON_HUMAN_SPEAKER_WORDS = new Set([
  '旁白',
  '系统',
  '系统提示',
  '提示音',
  '广播',
  '广播声',
  '机械音',
  '电子音',
  '风声',
  '雨声',
  '雷声',
  '水声',
  '脚步声',
  '钟声',
  '门响',
  '枪声',
  '刀鸣',
  '剑鸣',
  '铃声',
  '笑声',
  '哭声',
  '叹息',
  '低吼',
  '咆哮',
  '回声',
  '掌声',
  '轰鸣',
  '爆炸声',
]);

const ROLE_CONTEXT_WORDS = [
  '说道',
  '问道',
  '答道',
  '回答',
  '笑道',
  '喊道',
  '喝道',
  '开口',
  '看向',
  '望向',
  '盯着',
  '走向',
  '冲向',
  '拉住',
  '推开',
  '出手',
  '拔剑',
  '拦住',
];

const SIMPLE_SPEECH_WORDS = ['说', '问'];

const TITLE_SUFFIXES = [
  '师兄',
  '师姐',
  '师弟',
  '师妹',
  '长老',
  '掌门',
  '宗主',
  '城主',
  '将军',
  '殿下',
  '公子',
  '小姐',
  '姑娘',
  '先生',
  '夫人',
  '大人',
  '王爷',
  '皇子',
  '公主',
  '老板',
  '医生',
  '警官',
  '队长',
  '主任',
  '经理',
  '导师',
];

const NAME_PREFIX_BLACKLIST = [
  '这个',
  '那个',
  '这位',
  '那位',
  '一个',
  '两个',
  '一些',
  '一种',
  '整个',
  '所有',
  '任何',
  '每个',
  '自己',
  '他的',
  '她的',
  '它的',
  '他',
  '她',
  '它',
  '我',
  '你',
  '他们',
  '她们',
  '我们',
  '你们',
  '众人',
  '所有人',
];

const CANDIDATE_BLACKLIST = new Set([
  ...NON_HUMAN_SPEAKER_WORDS,
  '小说信息',
  '当前章节',
  '章节方向',
  '章节大纲',
  '角色档案',
  '本章正文',
  '角色定位',
  '外貌特征',
  '性格特点',
  '背景简述',
  '社会身份',
  '当前情绪状态',
  '心理画像',
  '本章行为要点',
  '公私面具',
  '对话风格提醒',
  '关键互动',
  '象征元素',
  '需要注意',
  '角色关系动态',
  '角色弧光',
  '本章出场角色',
  '出场角色',
  '登场角色',
  '相关角色',
  '本章角色',
  '身份',
  '形象',
  '首次登场',
  '首次出现',
  '登场',
  '主角',
  '反派',
  '配角',
  '路人',
  '众人',
  '男人',
  '女人',
  '少年',
  '少女',
  '青年',
  '老人',
  '老者',
  '孩子',
  '师父',
  '母亲',
  '父亲',
  '妈妈',
  '爸爸',
  '哥哥',
  '姐姐',
  '妹妹',
  '弟弟',
  '对方',
  '此人',
  '那人',
  '这人',
  '旁人',
  '下人',
  '手下',
  '起身',
  '说完',
  '三息',
  '两息',
  '习惯在',
  '终于',
  '突然',
  '忽然',
  '随即',
  '然后',
  '只是',
  '已经',
  '还是',
  '没有',
  '看着',
  '声音',
  '沉默',
]);

const SOUND_EFFECT_RE =
  /(风声|雨声|雷声|水声|脚步声|钟声|门响|枪声|刀鸣|剑鸣|铃声|笑声|哭声|叹息|低吼|咆哮|回声|掌声|轰鸣|爆炸声|提示音|广播声|机械音|电子音|警报声)/;

const SINGLE_SURNAME_TITLE_RE = new RegExp(
  `^[\\p{Script=Han}](?:${TITLE_SUFFIXES.join('|')})$`,
  'u',
);

const COMMON_SURNAME_CHARS =
  '赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜戚谢邹喻柏水窦章云苏潘葛奚范彭郎鲁韦昌马苗凤花方俞任袁柳鲍史唐费廉岑薛雷贺倪汤滕殷罗毕郝邬安常乐于时傅皮卞齐康伍余元卜顾孟平黄和穆萧尹姚邵湛汪祁毛禹狄米贝明臧计伏成戴谈宋庞熊纪舒屈项祝董梁杜阮蓝闵席季麻强贾路娄危江童颜郭梅盛林刁钟徐邱骆高夏蔡田胡凌霍虞万支柯管卢莫经房裘缪干解应宗丁宣邓郁单杭洪包诸左石崔吉龚程嵇邢滑裴陆荣翁荀羊於惠甄曲家封芮羿储靳汲邴糜松井段富巫乌焦巴弓牧隗山谷车侯宓蓬全郗班仰秋仲伊宫宁仇栾暴甘钭厉戎祖武符刘景詹龙叶幸司韶黎蓟薄印宿白怀蒲邰从鄂索咸籍赖卓蔺屠蒙池乔阴郁胥能苍双闻莘党翟谭贡劳逄姬申扶堵冉宰郦雍郤璩桑桂濮牛寿通边扈燕冀浦庄晏柴瞿阎连习容向古易慎戈廖庾终暨居衡步都耿满弘匡文寇广禄阙东欧利蔚越夔隆师巩厍聂晁勾敖融冷訾辛阚那简饶空曾毋沙乜养鞠须丰巢关蒯相查後荆红游竺权逯盖益桓公';

const COMPOUND_SURNAMES = [
  '欧阳',
  '太史',
  '端木',
  '上官',
  '司马',
  '东方',
  '独孤',
  '南宫',
  '万俟',
  '闻人',
  '夏侯',
  '诸葛',
  '尉迟',
  '公羊',
  '赫连',
  '澹台',
  '皇甫',
  '宗政',
  '濮阳',
  '公冶',
  '太叔',
  '申屠',
  '公孙',
  '慕容',
  '仲孙',
  '钟离',
  '长孙',
  '宇文',
  '司徒',
  '鲜于',
  '司空',
  '闾丘',
  '子车',
  '亓官',
  '司寇',
  '巫马',
  '公西',
  '颛孙',
  '壤驷',
  '公良',
  '漆雕',
  '乐正',
  '宰父',
  '谷梁',
  '拓跋',
  '夹谷',
  '轩辕',
  '令狐',
  '段干',
  '百里',
  '呼延',
  '东郭',
  '南门',
  '羊舌',
  '微生',
  '公户',
  '公玉',
  '公仪',
  '梁丘',
  '公仲',
  '公上',
  '公门',
  '公山',
  '公坚',
  '左丘',
  '公伯',
  '西门',
  '公祖',
  '第五',
  '公乘',
  '贯丘',
  '公皙',
  '南荣',
  '东里',
  '东宫',
  '仲长',
  '子书',
  '子桑',
  '即墨',
  '达奚',
  '褚师',
];

const COMMON_NAME_SUFFIX_VERBS = [
  '说道',
  '问道',
  '答道',
  '笑道',
  '喊道',
  '喝道',
  '开口',
  '开口道',
  '叫到',
  '叫道',
  '喊道',
  '骂道',
  '笑道',
  '哭道',
  '叹道',
  '低声',
  '低声道',
  '轻声',
  '轻声道',
  '沉声',
  '沉声道',
  '冷冷',
  '冷冷道',
  '淡淡',
  '淡淡道',
  '缓缓',
  '缓缓道',
  '慢慢',
  '慢慢道',
  '急忙',
  '急忙道',
  '连忙',
  '连忙道',
  '赶紧',
  '赶紧道',
  '心里',
  '心想',
  '暗道',
  '暗想',
  '想到',
  '觉得',
  '感觉',
  '感到',
  '发现',
  '看到',
  '听见',
  '听到',
  '知道',
  '明白',
  '清楚',
  '了解',
  '同意',
  '拒绝',
  '答应',
  '摇头',
  '点头',
  '转身',
  '回头',
  '上前',
  '后退',
  '离开',
  '进来',
  '出去',
  '坐下',
  '站起',
  '起身',
  '倒下',
  '摔倒',
  '死去',
  '死亡',
  '受伤',
  '昏迷',
  '醒来',
  '睡着',
  '练功',
  '修炼',
  '突破',
  '晋级',
  '失败',
  '成功',
  '胜利',
  '战败',
  '逃走',
  '逃跑',
  '追击',
  '追杀',
  '拦住',
  '阻挡',
  '阻止',
  '帮助',
  '救援',
  '杀死',
  '杀掉',
  '打伤',
  '打晕',
  '抓住',
  '捉住',
  '逮捕',
  '关押',
  '释放',
  '放出',
  '带走',
  '留下',
  '送走',
  '迎接',
  '欢迎',
  '告别',
  '告辞',
  '拜访',
  '探访',
  '调查',
  '查询',
  '询问',
  '咨询',
  '商量',
  '讨论',
  '谈判',
  '交易',
  '交换',
  '买卖',
  '购买',
  '出售',
  '收取',
  '支付',
  '付出',
  '得到',
  '获得',
  '失去',
  '丢失',
  '找到',
  '发现',
  '出现',
  '消失',
  '隐藏',
  '躲避',
  '埋伏',
  '偷袭',
  '暗杀',
  '刺杀',
  '攻击',
  '防御',
  '抵挡',
  '抵抗',
  '反抗',
  '投降',
  '屈服',
  '臣服',
  '效忠',
  '背叛',
  '欺骗',
  '撒谎',
  '坦白',
  '承认',
  '否认',
  '允许',
  '禁止',
  '命令',
  '请求',
  '恳求',
  '哀求',
  '乞求',
  '威胁',
  '恐吓',
  '警告',
  '提醒',
  '建议',
  '提议',
  '决定',
  '选择',
  '犹豫',
  '纠结',
  '痛苦',
  '悲伤',
  '愤怒',
  '生气',
  '高兴',
  '开心',
  '激动',
  '紧张',
  '害怕',
  '恐惧',
  '惊讶',
  '震惊',
  '疑惑',
  '困惑',
  '不解',
  '没有',
  '改了',
  '改变',
  '变动',
  '动摇',
  '坚定',
  '愣住',
  '怔住',
  '呆住',
  '了然',
  '顿悟',
  '恍然',
  '凛然',
  '肃然',
  '默然',
  '黯然',
  '坦然',
  '泰然',
  '漠然',
  '浩然',
  '巍然',
  '毅然',
  '决然',
  '断然',
  '果然',
  '居然',
  '竟然',
  '回答',
  '说道',
  '问道',
  '答道',
];

const SINGLE_CHAR_SUFFIX_VERBS = [
  '说',
  '道',
  '问',
  '答',
  '叫',
  '喊',
  '呼',
  '喝',
  '骂',
  '笑',
  '哭',
  '叹',
  '想',
  '思',
  '念',
  '记',
  '忆',
  '忘',
  '走',
  '跑',
  '跳',
  '飞',
  '落',
  '起',
  '坐',
  '站',
  '躺',
  '卧',
  '趴',
  '蹲',
  '跪',
  '爬',
  '滚',
  '摔',
  '倒',
  '死',
  '活',
  '生',
  '杀',
  '救',
  '帮',
  '害',
  '打',
  '踢',
  '咬',
  '抓',
  '挠',
  '推',
  '拉',
  '拽',
  '扯',
  '拖',
  '压',
  '顶',
  '撞',
  '碰',
  '摸',
  '拍',
  '敲',
  '击',
  '刺',
  '砍',
  '劈',
  '切',
  '割',
  '划',
  '刮',
  '擦',
  '抹',
  '涂',
  '画',
  '写',
  '读',
  '看',
  '听',
  '闻',
  '尝',
  '吃',
  '喝',
  '吞',
  '吐',
  '吸',
  '呼',
  '吹',
  '喘',
  '咳',
  '唱',
  '舞',
  '弹',
  '奏',
  '演',
  '出',
  '进',
  '退',
  '上',
  '下',
  '来',
  '去',
  '回',
  '到',
  '往',
  '向',
  '朝',
  '离',
  '从',
  '自',
  '由',
  '在',
  '于',
  '是',
  '为',
  '有',
  '无',
  '没',
  '不',
  '非',
  '未',
  '莫',
  '勿',
  '别',
  '休',
  '且',
  '并',
  '而',
  '但',
  '然',
  '则',
  '故',
  '因',
  '就',
  '才',
  '都',
  '也',
  '还',
  '又',
  '再',
  '更',
  '最',
  '很',
  '太',
  '挺',
  '好',
  '真',
  '假',
  '对',
  '错',
  '行',
  '能',
  '会',
  '要',
  '想',
  '敢',
  '肯',
  '得',
  '改',
  '变',
  '动',
  '停',
  '知',
  '明',
  '清',
  '懂',
  '会',
  '可',
  '以',
  '该',
  '应',
  '当',
  '须',
  '必',
  '需',
  '要',
  '令',
  '使',
  '让',
  '把',
  '被',
  '将',
  '给',
  '替',
  '比',
  '跟',
  '和',
  '与',
  '及',
  '或',
];

function isLikelyChinesePersonalName(name: string): boolean {
  if (!/^[\p{Script=Han}]{2,4}$/u.test(name)) return false;
  if (/^[小阿][\p{Script=Han}]{1,3}$/u.test(name)) return true;
  if (COMPOUND_SURNAMES.some(surname => name.startsWith(surname) && name.length > surname.length)) {
    return true;
  }
  return COMMON_SURNAME_CHARS.includes(name[0]);
}

function tryStripVerbSuffix(candidate: string): string | null {
  for (const suffix of COMMON_NAME_SUFFIX_VERBS) {
    if (candidate.endsWith(suffix) && candidate.length > suffix.length) {
      const stripped = candidate.slice(0, -suffix.length);
      if (isLikelyChinesePersonalName(stripped)) {
        return stripped;
      }
    }
  }
  // A one-character suffix is only unambiguous after a four-character name.
  // Shorter candidates can themselves be valid names such as "林知行".
  if (candidate.length === 5) {
    const lastChar = candidate.at(-1) ?? '';
    if (SINGLE_CHAR_SUFFIX_VERBS.includes(lastChar)) {
      const stripped = candidate.slice(0, -1);
      if (isLikelyChinesePersonalName(stripped)) {
        return stripped;
      }
    }
  }
  return null;
}

function isInvalidSpeakerToken(name: string): boolean {
  const normalized = normalizeCandidateName(name);
  if (!normalized) return true;
  if (/^[\d\p{P}\p{S}]+$/u.test(normalized)) return true;
  if (normalized.length < 2 || normalized.length > 12) return true;
  if (!/[\p{Script=Han}A-Za-z]/u.test(normalized)) return true;
  if (/[#()[\]（）【】]/u.test(normalized)) return true;
  if (/[的得地]/u.test(normalized)) return true;
  if (/^[一二三四五六七八九十两几半\d]/u.test(normalized)) return true;
  if (NON_HUMAN_SPEAKER_WORDS.has(normalized)) return true;
  if (CANDIDATE_BLACKLIST.has(normalized)) return true;
  if (NAME_PREFIX_BLACKLIST.some(prefix => normalized.startsWith(prefix))) return true;
  if (SINGLE_SURNAME_TITLE_RE.test(normalized)) return true;
  if (SOUND_EFFECT_RE.test(normalized)) return true;
  if (/^[啊呀哇呜嗯哈嘿呵嘶咚轰呼啪哐嗡]+$/u.test(normalized)) return true;
  if (normalized.endsWith('声') && normalized.length <= 4) return true;
  if (/[章节正文大纲剧情人物角色状态定位外貌性格背景互动关系弧光身份形象登场]/.test(normalized) && normalized.length > 4) {
    return true;
  }
  if (/[完在压身息没不正才又已还再却将]/u.test(normalized.at(-1) ?? '')) {
    return true;
  }
  return false;
}

function normalizeCandidateName(name: string): string {
  let normalized = name
    .trim()
    .replace(/^[#@：:【\[\(（\s]+/u, '')
    .replace(/[】\]\)）。，、；;：:！!？?"“”'‘’\s]+$/u, '')
    .replace(/\s+/g, '');
  if (normalized.includes('#')) {
    normalized = normalized.split('#').filter(Boolean).pop() ?? normalized;
  }
  normalized = normalized
    .replace(/^(?:身份|姓名|角色|人物|称呼)[：:]/u, '')
    .replace(/[（(【\[].*$/u, '')
    .replace(/(?:首次登场|首次出现|登场|出现).*$/u, '')
    .replace(/[】\]\)）。，、；;：:！!？?"“”'‘’\s]+$/u, '')
    .trim();
  return normalized;
}

function addCandidate(
  target: Set<string>,
  rawName: string,
  options?: { requireLikelyName?: boolean },
): void {
  let name = normalizeCandidateName(rawName);
  const stripped = tryStripVerbSuffix(name);
  if (stripped) {
    name = stripped;
  }

  if (isInvalidSpeakerToken(name)) return;

  if (options?.requireLikelyName && !isLikelyChinesePersonalName(name)) return;
  target.add(name);
}

function extractExplicitSpeakerNames(content: string): Set<string> {
  const speakerNames = new Set<string>();
  const markerRe = /[\(\uFF08]\s*#\s*([^\n]+?)\s*[\)\uFF09]/g;
  let match: RegExpExecArray | null;
  while ((match = markerRe.exec(content)) !== null) {
    addCandidate(speakerNames, match[1]);
  }
  return speakerNames;
}

function extractAgentHeadingNames(text: string): Set<string> {
  const names = new Set<string>();
  const headingRe = /^#{2,4}\s*(?:[\[【]\s*)?([^#\n\[\]【】]{2,12})(?:\s*[\]】])?\s*$/gm;
  let match: RegExpExecArray | null;
  while ((match = headingRe.exec(text)) !== null) {
    addCandidate(names, match[1], { requireLikelyName: true });
  }
  return names;
}

function extractListedCharacterNames(text: string): Set<string> {
  const names = new Set<string>();
  const listRe = /(出场角色|登场角色|相关角色|本章角色|本章出场角色)[^\n：:]{0,20}[：:]\s*([^\n]+)/g;
  let match: RegExpExecArray | null;
  while ((match = listRe.exec(text)) !== null) {
    for (const raw of match[2].split(/[、，,\/\\\s和与及]+/)) {
      addCandidate(names, raw);
    }
  }
  return names;
}

function extractDialogueContextNames(content: string): Set<string> {
  const names = new Set<string>();
  const roleAction = ROLE_CONTEXT_WORDS.join('|');
  const simpleSpeechAction = SIMPLE_SPEECH_WORDS.join('|');

  const patterns = [
    new RegExp(`(?:^|[。！？!?\\n，,、\\s"“])([\\p{Script=Han}]{2,4})(?:${roleAction})[，,。！？!"“”\\s]`, 'gu'),
    new RegExp(`(?:^|[。！？!?\\n，,])([\\p{Script=Han}]{2,4})(?:${roleAction})`, 'gu'),
    new RegExp(`(?:^|[。！？!?\\n，,、\\s"“])([\\p{Script=Han}]{2,4})(?:${simpleSpeechAction})[：:"“]`, 'gu'),
    new RegExp(`["“][^"”]{1,80}["”]\\s*([\\p{Script=Han}]{2,4})(?:${roleAction})`, 'gu'),
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      addCandidate(names, match[1], { requireLikelyName: true });
    }
  }

  return names;
}

export function extractMissingSpeakerCandidates(params: {
  chapterContent: string;
  analysisText?: string;
}): string[] {
  const highConfidence = new Set<string>();
  const lowConfidence = new Set<string>();

  for (const name of extractExplicitSpeakerNames(params.chapterContent)) {
    highConfidence.add(name);
  }

  if (params.analysisText?.trim()) {
    for (const name of extractListedCharacterNames(params.analysisText)) {
      highConfidence.add(name);
    }
    for (const name of extractAgentHeadingNames(params.analysisText)) {
      if (!highConfidence.has(name)) {
        lowConfidence.add(name);
      }
    }
    for (const name of extractDialogueContextNames(params.analysisText)) {
      if (!highConfidence.has(name)) {
        lowConfidence.add(name);
      }
    }
  }

  for (const name of extractDialogueContextNames(params.chapterContent)) {
    if (!highConfidence.has(name)) {
      lowConfidence.add(name);
    }
  }

  return [...highConfidence, ...lowConfidence];
}

/**
 * 从章节正文和角色分析中提取可能的新角色。
 * 对未建档角色不自动创建，而是写入"候选池"待人工确认。
 */
export async function extractAndCreateMissingSpeakers(
  novelManager: NovelManager,
  novelId: string,
  chapterNumber: number,
  chapterContent: string,
  analysisText?: string,
): Promise<string[]> {
  const speakerNames = new Set(extractMissingSpeakerCandidates({ chapterContent, analysisText }));

  if (speakerNames.size === 0) return [];

  const existingChars = await novelManager.getCharacters(novelId);
  const knownNames = new Set<string>();
  for (const c of existingChars) {
    knownNames.add(c.name);
    for (const alias of c.aliases) {
      knownNames.add(alias);
    }
  }

  const missingNames: string[] = [];
  for (const name of speakerNames) {
    if (knownNames.has(name)) continue;
    const fuzzyMatch = existingChars.some(
      c => c.name.includes(name) || name.includes(c.name),
    );
    if (!fuzzyMatch) {
      missingNames.push(name);
    }
  }

  if (missingNames.length === 0) return [];

  await novelManager.upsertPendingCharacterCandidates(novelId, chapterNumber, missingNames);
  console.warn(
    `[候选角色] 第 ${chapterNumber} 章发现 ${missingNames.length} 个未建档说话角色，已加入候选池：${missingNames.join('、')}`,
  );
  return missingNames;
}
