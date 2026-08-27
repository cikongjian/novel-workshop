import type { NovelGenre } from '../novel/types.js';
import type { NovelManager } from '../novel/novel-manager.js';
import type { TrendsSnapshot, TrendsSourceHighlight } from '../trends/trends-types.js';
import type { TrendsService } from '../trends/trends-service.js';
import { PLATFORM_ORDER, PLATFORM_PROFILES } from './platform-profiles.js';
import { buildPublishingSignals } from './publishing-signals.js';
import type {
  PublishingActionGuide,
  PublishingCopyVariant,
  DraftPublishingRecommendationBody,
  PublishingOverview,
  PublishingPortfolioProfile,
  PublishingPlatform,
  PublishingPlatformIntel,
  PublishingPlatformScore,
  PublishingRecommendation,
  PublishingRecommendationResponse,
  PublishingSourceHighlight,
} from './publishing-types.js';

const GENRE_ALIASES: Record<NovelGenre, string[]> = {
  fantasy: ['玄幻', '奇幻', '仙侠', 'fantasy'],
  mystery: ['悬疑', '推理', '怪谈', 'mystery'],
  modern: ['都市', '现实', '现代', 'modern'],
  scifi: ['科幻', '星际', '机甲', 'scifi'],
  historical: ['历史', '古言', '朝堂', 'historical'],
  romance: ['言情', '恋爱', 'romance', 'cp'],
  custom: [],
};

function includesAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword.toLowerCase()));
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function getConfidence(first: number, second: number, usingFallback: boolean): PublishingRecommendation['confidence'] {
  const gap = first - second;
  if (!usingFallback && gap >= 12) return 'high';
  if (gap >= 6) return 'medium';
  return 'low';
}

function toSourceHighlight(item: TrendsSourceHighlight): PublishingSourceHighlight {
  return {
    title: item.title,
    url: item.url,
    query: item.query,
    snippet: item.snippet,
    signalType: item.signalType,
    fetchedAt: item.fetchedAt,
  };
}

export class PublishingAdvisorService {
  constructor(
    private readonly novelManager: NovelManager,
    private readonly trendsService?: TrendsService,
  ) {}

  async recommendDraft(input: DraftPublishingRecommendationBody): Promise<PublishingRecommendationResponse> {
    const snapshot = await this.trendsService?.getLatest() ?? null;
    const portfolio = await this.buildPortfolioProfile();
    return this.buildRecommendation(input, snapshot, portfolio);
  }

  async recommendNovel(novelId: string): Promise<PublishingRecommendationResponse> {
    const novel = await this.novelManager.getNovel(novelId);
    let chapterCount = novel.chapterCount ?? novel.finalizedChapterCount ?? 0;
    if (!chapterCount) {
      chapterCount = (await this.novelManager.listChapters(novelId)).length;
    }
    const snapshot = await this.trendsService?.getLatest() ?? null;
    const portfolio = await this.buildPortfolioProfile();
    const result = this.buildRecommendation({
      title: novel.title,
      genre: novel.genre,
      synopsis: novel.synopsis || novel.description,
      targetChapters: novel.targetChapters,
      chapterCount,
    }, snapshot, portfolio);
    await this.novelManager.updateNovel(novelId, {
      publishingRecommendation: result,
    } as Partial<typeof novel>);
    return result;
  }

  async getSavedRecommendation(novelId: string): Promise<PublishingRecommendationResponse | null> {
    const novel = await this.novelManager.getNovel(novelId);
    return (novel.publishingRecommendation as PublishingRecommendationResponse | undefined) ?? null;
  }

  async clearSavedRecommendation(novelId: string): Promise<void> {
    await this.novelManager.updateNovel(novelId, {
      publishingRecommendation: undefined,
    } as Record<string, unknown>);
  }

