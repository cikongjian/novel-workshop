<template>
  <div class="moment-card" :class="'moment-card--' + roleColorKey">
    <!-- 作者信息 -->
    <div class="moment-card__header">
      <div class="moment-card__avatar">
        <img v-if="hasPortrait" :src="portraitUrl" alt="" @error="hasPortrait = false" />
        <span v-else>{{ moment.characterName.charAt(0) }}</span>
      </div>
      <div class="moment-card__author">
        <div class="moment-card__name-row">
          <span class="moment-card__name">{{ moment.characterName }}</span>
          <span class="moment-card__role">{{ moment.characterRole }}</span>
        </div>
        <span class="moment-card__time">{{ formatTime(moment.createdAt) }}</span>
      </div>
      <span v-if="typeLabel" class="moment-card__type">{{ typeLabel }}</span>
      <span v-if="moment.isPrivate" class="moment-card__private">私密</span>
    </div>

    <!-- 私密动态锁 -->
    <div v-if="moment.isPrivate && !collected" class="moment-card__lock">
      <div class="moment-card__lock-icon">
        <el-icon><Lock /></el-icon>
      </div>
      <div class="moment-card__lock-text">收藏「{{ moment.characterName }}」后可见</div>
      <button
        class="moment-card__lock-btn"
        :disabled="collecting"
        @click="unlockPrivate"
      >
        {{ collecting ? '收藏中...' : '立即收藏解锁' }}
      </button>
    </div>

    <!-- 动态正文（非锁定状态） -->
    <div v-else class="moment-card__content">{{ moment.content }}</div>

    <!-- 互动条 -->
    <div class="moment-card__actions">
      <button
        class="moment-card__action"
        :class="{ 'moment-card__action--liked': liked, 'moment-card__action--animating': likeAnimating }"
        @click="handleLike"
      >
        <el-icon class="moment-card__action-icon">
          <StarFilled v-if="liked" />
          <Star v-else />
        </el-icon>
        <span>{{ moment.likes }}</span>
      </button>
      <button class="moment-card__action" @click="showComments = !showComments">
        <el-icon class="moment-card__action-icon"><ChatLineRound /></el-icon>
        <span>{{ moment.comments.length }}</span>
      </button>
      <button
        class="moment-card__action"
        :class="{ 'moment-card__action--flowered': flowered }"
        @click="handleFlower"
      >
        <el-icon class="moment-card__action-icon"><MagicStick /></el-icon>
        <span>{{ moment.flowers || 0 }}</span>
      </button>
    </div>

    <!-- 评论区域 -->
    <div v-if="showComments" class="moment-card__comments">
      <MomentCommentList :comments="filteredComments" :is-owner="isOwner" @report="(cid: string) => $emit('reportComment', moment.id, cid)" @block="(uid: string) => $emit('blockReader', uid)" @delete="(cid: string) => $emit('deleteComment', moment.id, cid)" />
      <div class="moment-card__comment-input">
        <input
          v-model="commentText"
          class="moment-card__comment-field"
          placeholder="说点什么..."
          maxlength="200"
          @keyup.enter="submitComment"
        />
        <button
          class="moment-card__comment-send"
          :disabled="!commentText.trim()"
          @click="submitComment"
        >
          发送
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { ChatLineRound, Lock, MagicStick, Star, StarFilled } from '@element-plus/icons-vue';
import type { CharacterMoment } from '../../api/character-moments';
import { toggleCharacterCardCollect, fetchCharacterCardCollected } from '../../api/character-cards';
import { toggleMomentFlower } from '../../api/character-moments';
import MomentCommentList from './MomentCommentList.vue';

const props = defineProps<{
  moment: CharacterMoment;
  novelId: string;
  liked?: boolean;
  blockedReaderIds?: Set<string>;
  isOwner?: boolean;
}>();

const emit = defineEmits<{
  (e: 'like', momentId: string): void;
  (e: 'comment', momentId: string, content: string): void;
  (e: 'reportComment', momentId: string, commentId: string): void;
  (e: 'blockReader', authorId: string): void;
  (e: 'deleteComment', momentId: string, commentId: string): void;
}>();

