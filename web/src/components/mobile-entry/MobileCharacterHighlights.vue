<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  fetchCharacterGrowth,
  type CharacterQuote,
  type CharacterScene,
  type CharacterStateSnapshot,
} from '../../api/character-growth';
import type { CharacterEvent } from '../../api/characters';
import MobileCharacterStats from './MobileCharacterStats.vue';
import MobileCharacterGrowthTimeline from './MobileCharacterGrowthTimeline.vue';

const props = defineProps<{
  novelId: string;
  characterId: string;
}>();

const quotes = ref<CharacterQuote[]>([]);
const scenes = ref<CharacterScene[]>([]);
const snapshots = ref<CharacterStateSnapshot[]>([]);
const events = ref<CharacterEvent[]>([]);
const loading = ref(false);
const loadFailed = ref(false);

async function load() {
  if (!props.characterId || !props.novelId) return;
  loading.value = true;
  loadFailed.value = false;
  try {
    const data = await fetchCharacterGrowth(props.novelId, props.characterId);
    // 后端已按 score 降序、chapter 降序返回，取前几条展示
    quotes.value = (data.quotes ?? []).slice(0, 3);
    scenes.value = (data.scenes ?? []).slice(0, 3);
    snapshots.value = data.snapshots ?? [];
    events.value = data.events ?? [];
  } catch {
    quotes.value = [];
    scenes.value = [];
    snapshots.value = [];
    events.value = [];
    loadFailed.value = true;
  } finally {
    loading.value = false;
  }
}

watch(
  () => [props.novelId, props.characterId] as const,
  () => { void load(); },
  { immediate: true },
);

const hasData = computed(() => (
  quotes.value.length > 0 || scenes.value.length > 0 || events.value.length > 0
));

/** 基于最新 snapshot 推断「此刻状态」切片（替代空泛的 cardBlurb） */
const currentStatus = computed<{ text: string; color: string } | null>(() => {
  const snaps = snapshots.value;
  if (snaps.length === 0) return null;
  const latest = snaps[snaps.length - 1];
  const { intensity, stress, primary } = latest.emotionState;
  const goal = latest.goalProgress;
  if (stress > 70 && goal > 50) return { text: '蓄势反击 · 风暴前夕', color: '#f59e0b' };
  if (intensity > 60 && (primary === 'anger' || primary === 'sadness')) {
    return { text: '情绪激荡 · 至暗时刻', color: '#ef4444' };
  }
  if (goal > 80) return { text: '势如破竹 · 步步紧逼', color: '#10b981' };
  if (stress < 40 && intensity < 30) return { text: '从容布局 · 静水流深', color: '#0ea5e9' };
  return { text: '故事仍在展开…', color: '#6366f1' };
});
</script>

<template>
  <div v-if="loading" class="char-highlights__hint">加载高光时刻…</div>
  <div v-else-if="loadFailed" class="char-highlights__hint">高光时刻加载失败</div>
  <div v-else class="char-highlights">
    <!-- 此刻状态：基于最新 snapshot 的动态切片 -->
    <div
      v-if="currentStatus"
      class="char-highlights__status"
      :style="{ color: currentStatus.color, borderColor: currentStatus.color }"
    >
      <span class="char-highlights__status-dot" :style="{ background: currentStatus.color }" />
      此刻 · {{ currentStatus.text }}
    </div>

    <!-- 趣味数据卡 -->
    <MobileCharacterStats :snapshots="snapshots" :quotes="quotes" />

    <MobileCharacterGrowthTimeline :events="events" />

    <!-- 金句：粉丝第一眼看到的灵魂 -->
    <div v-if="quotes.length" class="char-highlights__quotes">
      <figure v-for="(q, i) in quotes" :key="`q-${i}`" class="char-highlights__quote">
        <span class="char-highlights__quote-mark">“</span>
        <blockquote class="char-highlights__quote-text">{{ q.text }}</blockquote>
        <figcaption class="char-highlights__quote-cite">— 第 {{ q.chapter }} 章</figcaption>
      </figure>
    </div>

    <!-- 高光时刻：关键章节的名场面片段 -->
    <div v-if="scenes.length" class="char-highlights__scenes">
      <h3 class="char-highlights__section-title">高光时刻</h3>
      <div v-for="(s, i) in scenes" :key="`s-${i}`" class="char-highlights__scene">
        <span class="char-highlights__scene-chapter">第 {{ s.chapter }} 章</span>
        <p class="char-highlights__scene-text">{{ s.text }}</p>
      </div>
    </div>

    <div v-if="!hasData && !currentStatus" class="char-highlights__empty">
      <div class="char-highlights__empty-icon">✦</div>
      <div class="char-highlights__empty-title">该角色尚未积累高光时刻</div>
      <div class="char-highlights__empty-sub">随着剧情推进，金句与名场面会自动浮现</div>
    </div>
  </div>
</template>

<style scoped>
.char-highlights {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.char-highlights__hint {
  padding: 14px 0;
  text-align: center;
  font-size: 13px;
  color: var(--nw-text-muted, #94a3b8);
}

/* 此刻状态 */
.char-highlights__status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  border-left: 3px solid;
  background: rgba(99, 102, 241, 0.05);
  border-radius: 0 10px 10px 0;
  font-size: 13px;
  font-weight: 600;
}
.char-highlights__status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

/* 空状态 */
.char-highlights__empty {
  text-align: center;
  padding: 20px 0;
}
.char-highlights__empty-icon {
  font-size: 24px;
  color: color-mix(in srgb, var(--mobile-focus-accent) 60%, var(--nw-text-primary));
}
.char-highlights__empty-title {
  margin-top: 8px;
  font-size: 13px;
  color: var(--nw-text-muted, #94a3b8);
}
.char-highlights__empty-sub {
  margin-top: 3px;
  font-size: 11px;
  color: var(--nw-text-muted);
}

/* ===== 金句 ===== */
.char-highlights__quotes {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.char-highlights__quote {
  position: relative;
  margin: 0;
  padding: 12px 14px 10px 30px;
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.08), rgba(168, 85, 247, 0.04));
  border-left: 3px solid #6366f1;
  border-radius: 0 12px 12px 0;
}
.char-highlights__quote-mark {
  position: absolute;
  left: 6px;
  top: -2px;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 34px;
  line-height: 1;
  color: rgba(99, 102, 241, 0.32);
  user-select: none;
}
.char-highlights__quote-text {
  margin: 0;
  font-size: 15px;
  line-height: 1.55;
  font-weight: 600;
  letter-spacing: 0.2px;
  color: var(--nw-text-primary, #1e293b);
}
.char-highlights__quote-cite {
  margin-top: 6px;
  font-size: 11px;
  color: var(--nw-text-muted, #94a3b8);
  text-align: right;
}

/* ===== 高光时刻 ===== */
.char-highlights__scenes {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.char-highlights__section-title {
  margin: 0 0 2px;
  font-size: 13px;
  font-weight: 700;
  color: var(--nw-text-secondary, #475569);
}
.char-highlights__scene {
  padding: 10px 12px;
  background: rgba(148, 163, 184, 0.06);
  border: 1px solid var(--nw-border, rgba(148, 163, 184, 0.16));
  border-radius: 10px;
}
.char-highlights__scene-chapter {
  display: inline-block;
  font-size: 10px;
  font-weight: 700;
  color: var(--mobile-focus-accent);
  background: rgba(99, 102, 241, 0.1);
  padding: 2px 8px;
  border-radius: 999px;
  margin-bottom: 6px;
}
.char-highlights__scene-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--nw-text-secondary, #475569);
}
</style>
