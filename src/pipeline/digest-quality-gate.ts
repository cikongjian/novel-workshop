/**
 * 章节摘要质量门禁
 *
 * 检测摘要是否遗漏了章节中的关键信息：
 * - 角色名出现在正文但未出现在摘要
 * - 关键事件词（死亡、战斗、发现、背叛等）在正文出现但摘要未提及
 * - 地点转换未记录
 * - 摘要长度与正文比例过低
 */

export type DigestQualityResult = {
  score: number;           // 0-100
  missingCharacters: string[];
  missingEvents: string[];
  missingLocations: string[];
  warnings: string[];
  pass: boolean;
};

const KEY_EVENT_WORDS = [
  '死', '亡', '殒命', '牺牲', '阵亡',
  '突破', '晋级', '升级', '觉醒', '进化',
  '背叛', '叛变', '反水', '倒戈',
  '发现', '揭露', '真相', '秘密',
  '结盟', '联盟', '合作', '联手',
  '战争', '开战', '宣战', '入侵',
  '婚', '订婚', '成亲',
  '怀孕', '生子', '诞生',
  '失踪', '消失', '被困',
  '获得', '得到', '夺取', '继承',
];

const LOCATION_MARKERS = [
  '来到', '抵达', '进入', '离开', '前往', '回到', '踏入', '走进', '飞往',
];

/**
 * 评估摘要质量：对比正文与摘要，检测遗漏的关键信息。
 */
export function evaluateDigestQuality(
  chapterContent: string,
  digest: string,
  knownCharacterNames: string[],
): DigestQualityResult {
  const warnings: string[] = [];
  let score = 100;

  // 1. 角色覆盖检查
  const contentChars = knownCharacterNames.filter(name =>
    name.length >= 2 && chapterContent.includes(name),
  );
  const missingCharacters = contentChars.filter(name => !digest.includes(name));
  // 仅惩罚出现 3 次以上的重要角色遗漏
  const significantMissing = missingCharacters.filter(name => {
    const count = chapterContent.split(name).length - 1;
    return count >= 3;
  });
  if (significantMissing.length > 0) {
    score -= significantMissing.length * 8;
    warnings.push(
      `摘要遗漏了${significantMissing.length}个重要角色：${significantMissing.join('、')}`,
    );
  }

  // 2. 关键事件检查
  const missingEvents: string[] = [];
  for (const word of KEY_EVENT_WORDS) {
    if (chapterContent.includes(word) && !digest.includes(word)) {
      // 仅当事件词出现 2 次以上（非一笔带过）才视为遗漏
      const count = chapterContent.split(word).length - 1;
      if (count >= 2) {
        missingEvents.push(word);
      }
    }
  }
  if (missingEvents.length > 0) {
    score -= missingEvents.length * 5;
    warnings.push(`摘要可能遗漏关键事件：${missingEvents.join('、')}`);
  }

  // 3. 地点转换检查
  const missingLocations: string[] = [];
  for (const marker of LOCATION_MARKERS) {
    const regex = new RegExp(marker + '([\\u4e00-\\u9fff]{2,6})', 'g');
    let match;
    while ((match = regex.exec(chapterContent)) !== null) {
      const location = match[1];
      if (location.length >= 2 && !digest.includes(location)) {
        if (!missingLocations.includes(location)) {
          missingLocations.push(location);
        }
      }
    }
  }
  // 仅当多个地点转换被遗漏时才警告
  if (missingLocations.length >= 2) {
    score -= 5;
    warnings.push(
      `摘要可能遗漏地点转换：${missingLocations.slice(0, 3).join('、')}`,
    );
  }

  // 4. 摘要长度比例检查
  const ratio = digest.length / chapterContent.length;
  if (ratio < 0.02) {
    score -= 15;
    warnings.push(
      `摘要过短（仅占正文${(ratio * 100).toFixed(1)}%），可能信息不足`,
    );
  }

  score = Math.max(0, Math.min(100, score));

  return {
    score,
    missingCharacters: significantMissing,
    missingEvents,
    missingLocations,
    warnings,
    pass: score >= 60,
  };
}

