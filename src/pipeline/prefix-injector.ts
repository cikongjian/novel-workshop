import type { ChapterOutline, Scene } from '../novel/types.js';

/**
 * 前缀注入器
 * 在关键节点强制插入题材专属的"前缀"，引导 LLM 进入正确模式
 */
export class PrefixInjector {
  // 甜宠文前缀库
  private sweetPrefixes = {
    sceneStart: [
      '他的视线落在她身上，停留了片刻。',
      '空气里的温度似乎上升了几度。',
      '她下意识地避开他的目光。',
      '两人之间的距离，近得能听到彼此的呼吸。',
      '他靠近了一步，她的心跳漏了半拍。',
    ],
    dialogue: [
      '他的语气比平时温和了些。',
      '她听出了他话里的关心。',
      '他的声音低沉，带着她不熟悉的温柔。',
    ],
    chapterEnd: [
      '他忽然意识到，自己开始期待见到她了。',
      '她转身时，心跳快了半拍。',
      '他盯着她的背影，久久没有移开视线。',
      '从今天起，他们的关系再也回不到从前了。',
      '她闭上眼睛，脑海里全是他的样子。',
    ],
  };

  // 升级文前缀库
  private upgradePrefixes = {
    sceneStart: [
      '丹田中的灵气开始沸腾。',
      '他握紧拳头，感受着体内暴涨的力量。',
      '一股强大的气息从他身上爆发。',
    ],
    chapterEnd: [
      '前方山谷，一株千年灵芝散发着七彩光芒。',
      '一道更强的气息锁定了他——金丹期！',
      '丹田中的灵气开始沸腾，金丹...要凝了！',
      '宗门大比第一名的奖励：进入藏经阁第三层！',
    ],
  };

  // 职场文前缀库
  private careerPrefixes = {
    sceneStart: [
      '会议室的门被推开。',
      '她打开电脑，开始准备反击。',
      '客户的目光在她和对手之间来回扫视。',
    ],
    chapterEnd: [
      '明天，她要去见那个传说中从不见人的神秘客户。',
      '总部来电：集团副总裁想见她。',
      '这个项目拿下，她就能组建自己的团队了。',
      '她看着那份陷害她的黑材料，嘴角上扬：该反击了。',
    ],
  };

  // 美食文前缀库
  private foodPrefixes = {
    sceneStart: [
      '她挽起袖子，开始洗菜。',
      '灶台上的油锅烧至七成热。',
      '香气从厨房飘出，引来了围观。',
    ],
    chapterEnd: [
      '明天，县太爷要她做满汉全席。',
      '镇上第一酒楼的大厨，要和她比试厨艺。',
      '这笔钱够了，她可以盘下那间临街铺子了。',
      '后山竟然有野生菌菇，做成菜一定绝了。',
    ],
  };

  /**
   * 为大纲注入前缀
   */
  injectPrefix(outline: ChapterOutline, constitutionTags: string[]): ChapterOutline {
    // 判断题材
    const genre = this.detectGenre(constitutionTags);
    if (!genre) return outline;

    // 深拷贝 outline，避免修改原对象
    const enhanced: ChapterOutline = JSON.parse(JSON.stringify(outline));

    // 在第一个 beat 的 summary 前插入场景开始前缀
    if (enhanced.beats && enhanced.beats.length > 0) {
      const firstBeat = enhanced.beats[0];
      const scenePrefix = this.getSceneStartPrefix(genre);
      if (scenePrefix) {
        firstBeat.summary = `${scenePrefix}\n\n${firstBeat.summary}`;
      }
    }

    // 在最后一个 beat 的 summary 后插入章末钩子前缀
    if (enhanced.beats && enhanced.beats.length > 0) {
      const lastBeat = enhanced.beats[enhanced.beats.length - 1];
      const endPrefix = this.getChapterEndPrefix(genre);
      if (endPrefix) {
        lastBeat.summary = `${lastBeat.summary}\n\n章节必须以以下方式结尾：${endPrefix}`;
      }
    }

    return enhanced;
  }

  /**
   * 检测题材
   */
  private detectGenre(constitutionTags: string[]): 'sweet' | 'upgrade' | 'career' | 'food' | null {
    if (constitutionTags.includes('sweet')) return 'sweet';
    if (constitutionTags.includes('upgrade') || constitutionTags.includes('fantasy-upgrade')) return 'upgrade';
    if (constitutionTags.includes('female-career')) return 'career';
    if (constitutionTags.includes('food-business')) return 'food';
    return null;
  }

  /**
   * 获取场景开始前缀
   */
  private getSceneStartPrefix(genre: 'sweet' | 'upgrade' | 'career' | 'food'): string | null {
    switch (genre) {
      case 'sweet':
        return this.randomChoice(this.sweetPrefixes.sceneStart);
      case 'upgrade':
        return this.randomChoice(this.upgradePrefixes.sceneStart);
      case 'career':
        return this.randomChoice(this.careerPrefixes.sceneStart);
      case 'food':
        return this.randomChoice(this.foodPrefixes.sceneStart);
      default:
        return null;
    }
  }

  /**
   * 获取章末前缀
   */
  private getChapterEndPrefix(genre: 'sweet' | 'upgrade' | 'career' | 'food'): string | null {
    switch (genre) {
      case 'sweet':
        return this.randomChoice(this.sweetPrefixes.chapterEnd);
      case 'upgrade':
        return this.randomChoice(this.upgradePrefixes.chapterEnd);
      case 'career':
        return this.randomChoice(this.careerPrefixes.chapterEnd);
      case 'food':
        return this.randomChoice(this.foodPrefixes.chapterEnd);
      default:
        return null;
    }
  }

  /**
   * 随机选择
   */
  private randomChoice<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
  }
}
