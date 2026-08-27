import type { NovelGenre } from '../novel/types.js';
import type { PublishingAudience, PublishingPace, PublishingPlatform, PublishingTrackedSource } from './publishing-types.js';

type PlatformProfile = {
  platformName: string;
  positioning: string;
  bestFor: string[];
  cautions: string[];
  trackedSources: PublishingTrackedSource[];
  trafficScore: number;
  newcomerSupportScore: number;
  longformScore: number;
  commercialScore: number;
  genreWeights: Record<NovelGenre, number>;
  audienceWeights: Record<PublishingAudience, number>;
  paceWeights: Record<PublishingPace, number>;
  tagWeights: Record<string, number>;
  chapterWeights: {
    coldStart: number;
    serializing: number;
    longform: number;
  };
};

export const PLATFORM_ORDER: PublishingPlatform[] = ['fanqie', 'qimao', 'qidian', 'jjwxc', 'zongheng'];

export const PLATFORM_PROFILES: Record<PublishingPlatform, PlatformProfile> = {
  fanqie: {
    platformName: '番茄小说',
    positioning: '免费大盘流量强，适合高钩子、强追更、强情绪或强爽点题材。',
    bestFor: ['大众爽文冷启动', '短剧感强的故事', '追更驱动型新书'],
    cautions: ['慢热铺垫过长时首轮流量容易掉', '开篇点击率与读完率要求高'],
    trackedSources: [
      { title: '番茄作者专区', url: 'https://fanqienovel.com/writer/zone' },
      { title: '番茄作者福利公告', url: 'https://fanqienovel.com/writer/zone/article/7513880852728643608' },
    ],
    trafficScore: 10,
    newcomerSupportScore: 9,
    longformScore: 5,
    commercialScore: 8,
    genreWeights: { fantasy: 7, mystery: 8, modern: 9, scifi: 7, historical: 6, romance: 8, custom: 5 },
    audienceWeights: { male: 8, female: 8, general: 7 },
    paceWeights: { fast: 9, medium: 6, slow: 2 },
    tagWeights: { 'short-drama': 8, 'female-emotion': 5, 'male-upgrade': 5, suspense: 5, 'free-commercial': 7, worldbuilding: 1, literary: -2, cp: 4 },
    chapterWeights: { coldStart: 7, serializing: 6, longform: 2 },
  },
  qimao: {
    platformName: '七猫小说',
    positioning: '免费阅读盘子大，福利和活动比较清晰，适合商业化强的新书。',
    bestFor: ['免费分发', '新人福利活动', '商业化题材验证'],
    cautions: ['需要较明确卖点', '题材不够商业时放量有限'],
    trackedSources: [
      { title: '七猫公告', url: 'https://www.qimao.com/gonggao/' },
      { title: '七猫作者动态', url: 'https://www.qimao.com/gonggao/67a707b587cbf96400391711/' },
    ],
    trafficScore: 8,
    newcomerSupportScore: 8,
    longformScore: 5,
    commercialScore: 9,
    genreWeights: { fantasy: 7, mystery: 8, modern: 8, scifi: 6, historical: 6, romance: 7, custom: 5 },
    audienceWeights: { male: 7, female: 7, general: 7 },
    paceWeights: { fast: 8, medium: 6, slow: 3 },
    tagWeights: { 'short-drama': 7, 'female-emotion': 4, 'male-upgrade': 4, suspense: 5, 'free-commercial': 8, worldbuilding: 2, literary: -2, cp: 3 },
    chapterWeights: { coldStart: 6, serializing: 6, longform: 3 },
  },
  qidian: {
    platformName: '起点中文网',
    positioning: '男频长线付费和精品化能力强，更适合世界观和长篇成长线。',
    bestFor: ['长篇世界观', '升级体系完整的男频', '长期订阅/IP路线'],
    cautions: ['纯冷启动不一定快', '慢热可行但要求稳定更新和结构完整'],
    trackedSources: [
      { title: '起点中文网', url: 'https://www.qidian.com/' },
      { title: '起点排行榜', url: 'https://www.qidian.com/rank/' },
    ],
    trafficScore: 7,
    newcomerSupportScore: 5,
    longformScore: 10,
    commercialScore: 8,
    genreWeights: { fantasy: 9, mystery: 6, modern: 6, scifi: 8, historical: 8, romance: 3, custom: 5 },
    audienceWeights: { male: 9, female: 3, general: 6 },
    paceWeights: { fast: 5, medium: 7, slow: 8 },
    tagWeights: { 'short-drama': -3, 'female-emotion': -2, 'male-upgrade': 8, suspense: 3, 'free-commercial': 1, worldbuilding: 9, literary: 2, cp: -1 },
    chapterWeights: { coldStart: 2, serializing: 5, longform: 8 },
  },
  jjwxc: {
    platformName: '晋江文学城',
    positioning: '女频细分读者强，适合关系驱动、情绪浓度高、CP感强的作品。',
    bestFor: ['言情/耽美/女频', '角色关系驱动', '社区讨论和养粉'],
    cautions: ['典型男频升级流不占优', '题材和语感需要更贴站内读者'],
    trackedSources: [
      { title: '晋江关于我们', url: 'https://www.jjwxc.net/aboutus/' },
      { title: '晋江首页', url: 'https://www.jjwxc.net/' },
    ],
    trafficScore: 6,
    newcomerSupportScore: 6,
    longformScore: 6,
    commercialScore: 7,
    genreWeights: { fantasy: 5, mystery: 5, modern: 7, scifi: 4, historical: 7, romance: 10, custom: 5 },
    audienceWeights: { male: 1, female: 10, general: 6 },
    paceWeights: { fast: 5, medium: 8, slow: 7 },
    tagWeights: { 'short-drama': -1, 'female-emotion': 9, 'male-upgrade': -5, suspense: 2, 'free-commercial': 0, worldbuilding: 2, literary: 4, cp: 10 },
    chapterWeights: { coldStart: 4, serializing: 5, longform: 5 },
  },
  zongheng: {
    platformName: '纵横中文网',
    positioning: '偏男频的长篇与商业化平衡位，适合想兼顾自有订阅与免费分发的作品。',
    bestFor: ['男频长篇', '稳定连载', '纵横+七猫渠道联动'],
    cautions: ['大盘流量不如番茄', '强女频题材不如晋江垂直'],
    trackedSources: [
      { title: '纵横作者福利', url: 'https://doc.zongheng.com/welfare/zongheng' },
      { title: '纵横中文网', url: 'https://www.zongheng.com/' },
    ],
    trafficScore: 6,
    newcomerSupportScore: 7,
    longformScore: 8,
    commercialScore: 7,
    genreWeights: { fantasy: 8, mystery: 6, modern: 6, scifi: 7, historical: 7, romance: 4, custom: 5 },
    audienceWeights: { male: 8, female: 4, general: 6 },
    paceWeights: { fast: 6, medium: 7, slow: 6 },
    tagWeights: { 'short-drama': 1, 'female-emotion': 1, 'male-upgrade': 6, suspense: 4, 'free-commercial': 4, worldbuilding: 5, literary: 1, cp: 0 },
    chapterWeights: { coldStart: 4, serializing: 6, longform: 7 },
  },
};
