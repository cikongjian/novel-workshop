export type UserDirectionAnchorAudit = {
  anchors: string[];
  presentAnchors: string[];
  missingAnchors: string[];
  coverage: number;
  shouldRepair: boolean;
  feedback: string;
  warnings?: string[];
  directionChars?: number;
  contentChars?: number;
  sourceHash?: string;
  directionPreview?: string;
  stage?: 'outline' | 'draft' | 'final' | 'revision';
};

const NEGATIVE_MARKER_RE = /(?:不要|禁止|不能|不得|避免|别|不许)/u;
const SENTENCE_SPLIT_RE = /(?<=[。！？；;!?])|\r?\n/u;
const WORD_RE = /[A-Za-z0-9#_-]{2,}/gu;
const CJK_STOP_WORDS = new Set([
  '继续',
  '题材',
  '重点',
  '写读',
  '判断',
  '现场',
  '协作',
  '处理',
  '通过',
  '进行',
  '之后',
  '后的',
  '新的',
  '本章',
  '章节',
  '故事',
  '小说',
  '主角',
  '读者',
  '方向',
  '风格',
  '生成',
  '推进',
]);
const CRITICAL_SCENE_ANCHORS = new Set([
  '早会',
  '晨会',
  '例会',
  '办公室',
  '公开会议',
  '会议室',
  '客厅',
  '同居',
  '气闸',
  '球场',
  '班赛',
  '城门',
  '戍卫营',
  '部落',
  '摊位',
  '活动室',
]);

const DOMAIN_TERM_RE = /(?:推进模块|备用电池|维修臂|参数记录|读数判断|现场协作|阀门|气闸|压降|过热|救援|星环|外环|维修班|故障记录|错误日志|假警报|停电|校准|读数|参数|工单升级|工单|泵组|传感器|报警|氧压|执行器|螺栓|夹爪|扳手|公开会议|验收清单|现场照片|结构确认单|客户复测|验收口径|方案拆解|责任分配|复测时间表|时间表|同事|站队|项目|客户|合同|交付|样板间|早会|晨会|例会|办公室|羞耻任务|社死任务|社死发言|指定台词|围观反应|围观|起哄|奖励|积分|计时|比分压力|传球失误|折返跑|右翼传切|身体极限|队友补位|失误修正|首发名单|队友信任|班赛|首发|补位|传切|右翼|比分|失误|修正|得分|助攻|防守|训练|比赛|摊位|酸汤面|客流|复购|社团|招新|活动室|模型|门阀|兵权|军权|戍卫营|女帝|皇帝|赐印|部落|炭坑|陶罐|灶台|蓄水|骨片|木片|骨棍|老族长|虎牙|阿骨|山魈|灰犬|暗金|神罚|交易凭证|分工|守洞|灵石|法术|品牌方|采访|Lisa|旧星星|新星星|密码|护短|主动靠近|门缝|直播|同居|牵手|心动)/gu;
const COMPOUND_NOUN_RE = /[\u4e00-\u9fa5A-Za-z0-9#_-]{1,4}(?:模块|电池|阀门|气闸|维修臂|读数|参数|工单|泵组|传感器|报警|日志|记录|校准|氧压|执行器|螺栓|夹爪|扳手|项目|合同|摊位|比赛|训练|传切|补位|失误|首发|社团|活动室|门阀|兵权|军权|戍卫营|部落|陶罐|灶台|蓄水|骨片|木片|骨棍|直播|同居)/gu;
const COMPOUND_FRAGMENT_RE = /(?:必须|出现|尝试|以及|主角|完成|结尾|落到|继续|单纯|正式|开始|变化)/u;

const ANCHOR_ALIAS_PATTERNS: Record<string, RegExp[]> = {
  星环: [/星环/u, /环体/u, /轨道环/u],
  外环: [/外环/u, /环体外侧/u, /外环补片区/u],
  维修班: [/维修班/u, /维修组/u, /班组/u, /外勤组/u, /(?:班长|老孙|调度)[^。！？\n]{0,24}(?:频道|确认|派|提醒|追问)/u],
  故障记录: [/故障记录/u, /故障[^。！？\n]{0,12}日志/u, /错误日志/u, /报错记录/u],
  错误日志: [/错误日志/u, /故障记录/u, /报错记录/u, /日志[^。！？\n]{0,18}(?:回放|编号|条目|记录)/u],
  假警报: [/假警报/u, /误报/u, /报警[^。！？\n]{0,18}(?:误触发|错误|假阳性)/u],
  停电: [/停电/u, /断电/u, /供电[^。！？\n]{0,18}(?:中断|掉线|切断)/u, /电力[^。！？\n]{0,18}中断/u],
  校准: [/校准/u, /标定/u, /复校/u, /重新[^。！？\n]{0,8}标定/u],
  传感器: [/传感器/u, /传感阵列/u, /传感单元/u, /校准探头/u, /采样(?:点|间隔|读数)/u],
  气闸: [/气闸/u, /气闸室/u, /舱门[^。！？\n]{0,18}(?:闭锁|泄压|密封)/u],
  早会: [/早会/u, /晨会/u, /例会/u, /会议室[^。！？\n]{0,24}(?:早|晨|上午|全员)/u],
  办公室: [/办公室/u, /工位/u, /会议室/u],
  羞耻任务: [/羞耻任务/u, /社死任务/u, /公开任务/u, /任务#[0-9]+/u],
  社死任务: [/社死任务/u, /羞耻任务/u, /公开任务/u, /任务#[0-9]+/u],
  社死发言: [/社死发言/u, /告白语气/u, /指定台词/u, /台词完整/u, /当众[^。！？\n]{0,24}(?:说|念|喊)/u, /被大家审视/u],
  指定台词: [/指定台词/u, /告白语气/u, /台词浮现/u],
  围观反应: [/围观/u, /看热闹/u, /笑声/u, /憋笑/u, /口哨/u, /起哄/u, /众人[^。！？\n]{0,24}(?:笑|愣|看)/u],
  围观: [/围观/u, /看热闹/u, /笑声/u, /憋笑/u, /口哨/u, /起哄/u],
  起哄: [/起哄/u, /口哨/u, /笑声/u, /喊/u],
  奖励: [/奖励/u, /积分/u, /获得[^。！？\n]{0,18}(?:技能|徽章|道具)/u],
  积分: [/积分/u, /奖励/u],
  社团: [/社团/u, /新生[^。！？\n]{0,24}(?:登记表|报名栏|报名|招新)/u],
  招新: [/招新/u, /新生[^。！？\n]{0,24}(?:登记表|报名栏|报名)/u, /登记表/u, /报名栏/u],
  活动室: [/活动室/u, /社团教室/u],
  客流: [/客流/u, /排队/u, /客人/u, /(?:卖出|卖够|卖了|还差)[^。！？\n]{0,12}(?:碗|份)/u, /(?:十六|十五|二十|三十)[^。！？\n]{0,6}碗/u],
  摊位: [/摊位/u, /出摊/u, /摊子/u, /摊前/u, /摊车/u, /破庙[^。！？\n]{0,24}(?:门口|墙根|檐角|岔道口)/u, /岔道口/u],
  复购: [/复购/u, /回头客/u, /再来(?:一碗|一份)?/u, /明天[^。！？\n]{0,24}(?:还来|再来|继续买|接着买)/u],
  班赛: [/比赛/u, /对抗/u, /赛场/u],
  比分压力: [/比分/u, /分差/u, /落后/u, /追分/u, /领先/u],
  传球失误: [/传球[^。！？\n]{0,12}(?:被断|被碰|变线|出界|偏了|丢了)/u, /球权转换/u, /失误/u],
  右翼传切: [/右翼[^。！？\n]{0,18}(?:传切|切入|空切|沉底|跑位)/u, /右侧45度[^。！？\n]{0,18}(?:传切|切入|空切|跑位)/u],
  队友补位: [/(?:刘洋|张恒|孙毅|队友)[^。！？\n]{0,18}(?:补位|换防|卡住|兜底|协防|补防|补你)/u],
  身体极限: [/(?:膝|腿|呼吸|体力)[^。！？\n]{0,24}(?:刺痛|钝痛|卡顿|撑不住|临界|极限|发力)/u],
  失误修正: [/(?:改|调整|修正|补救|追回|重新|提前)[^。！？\n]{0,28}(?:失误|路线|站位|节奏|球权|半秒|重心|步幅)/u],
  助攻: [/(?:分球|传给|直塞|喂球|传球|击地传)[\s\S]{0,48}(?:球进|上篮|得分|命中|刷网|中投|钻进篮筐)/u],
  防守: [/(?:防守|贴防|换防|协防|补防|卡住|封住|干扰|断球|抢断)/u],
  防守成功: [/(?:防守|贴防|换防|协防|补防|卡住|封住|干扰|断球|抢断)[^。！？\n]{0,24}(?:成功|不中|出界|球权转换|停球)/u],
  队友信任: [/(?:张恒|刘洋|孙毅|队友)[^。！？\n]{0,24}(?:相信|信任|交给|喂你|补你|兜底|拍了拍|点头)/u],
  首发名单: [/首发[^。！？\n]{0,12}(?:名单|阵容|位置|调整)/u, /第一阵容/u],
  参数记录: [/(?:记录板|参数记录|记录)[^。！？\n]{0,40}(?:参数|坐标|读数|压降|温度差|校准|阀门|维修臂)/u],
  现场协作: [/(?:调度|老孙|班长|同事|队友)[^。！？\n]{0,36}(?:收到|确认|反馈|追问|提醒|频道|协作|配合|切入)/u],
  客户: [/客户/u, /刘总/u],
  客户复测: [/(?:客户|刘总)[^。！？\n]{0,24}(?:复测|复核|确认|签字)/u, /复测时间表/u],
  公开会议: [/(?:会议室|公开会议|复测会议|客户方)[^。！？\n]{0,48}(?:坐|摊|翻|开口|签字|确认|异议|会议桌|主位)/u, /302的门/u],
  方案拆解: [/(?:方案|草案|验收草案|偏差项|异议项|参数|阈值)[^。！？\n]{0,36}(?:拆解|对齐|标注|划掉|驳回|逐项|依据)/u, /(?:复测时间表|替代供应商资质|结构补强出图单位)/u],
  责任分配: [/(?:谁出图|负责|责任|分配|刘莉|周维|小陈|老孙)[^。！？\n]{0,32}(?:签|出图|协调|监督|对接|发|取|负责)/u],
  同事: [/(?:小陈|小李|刘莉|周维|老孙|同事)[^。！？\n]{0,36}(?:站起来|递|推|发来|签|开口|点头|确认|支持|站队)/u],
  站队: [
    /(?:小陈|小李|刘莉|周维|老孙|同事)[^。！？\n]{0,48}(?:接过|站起来|递|推|签|开口|问|发来|点头|确认|支持|站队)/u,
    /(?:同学|学生|室友|新生|社员|老师)[^。！？\n]{0,48}(?:帮忙|守场|带.*来|报名|登记|支持|站队|留下|加入)/u,
    /(?:我|我们)[^。！？\n]{0,24}(?:帮忙守场|把室友.*带来|带.*来试|支持你们|报名|留下)/u,
  ],
  品牌方: [/品牌方/u, /Lisa[^。！？\n]{0,24}(?:流程|安排|消息|采访)/u],
  采访: [/采访/u, /镜头[^。！？\n]{0,24}(?:前|里|下|提问)/u],
  旧星星: [/旧星星/u, /星星[^。！？\n]{0,20}Z痕/u],
  新星星: [/新星星/u, /两枚星星/u],
  密码: [/密码/u, /生日[^。！？\n]{0,18}(?:数字|最后一位)/u],
  护短: [/护短/u, /站你那边/u, /不会让别人先护/u, /挡在[^。！？\n]{0,18}身前/u],
  主动靠近: [/主动靠近/u, /靠近/u, /牵住/u, /握住/u, /没有(?:躲|退)/u],
  门缝: [/门缝/u, /门留了一条缝/u, /没锁/u],
  兵权: [/兵权/u, /军权/u, /虎符/u, /兵符/u, /戍卫营[^。！？\n]{0,36}(?:归属|管辖权|共管|待议|归谁管|落到)/u, /归属方案/u],
  女帝: [/女帝/u, /陛下/u, /皇帝/u, /赐印/u, /那个女人[^。！？\n]{0,36}(?:选择|赐印|压制|态度)/u],
  交易凭证: [/(?:木片|骨片)[^。！？\n]{0,24}(?:记账|刻号|凭证|信用|换汤)/u, /交易凭证/u],
  分工: [/(?:虎牙|阿骨|老族长|孩子|族人)[^。！？\n]{0,36}(?:守|挖|搬|垒|排|掌勺|分工|接手)/u],
  蓄水: [/蓄水/u, /水坑/u, /净水/u],
  灶台: [/灶台/u, /垒[^。！？\n]{0,8}灶/u],
  骨棍: [/骨棍/u, /灰斑[^。！？\n]{0,12}(?:扩大|蔓延|发亮)/u],
  暗金: [/暗金/u, /金色沉淀/u],
  神罚: [/神罚/u, /灰斑[^。！？\n]{0,24}(?:扩|亮|蔓延)/u],
};

function positiveDirectionText(direction: string): string {
  const clauses = direction
    .split(SENTENCE_SPLIT_RE)
    .map(clause => clause.trim())
    .map(clause => {
      const match = clause.match(NEGATIVE_MARKER_RE);
      return match ? clause.slice(0, match.index).trim() : clause;
    })
    .filter(Boolean);
  const positiveClauses = clauses.filter(clause => !NEGATIVE_MARKER_RE.test(clause.slice(0, 8)));
  return (positiveClauses.length > 0 ? positiveClauses : clauses).join(' ').trim();
}

function normalizeAnchor(anchor: string): string {
  return anchor
    .replace(/[：:，,。；;、\s]+/gu, '')
    .trim();
}

function isUsefulAnchor(anchor: string): boolean {
  if (anchor.length < 2 || anchor.length > 12) return false;
  if (CJK_STOP_WORDS.has(anchor)) return false;
  if (/^(?:和|与|及|或|的|了|在|把|以|为|从)/u.test(anchor)) return false;
  if (/(?:不要|禁止|不能|不得|避免|悬疑|阴谋|揭秘|调查)$/u.test(anchor)) return false;
  return true;
}

export function extractUserDirectionAnchors(direction: string, limit = 12): string[] {
  const positiveText = positiveDirectionText(direction);
  const anchors: string[] = [];
  const add = (value: string | undefined, source: 'domain' | 'compound' | 'word' = 'domain'): void => {
    const anchor = normalizeAnchor(value ?? '');
    if (!isUsefulAnchor(anchor)) return;
    if (
      source === 'compound'
      && (
        COMPOUND_FRAGMENT_RE.test(anchor)
        || anchors.some(existing => existing.length >= 2 && anchor.includes(existing))
      )
    ) {
      return;
    }
    if (!anchors.includes(anchor)) anchors.push(anchor);
  };

  for (const match of positiveText.matchAll(DOMAIN_TERM_RE)) add(match[0], 'domain');
  for (const match of positiveText.matchAll(COMPOUND_NOUN_RE)) add(match[0], 'compound');
  for (const match of positiveText.matchAll(WORD_RE)) {
    const token = normalizeAnchor(match[0]);
    if (/^[A-Za-z0-9#_-]+$/u.test(token)) add(token, 'word');
  }

  return anchors.slice(0, limit);
}

export function buildUserDirectionAnchorInstruction(direction: string): string {
  const anchors = extractUserDirectionAnchors(direction);
  if (anchors.length < 2) return '';
  return [
    '## 用户方向锚点（不可被记忆检索或前文伏笔替换）',
    `- 本章必须自然出现并推动情节：${anchors.join('、')}。`,
    '- 如果前文伏笔、真相文件或题材模板与这些锚点冲突，优先执行用户方向锚点。',
    '- 不要把用户指定的现场任务改写成线索溯源、身份确认或泛化悬疑钩子。',
  ].join('\n');
}

export function auditUserDirectionAnchors(params: {
  direction: string;
  content: string;
  stage?: UserDirectionAnchorAudit['stage'];
}): UserDirectionAnchorAudit {
  const anchors = extractUserDirectionAnchors(params.direction);
  const presentAnchorSet = new Set(anchors.filter(anchor => isAnchorPresent(anchor, params.content)));
  for (const group of extractAlternativeAnchorGroups(params.direction, anchors)) {
    if (group.some(anchor => presentAnchorSet.has(anchor))) {
      for (const anchor of group) presentAnchorSet.add(anchor);
    }
  }
  const presentAnchors = anchors.filter(anchor => presentAnchorSet.has(anchor));
  const missingAnchors = anchors.filter(anchor => !presentAnchorSet.has(anchor));
  const coverage = anchors.length === 0 ? 1 : presentAnchors.length / anchors.length;
  const warnings = buildDirectionWarnings(params.direction, anchors);
  const criticalSceneMissing = missingAnchors.some(anchor => CRITICAL_SCENE_ANCHORS.has(anchor));
  const shouldRepair = anchors.length >= 3 && (
    coverage < 0.55
    || (anchors.length >= 8 && missingAnchors.length >= 3 && coverage < 0.75)
    || (criticalSceneMissing && coverage < 0.85)
  );
  const feedback = shouldRepair
    ? [
      `用户方向锚点缺失：${missingAnchors.join('、')}。`,
      `当前只命中 ${presentAnchors.length}/${anchors.length} 个锚点，修订必须把缺失锚点写成现场动作、设备状态、人物选择或即时结果。`,
      '不得用前文伏笔、工具溯源、身份确认、线索调查替代用户指定的本章任务。',
    ].join('\n')
    : '';
  return {
    anchors,
    presentAnchors,
    missingAnchors,
    coverage,
    shouldRepair,
    feedback,
    warnings,
    directionChars: params.direction.length,
    contentChars: params.content.length,
    sourceHash: `${hashString(params.direction)}:${hashString(params.content)}`,
    directionPreview: previewText(params.direction),
    stage: params.stage,
  };
}

function isAnchorPresent(anchor: string, content: string): boolean {
  if (content.includes(anchor)) return true;
  return (ANCHOR_ALIAS_PATTERNS[anchor] ?? []).some(pattern => pattern.test(content));
}

function extractAlternativeAnchorGroups(direction: string, anchors: string[]): string[][] {
  const positiveText = positiveDirectionText(direction);
  const groups: string[][] = [];
  const seen = new Set<string>();
  for (let i = 0; i < anchors.length; i++) {
    const left = anchors[i];
    const leftIndex = positiveText.indexOf(left);
    if (leftIndex < 0) continue;
    for (let j = i + 1; j < anchors.length; j++) {
      const right = anchors[j];
      const rightIndex = positiveText.indexOf(right, leftIndex + left.length);
      if (rightIndex < 0) continue;
      const between = positiveText.slice(leftIndex + left.length, rightIndex);
      if (!/^[\s，,、和与及一次完成主角下由成功]{0,18}或[\s，,、和与及一次完成主角下由成功]{0,18}$/u.test(between)) continue;
      const group = [left, right];
      const key = group.join('\u0000');
      if (!seen.has(key)) {
        groups.push(group);
        seen.add(key);
      }
    }
  }
  return groups;
}

function previewText(value: string): string {
  return value.replace(/\s+/gu, ' ').trim().slice(0, 160);
}

function buildDirectionWarnings(direction: string, anchors: string[]): string[] {
  const questionMarks = (direction.match(/\?/gu) ?? []).length;
  if (anchors.length === 0 && direction.length >= 20 && questionMarks >= Math.max(8, direction.length * 0.3)) {
    return ['user direction appears mojibake or question-mark corrupted'];
  }
  return [];
}

function hashString(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function buildUserDirectionAnchorRepairInstruction(audit: UserDirectionAnchorAudit): string {
  if (!audit.shouldRepair) return '';
  const actionRequirements = buildAnchorActionRequirements(audit.missingAnchors);
  return [
    '## 用户方向锚点强制重做',
    `- 上一版只命中 ${audit.presentAnchors.length}/${audit.anchors.length} 个锚点。`,
    `- 必须补入并作为场景动作推进：${audit.missingAnchors.join('、')}。`,
    ...(actionRequirements.length > 0
      ? [
        '- 缺失锚点必须按以下方式落成正文动作：',
        ...actionRequirements.map(item => `  - ${item}`),
      ]
      : []),
    '- 场景列表必须围绕这些缺失锚点重排；不要继续沿用偏离用户方向的前文伏笔。',
    '- 如果锚点属于设备、项目、菜品、比赛、关系动作或权力筹码，必须写成可见行动和即时结果。',
  ].join('\n');
}

function buildAnchorActionRequirements(missingAnchors: string[]): string[] {
  const requirements: Record<string, string> = {
    比分压力: '写出计时器/比分/分差，并让人物因为追分、领先或落后改变选择。',
    传球失误: '写出一次传球被断、变线、出界或丢球，并产生球权/节奏后果。',
    右翼传切: '写出右翼45度或右侧底线的传切路线，包含接球、跑位或出球。',
    队友补位: '写出队友补防、换防、兜底、卡住路线或补上空位。',
    身体极限: '写出膝腿、呼吸、体力或疼痛到临界点，并影响动作选择。',
    失误修正: '写出人物针对前一次失误调整站位、传球路线、防守判断或节奏。',
    助攻: '写出一次分球、直塞或喂球后由队友完成得分。',
    防守成功: '写出一次防守导致对手停球、出界、打铁、失误或球权转换。',
    队友信任: '写出队友通过传球、补位、承诺、拍肩、站位变化来表达信任。',
    首发名单: '写出首发名单、阵容或位置调整，并让角色关系因此改变。',
  };
  return missingAnchors
    .map(anchor => requirements[anchor])
    .filter((value): value is string => Boolean(value));
}
