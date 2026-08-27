/**
 * 工作台欢迎标语生成 —— 按时段 + 按天轮换，避免每次进入都是同一组文案。
 * 同一天同一时段返回同一组（稳定不跳变），跨时段 / 跨天自动换新句。
 * 每组含 headline（接在「笔名，」之后）与 note（下方小标语），配套成对。
 */

type TimeBucket = 'morning' | 'noon' | 'afternoon' | 'evening' | 'night';

/** 一组问候语：headline 接在「笔名，」之后，note 是下方小标语，两者配套成对 */
export type GreetingSet = { headline: string; note: string };

/** 各时段文案池（headline + note 配套成对，按时段 + 按天轮换） */
const GREETING_POOL: Record<TimeBucket, GreetingSet[]> = {
  morning: [
    { headline: '灵感来了吗？', note: '随时续写你的故事，读者正在等更新。' },
    { headline: '新的一天，故事从哪里开始？', note: '一杯咖啡的时间，足够写好开篇。' },
    { headline: '清晨的字最干净，趁手热写两段吧。', note: '今天哪怕只写五百字，也是前进。' },
    { headline: '今天打算写多少字？', note: '定个小目标，先把上一章收个尾。' },
  ],
  noon: [
    { headline: '午后的茶，配一段新剧情正好。', note: '休息够了，就让主角继续冒险。' },
    { headline: '中午小憩前，先把上一章存个稿。', note: '存稿多一点，更新才不慌。' },
    { headline: '趁午休，把大纲理一理吧。', note: '想清楚后面三章，下笔会更顺。' },
  ],
  afternoon: [
    { headline: '笔别停，主角正等你推进剧情。', note: '读者刚刷新过，别让他们空手而归。' },
    { headline: '趁阳光正好，再写一章如何？', note: '一口气写完的场景，往往最流畅。' },
    { headline: '下午的灵感，常藏在第三个段落里。', note: '写不下去时，先让角色开口说句话。' },
  ],
  evening: [
    { headline: '夜色温柔，正适合码字。', note: '这是很多人灵感最盛的时段。' },
    { headline: '今晚的故事，打算写到第几章？', note: '定个停笔点，比硬撑更有效率。' },
    { headline: '键盘声里，藏着另一个世界。', note: '别管草稿多糟，先写下来再说。' },
  ],
  night: [
    { headline: '夜深了，别熬太晚。', note: '写完这段就休息吧，明天还有灵感。' },
    { headline: '灵感深夜最活跃，但身体要紧。', note: '好故事不差这一晚，早些睡。' },
    { headline: '再写一段，就早点休息吧。', note: '记得保存，然后关掉那盏灯。' },
  ],
};

/** 按小时映射到时段桶 */
function resolveBucket(hour: number): TimeBucket {
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 14) return 'noon';
  if (hour >= 14 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 23) return 'evening';
  return 'night';
}

/** 一年中的第几天（1-366），用作按天轮换的稳定种子 */
function getDayOfYear(date: Date): number {
  const start = Date.UTC(date.getFullYear(), 0, 0);
  const current = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.floor((current - start) / 86_400_000);
}

/**
 * 返回当前时段的一组问候语（headline + note）。
 * 以「一年中的第几天」对当前时段文案池取模，保证同一天同时段稳定、跨天轮换。
 */
export function getGreeting(now: Date = new Date()): GreetingSet {
  const pool = GREETING_POOL[resolveBucket(now.getHours())];
  const dayOfYear = getDayOfYear(now);
  return pool[((dayOfYear % pool.length) + pool.length) % pool.length];
}
