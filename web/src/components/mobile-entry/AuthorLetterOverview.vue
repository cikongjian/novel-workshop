<template>
  <Teleport to="body">
    <div v-if="visible" class="author-letter-overview mobile-focus-light-vars">
      <div class="author-letter-overview__sheet" role="dialog" aria-modal="true" aria-label="角色信箱">
        <div class="author-letter-overview__header">
          <span class="author-letter-overview__title">角色信箱</span>
          <button class="author-letter-overview__close" @click="close">关闭</button>
        </div>

        <div v-if="loading" class="author-letter-overview__loading">加载中...</div>

        <template v-else>
          <!-- 统计概览 -->
          <div class="author-letter-overview__stats">
            <div class="author-letter-overview__stat">
              <div class="author-letter-overview__stat-num">{{ total }}</div>
              <div class="author-letter-overview__stat-label">总信件</div>
            </div>
            <div class="author-letter-overview__stat">
              <div class="author-letter-overview__stat-num">{{ stats.length }}</div>
              <div class="author-letter-overview__stat-label">涉及角色</div>
            </div>
          </div>

          <!-- 角色筛选 -->
          <div v-if="stats.length > 0" class="author-letter-overview__filters">
            <button
              class="author-letter-overview__filter"
              :class="{ 'is-active': selectedCharacterId === 'all' }"
              type="button"
              @click="selectCharacter('all')"
            >
              <span class="author-letter-overview__filter-name">全部来信</span>
              <span class="author-letter-overview__filter-count">{{ total }} 封</span>
            </button>
            <button
              v-for="stat in stats"
              :key="stat.characterId"
              class="author-letter-overview__filter"
              :class="{ 'is-active': selectedCharacterId === stat.characterId }"
              type="button"
              @click="selectCharacter(stat.characterId)"
            >
              <span class="author-letter-overview__filter-name">{{ stat.characterName }}</span>
              <span class="author-letter-overview__filter-meta">{{ stat.characterRole }}</span>
              <span class="author-letter-overview__filter-count">{{ stat.count }} 封</span>
            </button>
          </div>

          <!-- 信件列表 -->
          <div v-if="filteredLetters.length > 0" class="author-letter-overview__list">
            <button
              v-for="letter in filteredLetters"
              :key="letter.id"
              class="author-letter-overview__letter"
              :class="{ 'is-expanded': expandedLetterId === letter.id }"
              type="button"
              @click="toggleLetter(letter.id)"
            >
              <div class="author-letter-overview__letter-top">
                <span class="author-letter-overview__letter-char">给 {{ letter.characterName }}</span>
                <span class="author-letter-overview__letter-time">{{ formatTime(letter.createdAt) }}</span>
              </div>
              <div class="author-letter-overview__letter-msg">{{ letter.readerMessage }}</div>
              <div class="author-letter-overview__letter-reply-block">
                <span class="author-letter-overview__reply-label">
                  {{ expandedLetterId === letter.id ? '角色回信' : '回信摘要' }}
                </span>
                <div class="author-letter-overview__letter-reply">{{ letter.replyContent }}</div>
              </div>
              <span class="author-letter-overview__letter-action">
                {{ expandedLetterId === letter.id ? '收起详情' : '查看全文' }}
              </span>
            </button>
          </div>

          <div v-else-if="total === 0" class="author-letter-overview__empty">
            还没有读者来信，分享你的作品让更多人来互动吧
          </div>
          <div v-else class="author-letter-overview__empty">
            {{ activeCharacterName }} 暂时还没有新的来信
          </div>
        </template>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { fetchNovelLetters, type LetterRecord, type CharacterLetterStat } from '../../api/character-mail';

