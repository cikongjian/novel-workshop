<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import type { CharacterProfile, CharacterRole } from '../types';

const props = defineProps<{
  content: string;
  textareaEl: HTMLTextAreaElement | null;
  characters: CharacterProfile[];
}>();

const overlayRef = ref<HTMLDivElement | null>(null);

/** 角色类型对应的标签颜色（通过 CSS 变量驱动，支持主题切换） */
const ROLE_COLORS: Record<CharacterRole, { bg: string; text: string; border: string }> = {
  protagonist: {
    bg: 'var(--role-protagonist-bg)',
    text: 'var(--role-protagonist-base)',
    border: 'var(--role-protagonist-border)',
  },
  deuteragonist: {
    bg: 'var(--role-deuteragonist-bg)',
    text: 'var(--role-deuteragonist-base)',
    border: 'var(--role-deuteragonist-border)',
  },
  antagonist: {
    bg: 'var(--role-antagonist-bg)',
    text: 'var(--role-antagonist-base)',
    border: 'var(--role-antagonist-border)',
  },
  rival: {
    bg: 'var(--role-rival-bg)',
    text: 'var(--role-rival-base)',
    border: 'var(--role-rival-border)',
  },
  love_interest: {
    bg: 'var(--role-love-interest-bg)',
    text: 'var(--role-love-interest-base)',
    border: 'var(--role-love-interest-border)',
  },
  mentor: {
    bg: 'var(--role-mentor-bg)',
    text: 'var(--role-mentor-base)',
    border: 'var(--role-mentor-border)',
  },
  ally: {
    bg: 'var(--role-ally-bg)',
    text: 'var(--role-ally-base)',
    border: 'var(--role-ally-border)',
  },
  faction_leader: {
    bg: 'var(--role-faction-leader-bg)',
    text: 'var(--role-faction-leader-base)',
    border: 'var(--role-faction-leader-border)',
  },
  supporting: {
    bg: 'var(--role-supporting-bg)',
    text: 'var(--role-supporting-base)',
    border: 'var(--role-supporting-border)',
  },
  family: {
    bg: 'var(--role-family-bg)',
    text: 'var(--role-family-base)',
    border: 'var(--role-family-border)',
  },
  comic_relief: {
    bg: 'var(--role-comic-relief-bg)',
    text: 'var(--role-comic-relief-base)',
    border: 'var(--role-comic-relief-border)',
  },
  minor: {
    bg: 'var(--role-minor-bg)',
    text: 'var(--role-minor-base)',
    border: 'var(--role-minor-border)',
  },
};

/** (#角色名)/(（#角色名）) 匹配正则 */
const MARKER_RE = /[\(\uFF08]\s*#\s*([^()\uFF08\uFF09\n]+?)\s*[\)\uFF09]/g;

/** 根据角色名找到对应的角色类型 */
function findCharacterRole(name: string): CharacterRole {
  for (const char of props.characters) {
    if (char.name === name) return char.role;
    if (char.aliases?.includes(name)) return char.role;
  }
  return 'minor';
}

/** 将内容转化为 HTML：标记替换为彩色标签，其余为透明文本 */
const overlayHtml = computed(() => {
  if (!props.content) return '';

  // 用正则找出所有标记，构建 HTML
  let result = '';
  let lastIdx = 0;

  MARKER_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MARKER_RE.exec(props.content)) !== null) {
    // 标记前的普通文本（透明色）
    if (match.index > lastIdx) {
      result += escapeHtml(props.content.slice(lastIdx, match.index));
    }

    // 标记本身替换为彩色标签
    const charName = match[1];
    const role = findCharacterRole(charName);
    const colors = ROLE_COLORS[role];
    result += `<span class="speaker-tag" style="background:${colors.bg};color:${colors.text};border-color:${colors.border}">${escapeHtml(charName)}</span>`;

    lastIdx = match.index + match[0].length;
  }

  // 剩余文本
  if (lastIdx < props.content.length) {
    result += escapeHtml(props.content.slice(lastIdx));
  }

  return result;
});

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

/** 同步 textarea 的滚动位置 */
function syncScroll() {
  if (!props.textareaEl || !overlayRef.value) return;
  overlayRef.value.scrollTop = props.textareaEl.scrollTop;
  overlayRef.value.scrollLeft = props.textareaEl.scrollLeft;
}

/** 同步 overlay 尺寸和样式 */
function syncGeometry() {
  if (!props.textareaEl || !overlayRef.value) return;
  const el = props.textareaEl;
  const style = getComputedStyle(el);

  overlayRef.value.style.width = `${el.clientWidth}px`;
  overlayRef.value.style.height = `${el.clientHeight}px`;
  overlayRef.value.style.padding = style.padding;
  overlayRef.value.style.fontSize = style.fontSize;
  overlayRef.value.style.fontFamily = style.fontFamily;
  overlayRef.value.style.lineHeight = style.lineHeight;
  overlayRef.value.style.letterSpacing = style.letterSpacing;
  overlayRef.value.style.wordSpacing = style.wordSpacing;
  overlayRef.value.style.textIndent = style.textIndent;
  overlayRef.value.style.whiteSpace = style.whiteSpace;
  overlayRef.value.style.wordBreak = style.wordBreak;
  overlayRef.value.style.overflowWrap = style.overflowWrap;
  overlayRef.value.style.tabSize = style.tabSize;
}

let resizeObserver: ResizeObserver | null = null;

function bindTextarea(el: HTMLTextAreaElement | null) {
  // 清理旧的绑定
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }

  if (!el) return;

  el.addEventListener('scroll', syncScroll);

  resizeObserver = new ResizeObserver(() => {
    syncGeometry();
    syncScroll();
  });
  resizeObserver.observe(el);

  nextTick(() => {
    syncGeometry();
    syncScroll();
  });
}

watch(() => props.textareaEl, (el) => {
  bindTextarea(el);
}, { immediate: true });

// 内容变化时同步滚动
watch(() => props.content, () => {
  nextTick(syncScroll);
});

onMounted(() => {
  if (props.textareaEl) {
    bindTextarea(props.textareaEl);
  }
});

onUnmounted(() => {
  if (props.textareaEl) {
    props.textareaEl.removeEventListener('scroll', syncScroll);
  }
  if (resizeObserver) {
    resizeObserver.disconnect();
  }
});
</script>

<template>
  <div
    ref="overlayRef"
    class="speaker-overlay"
    v-html="overlayHtml"
  />
</template>

<style scoped>
.speaker-overlay {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
  color: transparent;
  overflow: hidden;
  box-sizing: border-box;
  z-index: 1;
  /* 确保与 textarea 文本对齐 */
  border: 1px solid transparent;
}

.speaker-overlay :deep(.speaker-tag) {
  display: inline;
  font-size: 0.75em;
  padding: 0 3px;
  border-radius: 3px;
  border: 1px solid;
  pointer-events: none;
  vertical-align: baseline;
  font-weight: 600;
  letter-spacing: 0;
}
</style>