const showComments = ref(false);
const commentText = ref('');
const hasPortrait = ref(true);
const likeAnimating = ref(false);
/** 是否已送花 */
const flowered = ref(false);
/** 是否已收藏该角色（用于解锁私密动态） */
const collected = ref(false);
const collecting = ref(false);

onMounted(() => {
  if (props.moment.isPrivate && props.moment.characterId) {
    fetchCharacterCardCollected(props.moment.characterId)
      .then((val) => { collected.value = val; })
      .catch(() => {});
  }
});

async function unlockPrivate() {
  collecting.value = true;
  try {
    const result = await toggleCharacterCardCollect({
      characterId: props.moment.characterId,
      novelId: props.novelId,
      characterName: props.moment.characterName,
    });
    collected.value = result.collected;
  } catch {
    // 静默失败
  } finally {
    collecting.value = false;
  }
}

const portraitUrl = computed(() =>
  `/api/novels/${props.novelId}/characters/${props.moment.characterId}/portrait?w=120`,
);

/** 过滤掉被屏蔽读者的评论 */
const filteredComments = computed(() => {
  if (!props.blockedReaderIds || props.blockedReaderIds.size === 0) return props.moment.comments;
  return props.moment.comments.filter(
    c => c.authorType !== 'reader' || !props.blockedReaderIds!.has(c.authorId),
  );
});

const typeLabel = computed(() => {
  const map: Record<string, string> = {
    mood: '心情',
    plot: props.moment.relatedChapterNum ? `第${props.moment.relatedChapterNum}章` : '剧情',
    daily: '日常',
    dream: '梦境',
    reveal: '爆料',
    night: '深夜',
    challenge: '挑衅',
  };
  return map[props.moment.type] || '';
});

/** 角色身份 -> 颜色标识 key */
const roleColorKey = computed(() => {
  const map: Record<string, string> = {
    protagonist: 'protagonist',
    deuteragonist: 'protagonist',
    antagonist: 'antagonist',
    rival: 'antagonist',
    love_interest: 'supporting',
    mentor: 'supporting',
    ally: 'supporting',
    faction_leader: 'supporting',
    supporting: 'supporting',
    family: 'supporting',
    comic_relief: 'supporting',
    minor: 'minor',
  };
  return map[props.moment.characterRole] || 'minor';
});

function submitComment() {
  const trimmed = commentText.value.trim();
  if (!trimmed) return;
  emit('comment', props.moment.id, trimmed);
  commentText.value = '';
}

function handleLike() {
  likeAnimating.value = true;
  emit('like', props.moment.id);
  setTimeout(() => { likeAnimating.value = false; }, 400);
}

