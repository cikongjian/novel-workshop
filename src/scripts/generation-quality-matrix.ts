import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectGeneratedTitle } from '../agents/title-generation-strategy.js';
import type { NovelConstitutionTagId } from '../config/novel-constitution-tags.js';
import type { Chapter, NovelMetadata } from '../novel/types.js';
import { auditGenreDrift } from '../pipeline/genre-drift-audit.js';
import { buildPromiseContract } from '../pipeline/promise-contract.js';
import { auditChapterReadability } from '../pipeline/readability-audit.js';
import { auditReaderDelivery } from '../pipeline/reader-delivery-audit.js';
import { collectNarrativeChapterReferenceLeaks } from '../utils/public-facing-content.js';

type NovelGenre = 'fantasy' | 'mystery' | 'modern' | 'scifi' | 'historical' | 'romance' | 'custom';
type StartupPlatformProfile = 'auto' | 'fanqie' | 'qidian';
type ChapterStylePreset =
  | 'auto'
  | 'serious'
  | 'comedy'
  | 'wacky'
  | 'historical'
  | 'xianxia'
  | 'wuxia'
  | 'suspense'
  | 'horror'
  | 'campus'
  | 'workplace'
  | 'political'
  | 'hard-scifi'
  | 'romance-sweet'
  | 'romance-angst';

type MatrixCase = {
  id: string;
  label: string;
  title: string;
  genre: NovelGenre;
  synopsis: string;
  description: string;
  constitutionTags?: NovelConstitutionTagId[];
  stylePreset?: ChapterStylePreset;
  maxWordCount?: number;
  generationFocus: string;
  forbiddenSignals?: RegExp[];
  direction: (chapterNumber: number) => string;
};

type CliOptions = {
  apply: boolean;
  apiBase: string;
  token?: string;
  username?: string;
  password?: string;
  outPath: string;
  chapters: number;
  caseIds: string[];
  resumeNovelId?: string;
  pollMs: number;
  timeoutMs: number;
  settleMs: number;
  maxWordCount?: number;
  startupPlatformProfile: StartupPlatformProfile;
  userApiProfileId?: string;
  userApiKey?: string;
  stopOnError: boolean;
  help: boolean;
};

type ApiClient = {
  apiBase: string;
  headers: Record<string, string>;
  refreshAuth?: () => Promise<boolean>;
};

type GenerationStatusResponse = Record<string, unknown> & {
  source?: unknown;
  isGenerating?: unknown;
  chapterNumber?: unknown;
  lastFailedChapter?: unknown;
  lastFailureMessage?: unknown;
  lock?: {
    chapterNumber?: unknown;
    stale?: unknown;
  } | null;
};

type StaleLockRecoveryResponse = {
  recovered: boolean;
  reason: string;
  message: string;
};

type ChapterScanReport = {
  chapterNumber: number;
  title: string;
  status: string;
  wordCount: number;
  readerScore?: number;
  readerDeliveryScore: number;
  readerDeliveryPassed: boolean;
  readerDeliveryDimensions: ReturnType<typeof auditReaderDelivery>['dimensions'];
  genreQualityPassed: boolean;
  promiseHits: number;
  sceneHits: number;
  suspenseHits: number;
  suspenseShare: number;
  qualityGateScore?: number;
  qualityGatePassed?: boolean;
  startupFindings: string[];
  issues: string[];
  suggestions: string[];
  flags: {
    titleQualityReasons: string[];
    rolePlaceholderLeaks: string[];
    publicMetaLeaks: string[];
    forbiddenSignals: string[];
  };
};

type CaseRunReport = {
  caseId: string;
  label: string;
  status: 'planned' | 'completed' | 'failed' | 'partial';
  novelId?: string;
  title: string;
  genre: NovelGenre;
  constitutionTags: string[];
  requestedChapters: number;
  generatedChapters: number;
  error?: string;
  chapters: ChapterScanReport[];
  summary: {
    readerDeliveryPassCount: number;
    genrePassCount: number;
    majorIssueChapterCount: number;
    avgReaderDeliveryScore: number;
    avgWordCount: number;
  };
};

type MatrixReport = {
  generatedAt: string;
  apiBase: string;
  applied: boolean;
  chaptersPerCase: number;
  cases: CaseRunReport[];
  summary: {
    totalCases: number;
    completedCases: number;
    failedCases: number;
    partialCases: number;
    totalChapters: number;
    readerDeliveryPassRate: number;
    genrePassRate: number;
    majorIssueChapterCount: number;
  };
};

class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message);
  }
}

const DEFAULT_CHAPTERS = 10;
const DEFAULT_POLL_MS = 5000;
const DEFAULT_TIMEOUT_MS = 12 * 60 * 1000;
const DEFAULT_SETTLE_MS = 5000;
const DEFAULT_MAX_WORD_COUNT = 3000;
const REQUEST_RETRY_COUNT = 2;

