<script setup lang="ts">
import { computed } from 'vue';

import {
  NOVEL_CONSTITUTION_TAG_LIMIT,
  NOVEL_CONSTITUTION_TAG_OPTIONS,
  type NovelConstitutionTagId,
} from '../../config/novel-constitution-tags';

const props = withDefaults(defineProps<{
  modelValue: string[];
  compact?: boolean;
}>(), {
  compact: false,
});

const emit = defineEmits<{
  (e: 'update:modelValue', value: string[]): void;
}>();

const selectedSet = computed(() => new Set(props.modelValue));

const selectedDescriptions = computed(() =>
  NOVEL_CONSTITUTION_TAG_OPTIONS
    .filter((opt) => selectedSet.value.has(opt.id))
    .map((opt) => ({ label: opt.label, description: opt.description })),
);

function toggleTag(tagId: NovelConstitutionTagId): void {
  const next = new Set(props.modelValue);
  if (next.has(tagId)) {
    next.delete(tagId);
    emit('update:modelValue', [...next]);
    return;
  }
  if (next.size >= NOVEL_CONSTITUTION_TAG_LIMIT) return;
  next.add(tagId);
  emit('update:modelValue', [...next]);
}
</script>

<template>
  <div class="constitution-picker" :class="{ 'constitution-picker--compact': compact }">
    <div class="constitution-chips">
      <button
        v-for="option in NOVEL_CONSTITUTION_TAG_OPTIONS"
        :key="option.id"
        type="button"
        class="constitution-chip"
        :class="{ 'constitution-chip--active': selectedSet.has(option.id) }"
        @click="toggleTag(option.id)"
      >
        {{ option.label }}
      </button>
    </div>

    <transition name="constitution-desc-fade">
      <div v-if="selectedDescriptions.length" class="constitution-descriptions">
        <p v-for="item in selectedDescriptions" :key="item.label">
          <strong>{{ item.label }}</strong>
          <span>{{ item.description }}</span>
        </p>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.constitution-picker {
  display: grid;
  gap: 10px;
}

.constitution-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.constitution-chip {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 10px;
  border: 1px solid color-mix(in srgb, var(--star-brand-sky) 22%, var(--nw-border));
  border-radius: 999px;
  background: color-mix(in srgb, var(--nw-text-primary) 4%, transparent);
  color: var(--nw-text-secondary);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: border-color 0.2s ease, background 0.2s ease, color 0.2s ease;
}

.constitution-chip:hover {
  border-color: color-mix(in srgb, var(--star-brand-sky) 42%, var(--nw-border));
}

.constitution-chip--active {
  border-color: color-mix(in srgb, var(--star-brand-sky) 50%, var(--nw-border));
  background: color-mix(in srgb, var(--star-brand-sky) 14%, transparent);
  color: var(--star-brand-sky);
}

.constitution-descriptions {
  display: grid;
  gap: 4px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--star-brand-sky) 14%, var(--nw-border));
  background: color-mix(in srgb, var(--star-brand-sky) 5%, transparent);
}

.constitution-descriptions p {
  margin: 0;
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--nw-text-secondary);
}

.constitution-descriptions strong {
  flex-shrink: 0;
  min-width: 64px;
  font-size: 12px;
  color: var(--star-brand-sky);
}

.constitution-desc-fade-enter-active,
.constitution-desc-fade-leave-active {
  transition: opacity 0.2s ease;
}
.constitution-desc-fade-enter-from,
.constitution-desc-fade-leave-to {
  opacity: 0;
}

@media (max-width: 768px) {
  .constitution-chips {
    gap: 6px;
  }
}
</style>