async function handleFlower() {
  try {
    const res = await toggleMomentFlower(props.moment.id);
    flowered.value = res.flowered;
    props.moment.flowers = res.flowers;
    if (!props.moment.floweredBy) props.moment.floweredBy = [];
    if (res.flowered) {
      // 需要知道当前用户 ID，暂时用本地状态
    }
  } catch { /* 静默 */ }
}

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
.moment-card {
  background: var(--nw-bg-secondary);
  border-radius: 14px;
  padding: 14px;
  margin-bottom: 10px;
  border-left: 3px solid color-mix(in srgb, var(--nw-border) 70%, transparent);
  transition: border-color 0.2s;
}
.moment-card--protagonist {
  border-left-color: var(--mobile-focus-status-gold);
}
.moment-card--antagonist {
  border-left-color: var(--mobile-focus-status-danger);
}
.moment-card--supporting {
  border-left-color: var(--mobile-focus-accent);
}
.moment-card--minor {
  border-left-color: var(--nw-text-muted);
}
.moment-card__header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.moment-card__avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--mobile-focus-accent) 14%, var(--nw-bg-secondary));
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  font-size: 17px;
  font-weight: 600;
  color: color-mix(in srgb, var(--mobile-focus-accent) 86%, var(--nw-text-primary));
  flex-shrink: 0;
}
.moment-card__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.moment-card__author {
  flex: 1;
  min-width: 0;
}
.moment-card__name-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.moment-card__name {
  font-size: 15px;
  font-weight: 600;
  color: var(--nw-text-primary);
}
.moment-card__role {
  font-size: 11px;
  color: color-mix(in srgb, var(--mobile-focus-accent) 86%, var(--nw-text-primary));
  background: color-mix(in srgb, var(--mobile-focus-accent) 12%, var(--nw-bg-secondary));
  padding: 1px 6px;
  border-radius: 4px;
}
.moment-card__time {
  font-size: 12px;
  color: var(--nw-text-muted);
}
.moment-card__type {
  font-size: 11px;
  color: var(--nw-text-muted);
  background: var(--mobile-focus-surface-muted);
  padding: 2px 8px;
  border-radius: 10px;
  flex-shrink: 0;
}
.moment-card__private {
  font-size: 11px;
  color: var(--mobile-focus-status-gold);
  background: color-mix(in srgb, var(--mobile-focus-status-gold) 18%, var(--nw-bg-secondary));
  padding: 2px 8px;
  border-radius: 10px;
  flex-shrink: 0;
}
.moment-card__content {
  font-size: 15px;
  line-height: 1.7;
  color: var(--nw-text-primary);
  margin-bottom: 10px;
  word-break: break-word;
  white-space: pre-wrap;
}
.moment-card__actions {
  display: flex;
  gap: 20px;
}
.moment-card__action {
  display: flex;
  align-items: center;
  gap: 5px;
  border: none;
  background: none;
  font-size: 13px;
  color: var(--nw-text-secondary);
  cursor: pointer;
  padding: 4px 0;
}
.moment-card__action:active {
  opacity: 0.6;
}
.moment-card__action--liked {
  color: var(--mobile-focus-status-danger);
}
.moment-card__action--flowered {
  color: var(--mobile-focus-status-gold);
}
.moment-card__action--animating .moment-card__action-icon {
  animation: like-pulse 0.4s ease;
}
@keyframes like-pulse {
  0% { transform: scale(1); }
  30% { transform: scale(1.4); }
  60% { transform: scale(0.9); }
  100% { transform: scale(1); }
}
.moment-card__action-icon {
  font-size: 16px;
}
.moment-card__comments {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid color-mix(in srgb, var(--nw-border) 46%, transparent);
}
.moment-card__comment-input {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}
.moment-card__comment-field {
  flex: 1;
  border: 1px solid color-mix(in srgb, var(--nw-border) 70%, transparent);
  border-radius: 20px;
  padding: 8px 14px;
  font-size: 14px;
  outline: none;
  color: var(--nw-text-primary);
  background: var(--mobile-focus-surface-muted);
}
.moment-card__comment-field:focus {
  border-color: var(--mobile-focus-accent);
  background: var(--nw-bg-secondary);
}
.moment-card__comment-send {
  border: none;
  background: var(--mobile-focus-accent);
  color: var(--mobile-focus-on-accent);
  font-size: 14px;
  font-weight: 600;
  padding: 8px 16px;
  border-radius: 20px;
  cursor: pointer;
  flex-shrink: 0;
}
.moment-card__comment-send:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* 私密动态锁 */
.moment-card__lock {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
  background: var(--mobile-focus-surface-muted);
  border-radius: 10px;
  margin-bottom: 10px;
  border: 1px dashed color-mix(in srgb, var(--nw-border) 70%, transparent);
}
.moment-card__lock-icon {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--mobile-focus-status-gold) 18%, var(--nw-bg-secondary));
  border: 2px solid var(--mobile-focus-status-gold);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  margin-bottom: 8px;
}
.moment-card__lock-text {
  font-size: 13px;
  color: var(--nw-text-secondary);
  margin-bottom: 12px;
}
.moment-card__lock-btn {
  border: none;
  background: linear-gradient(135deg, var(--mobile-focus-status-gold), color-mix(in srgb, var(--mobile-focus-status-gold) 82%, var(--nw-text-primary)));
  color: var(--mobile-focus-on-accent);
  font-size: 14px;
  font-weight: 600;
  padding: 8px 20px;
  border-radius: 20px;
  cursor: pointer;
  transition: all 0.15s;
}
.moment-card__lock-btn:active {
  transform: scale(0.95);
}
.moment-card__lock-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
