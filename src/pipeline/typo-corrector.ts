export type TypoCorrectionResult = {
  applied: boolean;
  correctionCount: number;
  corrections: Array<{
    type: string;
    original: string;
    corrected: string;
    count: number;
  }>;
  correctedText: string;
};

type TypoRule = {
  pattern: RegExp;
  to: string;
  type: string;
  label: string;
  confidence: 'high' | 'medium';
};

const TYPO_RULES: TypoRule[] = [
  { pattern: /印钮/g, to: '印纽', type: '形近字', label: '印钮→印纽', confidence: 'high' },
  { pattern: /钮扣/g, to: '纽扣', type: '形近字', label: '钮扣→纽扣', confidence: 'high' },
  { pattern: /电钮/g, to: '电纽', type: '形近字', label: '电钮→电纽', confidence: 'high' },

  { pattern: /戌边/g, to: '戍边', type: '形近字', label: '戌边→戍边', confidence: 'high' },
  { pattern: /戌卫/g, to: '戍卫', type: '形近字', label: '戌卫→戍卫', confidence: 'high' },
  { pattern: /戌守/g, to: '戍守', type: '形近字', label: '戌守→戍守', confidence: 'high' },
  { pattern: /卫戌/g, to: '卫戍', type: '形近字', label: '卫戌→卫戍', confidence: 'high' },
  { pattern: /戊戍/g, to: '戊戌', type: '形近字', label: '戊戍→戊戌', confidence: 'high' },

  { pattern: /既使/g, to: '即使', type: '形近字', label: '既使→即使', confidence: 'high' },
  { pattern: /即然/g, to: '既然', type: '形近字', label: '即然→既然', confidence: 'high' },

  { pattern: /峻工/g, to: '竣工', type: '形近字', label: '峻工→竣工', confidence: 'high' },
  { pattern: /竣马/g, to: '骏马', type: '形近字', label: '竣马→骏马', confidence: 'high' },
  { pattern: /峻岭/g, to: '峻岭', type: '形近字', label: '竣岭→峻岭', confidence: 'high' },

  { pattern: /帐蓬/g, to: '帐篷', type: '形近字', label: '帐蓬→帐篷', confidence: 'high' },
  { pattern: /篷勃/g, to: '蓬勃', type: '形近字', label: '篷勃→蓬勃', confidence: 'high' },
  { pattern: /蓬帐/g, to: '帐篷', type: '形近字', label: '蓬帐→帐篷', confidence: 'medium' },

  { pattern: /沧海一栗/g, to: '沧海一粟', type: '形近字', label: '沧海一栗→沧海一粟', confidence: 'high' },
  { pattern: /火中取栗/g, to: '火中取栗', type: '形近字', label: '火中取粟→火中取栗', confidence: 'high' },
  { pattern: /不寒而粟/g, to: '不寒而栗', type: '形近字', label: '不寒而粟→不寒而栗', confidence: 'high' },
  { pattern: /粟子/g, to: '栗子', type: '形近字', label: '粟子→栗子', confidence: 'medium' },

  { pattern: /肆无忌殚/g, to: '肆无忌惮', type: '形近字', label: '肆无忌殚→肆无忌惮', confidence: 'high' },
  { pattern: /殚精竭虑/g, to: '殚精竭虑', type: '形近字', label: '惮精竭虑→殚精竭虑', confidence: 'high' },

  { pattern: /虎视耽耽/g, to: '虎视眈眈', type: '形近字', label: '虎视耽耽→虎视眈眈', confidence: 'high' },
  { pattern: /眈误/g, to: '耽误', type: '形近字', label: '眈误→耽误', confidence: 'high' },

  { pattern: /中流抵柱/g, to: '中流砥柱', type: '形近字', label: '中流抵柱→中流砥柱', confidence: 'high' },
  { pattern: /抵砺/g, to: '砥砺', type: '形近字', label: '抵砺→砥砺', confidence: 'medium' },

  { pattern: /以逸代劳/g, to: '以逸待劳', type: '成语', label: '以逸代劳→以逸待劳', confidence: 'high' },
  { pattern: /越俎代疱/g, to: '越俎代庖', type: '成语', label: '越俎代疱→越俎代庖', confidence: 'high' },
  { pattern: /疱丁解牛/g, to: '庖丁解牛', type: '成语', label: '疱丁解牛→庖丁解牛', confidence: 'high' },

  { pattern: /相形见拙/g, to: '相形见绌', type: '成语', label: '相形见拙→相形见绌', confidence: 'high' },
  { pattern: /弄巧成绌/g, to: '弄巧成拙', type: '成语', label: '弄巧成绌→弄巧成拙', confidence: 'high' },
  { pattern: /咄咄逼人/g, to: '咄咄逼人', type: '成语', label: '拙拙逼人→咄咄逼人', confidence: 'medium' },

  { pattern: /迫不急待/g, to: '迫不及待', type: '成语', label: '迫不急待→迫不及待', confidence: 'high' },
  { pattern: /再接再励/g, to: '再接再厉', type: '成语', label: '再接再励→再接再厉', confidence: 'high' },
  { pattern: /一如继往/g, to: '一如既往', type: '成语', label: '一如继往→一如既往', confidence: 'high' },
  { pattern: /不记其数/g, to: '不计其数', type: '成语', label: '不记其数→不计其数', confidence: 'high' },
  { pattern: /走头无路/g, to: '走投无路', type: '成语', label: '走头无路→走投无路', confidence: 'high' },
  { pattern: /礼上往来/g, to: '礼尚往来', type: '成语', label: '礼上往来→礼尚往来', confidence: 'high' },
  { pattern: /一股作气/g, to: '一鼓作气', type: '成语', label: '一股作气→一鼓作气', confidence: 'high' },
  { pattern: /悬梁刺骨/g, to: '悬梁刺股', type: '成语', label: '悬梁刺骨→悬梁刺股', confidence: 'high' },
  { pattern: /黄梁美梦/g, to: '黄粱美梦', type: '成语', label: '黄梁美梦→黄粱美梦', confidence: 'high' },
  { pattern: /一诺千斤/g, to: '一诺千金', type: '成语', label: '一诺千斤→一诺千金', confidence: 'high' },
  { pattern: /声名雀起/g, to: '声名鹊起', type: '成语', label: '声名雀起→声名鹊起', confidence: 'high' },
  { pattern: /食不裹腹/g, to: '食不果腹', type: '成语', label: '食不裹腹→食不果腹', confidence: 'high' },
  { pattern: /谈笑风声/g, to: '谈笑风生', type: '成语', label: '谈笑风声→谈笑风生', confidence: 'high' },
  { pattern: /顶力相助/g, to: '鼎力相助', type: '成语', label: '顶力相助→鼎力相助', confidence: 'high' },
  { pattern: /衣衫蓝缕/g, to: '衣衫褴褛', type: '成语', label: '衣衫蓝缕→衣衫褴褛', confidence: 'high' },
  { pattern: /甘败下风/g, to: '甘拜下风', type: '成语', label: '甘败下风→甘拜下风', confidence: 'high' },
  { pattern: /自抱自弃/g, to: '自暴自弃', type: '成语', label: '自抱自弃→自暴自弃', confidence: 'high' },
  { pattern: /一愁莫展/g, to: '一筹莫展', type: '成语', label: '一愁莫展→一筹莫展', confidence: 'high' },
  { pattern: /穿流不息/g, to: '川流不息', type: '成语', label: '穿流不息→川流不息', confidence: 'high' },
  { pattern: /天翻地复/g, to: '天翻地覆', type: '成语', label: '天翻地复→天翻地覆', confidence: 'high' },
  { pattern: /言简意骇/g, to: '言简意赅', type: '成语', label: '言简意骇→言简意赅', confidence: 'high' },
  { pattern: /振聋发馈/g, to: '振聋发聩', type: '成语', label: '振聋发馈→振聋发聩', confidence: 'high' },
  { pattern: /美仑美奂/g, to: '美轮美奂', type: '成语', label: '美仑美奂→美轮美奂', confidence: 'high' },
  { pattern: /世外桃园/g, to: '世外桃源', type: '成语', label: '世外桃园→世外桃源', confidence: 'high' },
  { pattern: /默守陈规/g, to: '墨守成规', type: '成语', label: '默守陈规→墨守成规', confidence: 'high' },
  { pattern: /不径而走/g, to: '不胫而走', type: '成语', label: '不径而走→不胫而走', confidence: 'high' },
  { pattern: /受宠若惊/g, to: '受宠若惊', type: '成语', label: '受宠若惊→受宠若惊', confidence: 'medium' },

  { pattern: /逝目以待/g, to: '拭目以待', type: '成语', label: '逝目以待→拭目以待', confidence: 'high' },
  { pattern: /试目以待/g, to: '拭目以待', type: '成语', label: '试目以待→拭目以待', confidence: 'high' },
  { pattern: /举步为艰/g, to: '举步维艰', type: '成语', label: '举步为艰→举步维艰', confidence: 'high' },
  { pattern: /步履唯坚/g, to: '步履维艰', type: '成语', label: '步履唯坚→步履维艰', confidence: 'high' },
  { pattern: /唯妙唯肖/g, to: '惟妙惟肖', type: '成语', label: '唯妙唯肖→惟妙惟肖', confidence: 'medium' },
  { pattern: /任人为贤/g, to: '任人唯贤', type: '成语', label: '任人为贤→任人唯贤', confidence: 'high' },
  { pattern: /委屈求全/g, to: '委曲求全', type: '成语', label: '委屈求全→委曲求全', confidence: 'high' },
  { pattern: /卑躬曲膝/g, to: '卑躬屈膝', type: '成语', label: '卑躬曲膝→卑躬屈膝', confidence: 'high' },
  { pattern: /首曲一指/g, to: '首屈一指', type: '成语', label: '首曲一指→首屈一指', confidence: 'high' },
  { pattern: /能曲能伸/g, to: '能屈能伸', type: '成语', label: '能曲能伸→能屈能伸', confidence: 'high' },
  { pattern: /坚难困苦/g, to: '艰难困苦', type: '成语', label: '坚难困苦→艰难困苦', confidence: 'high' },
  { pattern: /坚苦奋斗/g, to: '艰苦奋斗', type: '成语', label: '坚苦奋斗→艰苦奋斗', confidence: 'high' },
  { pattern: /厉精图治/g, to: '励精图治', type: '成语', label: '厉精图治→励精图治', confidence: 'high' },
  { pattern: /厉害关系/g, to: '利害关系', type: '成语', label: '厉害关系→利害关系', confidence: 'high' },
  { pattern: /变本加利/g, to: '变本加厉', type: '成语', label: '变本加利→变本加厉', confidence: 'high' },
  { pattern: /金壁辉煌/g, to: '金碧辉煌', type: '成语', label: '金壁辉煌→金碧辉煌', confidence: 'high' },
  { pattern: /完壁归赵/g, to: '完璧归赵', type: '成语', label: '完壁归赵→完璧归赵', confidence: 'high' },
  { pattern: /白壁微瑕/g, to: '白璧微瑕', type: '成语', label: '白壁微瑕→白璧微瑕', confidence: 'high' },
  { pattern: /墙璧/g, to: '墙壁', type: '形近字', label: '墙璧→墙壁', confidence: 'high' },
  { pattern: /合盘托出/g, to: '和盘托出', type: '成语', label: '合盘托出→和盘托出', confidence: 'high' },
  { pattern: /貌和神离/g, to: '貌合神离', type: '成语', label: '貌和神离→貌合神离', confidence: 'high' },
  { pattern: /愁怅/g, to: '惆怅', type: '形近字', label: '愁怅→惆怅', confidence: 'high' },
  { pattern: /一蹋糊涂/g, to: '一塌糊涂', type: '成语', label: '一蹋糊涂→一塌糊涂', confidence: 'high' },
  { pattern: /死心踏地/g, to: '死心塌地', type: '成语', label: '死心踏地→死心塌地', confidence: 'high' },

  { pattern: /教梭/g, to: '教唆', type: '形近字', label: '教梭→教唆', confidence: 'high' },
  { pattern: /梭使/g, to: '唆使', type: '形近字', label: '梭使→唆使', confidence: 'high' },
  { pattern: /穿梭/g, to: '穿梭', type: '形近字', label: '穿唆→穿梭', confidence: 'medium' },

  { pattern: /地大物搏/g, to: '地大物博', type: '成语', label: '地大物搏→地大物博', confidence: 'high' },
  { pattern: /脉搏微弱/g, to: '脉搏微弱', type: '词语', label: '脉博微弱→脉搏微弱', confidence: 'high' },
  { pattern: /博斗/g, to: '搏斗', type: '形近字', label: '博斗→搏斗', confidence: 'high' },
];

