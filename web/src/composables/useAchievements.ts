import { ref, computed, watch } from 'vue';
import { brand } from '../config/brand';

export interface BadgeDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'reading' | 'explorer' | 'social' | 'special';
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  condition: (stats: ReadingStats) => boolean;
  progressText?: (stats: ReadingStats) => string;
}

export interface ReadingStats {
  totalChaptersRead: number;
  totalBooksRead: number;
  currentStreak: number;
  longestStreak: number;
  firstReadDate?: string;
  lastReadDate?: string;
  nightReads: number;
  morningReads: number;
  fastReads: number;
  slowReads: number;
  readChaptersByBook: Record<string, number>;
  readDates: string[];
}

const STORAGE_KEY = `${brand.slug}_reading_stats`;
const UNLOCKED_KEY = `${brand.slug}_unlocked_badges`;

const BADGE_DEFINITIONS: BadgeDefinition[] = [
  {
    id: 'first-chapter',
    name: '初入江湖',
    description: '读完第一章，开启你的小说之旅',
    icon: '🌅',
    category: 'reading',
    rarity: 'common',
    condition: (s) => s.totalChaptersRead >= 1,
  },
  {
    id: 'ten-chapters',
    name: '手不释卷',
    description: '累计阅读 10 章',
    icon: '📚',
    category: 'reading',
    rarity: 'common',
    condition: (s) => s.totalChaptersRead >= 10,
    progressText: (s) => `${Math.min(s.totalChaptersRead, 10)}/10 章`,
  },
  {
    id: 'fifty-chapters',
    name: '废寝忘食',
    description: '累计阅读 50 章',
    icon: '🔥',
    category: 'reading',
    rarity: 'rare',
    condition: (s) => s.totalChaptersRead >= 50,
    progressText: (s) => `${Math.min(s.totalChaptersRead, 50)}/50 章`,
  },
  {
    id: 'three-books',
    name: '博览群书',
    description: '阅读 3 本不同的小说',
    icon: '📖',
    category: 'explorer',
    rarity: 'common',
    condition: (s) => s.totalBooksRead >= 3,
    progressText: (s) => `${Math.min(s.totalBooksRead, 3)}/3 本`,
  },
  {
    id: 'night-owl',
    name: '夜猫子',
    description: '在深夜 23:00-5:00 阅读 5 次',
    icon: '🦉',
    category: 'special',
    rarity: 'rare',
    condition: (s) => s.nightReads >= 5,
    progressText: (s) => `${Math.min(s.nightReads, 5)}/5 次`,
  },
  {
    id: 'early-bird',
    name: '早起鸟',
    description: '在清晨 6:00-8:00 阅读 5 次',
    icon: '🐦',
    category: 'special',
    rarity: 'rare',
    condition: (s) => s.morningReads >= 5,
    progressText: (s) => `${Math.min(s.morningReads, 5)}/5 次`,
  },
  {
    id: 'streak-3',
    name: '三日不断',
    description: '连续阅读 3 天',
    icon: '⚡',
    category: 'reading',
    rarity: 'common',
    condition: (s) => s.longestStreak >= 3,
    progressText: (s) => `${Math.min(s.longestStreak, 3)}/3 天`,
  },
  {
    id: 'streak-7',
    name: '一周追更',
    description: '连续阅读 7 天',
    icon: '🌟',
    category: 'reading',
    rarity: 'epic',
    condition: (s) => s.longestStreak >= 7,
    progressText: (s) => `${Math.min(s.longestStreak, 7)}/7 天`,
  },
  {
    id: 'careful-reader',
    name: '细品慢读',
    description: '单章阅读超过 10 分钟 3 次',
    icon: '🍵',
    category: 'special',
    rarity: 'rare',
    condition: (s) => s.slowReads >= 3,
    progressText: (s) => `${Math.min(s.slowReads, 3)}/3 次`,
  },
  {
    id: 'bookworm',
    name: '书虫本虫',
    description: '累计阅读 100 章',
    icon: '🐛',
    category: 'reading',
    rarity: 'epic',
    condition: (s) => s.totalChaptersRead >= 100,
    progressText: (s) => `${Math.min(s.totalChaptersRead, 100)}/100 章`,
  },
];

const defaultStats: ReadingStats = {
  totalChaptersRead: 0,
  totalBooksRead: 0,
  currentStreak: 0,
  longestStreak: 0,
  nightReads: 0,
  morningReads: 0,
  fastReads: 0,
  slowReads: 0,
  readChaptersByBook: {},
  readDates: [],
};

