<script setup lang="ts">
/**
 * 桌面端·角色图鉴
 * 复用移动端 /character-cards/my?enriched=true API + MobileCharacterCard 逻辑
 * 桌面端用网格布局展示，支持按小说分组。
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { http } from '../../api/http';
import { Star } from '@element-plus/icons-vue';
import StateView from '../../components/shared/StateView.vue';
import Icon from '../../components/shared/Icon.vue';
import { fetchCharacters } from '../../api/characters';
import type { CharacterProfile } from '../../types';

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
  cardBlurb?: string;
  rarity?: 'SSR' | 'SR' | 'R' | 'N';
}

const router = useRouter();
const collections = ref<EnrichedCollection[]>([]);
const loading = ref(true);

const groupedByNovel = computed(() => {
  const map = new Map<string, EnrichedCollection[]>();
  for (const c of collections.value) {
    if (!map.has(c.novelId)) map.set(c.novelId, []);
    map.get(c.novelId)!.push(c);
  }
  for (const [, list] of map) {
    list.sort((a, b) => b.collectedAt.localeCompare(a.collectedAt));
  }
  return [...map.entries()];
});

const totalCharacters = computed(() => collections.value.length);
const totalNovels = computed(() => groupedByNovel.value.length);

const rarityClass: Record<string, string> = {
  SSR: 'rarity--ssr',
  SR: 'rarity--sr',
  R: 'rarity--r',
  N: 'rarity--n',
};

const rarityLabel: Record<string, string> = {
  SSR: '传说',
  SR: '稀有',
  R: '珍贵',
  N: '普通',
};

async function load() {
  loading.value = true;
  try {
    const { data } = await http.get('/character-cards/my?enriched=true');
    collections.value = (data.collections ?? []) as EnrichedCollection[];
  } catch {
    // 静默
  } finally {
    loading.value = false;
  }
}

const detailVisible = ref(false);
const detailCharacter = ref<CharacterProfile | null>(null);
const detailNovelId = ref('');

async function openCharacterDetail(novelId: string, characterId: string) {
  detailNovelId.value = novelId;
  try {
    const chars = await fetchCharacters(novelId);
    detailCharacter.value = chars.find((c) => c.id === characterId) ?? null;
    detailVisible.value = true;
  } catch {
    detailCharacter.value = null;
    detailVisible.value = true;
  }
}

function closeCharacterDetail() {
  detailVisible.value = false;
}

function handleCollectChanged(payload: { characterId: string; collected: boolean }) {
  if (!payload.collected) {
    collections.value = collections.value.filter((c) => c.characterId !== payload.characterId);
  }
}

function fmtDate(iso: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('zh-CN');
}

function portraitFor(item: EnrichedCollection): string {
  return item.hasPortrait ? `/api/novels/${item.novelId}/characters/${item.characterId}/portrait?w=200` : '';
}

onMounted(load);
</script>

<template>
  <div class="desktop-char-collection">
    <div class="collection-header">
      <h1>角色图鉴</h1>
      <p>收藏你喜爱的角色，追踪他们在故事中的成长。</p>
    </div>

    <StateView :loading="loading">
      <!-- 统计 -->
      <div v-if="collections.length" class="collection-stats">
        <div class="collection-stats__card nw-panel">
          <span class="collection-stats__num">{{ totalCharacters }}</span>
          <span class="collection-stats__label">已收藏角色</span>
        </div>
        <div class="collection-stats__card nw-panel">
          <span class="collection-stats__num">{{ totalNovels }}</span>
          <span class="collection-stats__label">涉及作品</span>
        </div>
        <div class="collection-stats__card nw-panel">
          <span class="collection-stats__num">
            {{ collections.filter((c) => c.rarity === 'SSR').length }}
          </span>
          <span class="collection-stats__label">传说级角色</span>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-if="!collections.length && !loading" class="nw-state nw-state--empty">
        <div class="empty-icon">
          <el-icon :size="32" color="#fff"><Star /></el-icon>
        </div>
        <p class="nw-state__title">还没有收藏任何角色</p>
        <p class="nw-state__desc">在小说详情页浏览角色卡牌，点击收藏即可在这里查看。</p>
      </div>

      <!-- 按小说分组 -->
      <div v-for="[novelIdKey, chars] in groupedByNovel" :key="novelIdKey" class="collection-group nw-panel">
        <div class="collection-group__head">
          <h2>{{ chars[0]?.novelTitle || '未知作品' }}</h2>
          <span class="collection-group__count">{{ chars.length }} 位角色</span>
        </div>
        <div class="collection-grid">
          <article
            v-for="item in chars"
            :key="item.characterId"
            class="char-card"
            :class="rarityClass[item.rarity ?? 'N']"
            @click="openCharacterDetail(item.novelId, item.characterId)"
          >
            <div class="char-card__portrait">
              <img v-if="portraitFor(item)" :src="portraitFor(item)" :alt="item.characterName" loading="lazy" />
              <span v-else class="char-card__initial">{{ item.characterName.slice(0, 1) }}</span>
              <span v-if="item.rarity" class="char-card__rarity">{{ item.rarity }}</span>
            </div>
            <div class="char-card__body">
              <div class="char-card__name">
                {{ item.characterName }}
                <span class="char-card__role">{{ item.roleLabel }}</span>
              </div>
              <p v-if="item.cardBlurb" class="char-card__blurb">{{ item.cardBlurb }}</p>
              <p v-else class="char-card__blurb">神秘角色，故事中见真章</p>
              <div v-if="item.tags.length" class="char-card__tags">
                <span v-for="tag in item.tags.slice(0, 3)" :key="tag" class="char-card__tag">{{ tag }}</span>
              </div>
              <div class="char-card__meta">
                <span><Icon name="star" :size="12" /> {{ item.collectCount }} 收藏</span>
                <span>收藏于 {{ fmtDate(item.collectedAt) }}</span>
              </div>
            </div>
          </article>
        </div>
      </div>
    </StateView>

    <!-- 角色详情弹窗 -->
    <el-dialog
      v-model="detailVisible"
      :title="detailCharacter?.name ?? '角色详情'"
      width="640px"
      destroy-on-close
    >
      <div v-if="detailCharacter" class="detail-content">
        <div v-if="detailCharacter.cardBlurb" class="detail-blurb">{{ detailCharacter.cardBlurb }}</div>
        <div class="detail-section">
          <h4>性格</h4>
          <p>{{ detailCharacter.personality || '未填写' }}</p>
        </div>
        <div class="detail-section">
          <h4>外貌</h4>
          <p>{{ detailCharacter.appearance || '未填写' }}</p>
        </div>
        <div class="detail-section">
          <h4>当前状态</h4>
          <p>{{ detailCharacter.currentState || '未填写' }}</p>
        </div>
      </div>
      <div v-else>加载中...</div>
      <template #footer>
        <button class="desktop-btn" @click="closeCharacterDetail">关闭</button>
        <button class="desktop-btn desktop-btn--primary" @click="router.push(`/desktop/reader/${detailNovelId}`)">
          进入作品
        </button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.desktop-char-collection {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-5);
  padding: var(--nw-space-5) 0;
}

.collection-header h1 {
  font-size: 24px;
  font-weight: 700;
  color: var(--nw-text-primary);
  margin: 0 0 6px 0;
  font-family: var(--nw-font-display);
}

.collection-header p {
  margin: 0;
  font-size: 14px;
  color: var(--nw-text-secondary);
}

.collection-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--nw-space-4);
}

.collection-stats__card {
  padding: var(--nw-space-4) var(--nw-space-5);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.collection-stats__num {
  font-size: 28px;
  font-weight: 700;
  color: var(--nw-accent-start);
  font-family: var(--nw-font-display);
  line-height: 1.1;
}

.collection-stats__label {
  font-size: 12px;
  color: var(--nw-text-muted);
}

.collection-group {
  padding: var(--nw-space-5);
}

.collection-group__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: var(--nw-space-4);
  padding-bottom: var(--nw-space-3);
  border-bottom: 1px solid var(--nw-border);
}

.collection-group__head h2 {
  font-size: 18px;
  font-weight: 700;
  color: var(--nw-text-primary);
  margin: 0;
  font-family: var(--nw-font-display);
}

.collection-group__count {
  font-size: 13px;
  color: var(--nw-text-muted);
}

.collection-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--nw-space-3);
}

.char-card {
  display: flex;
  gap: var(--nw-space-3);
  padding: var(--nw-space-3);
  border-radius: var(--nw-radius-md);
  background: var(--nw-bg-primary);
  border: 1px solid var(--nw-border);
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  overflow: hidden;
}

.char-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 3px;
  height: 100%;
  background: var(--nw-accent-start);
  opacity: 0;
  transition: opacity 0.2s ease;
}

.char-card:hover {
  border-color: var(--nw-accent-start);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.char-card:hover::before {
  opacity: 1;
}

.char-card.rarity--ssr {
  border-color: rgba(255, 215, 0, 0.4);
  background: linear-gradient(135deg, rgba(255, 215, 0, 0.04), transparent);
}

.char-card.rarity--sr {
  border-color: rgba(168, 85, 247, 0.3);
  background: linear-gradient(135deg, rgba(168, 85, 247, 0.04), transparent);
}

.char-card__portrait {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  overflow: hidden;
  background: var(--nw-accent-gradient);
  display: grid;
  place-items: center;
  flex-shrink: 0;
  position: relative;
}

.char-card__portrait img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.char-card__initial {
  color: #fff;
  font-size: 26px;
  font-weight: 700;
  font-family: var(--nw-font-display);
}

.char-card__rarity {
  position: absolute;
  top: -2px;
  right: -2px;
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 9px;
  font-weight: 700;
  background: linear-gradient(135deg, #fbbf24, #f59e0b);
  color: #fff;
  letter-spacing: 0.05em;
}

.rarity--sr .char-card__rarity {
  background: linear-gradient(135deg, #a855f7, #7c3aed);
}

.rarity--r .char-card__rarity {
  background: linear-gradient(135deg, #3b82f6, #2563eb);
}

.rarity--n .char-card__rarity {
  background: linear-gradient(135deg, #6b7280, #4b5563);
}

.char-card__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.char-card__name {
  font-size: 15px;
  font-weight: 600;
  color: var(--nw-text-primary);
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}

.char-card__role {
  font-size: 11px;
  font-weight: 500;
  color: var(--nw-accent-strong);
  padding: 1px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--nw-accent-start) 12%, transparent);
}

.char-card__blurb {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--nw-text-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.char-card__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.char-card__tag {
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 10px;
  color: var(--nw-text-muted);
  background: var(--nw-bg-secondary);
}

.char-card__meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  color: var(--nw-text-muted);
  margin-top: 4px;
}

.char-card__meta span {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.empty-icon {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--nw-accent-gradient);
  margin: 0 auto var(--nw-space-3);
}

.detail-content {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-3);
}

.detail-blurb {
  padding: var(--nw-space-3);
  background: var(--nw-bg-secondary);
  border-radius: var(--nw-radius-sm);
  border-left: 3px solid var(--nw-accent-start);
  font-size: 14px;
  line-height: 1.7;
  color: var(--nw-text-primary);
  font-style: italic;
}

.detail-section h4 {
  font-size: 12px;
  font-weight: 600;
  color: var(--nw-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0 0 4px 0;
}

.detail-section p {
  margin: 0;
  font-size: 14px;
  line-height: 1.7;
  color: var(--nw-text-primary);
}
</style>