const ROLE_PLACEHOLDER_RE = /(?:男主|女主|主角)(?:(?:说|道|看|想|走|站|拿|把|被|在)(?=[，。：:、\s　“”"「『])|[：:])/gu;
const PUBLIC_META_RE = /润色后正文|改写后正文|以下是(?:优化后|润色后|改写后)?正文|作为(?:AI|模型)|本文将|本章将|大纲要求|读者朋友|(?:\([#＃]|[#＃]\()(?:死亡|退场):[^)]+\)/gu;

const CASES: MatrixCase[] = [
  {
    id: 'showbiz',
    label: '娱乐圈逆袭',
    title: '逆风试镜当天',
    genre: 'modern',
    constitutionTags: ['showbiz'],
    synopsis: '过气女演员在娱乐圈重新开始，靠试镜、热搜、资源反抢、导演站队和片场表现翻红。',
    description: '验证娱乐圈主场景能否持续落在试镜、资源、片场反馈和舆论回报。',
    stylePreset: 'workplace',
    generationFocus: '试镜/片场/资源争夺/舆论反馈',
    forbiddenSignals: [/匿名短信|监控来源|幕后真相|旧钥匙|祭坛/gu],
    direction: chapter => `第${chapter}章继续娱乐圈逆袭线：必须写试镜、片场、资源争夺、导演或品牌方反馈，前半章给一次可见回报；不要主写匿名短信、监控来源或幕后调查。`,
  },
  {
    id: 'collapse-warning',
    label: '塌房预警爆红',
    title: '塌房预警开播夜',
    genre: 'modern',
    constitutionTags: ['collapse-warning'],
    synopsis: '女主拿到塌房预警能力，在直播间提前避雷、截胡资源、阻止团队踩坑，并靠公开验证和流量反馈爆红。',
    description: '验证塌房预警能否持续写预警、避雷、截胡、直播验证和热度增长，而不是转成幕后查案。',
    stylePreset: 'workplace',
    generationFocus: '预警/避雷/截胡/直播验证/爆红起量',
    forbiddenSignals: [/旧钥匙|祭坛|秘境|匿名人|监控来源/gu],
    direction: chapter => `第${chapter}章继续塌房预警爆红线：必须出现预警触发、公开避雷或截胡、直播/热搜验证、团队或品牌方反馈；不要转成调查幕后黑手。`,
  },
  {
    id: 'rebirth',
    label: '重生改命',
    title: '重回签约前夜',
    genre: 'modern',
    constitutionTags: ['rebirth'],
    synopsis: '女主重生回签约前夜，靠前世记忆避坑、截胡资源、反抢机会，让旧对手当众翻车。',
    description: '验证重生线能否持续把先知优势落成避坑、截胡、反抢和现实收益。',
    stylePreset: 'workplace',
    generationFocus: '先知优势/避坑/截胡/反抢/公开翻盘',
    forbiddenSignals: [/旧钥匙|祭坛|秘境|系统来源|匿名短信/gu],
    direction: chapter => `第${chapter}章继续重生改命：必须写前世信息被用于避坑、截胡或反抢，并让收益公开落地；不要主写神秘物件或幕后调查。`,
  },
  {
    id: 'faceslap',
    label: '打脸反杀',
    title: '全场等我翻车',
    genre: 'modern',
    constitutionTags: ['faceslap'],
    synopsis: '主角被公开压制和嘲笑，在现场拿出证据、能力或成绩反杀，让围观者震惊并改变站队。',
    description: '验证打脸反杀是否持续兑现压制、翻车、围观震惊和站队变化。',
    stylePreset: 'serious',
    generationFocus: '公开压制/现场反杀/围观震惊/站队变化',
    forbiddenSignals: [/旧钥匙|祭坛|秘境|系统来源|匿名短信/gu],
    direction: chapter => `第${chapter}章继续打脸反杀：必须有公开压制、现场反击、对手翻车、围观震惊或站队变化；不要把爽点写成私下查线索。`,
  },
  {
    id: 'sweet',
    label: '爽甜拉扯',
    title: '偏爱信号',
    genre: 'romance',
    constitutionTags: ['sweet'],
    synopsis: '男女主在合作与误会中拉扯，靠护短、偏爱、吃醋、心动反应和关系推进形成爽甜回报。',
    description: '验证甜宠拉扯是否持续兑现心动、护短、偏爱和关系进展。',
    stylePreset: 'romance-sweet',
    generationFocus: '心动/护短/偏爱/吃醋/关系推进',
    forbiddenSignals: [/旧钥匙|祭坛|秘境|监控来源|匿名短信/gu],
    direction: chapter => `第${chapter}章继续爽甜拉扯：必须写心动反应、护短或偏爱、吃醋/试探和关系推进；不要转成悬疑调查或秘物线。`,
  },
  {
    id: 'female-career',
    label: '大女主事业线',
    title: '她把项目抢回来',
    genre: 'modern',
    constitutionTags: ['female-career'],
    synopsis: '大女主职场事业线，主角靠公开会议、客户反馈、项目交付、同事站队和签约回报完成逆袭。',
    description: '验证事业线能否持续写成公开业务结果，而不是幕后查案。',
    stylePreset: 'workplace',
    generationFocus: '项目交付/公开反击/客户签约/站队变化',
    forbiddenSignals: [/旧钥匙|匿名人|幕后真相|祭坛|秘境/gu],
    direction: chapter => `第${chapter}章继续事业线：必须有会议室或客户现场，项目结果、责任归属、同事站队或签约推进至少落两项；不要把主回报写成幕后调查。`,
  },
  {
    id: 'shame-system',
    label: '羞耻系统',
    title: '早会三十秒',
    genre: 'modern',
    constitutionTags: ['shame-system'],
    synopsis: '办公室早会触发羞耻任务，女主必须当众完成指定台词，靠社死奖励、惩罚和围观反应推进关系。',
    description: '验证社死系统是否保持任务执行、围观反应和奖励惩罚闭环。',
    stylePreset: 'comedy',
    generationFocus: '公开任务/指定台词/围观反应/奖励惩罚',
    forbiddenSignals: [/系统来源|幕后操控|校园社团招新|祭坛|钥匙/gu],
    direction: chapter => `第${chapter}章继续办公室羞耻系统：必须出现公共场景、任务触发、当众执行、围观反应、奖励或惩罚；不要改成校园社团，也不要研究系统来源。`,
  },
  {
    id: 'food-business',
    label: '美食经营',
    title: '破庙口第一锅酸汤面',
    genre: 'modern',
    synopsis: '破庙口支起小饭摊，主角靠酸汤面、灶台手艺、试吃反馈、铜板成交、排队复购和摊位升级翻身。',
    description: '验证美食经营是否把手艺落成客流、成交和口碑。',
    stylePreset: 'comedy',
    generationFocus: '做饭/试吃/成交/复购/摊位升级',
    forbiddenSignals: [/祭坛|秘境|旧钥匙|神秘钥匙|钥匙碎片|匿名短信|幕后/gu],
    direction: chapter => `第${chapter}章继续美食经营：必须写处理食材、出锅、食客反应、铜板成交或复购压力；不要长时间苦情回忆，不要转成秘物或调查线。`,
  },
  {
    id: 'farming-survival',
    label: '种田求生',
    title: '荒年小院有口锅',
    genre: 'historical',
    synopsis: '逃荒农女被赶出家门后靠野菜、生火、换粮、五文铜钱、邻里反馈和小院经营撑过荒年。',
    description: '验证种田求生是否持续把困境转成活命动作和现实收益。',
    stylePreset: 'historical',
    generationFocus: '找粮/生火/换钱/撑过一天/小院经营',
    forbiddenSignals: [/神使|祭坛|灵宝|秘境|旧钥匙|神秘钥匙|钥匙碎片/gu],
    direction: chapter => `第${chapter}章继续种田求生：必须写找吃的、生火、换粮或换钱，并让邻里/家人给出反馈；章尾落到下一天的粮食、柴火、雨水或摊位压力。`,
  },
  {
    id: 'romance-rivals',
    label: '死对头拉扯',
    title: '同居合同压在玄关',
    genre: 'romance',
    constitutionTags: ['sweet'],
    synopsis: '死对头被迫同居，靠合同规则、互怼、嘴硬关心、旧疤记忆、肢体拉扯和关系升温推进。',
    description: '验证恋爱拉扯是否保持双人互动和关系回报。',
    stylePreset: 'romance-sweet',
    generationFocus: '同居合同/互怼/嘴硬关心/关系升温',
    forbiddenSignals: [/项目交付|客户验收|祭坛|幕后真相|匿名短信/gu],
    direction: chapter => `第${chapter}章继续死对头同居拉扯：必须让两人同场互动，给互怼、肢体拉扯、嘴硬关心或关系误会升级；不要写成职场项目或悬疑调查。`,
  },
  {
    id: 'civilization-upgrade',
    label: '文明升级',
    title: '我在蛮荒烧出第一只陶碗',
    genre: 'fantasy',
    synopsis: '穿越蛮荒部落，主角教制陶、净水、储粮和围栏知识，获得能力并带领部落对抗神罚。',
    description: '验证文明升级是否闭环到工具、教学、部落反馈和新技术门槛。',
    stylePreset: 'xianxia',
    generationFocus: '教学/工具制作/部落反馈/神罚验证',
    forbiddenSignals: [/宗门秘境|灵根|祭坛钥匙|幕后真相/gu],
    direction: chapter => `第${chapter}章继续文明升级：必须写具体知识或工具制作、部落成员反馈、成果用途和下一项技术门槛；世界秘密只能服务教学和生存压力。`,
  },
  {
    id: 'apocalypse-survival',
    label: '末世生存',
    title: '安全屋从一张补给券开始',
    genre: 'scifi',
    synopsis: '末世求生，主角靠补给券、清水、工具箱、加固防线、安全屋和路线选择撑过尸潮。',
    description: '验证末世生存是否把危险落成资源和安全状态变化。',
    stylePreset: 'hard-scifi',
    generationFocus: '资源选择/加固防线/尸群压力/安全屋',
    forbiddenSignals: [/实验档案来源|旧钥匙|祭坛|秘境|幕后真相/gu],
    direction: chapter => `第${chapter}章继续末世生存：必须写缺水缺药、补给选择、加固防线或路线选择，并让资源/安全状态发生变化；不要主写实验档案来源。`,
  },
  {
    id: 'sports-competition',
    label: '体育竞技',
    title: '替补席最后一格',
    genre: 'modern',
    synopsis: '体育竞技青春文，转学生从替补席开始，靠训练、选拔赛、比分压力、战术修正和队友信任回到场上。',
    description: '验证体育题材是否持续落到回合结果、比分变化和队友教练反馈。',
    stylePreset: 'campus',
    generationFocus: '比赛回合/比分压力/战术修正/队友信任',
    forbiddenSignals: [/客户验收|项目交付|匿名短信|旧钥匙|祭坛/gu],
    direction: chapter => `第${chapter}章继续体育竞技：必须有比分、计时、失误或落后、动作/战术修正、回合结果、队友或教练反应；不要写成职场或悬疑。`,
  },
  {
    id: 'campus-club-comedy',
    label: '校园社团轻喜剧',
    title: '废柴社团今天也要招满人',
    genre: 'modern',
    synopsis: '校园轻喜剧，大一新生接手濒临废社的模型社，靠招新、误会笑点、模型技能、同学报名和活动室资源保住社团。',
    description: '验证校园社团是否持续落到招新人数、同学反应和活动室资源。',
    stylePreset: 'campus',
    generationFocus: '招新/误会笑点/报名人数/活动室资源',
    forbiddenSignals: [/客户签约|项目预算|尸潮|祭坛|幕后真相/gu],
    direction: chapter => `第${chapter}章继续校园社团招新：必须出现社团现场、误会或笑点、报名/留下/活动室资源变化和同学老师反馈；不要写成职场项目。`,
  },
  {
    id: 'scifi-engineering',
    label: '科幻工程',
    title: '星环维修日志',
    genre: 'scifi',
    synopsis: '硬科幻工程文，空间站气闸报警，主角靠读数、参数修正、维修臂、阀门和推进模块排除故障。',
    description: '验证科幻工程是否保持设备异常、试错、参数/机械修正和现场反馈。',
    stylePreset: 'hard-scifi',
    generationFocus: '设备故障/读数/试错修正/工程反馈',
    forbiddenSignals: [/谁留下的|幕后真相|匿名人|祭坛|钥匙/gu],
    direction: chapter => `第${chapter}章继续科幻工程：第一屏必须有设备状态或报警读数，前半章写试错修正，章尾落到下一处设备压力；不要只追查来源。`,
  },
  {
    id: 'war-statecraft',
    label: '战争权谋建国',
    title: '万域霸主：东门军令',
    genre: 'historical',
    constitutionTags: ['war-statecraft'],
    synopsis: '战争权谋建国文，主线是攻城、破城、收编、兵权、军功爵、废奴政令、科举推进和旧贵族反扑。',
    description: '验证战争权谋是否持续落到军政结果，避免祭坛、钥匙、秘门抢主线。',
    stylePreset: 'historical',
    generationFocus: '攻城/兵权/政令/收编/旧贵族反扑',
    forbiddenSignals: [/祭坛|钥匙|坐标|秘门|碎片|封印|第三门/gu],
    direction: chapter => `第${chapter}章继续战争权谋建国：必须写战场、城门、军营、朝堂或府衙中的军政动作，至少改变攻城、兵权、政令、收编或站队之一；禁止用祭坛、钥匙、坐标、秘门替代战争推进。`,
  },
  {
    id: 'fantasy-upgrade',
    label: '玄幻升级',
    title: '被逐当天我破境反杀',
    genre: 'fantasy',
    constitutionTags: ['fantasy-upgrade', 'faceslap'],
    synopsis: '玄幻升级爽文，主角被逐出宗门后靠金手指、突破、资源争夺、擂台反杀和围观打脸一路升级。',
    description: '验证玄幻升级是否兑现突破、资源和打脸，而不是只堆谜团。',
    stylePreset: 'xianxia',
    generationFocus: '突破/资源争夺/擂台反杀/围观打脸',
    forbiddenSignals: [/监控来源|匿名短信|项目验收|社团招新/gu],
    direction: chapter => `第${chapter}章继续玄幻升级：必须有修炼资源、境界或战力变化、对手压迫、反杀/突破和围观反应；不要把回报写成调查幕后。`,
  },
];

function normalizeApiBase(value: string): string {
  const trimmed = value.trim().replace(/\/+$/u, '');
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNonNegativeInt(value: string | undefined, fallback: number): number {
  if (value == null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function parseArgs(argv: string[], env: NodeJS.ProcessEnv = process.env): CliOptions {
  const caseIds: string[] = [];
  let apply = false;
  let help = false;
  let stopOnError = false;
  let apiBase = normalizeApiBase(env.GEN_MATRIX_API_BASE ?? env.GEN_MATRIX_BASE_URL ?? 'http://localhost:3313');
  let token = env.GEN_MATRIX_TOKEN;
  let username = env.GEN_MATRIX_USERNAME;
  let password = env.GEN_MATRIX_PASSWORD;
  let outPath = env.GEN_MATRIX_OUT ?? path.join('data', 'reports', 'generation-quality-matrix-latest.json');
  let chapters = parsePositiveInt(env.GEN_MATRIX_CHAPTERS, DEFAULT_CHAPTERS);
  let resumeNovelId = env.GEN_MATRIX_RESUME_NOVEL_ID;
  let pollMs = parsePositiveInt(env.GEN_MATRIX_POLL_MS, DEFAULT_POLL_MS);
  let timeoutMs = parsePositiveInt(env.GEN_MATRIX_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
  let settleMs = parseNonNegativeInt(env.GEN_MATRIX_SETTLE_MS, DEFAULT_SETTLE_MS);
  let maxWordCount = env.GEN_MATRIX_MAX_WORD_COUNT ? parsePositiveInt(env.GEN_MATRIX_MAX_WORD_COUNT, DEFAULT_MAX_WORD_COUNT) : undefined;
  let startupPlatformProfile: StartupPlatformProfile = 'fanqie';
  let userApiProfileId = env.GEN_MATRIX_USER_API_PROFILE_ID;
  let userApiKey = env.GEN_MATRIX_USER_API_KEY;

  if (env.GEN_MATRIX_CASES) {
    caseIds.push(...env.GEN_MATRIX_CASES.split(',').map(item => item.trim()).filter(Boolean));
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--help' || arg === '-h') {
      help = true;
      continue;
    }
    if (arg === '--apply') {
      apply = true;
      continue;
    }
    if (arg === '--dry-run') {
      apply = false;
      continue;
    }
    if (arg === '--stop-on-error') {
      stopOnError = true;
      continue;
    }
    if ((arg === '--base-url' || arg === '--api-base') && next) {
      apiBase = normalizeApiBase(next);
      i += 1;
      continue;
    }
    if (arg.startsWith('--base-url=')) {
      apiBase = normalizeApiBase(arg.slice('--base-url='.length));
      continue;
    }
    if (arg.startsWith('--api-base=')) {
      apiBase = normalizeApiBase(arg.slice('--api-base='.length));
      continue;
    }
    if (arg === '--token' && next) {
      token = next;
      i += 1;
      continue;
    }
    if (arg === '--username' && next) {
      username = next;
      i += 1;
      continue;
    }
    if (arg === '--password' && next) {
      password = next;
      i += 1;
      continue;
    }
    if (arg === '--out' && next) {
      outPath = next;
      i += 1;
      continue;
    }
    if (arg === '--chapters' && next) {
      chapters = parsePositiveInt(next, chapters);
      i += 1;
      continue;
    }
    if (arg === '--resume-novel' && next) {
      resumeNovelId = next.trim();
      i += 1;
      continue;
    }
    if (arg === '--poll-ms' && next) {
      pollMs = parsePositiveInt(next, pollMs);
      i += 1;
      continue;
    }
    if (arg === '--timeout-ms' && next) {
      timeoutMs = parsePositiveInt(next, timeoutMs);
      i += 1;
      continue;
    }
    if (arg === '--settle-ms' && next) {
      settleMs = parseNonNegativeInt(next, settleMs);
      i += 1;
      continue;
    }
    if (arg === '--max-word-count' && next) {
      maxWordCount = parsePositiveInt(next, DEFAULT_MAX_WORD_COUNT);
      i += 1;
      continue;
    }
    if (arg === '--startup-platform-profile' && next) {
      if (next === 'auto' || next === 'fanqie' || next === 'qidian') {
        startupPlatformProfile = next;
      }
      i += 1;
      continue;
    }
    if ((arg === '--case' || arg === '--only') && next) {
      caseIds.push(...next.split(',').map(item => item.trim()).filter(Boolean));
      i += 1;
      continue;
    }
    if (arg === '--user-api-profile-id' && next) {
      userApiProfileId = next;
      i += 1;
      continue;
    }
    if (arg === '--user-api-key' && next) {
      userApiKey = next;
      i += 1;
      continue;
    }
  }

  return {
    apply,
    apiBase,
    token,
    username,
    password,
    outPath,
    chapters,
    caseIds,
    resumeNovelId,
    pollMs,
    timeoutMs,
    settleMs,
    maxWordCount,
    startupPlatformProfile,
    userApiProfileId,
    userApiKey,
    stopOnError,
    help,
  };
}

function formatHelp(invocation: string): string {
  return [
    `用法: ${invocation} [--apply] [--base-url http://localhost:3313] [--chapters 10]`,
    '',
    '默认 dry-run，只打印将创建的题材矩阵；真正调用平台 API 必须加 --apply。',
    '',
    '常用参数:',
    '  --apply                         实际创建小说并生成章节',
    '  --base-url <url>                平台地址，默认 http://localhost:3313',
    '  --api-base <url>                API 地址；可传 http://host/api',
    '  --token <jwt>                   直接使用 Bearer token',
    '  --username <u> --password <p>   登录后使用 accessToken',
    '  --case <id,id>                  只跑指定题材；可重复',
    '  --chapters <n>                  每本生成章节数，默认 10',
    '  --resume-novel <id>             单题材断点续跑；已完成章节只读取审计',
    '  --settle-ms <n>                 章节可读后等待后台生成状态归稳，默认 5000',
    '  --max-word-count <n>            覆盖所有题材单章字数，默认使用题材配置或 3000',
    '  --out <path>                    JSON 报告路径，默认 data/reports/generation-quality-matrix-latest.json',
    '  --user-api-profile-id <id>      透传本地个人模型 API profile',
    '  --user-api-key <key>            透传本地个人模型 API key',
    '  --stop-on-error                 任一题材失败后停止',
    '',
    `可用题材: ${CASES.map(item => item.id).join(', ')}`,
  ].join('\n');
}

function selectCases(caseIds: string[]): MatrixCase[] {
  if (caseIds.length === 0) return CASES;
  const wanted = new Set(caseIds);
  const selected = CASES.filter(item => wanted.has(item.id));
  const missing = [...wanted].filter(id => !CASES.some(item => item.id === id));
  if (missing.length > 0) {
    throw new Error(`未知题材 case: ${missing.join(', ')}`);
  }
  return selected;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function requestJson<T>(
  client: ApiClient,
  method: string,
  route: string,
  body?: unknown,
): Promise<T> {
  for (let attempt = 0; attempt <= REQUEST_RETRY_COUNT; attempt += 1) {
    try {
      return await sendRequestJson<T>(client, method, route, body);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401 && client.refreshAuth) {
        const refreshed = await client.refreshAuth();
        if (refreshed) {
          return sendRequestJson<T>(client, method, route, body);
        }
      }
      if (!isRetriableRequestError(method, err) || attempt >= REQUEST_RETRY_COUNT) {
        throw err;
      }
      await sleep(1000 * (attempt + 1));
    }
  }
  throw new Error(`request failed: ${method} ${route}`);
}

function isTransportError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return /fetch failed|ECONNRESET|ECONNREFUSED|ECONNABORTED|ETIMEDOUT|socket hang up/i.test(err.message);
}

function isRetriableRequestError(method: string, err: unknown): boolean {
  if (method.toUpperCase() !== 'GET') return false;
  if (err instanceof ApiError) return err.status >= 500 && err.status < 600;
  return isTransportError(err);
}

function formatRequestError(err: unknown): string {
  if (err instanceof ApiError) {
    const body = err.body.trim().replace(/\s+/gu, ' ').slice(0, 180);
    return `HTTP ${err.status}${body ? ` ${body}` : ''}`;
  }
  return err instanceof Error ? err.message : String(err);
}

async function sendRequestJson<T>(
  client: ApiClient,
  method: string,
  route: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = {
    ...client.headers,
  };
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
  }
  const response = await fetch(`${client.apiBase}${route}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new ApiError(`HTTP ${response.status} ${method} ${route}: ${text}`, response.status, text);
  }
  if (!text.trim()) return undefined as T;
  return JSON.parse(text) as T;
}

async function optionalRequestJson<T>(
  client: ApiClient,
  method: string,
  route: string,
): Promise<T | null> {
  try {
    return await requestJson<T>(client, method, route);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export async function buildApiClient(options: CliOptions): Promise<ApiClient> {
  const headers: Record<string, string> = {};
  let token = options.token;
  const refreshAuth = async (): Promise<boolean> => {
    if (!options.username || !options.password) return false;
    const loginClient: ApiClient = { apiBase: options.apiBase, headers: {} };
    const login = await requestJson<{ accessToken: string }>(loginClient, 'POST', '/sync/session', {
      username: options.username,
      password: options.password,
    });
    token = login.accessToken;
    headers.authorization = `Bearer ${token}`;
    return true;
  };
  if (!token) {
    await refreshAuth();
  }
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }
  if (options.userApiProfileId && options.userApiKey) {
    const encoded = Buffer.from(JSON.stringify({
      profileId: options.userApiProfileId,
      apiKey: options.userApiKey,
    })).toString('base64url');
    headers['x-nw-user-api-model'] = encoded;
  }
  return {
    apiBase: options.apiBase,
    headers,
    refreshAuth: options.username && options.password ? refreshAuth : undefined,
  };
}

async function createNovel(client: ApiClient, testCase: MatrixCase): Promise<NovelMetadata> {
  return requestJson<NovelMetadata>(client, 'POST', '/novels', {
    title: testCase.title,
    genre: testCase.genre,
    synopsis: testCase.synopsis,
    description: testCase.description,
    constitutionTags: testCase.constitutionTags ?? [],
  });
}

async function generateChapter(params: {
  client: ApiClient;
  testCase: MatrixCase;
  novelId: string;
  chapterNumber: number;
  maxWordCount: number;
  startupPlatformProfile: StartupPlatformProfile;
}): Promise<void> {
  const { client, testCase, novelId, chapterNumber, maxWordCount, startupPlatformProfile } = params;
  try {
    await requestJson(client, 'POST', '/generate/chapter', {
    novelId,
    chapterNumber,
    userDirection: testCase.direction(chapterNumber),
    maxWordCount,
    stylePreset: testCase.stylePreset,
    styleNotes: `题材一致性压测：${testCase.generationFocus}`,
    startupPlatformProfile,
    });
  } catch (err) {
    if (isTransportError(err)) {
      console.warn(`[matrix] generate request disconnected ${testCase.id} novel=${novelId} chapter=${chapterNumber}; polling target chapter`);
      return;
    }
    throw err;
  }
}

function isFailedChapter(chapter: Chapter): string | null {
  const lifecycle = chapter.diagnostics?.generationLifecycle;
  if (lifecycle?.phase === 'failed') {
    return lifecycle.errorMessage ?? lifecycle.errorCode ?? '章节生成失败';
  }
  return null;
}

export function isChapterGenerationReady(
  chapter: Chapter | null | undefined,
): boolean {
  if (!chapter?.content?.trim()) return false;
  if (chapter.status === 'finalized') return true;
  return chapter.status === 'reviewed'
    && chapter.diagnostics?.generationLifecycle?.phase === 'final';
}

async function waitForChapter(params: {
  client: ApiClient;
  novelId: string;
  chapterNumber: number;
  pollMs: number;
  timeoutMs: number;
}): Promise<Chapter> {
  const { client, novelId, chapterNumber, pollMs, timeoutMs } = params;
  const deadline = Date.now() + timeoutMs;
  let lastStatus = '';
  let staleRecoveryAttempted = false;
  while (Date.now() <= deadline) {
    let chapter: Chapter | null = null;
    try {
      chapter = await optionalRequestJson<Chapter>(client, 'GET', `/novels/${novelId}/chapters/${chapterNumber}`);
    } catch (err) {
      if (!isRetriableRequestError('GET', err)) {
        throw err;
      }
      lastStatus = `chapter poll failed: ${formatRequestError(err)}`;
    }
    if (chapter) {
      const failure = isFailedChapter(chapter);
      if (failure) {
        throw new Error(`第 ${chapterNumber} 章生成失败：${failure}`);
      }
      if (isChapterGenerationReady(chapter)) {
        return chapter;
      }
      lastStatus = `status=${chapter.status} lifecycle=${chapter.diagnostics?.generationLifecycle?.phase ?? 'missing'} wordCount=${chapter.wordCount}`;
    }

    let status: GenerationStatusResponse | null = null;
    try {
      status = await optionalRequestJson<GenerationStatusResponse>(client, 'GET', `/novels/${novelId}/chapters/generation-status`);
    } catch (err) {
      if (!isRetriableRequestError('GET', err)) {
        throw err;
      }
      lastStatus = `status poll failed: ${formatRequestError(err)}`;
    }
    if (status) {
      lastStatus = JSON.stringify(status);
      const failure = getTargetGenerationFailure(status, chapterNumber);
      if (failure) {
        throw new Error(`第 ${chapterNumber} 章生成失败：${failure}`);
      }
      if (Number(status.lastCompletedChapter) >= chapterNumber) {
        lastStatus = `target chapter ${chapterNumber} is not readable although status reports lastCompletedChapter=${String(status.lastCompletedChapter)}; ${lastStatus}`;
      }
      if (!staleRecoveryAttempted && isTargetStaleLockStatus(status, chapterNumber)) {
        staleRecoveryAttempted = true;
        const recovered = await recoverStaleLock(client, novelId);
        lastStatus = `stale lock recovery ${recovered.reason}: ${recovered.message}; ${lastStatus}`;
      }
    }
    await sleep(pollMs);
  }
  throw new Error(`等待第 ${chapterNumber} 章生成超时。最后状态：${lastStatus || '无'}`);
}

export function getTargetGenerationFailure(
  status: GenerationStatusResponse,
  chapterNumber: number,
): string | null {
  if (status.isGenerating === true || Number(status.lastFailedChapter) !== chapterNumber) {
    return null;
  }
  return typeof status.lastFailureMessage === 'string' && status.lastFailureMessage.trim()
    ? status.lastFailureMessage.trim()
    : '服务端已结束该章生成任务';
}

function isTargetStaleLockStatus(status: GenerationStatusResponse, chapterNumber: number): boolean {
  const lockChapter = Number(status.lock?.chapterNumber);
  const failedChapter = Number(status.lastFailedChapter);
  return (
    status.lock?.stale === true
    && Number.isFinite(lockChapter)
    && lockChapter === chapterNumber
  ) || (
    status.source === 'lock'
    && Number.isFinite(failedChapter)
    && failedChapter === chapterNumber
    && status.isGenerating !== true
  );
}

async function recoverStaleLock(client: ApiClient, novelId: string): Promise<StaleLockRecoveryResponse> {
  return requestJson<StaleLockRecoveryResponse>(
    client,
    'POST',
    `/novels/${novelId}/chapters/generation-status/recover-stale-lock`,
  );
}

async function waitForGenerationSettle(params: {
  client: ApiClient;
  novelId: string;
  chapterNumber: number;
  pollMs: number;
  settleMs: number;
}): Promise<void> {
  const { client, novelId, chapterNumber, pollMs, settleMs } = params;
  if (settleMs <= 0) return;

  const deadline = Date.now() + settleMs;
  while (Date.now() <= deadline) {
    let status: Record<string, unknown> | null = null;
    try {
      status = await optionalRequestJson<Record<string, unknown>>(client, 'GET', `/novels/${novelId}/chapters/generation-status`);
    } catch (err) {
      if (!isRetriableRequestError('GET', err)) {
        throw err;
      }
    }

    const isGenerating = status?.isGenerating === true;
    const activeChapter = Number(status?.chapterNumber);
    if (!isGenerating || (Number.isFinite(activeChapter) && activeChapter !== chapterNumber)) {
      return;
    }
    await sleep(Math.min(pollMs, Math.max(250, deadline - Date.now())));
  }
}

function collectMatches(text: string, patterns: RegExp[]): string[] {
  const found = new Set<string>();
  for (const pattern of patterns) {
    const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
    const re = new RegExp(pattern.source, flags);
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      found.add(match[0]);
      if (match[0].length === 0) re.lastIndex += 1;
      if (found.size >= 20) break;
    }
  }
  return [...found];
}

export function collectRolePlaceholderLeaks(text: string): string[] {
  return collectMatches(text, [ROLE_PLACEHOLDER_RE]);
}

export function collectPublicMetaLeaks(text: string): string[] {
  return [...new Set([
    ...collectMatches(text, [PUBLIC_META_RE]),
    ...collectNarrativeChapterReferenceLeaks(text),
  ])];
}

export function collectTitleQualityReasons(title: string): string[] {
  return inspectGeneratedTitle(title).reasons;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function scanChapter(params: {
  testCase: MatrixCase;
  novel: NovelMetadata;
  chapter: Chapter;
  previousChapter?: Chapter;
}): { report: ChapterScanReport; enrichedChapter: Chapter } {
  const { testCase, novel, chapter, previousChapter } = params;
  const promiseContract = buildPromiseContract({
    title: novel.title,
    synopsis: novel.synopsis,
    tags: novel.tags,
    constitutionTags: novel.constitutionTags,
    genre: novel.genre,
    platformProfile: 'fanqie',
  });
  const genreDrift = auditGenreDrift({
    chapterContent: chapter.content,
    title: novel.title,
    synopsis: novel.synopsis,
    tags: novel.tags,
    constitutionTags: novel.constitutionTags,
    genre: novel.genre,
    promiseContract,
  });
  const readabilityAudit = auditChapterReadability({
    chapterContent: chapter.content,
    readerScore: chapter.readerScore,
    previousReaderScore: previousChapter?.readerScore,
    qualityGate: chapter.diagnostics?.qualityGate,
    genreDrift,
  });
  const checkedAt = new Date().toISOString();
  const withReadability: Chapter = {
    ...chapter,
    diagnostics: {
      ...(chapter.diagnostics ?? {}),
      readabilityAudit,
      updatedAt: chapter.diagnostics?.updatedAt ?? checkedAt,
    },
  };
  const readerDelivery = auditReaderDelivery({
    chapter: withReadability,
    previousChapter,
  });
  const enrichedChapter: Chapter = {
    ...withReadability,
    diagnostics: {
      ...(withReadability.diagnostics ?? {}),
      readerDeliveryAudit: readerDelivery,
      updatedAt: withReadability.diagnostics?.updatedAt ?? checkedAt,
    },
  };
  const startupFindings = (chapter.diagnostics?.startupOpeningReport?.findings ?? []).map(finding => `${finding.code}:${finding.message}`);
  const titleQualityReasons = collectTitleQualityReasons(chapter.title);
  const rolePlaceholderLeaks = collectRolePlaceholderLeaks(chapter.content);
  const publicMetaLeaks = collectPublicMetaLeaks(chapter.content);
  const forbiddenSignals = collectMatches(chapter.content, testCase.forbiddenSignals ?? []);
  const issues = [
    ...readerDelivery.issues,
    ...genreDrift.issues,
  ];
  if (titleQualityReasons.length > 0) {
    issues.push(`标题质量：${titleQualityReasons.join('、')}`);
  }
  if (rolePlaceholderLeaks.length > 0) {
    issues.push(`角色占位词泄露：${rolePlaceholderLeaks.slice(0, 5).join('、')}`);
  }
  if (publicMetaLeaks.length > 0) {
    issues.push(`发布面元话语泄露：${publicMetaLeaks.slice(0, 5).join('、')}`);
  }
  if (forbiddenSignals.length > 0) {
    issues.push(`题材禁用漂移信号：${forbiddenSignals.slice(0, 8).join('、')}`);
  }
  const hardStartupFindings = startupFindings.filter(item =>
    /suspense-drift|missing-promise-payoff|weak-early-payoff|unclear-goal|unclear-obstacle/u.test(item),
  );
  issues.push(...hardStartupFindings.slice(0, 3).map(item => `开篇门禁：${item}`));

  return {
    enrichedChapter,
    report: {
      chapterNumber: chapter.chapterNumber,
      title: chapter.title,
      status: chapter.status,
      wordCount: chapter.wordCount,
      readerScore: chapter.readerScore,
      readerDeliveryScore: readerDelivery.score,
      readerDeliveryPassed: readerDelivery.passed,
      readerDeliveryDimensions: readerDelivery.dimensions,
      genreQualityPassed: genreDrift.qualityFloorPassed,
      promiseHits: genreDrift.promiseDrift.promiseHits,
      sceneHits: genreDrift.promiseDrift.sceneHits,
      suspenseHits: genreDrift.promiseDrift.suspenseHits,
      suspenseShare: round(genreDrift.promiseDrift.suspenseShare),
      qualityGateScore: chapter.diagnostics?.qualityGate?.overallScore,
      qualityGatePassed: chapter.diagnostics?.qualityGate?.passed,
      startupFindings,
      issues: [...new Set(issues)].slice(0, 12),
      suggestions: [...new Set([
        ...readerDelivery.suggestions,
        ...genreDrift.suggestions,
      ])].slice(0, 8),
      flags: {
        titleQualityReasons,
        rolePlaceholderLeaks,
        publicMetaLeaks,
        forbiddenSignals,
      },
    },
  };
}

function summarizeCase(params: {
  testCase: MatrixCase;
  status: CaseRunReport['status'];
  novel?: NovelMetadata;
  requestedChapters: number;
  chapters: ChapterScanReport[];
  error?: string;
}): CaseRunReport {
  const { testCase, status, novel, requestedChapters, chapters, error } = params;
  const totalScore = chapters.reduce((sum, item) => sum + item.readerDeliveryScore, 0);
  const totalWords = chapters.reduce((sum, item) => sum + item.wordCount, 0);
  return {
    caseId: testCase.id,
    label: testCase.label,
    status,
    novelId: novel?.id,
    title: novel?.title ?? testCase.title,
    genre: testCase.genre,
    constitutionTags: testCase.constitutionTags ?? [],
    requestedChapters,
    generatedChapters: chapters.length,
    error,
    chapters,
    summary: {
      readerDeliveryPassCount: chapters.filter(item => item.readerDeliveryPassed).length,
      genrePassCount: chapters.filter(item => item.genreQualityPassed).length,
      majorIssueChapterCount: chapters.filter(item => item.issues.length > 0).length,
      avgReaderDeliveryScore: chapters.length > 0 ? round(totalScore / chapters.length) : 0,
      avgWordCount: chapters.length > 0 ? round(totalWords / chapters.length) : 0,
    },
  };
}

function summarizeMatrix(apiBase: string, applied: boolean, chaptersPerCase: number, cases: CaseRunReport[]): MatrixReport {
  const allChapters = cases.flatMap(item => item.chapters);
  const readerPass = allChapters.filter(item => item.readerDeliveryPassed).length;
  const genrePass = allChapters.filter(item => item.genreQualityPassed).length;
  return {
    generatedAt: new Date().toISOString(),
    apiBase,
    applied,
    chaptersPerCase,
    cases,
    summary: {
      totalCases: cases.length,
      completedCases: cases.filter(item => item.status === 'completed').length,
      failedCases: cases.filter(item => item.status === 'failed').length,
      partialCases: cases.filter(item => item.status === 'partial').length,
      totalChapters: allChapters.length,
      readerDeliveryPassRate: allChapters.length > 0 ? round(readerPass / allChapters.length) : 0,
      genrePassRate: allChapters.length > 0 ? round(genrePass / allChapters.length) : 0,
      majorIssueChapterCount: allChapters.filter(item => item.issues.length > 0).length,
    },
  };
}

async function writeReport(report: MatrixReport, outPath: string): Promise<void> {
  const absPath = path.resolve(outPath);
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

function printDryRun(selectedCases: MatrixCase[], options: CliOptions): void {
  console.log('generation-quality-matrix dry-run');
  console.log(`apiBase=${options.apiBase}`);
  console.log(`chapters=${options.chapters}`);
  console.log(`out=${options.outPath}`);
  for (const item of selectedCases) {
    console.log(`- ${item.id} | ${item.label} | ${item.genre} | ${item.title}`);
  }
  console.log('');
  console.log('加 --apply 后才会创建小说并生成章节。');
}

function printSummary(report: MatrixReport, outPath: string): void {
  console.log('generation-quality-matrix completed');
  console.log(`report=${path.resolve(outPath)}`);
  console.log(`cases=${report.summary.totalCases}, completed=${report.summary.completedCases}, partial=${report.summary.partialCases}, failed=${report.summary.failedCases}`);
  console.log(`chapters=${report.summary.totalChapters}, readerPassRate=${report.summary.readerDeliveryPassRate}, genrePassRate=${report.summary.genrePassRate}, majorIssueChapters=${report.summary.majorIssueChapterCount}`);
  for (const item of report.cases) {
    const failed = item.chapters.filter(chapter => chapter.issues.length > 0).map(chapter => chapter.chapterNumber);
    console.log(`- ${item.caseId}: ${item.status}, novel=${item.novelId ?? 'N/A'}, chapters=${item.generatedChapters}/${item.requestedChapters}, avgReader=${item.summary.avgReaderDeliveryScore}, issueChapters=${failed.join(',') || 'none'}`);
    if (item.error) console.log(`  error=${item.error}`);
  }
}

async function runCase(params: {
  client: ApiClient;
  testCase: MatrixCase;
  options: CliOptions;
}): Promise<CaseRunReport> {
  const { client, testCase, options } = params;
  const generated: Chapter[] = [];
  let novel: NovelMetadata | undefined;
  try {
    if (options.resumeNovelId) {
      novel = await requestJson<NovelMetadata>(client, 'GET', `/novels/${options.resumeNovelId}`);
      console.log(`[matrix] resuming ${testCase.id} novel=${novel.id} ${novel.title}`);
    } else {
      console.log(`[matrix] creating ${testCase.id} ${testCase.title}`);
      novel = await createNovel(client, testCase);
    }
    const maxWordCount = options.maxWordCount ?? testCase.maxWordCount ?? DEFAULT_MAX_WORD_COUNT;
    for (let chapterNumber = 1; chapterNumber <= options.chapters; chapterNumber += 1) {
      const existingChapter = options.resumeNovelId
        ? await optionalRequestJson<Chapter>(client, 'GET', `/novels/${novel.id}/chapters/${chapterNumber}`)
        : null;
      if (existingChapter && isChapterGenerationReady(existingChapter) && !isFailedChapter(existingChapter)) {
        generated.push(existingChapter);
        console.log(`[matrix] reuse ${testCase.id} chapter=${chapterNumber} chars=${existingChapter.content.length}`);
        continue;
      }
      console.log(`[matrix] generate ${testCase.id} novel=${novel.id} chapter=${chapterNumber}`);
      await generateChapter({
        client,
        testCase,
        novelId: novel.id,
        chapterNumber,
        maxWordCount,
        startupPlatformProfile: options.startupPlatformProfile,
      });
      const chapter = await waitForChapter({
        client,
        novelId: novel.id,
        chapterNumber,
        pollMs: options.pollMs,
        timeoutMs: options.timeoutMs,
      });
      generated.push(chapter);
      console.log(`[matrix] ready ${testCase.id} chapter=${chapterNumber} chars=${chapter.content.length}`);
      await waitForGenerationSettle({
        client,
        novelId: novel.id,
        chapterNumber,
        pollMs: options.pollMs,
        settleMs: options.settleMs,
      });
    }
  } catch (err) {
    const chapters = scanCaseChapters(testCase, novel, generated);
    const status: CaseRunReport['status'] = generated.length > 0 ? 'partial' : 'failed';
    return summarizeCase({
      testCase,
      status,
      novel,
      requestedChapters: options.chapters,
      chapters,
      error: err instanceof Error ? err.message : String(err),
    });
  }
  const chapters = scanCaseChapters(testCase, novel, generated);
  return summarizeCase({
    testCase,
    status: 'completed',
    novel,
    requestedChapters: options.chapters,
    chapters,
  });
}

function scanCaseChapters(testCase: MatrixCase, novel: NovelMetadata | undefined, chapters: Chapter[]): ChapterScanReport[] {
  if (!novel) return [];
  const reports: ChapterScanReport[] = [];
  let previousChapter: Chapter | undefined;
  for (const chapter of chapters) {
    const scanned = scanChapter({
      testCase,
      novel,
      chapter,
      previousChapter,
    });
    reports.push(scanned.report);
    previousChapter = scanned.enrichedChapter;
  }
  return reports;
}

function buildPlannedReport(options: CliOptions, selectedCases: MatrixCase[]): MatrixReport {
  const planned = selectedCases.map(testCase => summarizeCase({
    testCase,
    status: 'planned',
    requestedChapters: options.chapters,
    chapters: [],
  }));
  return summarizeMatrix(options.apiBase, false, options.chapters, planned);
}

export async function runGenerationQualityMatrixCli(
  argv: string[] = process.argv.slice(2),
  invocation = 'nw dev generation-quality-matrix',
): Promise<number> {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(formatHelp(invocation));
    return 0;
  }

  const selectedCases = selectCases(options.caseIds);
  if (options.resumeNovelId && selectedCases.length !== 1) {
    throw new Error('--resume-novel 必须与且仅与一个 --case 一起使用');
  }
  if (!options.apply) {
    printDryRun(selectedCases, options);
    await writeReport(buildPlannedReport(options, selectedCases), options.outPath);
    return 0;
  }

  const client = await buildApiClient(options);
  const caseReports: CaseRunReport[] = [];
  for (const testCase of selectedCases) {
    const report = await runCase({ client, testCase, options });
    caseReports.push(report);
    await writeReport(summarizeMatrix(options.apiBase, true, options.chapters, caseReports), options.outPath);
    if (options.stopOnError && report.status !== 'completed') {
      break;
    }
  }

  const matrixReport = summarizeMatrix(options.apiBase, true, options.chapters, caseReports);
  await writeReport(matrixReport, options.outPath);
  printSummary(matrixReport, options.outPath);
  return matrixReport.summary.failedCases > 0 ? 1 : 0;
}

function isExecutedAsEntry(): boolean {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  return path.basename(fileURLToPath(import.meta.url)).startsWith(path.basename(argv1, path.extname(argv1)));
}

if (isExecutedAsEntry()) {
  void runGenerationQualityMatrixCli().then((code) => {
    process.exitCode = code;
  }).catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  });
}
