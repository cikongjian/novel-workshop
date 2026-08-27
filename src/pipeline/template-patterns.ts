export type TemplatePatternCategory = 'cliche' | 'ai-tell' | 'ai-structure' | 'ai-meta' | 'ai-formatting' | 'ai-connector';

export type TemplatePatternItem = {
  category: TemplatePatternCategory;
  pattern: RegExp;
  label: string;
};

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

export const TEMPLATE_PATTERN_LIBRARY: TemplatePatternItem[] = [
  // 常见套路化表达
  { category: 'cliche', pattern: /深吸一口气/g, label: '”深吸一口气”' },
  { category: 'cliche', pattern: /心头一紧/g, label: '”心头一紧”' },
  { category: 'cliche', pattern: /空气仿佛凝固/g, label: '”空气仿佛凝固”' },
  { category: 'cliche', pattern: /不由得/g, label: '”不由得”' },
  { category: 'cliche', pattern: /嘴角微微上扬/g, label: '”嘴角微微上扬”' },
  { category: 'cliche', pattern: /瞳孔骤缩/g, label: '”瞳孔骤缩”' },
  { category: 'cliche', pattern: /不由自主/g, label: '”不由自主”' },
  { category: 'cliche', pattern: /内心深处/g, label: '”内心深处”' },
  { category: 'cliche', pattern: /一股(?:无形的|莫名的)?力量/g, label: '”一股(无形的)力量”' },
  { category: 'cliche', pattern: /心中(?:暗暗|暗自)?(?:想道|暗道|想到|思忖)/g, label: '”心中暗道”' },
  { category: 'cliche', pattern: /下意识(?:地|的)/g, label: '”下意识地”' },
  { category: 'cliche', pattern: /不知不觉/g, label: '”不知不觉”' },
  { category: 'cliche', pattern: /莫名(?:的|地)/g, label: '”莫名的/地”' },
  { category: 'cliche', pattern: /说不出的/g, label: '”说不出的”' },
  { category: 'cliche', pattern: /眼中闪过一丝/g, label: '”眼中闪过一丝”' },
  { category: 'cliche', pattern: /心中涌起一股/g, label: '”心中涌起一股”' },
  { category: 'cliche', pattern: /一(?:股|阵)(?:暖流|寒意|凉意)/g, label: '”一股暖流/寒意”' },
  { category: 'cliche', pattern: /心中一(?:动|凛|惊)/g, label: '”心中一动/一凛”' },
  { category: 'cliche', pattern: /此刻/g, label: '”此刻”' },
  { category: 'cliche', pattern: /就在这时/g, label: '”就在这时”' },
  { category: 'cliche', pattern: /不是[^。！？；\n]{1,20}而是[^。！？；\n]{1,24}/g, label: '“不是X，而是Y”对照句' },
  { category: 'cliche', pattern: /所谓[^。！？；\n]{1,16}不是[^。！？；\n]{1,20}而是[^。！？；\n]{1,24}/g, label: '“所谓X不是……而是……”对照句' },
  { category: 'cliche', pattern: /并非[^。！？；\n]{1,20}而是[^。！？；\n]{1,24}/g, label: '“并非X，而是Y”对照句' },
  { category: 'cliche', pattern: /与其说[^。！？；\n]{1,20}不如说[^。！？；\n]{1,24}/g, label: '“与其说X，不如说Y”对照句' },

  // 更偏“AI味”的通用微动作/氛围模板
  { category: 'ai-tell', pattern: /指(?:节|关节)发白/g, label: '“指节发白”' },
  { category: 'ai-tell', pattern: /指尖(?:微微)?泛白/g, label: '“指尖泛白”' },
  { category: 'ai-tell', pattern: /(?:脸色|面色|唇色|嘴唇)(?:瞬间|骤然|一下子)?发白/g, label: '“脸色/唇色发白”' },
  { category: 'ai-tell', pattern: /脸(?:色)?(?:一下子|瞬间|骤然)?白了/g, label: '“脸一下子白了”' },
  { category: 'ai-tell', pattern: /喉结(?:上下)?滚动/g, label: '“喉结滚动”' },
  { category: 'ai-tell', pattern: /眼底(?:闪过|掠过|划过)/g, label: '“眼底闪过”' },
  { category: 'ai-tell', pattern: /眸(?:底|光)(?:闪过|掠过|划过)/g, label: '“眸底闪过”' },
  { category: 'ai-tell', pattern: /呼吸(?:一)?(?:滞|窒)/g, label: '“呼吸一滞”' },
  { category: 'ai-tell', pattern: /喉咙(?:发紧|发干)/g, label: '“喉咙发紧”' },
  { category: 'ai-tell', pattern: /背脊(?:一)?凉/g, label: '“背脊一凉”' },
  { category: 'ai-tell', pattern: /脊背(?:发凉|发寒|一凉)/g, label: '“脊背发凉”' },
  { category: 'ai-tell', pattern: /掌心(?:渗出|冒出)?冷汗/g, label: '“掌心冷汗”' },
  { category: 'ai-tell', pattern: /冷汗(?:涔涔)?(?:冒出|渗出)/g, label: '“冷汗冒出”' },
  { category: 'ai-tell', pattern: /拳头(?:不由得)?(?:攥|握)紧/g, label: '“攥紧拳头”' },
  { category: 'ai-tell', pattern: /指尖(?:发凉|冰凉)/g, label: '“指尖发凉”' },
  { category: 'ai-tell', pattern: /血液仿佛凝固/g, label: '“血液仿佛凝固”' },
  { category: 'ai-tell', pattern: /时间仿佛(?:静止|停滞)/g, label: '“时间仿佛静止”' },
  { category: 'ai-tell', pattern: /四周一片死寂/g, label: '“四周一片死寂”' },
  { category: 'ai-tell', pattern: /沉默(?:在|于)空气中(?:蔓延|扩散)/g, label: '“沉默蔓延”' },
  { category: 'ai-tell', pattern: /目光(?:复杂|幽深|深邃)/g, label: '“目光复杂”' },
  { category: 'ai-tell', pattern: /嘴角(?:微微)?(?:勾起|扬起)/g, label: '“嘴角勾起”' },
  { category: 'ai-tell', pattern: /眉头(?:微微)?(?:一皱|皱起)/g, label: '“眉头一皱”' },
  { category: 'ai-tell', pattern: /心里(?:咯噔|一沉)/g, label: '“心里咯噔/一沉”' },
  { category: 'ai-tell', pattern: /五味杂陈/g, label: '“五味杂陈”' },
  { category: 'ai-tell', pattern: /脑海中(?:闪过|浮现)/g, label: '“脑海中闪过”' },
  { category: 'ai-tell', pattern: /空气中(?:弥漫|充斥)着?[^。；\n]{0,12}(?:气息|味道)/g, label: '”空气中弥漫着…气息”' },
  { category: 'ai-tell', pattern: /(?:身体|身子)(?:微微)?(?:一僵|僵住|一颤)/g, label: '”身体一僵/一颤”' },
  { category: 'ai-tell', pattern: /瞳孔(?:微微)?(?:一缩|收缩|放大)/g, label: '”瞳孔一缩/放大”' },
  { category: 'ai-tell', pattern: /心脏(?:猛地|狠狠)?(?:一缩|一跳|漏跳)/g, label: '”心脏猛地一缩”' },
  { category: 'ai-tell', pattern: /声音(?:不自觉|不由得)?(?:发颤|颤抖|沙哑)/g, label: '”声音发颤/沙哑”' },
  { category: 'ai-tell', pattern: /喉咙(?:像是)?(?:被(?:什么|一只手)(?:掐|扼|堵)住|哽住)/g, label: '”喉咙被什么掐住”' },
  { category: 'ai-tell', pattern: /(?:眼眶|眼圈)(?:微微)?(?:泛红|发红|一红|一热)/g, label: '”眼眶泛红”' },
  { category: 'ai-tell', pattern: /嘴唇(?:微微)?(?:颤抖|抿紧|翕动|蠕动)/g, label: '”嘴唇颤抖/抿紧”' },
  { category: 'ai-tell', pattern: /浑身(?:一震|一颤|一抖)/g, label: '”浑身一震”' },
  { category: 'ai-tell', pattern: /如遭雷击/g, label: '”如遭雷击”' },
  { category: 'ai-tell', pattern: /仿佛被(?:抽空|抽干|掏空)/g, label: '”仿佛被抽空”' },

  // 更偏“结构性 AI 味”的总结腔/条理腔（在小说正文里尽量避免）
  { category: 'ai-structure', pattern: /(?:总而言之|简而言之|综上所述|归根结底)/g, label: '“总而言之/综上所述”' },
  { category: 'ai-structure', pattern: /(?:不难发现|可以看出|显而易见|毫无疑问|毋庸置疑)/g, label: '“不难发现/可以看出”' },
  { category: 'ai-structure', pattern: /(?:值得一提的是|需要注意的是|不可否认的是)/g, label: '“值得一提的是”' },
  { category: 'ai-structure', pattern: /(?:从某种意义上说|某种程度上)/g, label: '“从某种意义上说”' },
  { category: 'ai-structure', pattern: /(?:首先|其次|最后|其一|其二|其三)[，：]/g, label: '“首先/其次/最后”' },
  { category: 'ai-structure', pattern: /(?:第一|第二|第三)[，：]/g, label: '“第一/第二/第三”' },
  { category: 'ai-structure', pattern: /(?:总之|总的来说|总体而言)[，：]/g, label: '“总之/总体而言”' },
  { category: 'ai-structure', pattern: /(?:换句话说|也就是说)[，：]/g, label: '“换句话说/也就是说”' },
  { category: 'ai-structure', pattern: /(?:与其说|不如说)[，：]/g, label: '“与其说/不如说”' },
  { category: 'ai-structure', pattern: /(?:在[^，。；\n]{0,16}层面上|从[^，。；\n]{0,16}角度来看)/g, label: '“从…角度/层面”' },
  { category: 'ai-structure', pattern: /在这一刻/g, label: '“在这一刻”' },

  // 明确的 AI/作者/写作 meta 泄露（小说正文里应为 0）
  { category: 'ai-meta', pattern: /作为(?:一个|一名)?(?:ai|AI|人工智能|语言模型)/g, label: '“作为AI/语言模型”' },
  { category: 'ai-meta', pattern: /我无法(?:继续|满足|提供|确认)/g, label: '“我无法…”' },
  { category: 'ai-meta', pattern: /抱歉[，：]/g, label: '“抱歉，”' },
  { category: 'ai-meta', pattern: /(?:本文|本段|本章|这篇文章|这段文字)/g, label: '“本文/本章/这段文字”' },
  { category: 'ai-meta', pattern: /(?:亲爱的)?(?:读者|观众)朋友|(?:读者|观众)们|作为(?:一名|一个)?(?:读者|观众)|(?:读者|观众)会(?:发现|看到|知道|明白)/g, label: '”面向读者/观众的创作口吻”' },
  { category: 'ai-meta', pattern: /第\s*[0-9０-９一二三四五六七八九十百]+\s*章/g, label: '”正文引用第N章”' },

  // Markdown 格式残留（小说正文中不应出现任何 Markdown 语法）
  { category: 'ai-formatting', pattern: /\*{3}[^\n*]+?\*{3}/g, label: '”***加粗斜体***”' },
  { category: 'ai-formatting', pattern: /\*{2}[^\n*]+?\*{2}/g, label: '”**加粗**”' },
  { category: 'ai-formatting', pattern: /(?<![*\\])\*[^\n*]+?\*(?!\*)/g, label: '”*斜体*”' },
  { category: 'ai-formatting', pattern: /~~[^\n~]+?~~/g, label: '”~~删除线~~”' },
  { category: 'ai-formatting', pattern: /`[^\n`]+?`/g, label: '”`行内代码`”' },
  { category: 'ai-formatting', pattern: /^\s{0,3}#{1,6}\s+/gm, label: '”# 标题前缀”' },
  { category: 'ai-formatting', pattern: /^\s{0,3}>\s/gm, label: '”> 引用块”' },
  { category: 'ai-formatting', pattern: /^\s{0,3}(?:[-*+]|\d{1,3}\.)\s+/gm, label: '”列表标记”' },
  { category: 'ai-formatting', pattern: /\[[^\]]+?\]\([^)]+?\)/g, label: '”[链接](url)”' },

  // AI 高频过渡连接词（段首堆砌是 AI 检测工具的核心特征之一）
  { category: 'ai-connector', pattern: /(?:^|(?<=\n))(?:然而|不过)[，,]/gm, label: '”然而/不过，”段首转折' },
  { category: 'ai-connector', pattern: /(?:^|(?<=\n))与此同时[，,]/gm, label: '”与此同时，”段首' },
  { category: 'ai-connector', pattern: /(?:^|(?<=\n))(?:此外|另外|除此之外)[，,]/gm, label: '”此外/另外，”段首' },
  { category: 'ai-connector', pattern: /(?:^|(?<=\n))(?:不仅如此|更重要的是|更为重要的是)[，,]/gm, label: '”不仅如此/更重要的是，”段首' },
  { category: 'ai-connector', pattern: /(?:^|(?<=\n))(?:事实上|实际上)[，,]/gm, label: '”事实上/实际上，”段首' },
  { category: 'ai-connector', pattern: /(?:^|(?<=\n))(?:毕竟|说到底)[，,]/gm, label: '”毕竟/说到底，”段首' },
  { category: 'ai-connector', pattern: /(?:^|(?<=\n))(?:随即|紧接着|随后)[，,]/gm, label: '”随即/紧接着，”段首' },
  { category: 'ai-connector', pattern: /(?:^|(?<=\n))(?:显然|无疑)[，,]/gm, label: '”显然/无疑，”段首' },
];

export function templatePatternsByCategory(category: TemplatePatternCategory): TemplatePatternItem[] {
  return TEMPLATE_PATTERN_LIBRARY.filter(item => item.category === category);
}

export function countTemplatePatternHits(
  text: string,
  categories?: TemplatePatternCategory[],
): Array<{ category: TemplatePatternCategory; label: string; count: number }> {
  const selected = categories && categories.length > 0
    ? TEMPLATE_PATTERN_LIBRARY.filter(item => categories.includes(item.category))
    : TEMPLATE_PATTERN_LIBRARY;

  const results = selected
    .map(item => ({ category: item.category, label: item.label, count: (text.match(item.pattern) ?? []).length }))
    .filter(item => item.count > 0)
    .sort((a, b) => b.count - a.count);

  return results;
}

export function buildTemplatePatternExampleList(params: {
  categories: TemplatePatternCategory[];
  maxItems: number;
}): string {
  const labels = TEMPLATE_PATTERN_LIBRARY
    .filter(item => params.categories.includes(item.category))
    .map(item => item.label);
  return unique(labels).slice(0, Math.max(0, params.maxItems)).join('、');
}