function applyRule(text: string, rule: TypoRule): { text: string; count: number } {
  let count = 0;
  const result = text.replace(rule.pattern, () => {
    count++;
    return rule.to;
  });
  return { text: result, count };
}

export function correctTypos(
  text: string,
  options: { minConfidence?: 'high' | 'medium' } = {},
): TypoCorrectionResult {
  if (!text || !text.trim()) {
    return {
      applied: false,
      correctionCount: 0,
      corrections: [],
      correctedText: text,
    };
  }

  const minConfidence = options.minConfidence || 'medium';
  const filteredRules = TYPO_RULES.filter(
    r => minConfidence === 'high' ? r.confidence === 'high' : true,
  );

  let correctedText = text;
  const correctionMap = new Map<string, { type: string; original: string; corrected: string; count: number }>();
  let totalCount = 0;

  for (const rule of filteredRules) {
    const { text: newText, count } = applyRule(correctedText, rule);
    if (count > 0) {
      correctedText = newText;
      totalCount += count;
      const key = rule.label;
      if (correctionMap.has(key)) {
        correctionMap.get(key)!.count += count;
      } else {
        correctionMap.set(key, {
          type: rule.type,
          original: rule.pattern.source,
          corrected: rule.to,
          count,
        });
      }
    }
  }

  return {
    applied: totalCount > 0,
    correctionCount: totalCount,
    corrections: Array.from(correctionMap.values()),
    correctedText,
  };
}

export function correctTyposSummary(text: string): string {
  const result = correctTypos(text);
  if (!result.applied) return '无错别字修正';
  const byType = new Map<string, number>();
  for (const c of result.corrections) {
    byType.set(c.type, (byType.get(c.type) || 0) + c.count);
  }
  const parts = Array.from(byType.entries()).map(([type, count]) => `${type}:${count}处`);
  return `共修正${result.correctionCount}处错字（${parts.join('，')}）`;
}