  private buildRecommendation(
    input: DraftPublishingRecommendationBody,
    snapshot: TrendsSnapshot | null,
    portfolio: PublishingPortfolioProfile | null,
  ): PublishingRecommendationResponse {
    const overview = this.buildOverview(snapshot);
    const signals = buildPublishingSignals(input);
    const scores = PLATFORM_ORDER.map((platform) => this.scorePlatform(platform, signals, snapshot, portfolio));
      
    scores.sort((left, right) => right.totalScore - left.totalScore);
    const primary = scores[0];
    const second = scores[1] ?? scores[0];
    const primaryIntel = overview.platforms.find((item) => item.platform === primary.platform) ?? overview.platforms[0];

    const reasons = [
      `${primary.platformName}当前更适合${signals.audience === 'female' ? '女频/情绪关系' : signals.audience === 'male' ? '男频/升级爽点' : '大众向'}表达。`,
      `${primary.platformName}对${this.describePace(signals.pace)}节奏内容更友好。`,
      ...(primary.fitTags.slice(0, 2).map((tag) => `作品信号与${primary.platformName}的“${tag}”偏好吻合。`)),
    ].slice(0, 4);

    const risks = [
      primaryIntel.caution,
      ...(signals.pace === 'slow' && (primary.platform === 'fanqie' || primary.platform === 'qimao')
        ? ['如果开篇节奏偏慢，建议重写前三章钩子。']
        : []),
      ...(signals.audience === 'male' && primary.platform === 'jjwxc'
        ? ['若走晋江，需要显著强化人物关系与社区讨论点。']
        : []),
    ].slice(0, 3);

    const recommendation: PublishingRecommendation = {
      primaryPlatform: primary.platform,
      primaryPlatformName: primary.platformName,
      confidence: getConfidence(primary.totalScore, second.totalScore, overview.usingFallback),
      reasons,
      risks,
      matchedSignals: [`题材：${input.genre}`, `受众：${signals.audience}`, `节奏：${signals.pace}`, ...signals.tags.slice(0, 4)],
      scoreBreakdown: scores,
      basedOnSnapshotAt: overview.updatedAt,
      usingFallback: overview.usingFallback,
    };

    const actionGuide = this.buildActionGuide(primary.platform, signals);
    const copyVariants = scores
      .slice(0, 3)
      .map((item) => this.buildCopyVariant(item.platform, input, signals));

    return { overview, signals, portfolio, recommendation, actionGuide, copyVariants };
  }

  private buildOverview(snapshot: TrendsSnapshot | null): PublishingOverview {
    const usingFallback = !snapshot;
    return {
      updatedAt: snapshot?.analysis.analyzedAt ?? null,
      usingFallback,
      platforms: PLATFORM_ORDER.map((platform) => this.buildPlatformIntel(platform, snapshot)),
    };
  }

  private buildPlatformIntel(platform: PublishingPlatform, snapshot: TrendsSnapshot | null): PublishingPlatformIntel {
    const profile = PLATFORM_PROFILES[platform];
    const analysis = snapshot?.analysis.platforms.find((item) => item.platform === platform);
    const sourceHighlights = (snapshot?.sourceHighlights ?? [])
      .filter((item) => item.platformHints.includes(platform))
      .slice(0, 3)
      .map(toSourceHighlight);

    return {
      platform,
      platformName: profile.platformName,
      summary: analysis?.keyInsight || profile.positioning,
      topGenres: analysis?.topGenres.slice(0, 3).map((item) => item.genre) ?? [],
      topThemes: analysis?.topThemes.slice(0, 4).map((item) => item.theme) ?? [],
      bestFor: profile.bestFor,
      caution: profile.cautions[0] ?? '',
      trafficScore: profile.trafficScore,
      newcomerSupportScore: profile.newcomerSupportScore,
      longformScore: profile.longformScore,
      commercialScore: profile.commercialScore,
      sourceHighlights,
      trackedSources: profile.trackedSources,
    };
  }