const props = defineProps<{
  visible: boolean;
  novelId: string;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const loading = ref(false);
const letters = ref<LetterRecord[]>([]);
const stats = ref<CharacterLetterStat[]>([]);
const total = ref(0);
const selectedCharacterId = ref<string>('all');
const expandedLetterId = ref<string | null>(null);

const filteredLetters = computed(() => {
  if (selectedCharacterId.value === 'all') return letters.value;
  return letters.value.filter((letter) => letter.characterId === selectedCharacterId.value);
});

const activeCharacterName = computed(() => (
  stats.value.find((stat) => stat.characterId === selectedCharacterId.value)?.characterName ?? '这个角色'
));

watch(
  () => props.visible,
  async (val) => {
    if (val && props.novelId) {
      loading.value = true;
      selectedCharacterId.value = 'all';
      expandedLetterId.value = null;
      try {
        const data = await fetchNovelLetters(props.novelId);
        letters.value = data.letters ?? [];
        stats.value = data.stats ?? [];
        total.value = data.total ?? 0;
      } catch {
        letters.value = [];
        stats.value = [];
        total.value = 0;
      } finally {
        loading.value = false;
      }
    }
  },
);

function close() {
  emit('close');
}

function selectCharacter(characterId: string) {
  selectedCharacterId.value = characterId;
  expandedLetterId.value = null;
}

function toggleLetter(letterId: string) {
  expandedLetterId.value = expandedLetterId.value === letterId ? null : letterId;
}

function formatTime(ts: number): string {
  const now = Date.now();
  const diff = now - ts;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return `${Math.floor(diff / 86_400_000)} 天前`;
}
</script>

<style scoped>
.author-letter-overview,
.author-letter-overview * {
  box-sizing: border-box;
}

.author-letter-overview {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: stretch;
  justify-content: center;
  width: 100vw;
  height: 100dvh;
  background: rgba(0, 0, 0, 0.5);
  overflow: hidden;
}

.author-letter-overview__sheet {
  width: min(100vw, 480px);
  height: 100dvh;
  padding: max(16px, env(safe-area-inset-top, 0px)) 16px max(16px, env(safe-area-inset-bottom, 0px));
  display: flex;
  flex-direction: column;
  background: var(--nw-bg-secondary);
  color: var(--nw-text-primary);
  overflow: hidden;
}
.author-letter-overview__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--nw-border) 46%, transparent);
  flex-shrink: 0;
}
.author-letter-overview__title {
  font-size: 16px;
  font-weight: 600;
  color: var(--nw-text-primary);
}
.author-letter-overview__close {
  background: none;
  border: none;
  font-size: 14px;
  color: var(--nw-text-secondary);
  cursor: pointer;
}
.author-letter-overview__loading,
.author-letter-overview__empty {
  padding: 40px 16px;
  text-align: center;
  color: var(--nw-text-muted);
  font-size: 14px;
}
.author-letter-overview__stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  padding: 16px 0;
  flex-shrink: 0;
}
.author-letter-overview__stat {
  min-width: 0;
  text-align: center;
  padding: 16px;
  background: var(--mobile-focus-surface-muted);
  border-radius: 12px;
}
.author-letter-overview__stat-num {
  font-size: 24px;
  font-weight: 700;
  color: var(--mobile-focus-accent);
}
.author-letter-overview__stat-label {
  font-size: 12px;
  color: var(--nw-text-muted);
  margin-top: 4px;
}
.author-letter-overview__filters {
  display: flex;
  gap: 8px;
  width: calc(100% + 32px);
  margin: 0 -16px;
  padding: 6px 16px 14px;
  flex-shrink: 0;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
}
.author-letter-overview__filters::-webkit-scrollbar {
  display: none;
}
.author-letter-overview__filter {
  display: grid;
  gap: 2px;
  min-width: 104px;
  max-width: 136px;
  padding: 9px 12px;
  border: 1px solid color-mix(in srgb, var(--nw-border) 70%, transparent);
  border-radius: 10px;
  background: var(--nw-bg-secondary);
  color: var(--nw-text-secondary);
  text-align: left;
  cursor: pointer;
  flex-shrink: 0;
}
.author-letter-overview__filter.is-active {
  border-color: color-mix(in srgb, var(--mobile-focus-accent) 32%, var(--nw-border));
  background: color-mix(in srgb, var(--mobile-focus-accent) 12%, var(--nw-bg-secondary));
  color: color-mix(in srgb, var(--mobile-focus-accent) 86%, var(--nw-text-primary));
}
.author-letter-overview__filter-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--nw-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.author-letter-overview__filter.is-active .author-letter-overview__filter-name {
  color: color-mix(in srgb, var(--mobile-focus-accent) 90%, var(--nw-text-primary));
}
.author-letter-overview__filter-meta {
  font-size: 11px;
  color: var(--nw-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.author-letter-overview__filter-count {
  font-size: 12px;
  font-weight: 600;
  color: currentColor;
}
.author-letter-overview__list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding-bottom: 8px;
}
.author-letter-overview__letter {
  display: block;
  width: 100%;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--nw-border) 46%, transparent);
  border-radius: 10px;
  margin-bottom: 8px;
  background: var(--nw-bg-secondary);
  text-align: left;
  cursor: pointer;
}
.author-letter-overview__letter-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}
.author-letter-overview__letter-char {
  font-size: 14px;
  font-weight: 600;
  color: var(--nw-text-primary);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.author-letter-overview__letter-time {
  font-size: 11px;
  color: var(--nw-text-muted);
  flex-shrink: 0;
}
.author-letter-overview__letter-msg {
  font-size: 13px;
  color: var(--nw-text-secondary);
  line-height: 1.5;
  margin-bottom: 6px;
  overflow-wrap: anywhere;
}
.author-letter-overview__letter:not(.is-expanded) .author-letter-overview__letter-msg,
.author-letter-overview__letter:not(.is-expanded) .author-letter-overview__letter-reply {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.author-letter-overview__letter:not(.is-expanded) .author-letter-overview__letter-msg {
  -webkit-line-clamp: 2;
}
.author-letter-overview__letter:not(.is-expanded) .author-letter-overview__letter-reply {
  -webkit-line-clamp: 2;
}
.author-letter-overview__letter-reply-block {
  padding: 8px;
  background: color-mix(in srgb, var(--mobile-focus-status-gold) 10%, var(--nw-bg-secondary));
  border-radius: 6px;
}
.author-letter-overview__reply-label {
  display: block;
  margin-bottom: 4px;
  font-size: 11px;
  font-weight: 600;
  color: color-mix(in srgb, var(--mobile-focus-status-gold) 86%, var(--nw-text-primary));
}
.author-letter-overview__letter-reply {
  font-size: 12px;
  color: var(--nw-text-muted);
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.author-letter-overview__letter-action {
  display: inline-flex;
  margin-top: 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--mobile-focus-accent);
}
</style>
