<script setup lang="ts">
import { ref, computed } from 'vue';
import { Smile } from '@element-plus/icons-vue';

const props = defineProps<{
  visible: boolean;
}>();

const emit = defineEmits<{
  select: [emoji: string];
  close: [];
}>();

const activeCategory = ref(0);

const categories = [
  { name: '常用', icon: '😀' },
  { name: '表情', icon: '😂' },
  { name: '爱心', icon: '❤️' },
  { name: '动物', icon: '🐶' },
  { name: '食物', icon: '🍎' },
  { name: '旅行', icon: '✈️' },
];

const emojiList: Record<number, string[]> = {
  0: ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙', '🥲', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮', '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳', '🥸', '😎', '🤓', '🧐', '😕', '😟', '🙁', '☹️', '😮‍💨', '😌', '😤', '😡', '😠', '🤬', '😈', '👿', '💀', '☠️', '💩', '🤡', '👹', '👺', '👻', '👽', '👾', '🤖', '🎃', '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾'],
  1: ['🤗', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮', '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳', '🥸', '😎', '🤓', '🧐', '😕', '😟', '🙁', '☹️', '😮‍💨', '😌', '😤', '😡', '😠', '🤬', '😈', '👿', '💀', '☠️', '💩', '🤡', '👹', '👺', '👻', '👽', '👾', '🤖', '🎃'],
  2: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🤎', '🖤', '🤍', '🤎', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '❣️', '💔', '❤️‍🔥', '❤️‍🩹', '🖤', '🤍', '🤎', '💔', '❤️‍🔥', '❤️‍🩹'],
  3: ['🐵', '🐒', '🦍', '🦧', '🐶', '🐕', '🦮', '🐩', '🐺', '🦊', '🦝', '🐱', '🐈', '🦁', '🐯', '🐅', '🐆', '🐴', '🫏', '🦄', '🦓', '🦌', '🐮', '🐂', '🐃', '🐄', '🐷', '🐖', '🐗', '🐽', '🐏', '🐑', '🐐', '🦙', '🦒', '🐘', '🦣', '🦏', '🦛', '🐭', '🐁', '🐀', '🐹', '🐰', '🐇', '🐿️', '🦫', '🦔', '🐔', '🐓', '🐣', '🐤', '🐥', '🐦', '🐧', '🕊️', '🦅', '🦆', '🦢', '🦉', '🦤', '🪶', '🐸', '🐊', '🐢', '🐍', '🦎', '🦖', '🦕', '🐙', '🦑', '🦐', '🦞', '🦀', '🐡', '🐠', '🐟', '🐬', '🦈', '🐳', '🐋', '🦭', '🐪', '🐫', '🦒', '🐘'],
  4: ['🍎', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🍑', '🍒', '🥝', '🍅', '🥑', '🌽', '🥕', '🥦', '🧅', '🧄', '🥔', '🍠', '🥐', '🍞', '🥖', '🧀', '🍗', '🍖', '🥩', '🍤', '🍳', '🍕', '🍔', '🍟', '🌭', '🍿', '🧂', '🍦', '🍰', '🎂', '🍪', '🍩', '🍫', '🍬', '🍭', '🍮', '☕', '🍵', '🍶', '🍺', '🍷', '🍸', '🍹', '🧉', '🥤', '🧋'],
  5: ['🚗', '🚕', '🚙', '🚌', '🚎', '🏎️', '🚓', '🚑', '🚒', '🚐', '🚚', '🚛', '🚜', '🚲', '🛵', '🏍️', '🚨', '🚔', '🚍', '🚘', '🚖', '🚡', '🚠', '🚟', '🚃', '🚋', '🚞', '🚝', '🚄', '🚅', '🚆', '🚇', '🚈', '🚂', '🚀', '✈️', '🛫', '🛬', '🚁', '🚟', '⛵', '🚢', '🛳️', '🚤', '🛥️', '🚲', '🛴', '🛹', '🛼', '🛸', '🚀'],
};

const currentEmojis = computed(() => emojiList[activeCategory.value] || []);

function selectEmoji(emoji: string) {
  emit('select', emoji);
}

function handleClose() {
  emit('close');
}
</script>

<template>
  <div v-if="visible" class="emoji-picker" @click.self="handleClose">
    <div class="emoji-picker__content">
      <div class="emoji-picker__header">
        <span class="emoji-picker__title">选择表情</span>
      </div>

      <div class="emoji-picker__categories">
        <button
          v-for="(cat, index) in categories"
          :key="index"
          class="emoji-picker__category-btn"
          :class="{ active: activeCategory === index }"
          @click="activeCategory = index"
        >
          <span class="emoji-picker__category-icon">{{ cat.icon }}</span>
          <span class="emoji-picker__category-name">{{ cat.name }}</span>
        </button>
      </div>

      <div class="emoji-picker__list">
        <button
          v-for="(emoji, index) in currentEmojis"
          :key="index"
          class="emoji-picker__item"
          @click="selectEmoji(emoji)"
        >
          {{ emoji }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.emoji-picker {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 0;
  right: 0;
  z-index: 10;
  background: color-mix(in srgb, var(--nw-text-primary) 50%, transparent);
  display: flex;
  justify-content: flex-end;
  padding: 8px;
}

.emoji-picker__content {
  background: var(--nw-bg-secondary);
  border-radius: 16px;
  width: 100%;
  max-width: 360px;
  box-shadow: 0 -4px 20px color-mix(in srgb, var(--nw-text-primary) 20%, transparent);
  display: flex;
  flex-direction: column;
}

.emoji-picker__header {
  padding: 12px 16px;
  border-bottom: 1px solid color-mix(in srgb, var(--nw-border) 46%, transparent);
}

.emoji-picker__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--nw-text-primary);
}

.emoji-picker__categories {
  display: flex;
  gap: 4px;
  padding: 8px 12px;
  overflow-x: auto;
  border-bottom: 1px solid color-mix(in srgb, var(--nw-border) 30%, transparent);
}

.emoji-picker__category-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  border: 0;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
  min-width: 48px;
}

.emoji-picker__category-btn:hover {
  background: color-mix(in srgb, var(--nw-text-primary) 5%, transparent);
}

.emoji-picker__category-btn.active {
  background: color-mix(in srgb, var(--mobile-focus-accent) 16%, transparent);
}

.emoji-picker__category-icon {
  font-size: 18px;
}

.emoji-picker__category-name {
  font-size: 11px;
  color: var(--nw-text-muted);
}

.emoji-picker__category-btn.active .emoji-picker__category-name {
  color: var(--mobile-focus-accent);
}

.emoji-picker__list {
  display: flex;
  flex-wrap: wrap;
  padding: 8px;
  max-height: 200px;
  overflow-y: auto;
}

.emoji-picker__item {
  width: calc(100% / 8);
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  background: transparent;
  font-size: 24px;
  cursor: pointer;
  border-radius: 8px;
  transition: all 0.15s;
}

.emoji-picker__item:hover {
  background: color-mix(in srgb, var(--nw-text-primary) 8%, transparent);
  transform: scale(1.2);
}
</style>