  private scorePlatform(
    platform: PublishingPlatform,
    signals: ReturnType<typeof buildPublishingSignals>,
    snapshot: TrendsSnapshot | null,
    portfolio: PublishingPortfolioProfile | null,
  ): PublishingPlatformScore {
    const profile = PLATFORM_PROFILES[platform];
    const fitTags: string[] = [];
    let baseScore = 25;

    baseScore += profile.genreWeights[signals.genre];
    fitTags.push(`题材匹配`);
    baseScore += profile.audienceWeights[signals.audience];
    fitTags.push(`受众匹配`);
    baseScore += profile.paceWeights[signals.pace];
    fitTags.push(`节奏匹配`);

    for (const tag of signals.tags) {
      const weight = profile.tagWeights[tag] ?? 0;
      if (weight !== 0) {
        baseScore += weight;
        if (weight > 0) fitTags.push(tag);
      }
    }

    const chapterBucket = signals.chapterCount >= 80 || (signals.targetChapters ?? 0) >= 180
      ? 'longform'
      : signals.chapterCount >= 12
        ? 'serializing'
        : 'coldStart';
    baseScore += profile.chapterWeights[chapterBucket];
    fitTags.push(chapterBucket === 'longform' ? '长篇潜力' : chapterBucket === 'serializing' ? '连载阶段' : '新书冷启动');

    const portfolioBoost = this.computePortfolioBoost(platform, signals, portfolio);
    const trendBoost = this.computeTrendBoost(platform, signals.genre, signals.tags, snapshot);
    const policyBoost = this.computePolicyBoost(platform, snapshot);

    return {
      platform,
      platformName: profile.platformName,
      totalScore: clampScore(baseScore + portfolioBoost + trendBoost + policyBoost),
      baseScore: clampScore(baseScore),
      portfolioBoost,
      trendBoost,
      policyBoost,
      fitTags: [...new Set(fitTags)].slice(0, 6),
    };
  }

  private computePortfolioBoost(
    platform: PublishingPlatform,
    signals: ReturnType<typeof buildPublishingSignals>,
    portfolio: PublishingPortfolioProfile | null,
  ): number {
    if (!portfolio || portfolio.sampleCount < 2) return 0;
    let boost = 0;
    const profile = PLATFORM_PROFILES[platform];
    if (portfolio.dominantGenres.includes(signals.genre)) {
      boost += 2;
    }
    if (portfolio.dominantAudience === signals.audience) {
      boost += Math.max(1, Math.round(profile.audienceWeights[signals.audience] / 4));
    }
    if (portfolio.dominantPace === signals.pace) {
      boost += Math.max(1, Math.round(profile.paceWeights[signals.pace] / 4));
    }
    const sharedTags = signals.tags.filter((tag) => portfolio.dominantTags.includes(tag));
    boost += Math.min(4, sharedTags.length * 2);
    return Math.min(12, boost);
  }

  private computeTrendBoost(platform: PublishingPlatform, genre: NovelGenre, tags: string[], snapshot: TrendsSnapshot | null): number {
    const analysis = snapshot?.analysis.platforms.find((item) => item.platform === platform);
    if (!analysis) return 0;

    let boost = 0;
    const genreKeywords = GENRE_ALIASES[genre].map((item) => item.toLowerCase());
    for (const item of analysis.topGenres.slice(0, 4)) {
      const genreText = item.genre.toLowerCase();
      if (includesAny(genreText, genreKeywords) || includesAny(item.description.toLowerCase(), genreKeywords)) {
        boost += Math.max(3, 9 - item.rank * 2);
        if (item.trend === 'rising') boost += 2;
      }
    }

    const themeText = analysis.topThemes.map((item) => `${item.theme} ${item.examples.join(' ')}`.toLowerCase()).join(' ');
    for (const tag of tags) {
      const aliases = GENRE_ALIASES[genre].concat(tag.replace(/-/g, ' '));
      if (includesAny(themeText, aliases.map((item) => item.toLowerCase()))) {
        boost += 2;
      }
    }
    return Math.min(18, boost);
  }

  private computePolicyBoost(platform: PublishingPlatform, snapshot: TrendsSnapshot | null): number {
    const hits = (snapshot?.sourceHighlights ?? []).filter((item) =>
      item.platformHints.includes(platform) && item.signalType === 'policy',
    );
    if (hits.length === 0) return 0;
    return Math.min(10, hits.length * 2);
  }

  private describePace(pace: ReturnType<typeof buildPublishingSignals>['pace']): string {
    switch (pace) {
      case 'fast': return '高钩子';
      case 'slow': return '慢热铺陈';
      default: return '中速推进';
    }
  }

