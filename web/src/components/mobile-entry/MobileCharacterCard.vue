<script setup lang="ts">
import { ref, computed } from 'vue';
import { StarFilled } from '@element-plus/icons-vue';
import { fetchCharacterCardCollected, toggleCharacterCardCollect } from '../../api/character-cards';

const props = defineProps<{
  characterId: string;
  novelId: string;
  name: string;
  role: string;
  roleLabel: string;
  personality?: string;
  appearance?: string;
  currentState?: string;
  tags?: string[];
  collectCount?: number;
  hasPortrait?: boolean;
  initialCollected?: boolean;
  /** AI 生成的读者友好卡牌标签 */
  cardBlurb?: string;
  /** 稀有度 */
  rarity?: 'SSR' | 'SR' | 'R' | 'N';
}>();

const emit = defineEmits<{
  (e: 'click'): void;
  (e: 'collect-changed', payload: { characterId: string; collected: boolean; collectCount: number }): void;
}>();

const isFlipped = ref(false);
const isCollected = ref(props.initialCollected ?? false);
const collectCount = ref(props.collectCount ?? 0);
const collecting = ref(false);

/** 过滤掉内部/英文标签，只保留有中文的标签 */
const displayTags = computed(() =>
  (props.tags ?? []).filter((t) => /[\u4e00-\u9fff]/.test(t)).slice(0, 3),
);

/** 仅在有实质中文内容时才展示 */
const displayPersonality = computed(() => {
  if (!props.personality) return '';
  const trimmed = props.personality.slice(0, 80);
  return /[\u4e00-\u9fff]/.test(trimmed) ? trimmed : '';
});

const displayAppearance = computed(() => {
  if (!props.appearance) return '';
  const trimmed = props.appearance.slice(0, 80);
  return /[\u4e00-\u9fff]/.test(trimmed) ? trimmed : '';
});

/** 卡片正面展示的角色特征摘要：优先 cardBlurb，否则 personality，最后 appearance */
const statusSummary = computed(() => {
  const source = (props.cardBlurb || props.personality || props.appearance || '').trim();
  if (!source) return '';
  const maxLen = 72;
  return source.length > maxLen ? source.slice(0, maxLen) + '...' : source;
});

const hasBackContent = computed(() => !!(displayPersonality.value || displayAppearance.value));

const roleColors: Record<string, string> = {
  protagonist: 'var(--role-protagonist-base)',
  deuteragonist: 'var(--role-deuteragonist-base)',
  antagonist: 'var(--role-antagonist-base)',
  rival: 'var(--role-rival-base)',
  love_interest: 'var(--role-love-interest-base)',
  mentor: 'var(--role-mentor-base)',
  ally: 'var(--role-ally-base)',
  faction_leader: 'var(--role-faction-leader-base)',
  supporting: 'var(--role-supporting-base)',
  family: 'var(--role-family-base)',
  comic_relief: 'var(--role-comic-relief-base)',
  minor: 'var(--role-minor-base)',
};

const cardColor = computed(() => roleColors[props.role] ?? '#0ea5e9');

function toggleFlip() {
  isFlipped.value = !isFlipped.value;
}

async function checkCollected() {
  try {
    isCollected.value = await fetchCharacterCardCollected(props.characterId);
  } catch { /* ignore */ }
}

async function toggleCollect(e: Event) {
  e.stopPropagation();
  if (collecting.value) return;
  collecting.value = true;
  try {
    const data = await toggleCharacterCardCollect({
      characterId: props.characterId,
      novelId: props.novelId,
      characterName: props.name,
    });
    isCollected.value = data.collected as boolean;
    collectCount.value = Math.max(0, collectCount.value + (isCollected.value ? 1 : -1));
    emit('collect-changed', {
      characterId: props.characterId,
      collected: isCollected.value,
      collectCount: collectCount.value,
    });
  } catch { /* ignore */ }
  finally { collecting.value = false; }
}

checkCollected();
</script>

<template>
  <div class="char-card-wrapper" @click="emit('click')">
    <div :class="['char-card', { 'is-flipped': isFlipped }]">
      <!-- 正面 -->
      <div class="char-card__face char-card__face--front">
        <!-- 稀有度徽章 -->
        <span v-if="rarity && rarity !== 'N'" :class="['char-card__rarity-badge', `char-card__rarity-badge--${rarity}`]">{{ rarity }}</span>
        <div class="char-card__portrait" :style="!hasPortrait ? { background: `linear-gradient(135deg, ${cardColor}, color-mix(in srgb, ${cardColor} 42%, #000))` } : {}">
          <img v-if="hasPortrait" :src="`/api/novels/${novelId}/characters/${characterId}/portrait?w=360`" alt="" class="char-card__avatar-img" />
          <span v-else class="char-card__avatar-text">{{ name.slice(0, 2) }}</span>
        </div>
        <div class="char-card__content">
          <div class="char-card__info">
            <span class="char-card__role" :style="{ color: cardColor }">{{ roleLabel }}</span>
            <strong class="char-card__name">{{ name }}</strong>
            <p v-if="statusSummary" class="char-card__status">{{ statusSummary }}</p>
            <div v-if="displayTags.length" class="char-card__tags">
              <span v-for="tag in displayTags" :key="tag" class="char-card__tag">{{ tag }}</span>
            </div>
          </div>
          <div class="char-card__actions">
            <button
              :class="['char-card__collect-btn', { 'is-active': isCollected }]"
              :disabled="collecting"
              @click="toggleCollect"
            >
              <el-icon :size="16"><StarFilled /></el-icon>
              <span>{{ collectCount }}</span>
            </button>
            <button class="char-card__flip-btn" @click.stop="toggleFlip">详情</button>
          </div>
        </div>
      </div>

      <!-- 背面 -->
      <div class="char-card__face char-card__face--back">
        <div class="char-card__back-content">
          <div v-if="displayPersonality" class="char-card__back-section">
            <strong>性格</strong>
            <p>{{ displayPersonality }}{{ (props.personality?.length ?? 0) > 80 ? '...' : '' }}</p>
          </div>
          <div v-if="displayAppearance" class="char-card__back-section">
            <strong>外貌</strong>
            <p>{{ displayAppearance }}{{ (props.appearance?.length ?? 0) > 80 ? '...' : '' }}</p>
          </div>
          <div v-if="!hasBackContent" class="char-card__back-empty">
            暂无更多信息
          </div>
        </div>
        <button class="char-card__flip-btn" @click.stop="toggleFlip">返回</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.char-card-wrapper {
  perspective: 800px;
}

