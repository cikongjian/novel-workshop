<template>
  <div class="moment-comments">
    <div v-if="comments.length === 0" class="moment-comments__empty">
      还没有评论，快来抢沙发
    </div>
    <div v-else class="moment-comments__list">
      <div
        v-for="comment in comments"
        :key="comment.id"
        class="moment-comments__item"
        :class="{ 'moment-comments__item--character': comment.authorType === 'character' }"
      >
        <div class="moment-comments__avatar" :class="{ 'moment-comments__avatar--character': comment.authorType === 'character' }">
          <span>{{ comment.authorName.charAt(0) }}</span>
        </div>
        <div class="moment-comments__body">
          <div class="moment-comments__meta">
            <span class="moment-comments__name">{{ comment.authorName }}</span>
            <span v-if="comment.authorType === 'character'" class="moment-comments__badge">角色</span>
            <span class="moment-comments__time">{{ formatTime(comment.createdAt) }}</span>
          </div>
          <div class="moment-comments__content">{{ comment.content }}</div>
          <div v-if="comment.authorType === 'reader'" class="moment-comments__ops">
            <button class="moment-comments__op-btn" @click="$emit('report', comment.id)">举报</button>
            <button class="moment-comments__op-btn" @click="$emit('block', comment.authorId)">不看TA</button>
            <button v-if="isOwner" class="moment-comments__op-btn moment-comments__op-btn--danger" @click="$emit('delete', comment.id)">删除</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { MomentComment } from '../../api/character-moments';

defineProps<{
  comments: MomentComment[];
  isOwner?: boolean;
}>();

defineEmits<{
  (e: 'report', commentId: string): void;
  (e: 'block', authorId: string): void;
  (e: 'delete', commentId: string): void;
}>();

function formatTime(ts: number): string {
  const now = Date.now();
  const diff = now - ts;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}小时前`;
  return `${Math.floor(diff / 86_400_000)}天前`;
}
</script>

<style scoped>
.moment-comments__empty {
  padding: 16px;
  text-align: center;
  color: var(--nw-text-muted);
  font-size: 13px;
}
.moment-comments__list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.moment-comments__item {
  display: flex;
  gap: 10px;
}
.moment-comments__avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--nw-border) 56%, var(--nw-bg-secondary));
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 600;
  color: var(--nw-text-secondary);
  flex-shrink: 0;
}
.moment-comments__avatar--character {
  background: color-mix(in srgb, var(--mobile-focus-status-gold) 18%, var(--nw-bg-secondary));
  color: color-mix(in srgb, var(--mobile-focus-status-gold) 86%, var(--nw-text-primary));
}
.moment-comments__body {
  flex: 1;
  min-width: 0;
}
.moment-comments__meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 2px;
}
.moment-comments__name {
  font-size: 13px;
  font-weight: 600;
  color: var(--nw-text-primary);
}
.moment-comments__badge {
  font-size: 10px;
  font-weight: 600;
  color: color-mix(in srgb, var(--mobile-focus-status-gold) 86%, var(--nw-text-primary));
  background: color-mix(in srgb, var(--mobile-focus-status-gold) 18%, var(--nw-bg-secondary));
  padding: 1px 5px;
  border-radius: 4px;
}
.moment-comments__time {
  font-size: 11px;
  color: var(--nw-text-muted);
  margin-left: auto;
}
.moment-comments__content {
  font-size: 14px;
  line-height: 1.5;
  color: var(--nw-text-primary);
  word-break: break-word;
}
.moment-comments__ops {
  display: flex;
  gap: 10px;
  margin-top: 4px;
}
.moment-comments__op-btn {
  border: none;
  background: none;
  font-size: 11px;
  color: var(--nw-text-muted);
  cursor: pointer;
  padding: 0;
}
.moment-comments__op-btn:active {
  color: var(--nw-text-secondary);
}
.moment-comments__op-btn--danger {
  color: var(--mobile-focus-status-danger);
}
</style>