  private buildActionGuide(
    platform: PublishingPlatform,
    signals: ReturnType<typeof buildPublishingSignals>,
  ): PublishingActionGuide {
    const commonChecklist = [
      '先确认书名、简介、前三章钩子是否围绕目标平台读者偏好展开。',
      '保持新书期稳定更新，避免断更导致首轮推荐衰减。',
      '投前检查题材标签、封面、简介关键词是否和核心卖点一致。',
    ];

    if (platform === 'fanqie') {
      return {
        submissionChecklist: [
          ...commonChecklist,
          '重点检查前 1-3 章是否在第一页就给出冲突、反转或高情绪钩子。',
          '准备 5-7 个短视频感强的宣传句，方便后续测点击。',
        ],
        openingTips: [
          '第一章尽量在 300-800 字内给出人物困境和直接冲突。',
          signals.pace === 'slow' ? '当前偏慢热，建议把最强冲突前置到第一章。' : '保持高信息密度，章末一定留追更点。',
          '每章结尾加一个“下一步会更惨/更爽/更危险”的悬念。',
        ],
        packagingTips: [
          '书名尽量突出身份、反差、逆袭、复仇、马甲、系统等高点击元素。',
          '简介前两句优先写“主角是谁 + 现在有多惨/多强 + 即将怎么反转”。',
        ],
      };
    }

    if (platform === 'qimao') {
      return {
        submissionChecklist: [
          ...commonChecklist,
          '投稿前把题材归类写得更商业化，突出可读卖点。',
          '关注平台福利活动节奏，尽量在新书期配合活动节点发书。',
        ],
        openingTips: [
          '首章直接展示主角核心欲望和最大矛盾，不要先铺大量背景。',
          '第二章前最好出现第一次明显爽点或情绪爆点。',
          '前三章每章都要能独立留下继续读的理由。',
        ],
        packagingTips: [
          '书名和简介建议更“直给”，少文艺化表达，多卖点化表达。',
          '简介里优先写清楚题材标签、人物身份、反转机制。',
        ],
      };
    }

    if (platform === 'qidian') {
      return {
        submissionChecklist: [
          ...commonChecklist,
          '准备较完整的长线设定：力量体系、升级路线、长期主线冲突。',
          '检查前 10 章能否同时体现世界观、主角能力和长期成长空间。',
        ],
        openingTips: [
          '首章可以稍慢，但必须尽快建立主角独特能力或困局。',
          '前三章重点是“设定吸引力 + 主角可持续成长线”，而不是单次反转。',
          '如果是男频升级流，尽早明确变强路径和第一阶段目标。',
        ],
        packagingTips: [
          '书名更适合突出设定核心、世界观钩子或成长主轴。',
          '简介要兼顾设定清晰度和长线期待感，避免只写短期爽点。',
        ],
      };
    }

    if (platform === 'jjwxc') {
      return {
        submissionChecklist: [
          ...commonChecklist,
          '检查主角关系线是否足够清晰，CP 感或情绪张力是否能快速建立。',
          '确认文案语气更贴近晋江读者，不要过度男频化或硬广告化。',
        ],
        openingTips: [
          '第一章优先立人设和关系火花，让读者尽快感知人物吸引力。',
          '开篇最好出现明确的人物互动张力，而不只是背景说明。',
          '如果是古言/现言，前 3 章要迅速建立情感线或关系矛盾。',
        ],
        packagingTips: [
          '书名建议突出人物关系、情绪氛围或核心设定反差。',
          '简介比起大世界观，更要突出角色、关系和情感预期。',
        ],
      };
    }

    return {
      submissionChecklist: [
        ...commonChecklist,
        '提前规划至少 20 章的连载节奏，确保中前期不断档。',
        '确认作品既能独立成书，也能兼容免费分发读者的快反馈需求。',
      ],
      openingTips: [
        '前 3 章要同时交代题材卖点、主角优势和主要冲突。',
        '如果是长篇，尽早给出一条清晰的大目标线。',
        '如果是商业向，章末钩子要连续、明确。',
      ],
      packagingTips: [
        '书名要兼顾类型识别和点击欲，避免过于抽象。',
        '简介建议按“主角处境 → 核心卖点 → 主要冲突 → 期待感”写。',
      ],
    };
  }

