import { describe, expect, it } from 'vitest';
import { parseChapterDigest } from './digest-types.js';

describe('parseChapterDigest', () => {
  it('parses strict JSON digest output', () => {
    const digest = parseChapterDigest(JSON.stringify({
      plotSummary: '许知夏守住活动室，招新名单没有外流。',
      keyEvents: ['许知夏守住活动室', '招新名单被重新确认'],
      characterStateChanges: [{ name: '许知夏', change: '从被动解释转为主动控场' }],
      worldStateChanges: [{ entity: '活动室', change: '成为社团公开协商地点' }],
      unresolvedThreads: ['名单泄露者仍未确认'],
      causalLinks: [{ fromChapter: 3, event: '名单争议', effect: '本章公开协商' }],
    }));

    expect(digest).toEqual({
      plotSummary: '许知夏守住活动室，招新名单没有外流。',
      keyEvents: ['许知夏守住活动室', '招新名单被重新确认'],
      characterStateChanges: [{ name: '许知夏', change: '从被动解释转为主动控场' }],
      worldStateChanges: [{ entity: '活动室', change: '成为社团公开协商地点' }],
      unresolvedThreads: ['名单泄露者仍未确认'],
      causalLinks: [{ fromChapter: 3, event: '名单争议', effect: '本章公开协商' }],
    });
  });

  it('parses fenced JSON with trailing prose', () => {
    const digest = parseChapterDigest(`
\`\`\`json
{
  "plotSummary": "沈砚拿到虎符，女帝借此试探门阀。",
  "keyEvents": ["沈砚接下虎符"],
  "characterStateChanges": [{"name": "沈砚", "change": "被卷入兵权博弈"}],
  "worldStateChanges": [],
  "unresolvedThreads": ["女帝真正意图未明"],
  "causalLinks": [{"fromChapter": 8, "event": "门阀逼宫", "effect": "女帝转向兵权制衡"}]
}
\`\`\`
以上为本章摘要。
`);

    expect(digest?.plotSummary).toBe('沈砚拿到虎符，女帝借此试探门阀。');
    expect(digest?.causalLinks[0]).toEqual({
      fromChapter: 8,
      event: '门阀逼宫',
      effect: '女帝转向兵权制衡',
    });
  });

  it('extracts the first balanced JSON object from prefixed and suffixed text', () => {
    const digest = parseChapterDigest(`摘要如下：{
      "plotSummary": "摊主在破庙岔道口卖出十六碗汤面，老客说明天还来。",
      "events": ["十六碗汤面售罄", "老客提出复购"],
      "characters": [{"character": "摊主", "status": "确认破庙岔道口有稳定客流"}],
      "world": [{"target": "破庙岔道口", "change": "从临时摊点变成可复用客源点"}],
      "threads": ["隔壁摊是否压价"],
      "links": [{"chapter": "0", "cause": "汤面售罄", "result": "复购预期形成"}]
    } 后续不要写入数据库。`);

    expect(digest).toMatchObject({
      plotSummary: '摊主在破庙岔道口卖出十六碗汤面，老客说明天还来。',
      keyEvents: ['十六碗汤面售罄', '老客提出复购'],
      characterStateChanges: [{ name: '摊主', change: '确认破庙岔道口有稳定客流' }],
      worldStateChanges: [{ entity: '破庙岔道口', change: '从临时摊点变成可复用客源点' }],
      unresolvedThreads: ['隔壁摊是否压价'],
      causalLinks: [{ fromChapter: 0, event: '汤面售罄', effect: '复购预期形成' }],
    });
  });

  it('keeps braces inside strings from ending extraction early', () => {
    const digest = parseChapterDigest(`{
      "plotSummary": "屏幕显示 {LOCKED}，飞船仍未解除静默。",
      "keyEvents": ["船员看到 {LOCKED} 提示"],
      "characterStateChanges": [],
      "worldStateChanges": [],
      "unresolvedThreads": [],
      "causalLinks": []
    } trailing`);

    expect(digest?.plotSummary).toBe('屏幕显示 {LOCKED}，飞船仍未解除静默。');
  });

  it('repairs common malformed JSON digest output', () => {
    const digest = parseChapterDigest(`{
      plotSummary: '林栀把旧星星和新星星并排放下，顾砚舟在门缝外停住。',
      keyEvents: ['林栀并排放下两枚星星', '顾砚舟停在卧室门缝外'],
      characterStateChanges: [{ name: '林栀', change: '从配合直播转为主动确认关系' }],
      worldStateChanges: [],
      unresolvedThreads: ['刻刀还没有被拿起'],
      causalLinks: [{ fromChapter: 22, event: '直播前约定', effect: '本章关系确认推进' }],
    }`);

    expect(digest?.plotSummary).toContain('旧星星和新星星');
    expect(digest?.keyEvents).toContain('林栀并排放下两枚星星');
  });

  it('repairs unclosed digest JSON and preserves salvageable fields', () => {
    const digest = parseChapterDigest(`{
      "plotSummary": "Court ledger pressure turns into a private-store counterattack.",
      "keyEvents": [
        "The queen raises the grain ledger in court.",
        "The general answers with testimony about the private storehouse."
      ],
      "characterStateChanges": [
        {
          "name": "General Shen",
          "change": "He refuses to explain his wound and accepts a tighter deadline."
        }
      ],
    `);

    expect(digest).toMatchObject({
      plotSummary: 'Court ledger pressure turns into a private-store counterattack.',
      keyEvents: [
        'The queen raises the grain ledger in court.',
        'The general answers with testimony about the private storehouse.',
      ],
      characterStateChanges: [{
        name: 'General Shen',
        change: 'He refuses to explain his wound and accepts a tighter deadline.',
      }],
    });
  });

  it('returns null when no JSON object candidate exists', () => {
    expect(parseChapterDigest('只有说明文字')).toBeNull();
  });
});
