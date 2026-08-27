<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { ArrowLeft, Star, RefreshRight } from '@element-plus/icons-vue';
import { http } from '../api/http';
import MobileTopbar from '../components/mobile-focus/MobileTopbar.vue';
import MobileCharacterCard from '../components/mobile-entry/MobileCharacterCard.vue';
import MobileCharacterDetailSheet from '../components/mobile-entry/MobileCharacterDetailSheet.vue';
import { useThemeMode } from '../composables/useThemeMode';
import { usePullRefresh } from '../composables/usePullRefresh';

const router = useRouter();
const { isDark: isDarkTheme, isWarmNight } = useThemeMode();

interface EnrichedCollection {
  characterId: string;
  novelId: string;
  characterName: string;
  novelTitle: string;
  role: string;
  roleLabel: string;
  personality: string;
  appearance: string;
  currentState: string;
  tags: string[];
  collectCount: number;
  hasPortrait: boolean;
  collectedAt: string;
  /** AI 生成的读者友好卡牌标签 */
  cardBlurb?: string;
  /** 稀有度定级 */
  rarity?: 'SSR' | 'SR' | 'R' | 'N';
}

const collections = ref<EnrichedCollection[]>([]);
const loading = ref(true);

const { pullDistance, refreshing, triggered, pullContainerRef } = usePullRefresh({
  onRefresh: () => load(true),
});

/** 详情浮层状态 */
const detailNovelId = ref('');
const detailCharacterId = ref('');

/** 按小说分组 */
const groupedByNovel = computed(() => {
  const map = new Map<string, EnrichedCollection[]>();
  for (const c of collections.value) {
    const key = c.novelId;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(c);
  }
  for (const [, list] of map) {
    list.sort((a, b) => b.collectedAt.localeCompare(a.collectedAt));
  }
  return [...map.entries()];
});

const totalCharacters = computed(() => collections.value.length);
const totalNovels = computed(() => groupedByNovel.value.length);

async function load(showError = false) {
  loading.value = true;
  try {
    const { data } = await http.get('/character-cards/my?enriched=true');
    collections.value = (data.collections ?? []) as EnrichedCollection[];
  } catch (error: any) {
    if (showError) {
      ElMessage.error(error?.response?.data?.error || '加载角色图鉴失败');
    }
  } finally {
    loading.value = false;
  }
}

function openCharacterDetail(novelId: string, characterId: string) {
  detailNovelId.value = novelId;
  detailCharacterId.value = characterId;
}

function closeCharacterDetail() {
  detailCharacterId.value = '';
}

function handleCollectChanged(payload: { characterId: string; collected: boolean }) {
  if (!payload.collected) {
    // 取消收藏后从列表移除
    collections.value = collections.value.filter((c) => c.characterId !== payload.characterId);
  }
}

onMounted(load);
</script>