  private buildCopyVariant(
    platform: PublishingPlatform,
    input: DraftPublishingRecommendationBody,
    signals: ReturnType<typeof buildPublishingSignals>,
  ): PublishingCopyVariant {
    const platformName = PLATFORM_PROFILES[platform].platformName;
    const baseTitle = (input.title || '未命名作品').trim();
    const synopsis = (input.synopsis || '').trim();
    const genreLabel = this.getGenreLabel(input.genre);
    const keywords = this.selectCopyKeywords(platform, signals);
    const coreWord = keywords[0] ?? genreLabel;
    const accentWord = keywords[1] ?? (signals.audience === 'female' ? '情感拉扯' : '逆袭成长');

    if (platform === 'fanqie') {
      return {
        platform,
        platformName,
        titleDirection: '强调冲突、反差和点击感，适合免费流量冷启动。',
        titleSuggestions: [
          `我靠${coreWord}${accentWord}`,
          `被逼到绝境后，我用${coreWord}杀回来了`,
          `${baseTitle}：开局就被${coreWord}盯上`,
        ],
        shortSynopsis: `主角陷入${coreWord}危局，被迫在更狠的局面里反杀翻盘。前几章就有强冲突、快反转和持续追更点。`,
        longSynopsis: `${baseTitle}主打“${coreWord}+${accentWord}”的高钩子阅读体验。故事开篇直接把主角推进危险处境，在最短时间内交代身份、困境和第一次爆点；随后用连续反转、升级回报和章末悬念，把读者稳稳拉进追更节奏。${synopsis ? `当前故事基础可概括为：${synopsis.slice(0, 90)}。` : ''}`,
        keywords,
      };
    }

    if (platform === 'qimao') {
      return {
        platform,
        platformName,
        titleDirection: '突出题材卖点和商业可读性，表达直给。',
        titleSuggestions: [
          `${coreWord}之下，我只想活成最狠的人`,
          `${baseTitle}：这一次我要靠${accentWord}翻身`,
          `当${coreWord}降临，我成了唯一破局者`,
        ],
        shortSynopsis: `围绕${coreWord}与${accentWord}展开，主角在高压局面中连续破局，爽点和情绪点清晰，适合商业向免费阅读。`,
        longSynopsis: `这是一个卖点明确、读感直给的${genreLabel}故事。主角不是慢慢热身，而是在开局就卷入${coreWord}带来的高压局面，并通过${accentWord}持续破局。文案建议突出“人设身份+当前困境+核心反转机制”，让读者一眼知道这本书为什么值得点开。${synopsis ? `现有故事底盘可提炼为：${synopsis.slice(0, 100)}。` : ''}`,
        keywords,
      };
    }

    if (platform === 'qidian') {
      return {
        platform,
        platformName,
        titleDirection: '强调设定核心、成长主轴和长线世界观。',
        titleSuggestions: [
          `${coreWord}纪元`,
          `我在${coreWord}世界里${accentWord}`,
          `${baseTitle}：从${coreWord}开始重构命运`,
        ],
        shortSynopsis: `一部以${coreWord}为核心设定、围绕${accentWord}持续展开的长线成长故事，适合强调体系感和升级空间。`,
        longSynopsis: `这本书的起点版文案应更强调“设定核心+主角成长+长线冲突”。推荐把${coreWord}作为全书最清晰的辨识点，再用${accentWord}去解释主角为什么必须不断成长、为什么读者愿意长期追下去。${synopsis ? `故事现有基础为：${synopsis.slice(0, 110)}。` : ''} 相比短平快表达，更适合突出世界观、路径感和未来上限。`,
        keywords,
      };
    }

    if (platform === 'jjwxc') {
      return {
        platform,
        platformName,
        titleDirection: '突出人物关系、情绪氛围和角色吸引力。',
        titleSuggestions: [
          `与${coreWord}有关的我们`,
          `她（他）在${accentWord}之后靠近我`,
          `${baseTitle}：当命运把我们推向彼此`,
        ],
        shortSynopsis: `以人物关系和情绪牵引为核心，在${coreWord}背景下展开更细腻、更有拉扯感的故事。`,
        longSynopsis: `晋江版文案建议从人物关系切入，而不是只讲大设定。可以把${coreWord}视为背景压力，把${accentWord}转成角色间的情绪拉扯、靠近与试探。读者第一眼要看到“这两个人/这群人为什么值得嗑、值得心疼、值得继续追”。${synopsis ? `现有故事可浓缩为：${synopsis.slice(0, 100)}。` : ''}`,
        keywords,
      };
    }

    return {
      platform,
      platformName,
      titleDirection: '兼顾长线成长与商业表达，适合稳定连载。',
      titleSuggestions: [
        `${baseTitle}：${coreWord}之上`,
        `我在${coreWord}里一步步${accentWord}`,
        `${coreWord}时代的破局者`,
      ],
      shortSynopsis: `在${coreWord}框架下展开连续成长与破局，兼顾阅读爽感和长线推进。`,
      longSynopsis: `这版文案适合兼顾“题材识别度”和“连载稳定感”。建议保留${coreWord}作为书名或简介里的核心识别词，再用${accentWord}说明主角的成长路径与冲突方向。${synopsis ? `故事基础为：${synopsis.slice(0, 100)}。` : ''}`,
      keywords,
    };
  }

