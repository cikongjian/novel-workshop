import { describe, expect, it } from 'vitest';

import {
  analyzeDistributedSceneReplay,
  stripDistributedReplayedParagraphs,
} from './startup-scene-replay.js';

describe('startup scene distributed replay guard', () => {
  it('detects when a later scene replays a finished beat cluster in the middle', () => {
    const priorChapterContent = [
      '陆景川抬手示意，圣心大教堂两侧的巨幕同时亮起，婚礼现场的直播画面被同步推上了所有平台。',
      '他把手机贴近话筒，苏清雅和陆明轩的录音顺着顶级音响流淌出来，宾客席和直播间一起陷入死寂。',
      '陆振华脸色惨白地冲上礼台，吼着说录音是伪造的，陆景川却反手抛出了阳光基金的审计流水。',
      '周怀山当着所有镜头缓缓举杯，那是再明显不过的站队信号，在线人数继续疯涨。',
      '陆景川最后宣布，直播收到的打赏收益全部捐回阳光基金，这一轮公开处刑彻底落了下来。',
    ].join('\n\n');

    const currentSceneText = [
      '陆景川接过助理递来的平板，站在礼台边缘，像是要把同一出戏重新再演一遍。',
      '他再次转向镜头，强调婚礼现场已经面向全网同步直播，教堂两侧的巨幕也随之重新亮起。',
      '新的录音又一次通过顶级音响被放了出来，苏清雅和陆明轩的笑声顺着扩音器压过了整个教堂。',
      '宾客席和直播间的反应再一次炸开，所有人都盯着陆振华那张失血的脸。',
      '陆振华又一次嘶吼那是伪造，陆景川便再度把阳光基金的审计流水压回了所有镜头前。',
      '周怀山仍旧在第一排缓缓举杯，像是要把刚刚发生过的站队动作再演一轮。',
      '陆景川甚至再次宣布，直播收到的打赏收益会全部捐回阳光基金。',
      '直到助理快步上前，低声汇报云顶公寓的产权手续已经办妥，场面才真正往下一步推进。',
    ].join('\n\n');

    const report = analyzeDistributedSceneReplay(currentSceneText, priorChapterContent);
    expect(report.shouldRetry).toBe(true);
    expect(report.matchedParagraphCount).toBeGreaterThanOrEqual(3);
    expect(report.matchedRatio).toBeGreaterThanOrEqual(0.24);
  });

  it('strips repeated middle paragraphs but keeps the new hook paragraph', () => {
    const priorChapterContent = [
      '陆景川转身，',
      '他当众宣布婚礼全网直播，教堂巨幕亮起，直播间的弹幕瞬间压满了屏幕。',
      '录音一放出来，宾客席和直播间同时死寂，苏清雅和陆明轩的笑声传遍全场。',
      '陆振华吼着说伪造，陆景川随手抛出阳光基金的审计流水，把对方压得一句话都接不上。',
      '周怀山缓缓举杯站队，镜头和人群的注意力都被他这一动作钉死了。',
      '陆景川宣布把打赏收益捐给阳光基金，这一轮公开处刑到这里已经结束。',
    ].join('\n\n');

    const currentSceneText = [
      '陆景川接过助理递来的平板，顺势把动作往后接了下去。',
      '他又宣布了一遍婚礼已经面向全网直播，巨幕重新亮起，弹幕再次铺满了教堂顶端的屏幕。',
      '录音再次放出，苏清雅和陆明轩的笑声又压过了全场，宾客席又一次跟着死寂下来。',
      '陆振华再次嘶吼伪造，陆景川便再抛一遍阳光基金流水，把同一轮证据重演了一次。',
      '周怀山还是举杯站队，像把刚刚那一幕重新复制到了第二轮。',
      '陆景川再次宣布把打赏收益捐给阳光基金，这一段已经明显在回放上一场。',
      '助理低声提醒：云顶公寓的产权变更手续已经完成，苏清雅正在联系媒体反扑。',
      '陆景川听完后只说了一句“让她开”，这才把章尾真正推向新的战场。',
    ].join('\n\n');

    const result = stripDistributedReplayedParagraphs(currentSceneText, priorChapterContent);
    expect(result.removedParagraphs.length).toBeGreaterThanOrEqual(3);
    expect(result.sanitizedText).toContain('云顶公寓的产权变更手续已经完成');
    expect(result.sanitizedText).toContain('陆景川接过助理递来的平板');
    expect(result.sanitizedText).not.toContain('他又宣布了一遍婚礼已经面向全网直播');
  });

  it('does not flag a normal continuation scene with the same cast', () => {
    const priorChapterContent = [
      '沈知微和陆景珩签下协议，决定先回别墅应付明早的核查。',
      '车停在半山别墅门口，雨开始下了起来。',
    ].join('\n\n');

    const currentSceneText = [
      '别墅里冷得像样板房，沈知微拖着行李箱上楼，脚踝忽然一崴。',
      '陆景珩折返，替她处理伤口，又把核查提前的消息丢了过来。',
      '五分钟后，信托委员会的视频请求打进来，两人只能立刻并肩坐到镜头前。',
    ].join('\n\n');

    const report = analyzeDistributedSceneReplay(currentSceneText, priorChapterContent);
    expect(report.shouldRetry).toBe(false);
    expect(report.matchedParagraphCount).toBe(0);
  });
});