let statsInstance: ReturnType<typeof createStatsStore> | null = null;

function createStatsStore() {
  const stats = ref<ReadingStats>({ ...defaultStats });
  const newlyUnlocked = ref<string[]>([]);
  let loaded = false;

  function load() {
    if (loaded) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        stats.value = { ...defaultStats, ...parsed };
      }
    } catch { /* ignore */ }
    loaded = true;
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stats.value));
    } catch { /* ignore */ }
  }

  function getUnlockedBadges(): string[] {
    try {
      const raw = localStorage.getItem(UNLOCKED_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }

  function saveUnlocked(ids: string[]) {
    try {
      localStorage.setItem(UNLOCKED_KEY, JSON.stringify(ids));
    } catch { /* ignore */ }
  }

  function computeStreak(dates: string[]): { current: number; longest: number } {
    if (dates.length === 0) return { current: 0, longest: 0 };
    const sorted = [...new Set(dates)].sort().reverse();
    let longest = 0;
    let current = 0;
    let prevDate: Date | null = null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const d of sorted) {
      const date = new Date(d);
      date.setHours(0, 0, 0, 0);
      if (prevDate === null) {
        const diffDays = Math.round((today.getTime() - date.getTime()) / 86400000);
        if (diffDays <= 1) {
          current = 1;
          longest = 1;
        } else {
          current = 0;
          longest = Math.max(longest, 1);
        }
      } else {
        const diff = Math.round((prevDate.getTime() - date.getTime()) / 86400000);
        if (diff === 1) {
          if (current > 0) current++;
          longest = Math.max(longest, current);
        } else if (diff > 1) {
          current = 0;
        }
      }
      prevDate = date;
    }
    longest = Math.max(longest, current);
    return { current, longest };
  }

  function recordChapterRead(novelId: string, chapterNumber: number, readSeconds: number) {
    load();
    const s = stats.value;
    const today = new Date().toISOString().slice(0, 10);
    const hour = new Date().getHours();

    const key = `${novelId}:${chapterNumber}`;
    const prevCountForBook = s.readChaptersByBook[novelId] ?? 0;
    if (prevCountForBook === 0) {
      s.totalBooksRead++;
    }
    s.readChaptersByBook[novelId] = prevCountForBook + 1;
    s.totalChaptersRead++;

    if (!s.readDates.includes(today)) {
      s.readDates.push(today);
    }
    s.firstReadDate = s.firstReadDate || today;
    s.lastReadDate = today;

    if (hour >= 23 || hour < 5) s.nightReads++;
    if (hour >= 6 && hour < 8) s.morningReads++;
    if (readSeconds < 180) s.fastReads++;
    if (readSeconds > 600) s.slowReads++;

    const { current, longest } = computeStreak(s.readDates);
    s.currentStreak = current;
    s.longestStreak = longest;

    save();

    const unlockedBefore = getUnlockedBadges();
    const newly: string[] = [];
    for (const badge of BADGE_DEFINITIONS) {
      if (!unlockedBefore.includes(badge.id) && badge.condition(s)) {
        newly.push(badge.id);
      }
    }
    if (newly.length > 0) {
      saveUnlocked([...unlockedBefore, ...newly]);
      newlyUnlocked.value = newly;
      setTimeout(() => { newlyUnlocked.value = []; }, 5000);
    }

    return newly;
  }

  const unlockedBadgeIds = computed(() => {
    load();
    return getUnlockedBadges();
  });

  const unlockedCount = computed(() => unlockedBadgeIds.value.length);
  const totalCount = computed(() => BADGE_DEFINITIONS.length);

  const badges = computed(() =>
    BADGE_DEFINITIONS.map((b) => ({
      ...b,
      unlocked: unlockedBadgeIds.value.includes(b.id),
      progress: b.progressText ? b.progressText(stats.value) : undefined,
    })),
  );

  const badgesByCategory = computed(() => {
    const groups: Record<string, typeof badges.value> = {};
    for (const b of badges.value) {
      if (!groups[b.category]) groups[b.category] = [];
      groups[b.category].push(b);
    }
    return groups;
  });

  return {
    stats,
    badges,
    badgesByCategory,
    unlockedBadgeIds,
    unlockedCount,
    totalCount,
    newlyUnlocked,
    recordChapterRead,
    load,
  };
}

export function useAchievements() {
  if (!statsInstance) {
    statsInstance = createStatsStore();
  }
  return statsInstance;
}

export { BADGE_DEFINITIONS };