  private selectCopyKeywords(
    platform: PublishingPlatform,
    signals: ReturnType<typeof buildPublishingSignals>,
  ): string[] {
    const keywords = new Set<string>();
    const tagMap: Record<string, string[]> = {
      cp: ['关系拉扯', '双向奔赴'],
      'female-emotion': ['情绪反转', '情感拉扯'],
      'male-upgrade': ['逆袭升级', '成长反杀'],
      'short-drama': ['高能反转', '极限翻盘'],
      'free-commercial': ['强爽点', '高点击'],
      worldbuilding: ['世界观', '体系成长'],
      suspense: ['悬疑谜局', '危险真相'],
      literary: ['命运感', '人物成长'],
    };

    keywords.add(this.getGenreLabel(signals.genre));
    for (const tag of signals.tags) {
      for (const item of tagMap[tag] ?? []) {
        keywords.add(item);
      }
    }
    if (platform === 'fanqie' || platform === 'qimao') {
      keywords.add(signals.audience === 'female' ? '情绪爆点' : '爽点爆发');
    }
    return [...keywords].slice(0, 4);
  }

  private getGenreLabel(genre: NovelGenre): string {
    switch (genre) {
      case 'fantasy': return '玄幻冒险';
      case 'mystery': return '悬疑谜局';
      case 'modern': return '都市逆袭';
      case 'scifi': return '科幻世界';
      case 'historical': return '历史风云';
      case 'romance': return '情感关系';
      default: return '故事核心';
    }
  }

  private async buildPortfolioProfile(): Promise<PublishingPortfolioProfile | null> {
    const novels = (await this.novelManager.listNovels()).slice(0, 50);
    if (novels.length === 0) return null;

    const genreCounts = new Map<string, number>();
    const audienceCounts = new Map<string, number>();
    const paceCounts = new Map<string, number>();
    const tagCounts = new Map<string, number>();

    for (const novel of novels) {
      const signals = buildPublishingSignals({
        title: novel.title,
        genre: novel.genre,
        synopsis: novel.synopsis || novel.description,
        targetChapters: novel.targetChapters,
        chapterCount: novel.chapterCount ?? novel.finalizedChapterCount ?? 0,
      });
      genreCounts.set(signals.genre, (genreCounts.get(signals.genre) ?? 0) + 1);
      audienceCounts.set(signals.audience, (audienceCounts.get(signals.audience) ?? 0) + 1);
      paceCounts.set(signals.pace, (paceCounts.get(signals.pace) ?? 0) + 1);
      for (const tag of signals.tags) {
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
      }
    }

    const topGenres = [...genreCounts.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 2)
      .map(([genre]) => genre as DraftPublishingRecommendationBody['genre']);
    const dominantAudience = ([...audienceCounts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? 'general') as PublishingPortfolioProfile['dominantAudience'];
    const dominantPace = ([...paceCounts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? 'medium') as PublishingPortfolioProfile['dominantPace'];
    const dominantTags = [...tagCounts.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 5)
      .map(([tag]) => tag);

    return {
      sampleCount: novels.length,
      dominantGenres: topGenres,
      dominantAudience,
      dominantPace,
      dominantTags,
    };
  }
}
