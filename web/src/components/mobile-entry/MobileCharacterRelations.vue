<script setup lang="ts">
import { ref, watch } from 'vue';
import { fetchCharacterGrowth, type RelationCard } from '../../api/character-growth';

const props = defineProps<{
  novelId: string;
  characterId: string;
}>();

const relations = ref<RelationCard[]>([]);
const loading = ref(false);
const loadFailed = ref(false);
const expandedOtherId = ref<string | null>(null);

async function load() {
  if (!props.characterId || !props.novelId) return;
  loading.value = true;
  loadFailed.value = false;
  try {
    const data = await fetchCharacterGrowth(props.novelId, props.characterId);
    relations.value = data.relations ?? [];
  } catch {
    relations.value = [];
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

const LABEL_COLOR: Record<string, string> = {
  宿敌: '#ef4444',
  盟友: '#10b981',
  同行者: '#0ea5e9',
  过客: '#94a3b8',
};

function toggle(otherId: string) {
  expandedOtherId.value = expandedOtherId.value === otherId ? null : otherId;
}
</script>

<template>
  <div v-if="loading" class="char-relations__hint">加载人物关系…</div>
  <div v-else-if="loadFailed" class="char-relations__hint">人物关系加载失败</div>
  <div v-else-if="!relations.length" class="char-relations__hint">该角色尚未建立显著关系</div>

  <div v-else class="char-relations">
    <h3 class="char-relations__title">人物关系</h3>
    <div
      v-for="r in relations"
      :key="r.otherId"
      class="char-relation"
    >
      <div
        class="char-relation__head"
        :class="{ 'is-clickable': !!r.bestExchange }"
        @click="r.bestExchange && toggle(r.otherId)"
      >
        <span class="char-relation__name">{{ r.otherName }}</span>
        <span
          v-if="r.label"
          class="char-relation__label"
          :style="{ background: LABEL_COLOR[r.label] ?? '#94a3b8' }"
        >{{ r.label }}</span>
        <span class="char-relation__count">交锋 {{ r.encounters }} 次 · 同框 {{ r.coAppearances }} 章</span>
        <span v-if="r.bestExchange" class="char-relation__expand">
          {{ expandedOtherId === r.otherId ? '收起' : '名交锋' }}
        </span>
      </div>

      <div
        v-if="expandedOtherId === r.otherId && r.bestExchange"
        class="char-relation__exchange"
      >
        <div
          v-for="(line, i) in r.bestExchange.lines"
          :key="i"
          :class="['char-relation__line', line.speakerId === r.otherId ? 'is-other' : 'is-self']"
        >
          {{ line.text }}
        </div>
        <div class="char-relation__exchange-chapter">— 第 {{ r.bestExchange.chapter }} 章</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.char-relations__hint {
  padding: 14px 0;
  text-align: center;
  font-size: 13px;
  color: var(--nw-text-muted, #94a3b8);
}

.char-relations {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.char-relations__title {
  margin: 0 0 2px;
  font-size: 13px;
  font-weight: 700;
  color: var(--nw-text-secondary, #475569);
}

.char-relation {
  padding: 10px 12px;
  background: rgba(148, 163, 184, 0.06);
  border: 1px solid var(--nw-border, rgba(148, 163, 184, 0.16));
  border-radius: 10px;
}
.char-relation__head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.char-relation__head.is-clickable {
  cursor: pointer;
}
.char-relation__name {
  font-size: 14px;
  font-weight: 600;
  color: var(--nw-text-primary, #1e293b);
}
.char-relation__label {
  font-size: 10px;
  font-weight: 700;
  color: #fff;
  padding: 2px 8px;
  border-radius: 999px;
}
.char-relation__count {
  font-size: 11px;
  color: var(--nw-text-muted, #94a3b8);
}
.char-relation__expand {
  margin-left: auto;
  font-size: 11px;
  color: var(--mobile-focus-accent);
  font-weight: 600;
}

.char-relation__exchange {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed var(--nw-border, rgba(148, 163, 184, 0.2));
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.char-relation__line {
  max-width: 82%;
  font-size: 12.5px;
  line-height: 1.5;
  padding: 6px 10px;
  border-radius: 10px;
}
.char-relation__line.is-other {
  align-self: flex-start;
  background: color-mix(in srgb, var(--nw-text-primary) 6%, transparent);
  color: var(--nw-text-secondary, #475569);
  border-bottom-left-radius: 2px;
}
.char-relation__line.is-self {
  align-self: flex-end;
  background: rgba(99, 102, 241, 0.12);
  color: var(--mobile-focus-accent-strong);
  border-bottom-right-radius: 2px;
}
.char-relation__exchange-chapter {
  margin-top: 4px;
  font-size: 10px;
  color: var(--nw-text-muted, #94a3b8);
  text-align: right;
}
</style>