.char-card {
  position: relative;
  width: 100%;
  min-height: 432px;
  transform-style: preserve-3d;
  transition: transform 0.5s ease;
}

.char-card.is-flipped {
  transform: rotateY(180deg);
}

.char-card__face {
  position: absolute;
  inset: 0;
  backface-visibility: hidden;
  border-radius: 18px;
  background: color-mix(in srgb, var(--nw-bg-card) 92%, var(--nw-bg-secondary));
  backdrop-filter: blur(8px);
  border: 1px solid var(--nw-border);
  padding: 10px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 12px 28px color-mix(in srgb, var(--nw-text-primary) 8%, transparent);
  overflow: hidden;
}

.char-card__face--front {
  display: grid;
  grid-template-rows: 218px minmax(0, 1fr);
  gap: 10px;
}

.char-card__face--back {
  transform: rotateY(180deg);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.char-card__portrait {
  width: 100%;
  height: 218px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
  background: var(--mobile-focus-surface-muted);
}

.char-card__avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center top;
}

.char-card__avatar-text {
  color: #fff;
  font-size: 28px;
  font-weight: 700;
}

.char-card__content {
  min-height: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 8px;
}

.char-card__info {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  min-height: 0;
}

.char-card__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 18px;
  line-height: 1.2;
  color: var(--nw-text-primary, #102033);
}

.char-card__role {
  width: fit-content;
  font-size: 12px;
  line-height: 1.1;
  font-weight: 800;
}

.char-card__status {
  min-height: 38px;
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  color: var(--nw-text-secondary);
  font-size: 12px;
  line-height: 1.55;
}

.char-card__tags {
  min-height: 44px;
  max-height: 44px;
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
  gap: 4px;
  margin-top: 4px;
  overflow: hidden;
}

.char-card__tag {
  max-width: 100%;
  box-sizing: border-box;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  line-height: 20px;
  padding: 1px 8px;
  border-radius: 4px;
  background: rgba(148, 163, 184, 0.12);
  color: var(--nw-text-muted, #5d7188);
}

.char-card__actions {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.char-card__collect-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  background: rgba(148, 163, 184, 0.08);
  border: none;
  min-width: 58px;
  height: 34px;
  padding: 0 10px;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  color: var(--nw-text-muted, #5d7188);
  transition: all 0.15s;
}

.char-card__collect-btn.is-active {
  background: rgba(234, 179, 8, 0.12);
  color: color-mix(in srgb, #f59e0b 80%, var(--nw-text-primary));
}

.char-card__flip-btn {
  background: none;
  border: 1px solid rgba(148, 163, 184, 0.2);
  height: 34px;
  padding: 0 12px;
  border-radius: 8px;
  font-size: 12px;
  cursor: pointer;
  color: var(--nw-text-muted, #5d7188);
}

.char-card__back-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.char-card__back-section strong {
  font-size: 13px;
  color: var(--nw-text-primary);
}

.char-card__back-section p {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--nw-text-secondary);
  line-height: 1.5;
}

.char-card__back-empty {
  color: var(--nw-text-muted);
  font-size: 13px;
  text-align: center;
  padding: 20px 0;
}

@media (max-width: 420px) {
  .char-card {
    min-height: 468px;
  }

  .char-card__portrait {
    height: 250px;
  }

  .char-card__face--front {
    grid-template-rows: 250px minmax(0, 1fr);
  }
}

/* ============ 稀有度徽章 ============ */
.char-card__rarity-badge {
  position: absolute;
  top: 14px;
  right: 14px;
  z-index: 2;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.5px;
  pointer-events: none;
}

.char-card__rarity-badge--SSR {
  background: linear-gradient(135deg, #f59e0b, #d97706);
  color: #fff;
  box-shadow: 0 0 12px rgba(245, 158, 11, 0.5);
}

.char-card__rarity-badge--SR {
  background: linear-gradient(135deg, #94a3b8, #64748b);
  color: #fff;
  box-shadow: 0 0 8px rgba(148, 163, 184, 0.4);
}

.char-card__rarity-badge--R {
  background: linear-gradient(135deg, #d4a574, #b0815a);
  color: #fff;
}
</style>