<template>
  <div ref="pullContainerRef" class="mobile-char-col-page mobile-focus-page" :class="{ 'mobile-focus-page--dark': isDarkTheme, 'mobile-focus-page--warm-night': isWarmNight }">
    <div
      class="mobile-focus-pull-indicator"
      :class="{
        'mobile-focus-pull-indicator--visible': pullDistance > 0,
        'mobile-focus-pull-indicator--triggered': triggered,
        'mobile-focus-pull-indicator--refreshing': refreshing,
      }"
      :style="{ '--pull-offset': pullDistance > 0 || refreshing ? '0px' : '-60px' }"
    >
      <span v-if="refreshing" class="mobile-focus-pull-spinner" />
      <span v-else class="mobile-focus-pull-arrow">↓</span>
      <span>{{ refreshing ? '刷新中...' : triggered ? '松手刷新' : '下拉刷新' }}</span>
    </div>
    <div class="mobile-focus-shell">
      <MobileTopbar title="角色图鉴" subtitle="Character Collection" :brand-size="28">
        <template #leading>
          <button class="mobile-focus-button--secondary" type="button" @click="() => router.back()">
            <el-icon :size="14"><ArrowLeft /></el-icon>
            返回
          </button>
        </template>
        <template #actions>
          <button class="mobile-focus-button--secondary" type="button" @click="load(true)">
            <el-icon :size="14"><RefreshRight /></el-icon>
            刷新
          </button>
        </template>
      </MobileTopbar>

      <!-- 加载中 -->
      <div v-if="loading && !refreshing" class="char-col-loading">
        <el-skeleton animated :rows="4" />
      </div>

      <!-- 空状态 -->
      <div v-else-if="!collections.length" class="char-col-empty">
        <div class="char-col-empty__icon">
          <el-icon :size="28"><Star /></el-icon>
        </div>
        <strong>还没有收藏任何角色</strong>
        <p>在小说详情页浏览角色卡牌，点击收藏即可在这里查看。</p>
      </div>

      <!-- 有收藏 -->
      <template v-else>
        <!-- 统计面板 -->
        <div class="char-col-stats">
          <div class="char-col-stats__item">
            <span class="char-col-stats__num">{{ totalCharacters }}</span>
            <span class="char-col-stats__label">已收藏角色</span>
          </div>
          <div class="char-col-stats__divider" />
          <div class="char-col-stats__item">
            <span class="char-col-stats__num">{{ totalNovels }}</span>
            <span class="char-col-stats__label">涉及作品</span>
          </div>
        </div>

        <!-- 按小说分组 -->
        <div
          v-for="([novelId, chars], gi) in groupedByNovel"
          :key="novelId"
          class="char-col-group"
          :style="{ animationDelay: `${gi * 0.08}s` }"
        >
          <div class="char-col-group__header">
            <h3 class="char-col-group__title">{{ chars[0]?.novelTitle || '未知作品' }}</h3>
            <span class="char-col-group__count">{{ chars.length }} 位角色</span>
          </div>
          <div class="char-col-group__grid">
            <MobileCharacterCard
              v-for="(item, ci) in chars"
              :key="item.characterId"
              :character-id="item.characterId"
              :novel-id="item.novelId"
              :name="item.characterName"
              :role="item.role"
              :role-label="item.roleLabel"
              :personality="item.personality"
              :appearance="item.appearance"
              :current-state="item.currentState"
              :tags="item.tags"
              :collect-count="item.collectCount"
              :has-portrait="item.hasPortrait"
              :initial-collected="true"
              :card-blurb="item.cardBlurb"
              :rarity="item.rarity"
              :style="{ animationDelay: `${gi * 0.08 + ci * 0.04}s` }"
              @click="openCharacterDetail(item.novelId, item.characterId)"
              @collect-changed="handleCollectChanged"
            />
          </div>
        </div>
      </template>
    </div>

    <!-- 角色详情浮层 -->
    <MobileCharacterDetailSheet
      :visible="!!detailCharacterId"
      :novel-id="detailNovelId"
      :character-id="detailCharacterId"
      @close="closeCharacterDetail"
    />
  </div>
</template>

<style scoped>
.mobile-char-col-page {
  --mobile-focus-accent: var(--star-brand-sky, #0ea5e9);
  --mobile-focus-accent-strong: var(--star-brand-teal, #14b8a6);
}

/* ============ 统计面板 ============ */
.char-col-stats {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 24px;
  padding: 20px 16px;
  margin: 0 12px 8px;
  background: var(--nw-bg-card, var(--nw-bg-secondary));
  border: 1px solid var(--nw-border);
  border-radius: 14px;
}

.char-col-stats__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.char-col-stats__num {
  font-size: 24px;
  font-weight: 800;
  color: var(--mobile-focus-accent);
  line-height: 1.1;
}

.char-col-stats__label {
  font-size: 11px;
  color: var(--nw-text-muted);
}

.char-col-stats__divider {
  width: 1px;
  height: 32px;
  background: var(--nw-border);
}

/* ============ 分组 ============ */
.char-col-group {
  padding: 0 12px 16px;
  animation: charColFadeIn 0.4s ease both;
}

.char-col-group__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 10px;
  padding: 0 4px;
}

.char-col-group__title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--nw-text-primary);
}

.char-col-group__count {
  font-size: 11px;
  color: var(--nw-text-muted);
}

/* ============ 网格 ============ */
.char-col-group__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

/* ============ 动画 ============ */
@keyframes charColFadeIn {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* ============ 加载 ============ */
.char-col-loading {
  padding: 20px 16px;
}

/* ============ 空状态 ============ */
.char-col-empty {
  padding: 48px 24px;
  text-align: center;
}

.char-col-empty__icon {
  margin: 0 auto 14px;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--mobile-focus-accent), var(--mobile-focus-accent-strong));
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
}

.char-col-empty strong {
  display: block;
  font-size: 16px;
  color: var(--nw-text-primary);
  margin-bottom: 6px;
}

.char-col-empty p {
  margin: 0;
  font-size: 13px;
  color: var(--nw-text-muted);
  line-height: 1.5;
}
</style>
