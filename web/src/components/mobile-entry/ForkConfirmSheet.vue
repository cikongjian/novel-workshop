<script setup lang="ts">
/**
 * 抱走确认弹层 — 读者从某章节抱走作品创建分支
 */
import { ref, watch, computed } from 'vue';
import { useRouter } from 'vue-router';
import {
  CircleCheckFilled,
  CircleCloseFilled,
  Close,
  Key,
  Lock,
  MagicStick,
  Reading,
  View,
} from '@element-plus/icons-vue';
import { useFork } from '../../composables/useFork';
import { useAuthStore } from '../../stores/auth';

const props = defineProps<{
  visible: boolean;
  novelId: string;
  novelTitle: string;
  chapter: number;
}>();

const emit = defineEmits<{
  close: [];
  forked: [forkedNovelId: string];
}>();

const router = useRouter();
const auth = useAuthStore();
const fork = useFork();

const newTitle = ref('');
const isPublic = ref(true);
const checking = ref(false);

const needsLogin = computed(() => !auth.isAuthenticated);
const notAllowed = computed(() => !!fork.checkResult.value && !fork.checkResult.value.allowed);
const alreadyForked = computed(() => !!fork.checkResult.value?.alreadyForked);
const canFork = computed(
  () =>
    auth.isAuthenticated &&
    !!fork.checkResult.value?.allowed &&
    !!fork.checkResult.value?.chapterAllowed &&
    !fork.checkResult.value?.alreadyForked,
);

const authorNote = computed(() => fork.checkResult.value?.config.authorNote ?? '');
const chapterBlocked = computed(
  () => !!fork.checkResult.value && !fork.checkResult.value.chapterAllowed,
);

watch(
  () => props.visible,
  async (v) => {
    if (v) {
      newTitle.value = `${props.novelTitle} - 我的分支`;
      isPublic.value = true;
      if (auth.isAuthenticated) {
        checking.value = true;
        await fork.check(props.novelId, props.chapter);
        checking.value = false;
      }
    } else {
      fork.checkResult.value = null;
    }
  },
  { immediate: true },
);

async function handleFork() {
  const record = await fork.fork({
    novelId: props.novelId,
    fromChapter: props.chapter,
    newTitle: newTitle.value.trim() || undefined,
    isPublic: isPublic.value,
  });
  if (record) {
    emit('forked', record.forkedNovelId);
    emit('close');
    router.push(`/m/novel/${record.forkedNovelId}`);
  }
}

function handleClose() {
  if (fork.forking.value) return;
  emit('close');
}
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="fork-sheet-overlay mobile-focus-light-vars">
      <div class="fork-sheet">
        <!-- 顶部 -->
        <div class="fork-sheet__header">
          <h3 class="fork-sheet__title">
            <el-icon class="fork-sheet__title-icon"><MagicStick /></el-icon>
            <span>抱走创作</span>
          </h3>
          <button class="fork-sheet__close" @click="handleClose">
            <el-icon><Close /></el-icon>
          </button>
        </div>

        <!-- 未登录 -->
        <div v-if="needsLogin" class="fork-sheet__permission">
          <div class="fork-sheet__permission-icon">
            <el-icon><Key /></el-icon>
          </div>
          <p class="fork-sheet__permission-text">登录后即可抱走作品，开启你的二创之旅</p>
        </div>

        <!-- 权限检查中 -->
        <div v-else-if="checking" class="fork-sheet__loading">
          <div class="fork-sheet__loading-dots"><span></span><span></span><span></span></div>
          <p>正在检查抱走权限...</p>
        </div>

        <!-- 不允许抱走 -->
        <div v-else-if="notAllowed" class="fork-sheet__permission">
          <div class="fork-sheet__permission-icon fork-sheet__permission-icon--danger">
            <el-icon><CircleCloseFilled /></el-icon>
          </div>
          <p class="fork-sheet__permission-text">{{ fork.checkResult?.reason || '当前作品不允许抱走' }}</p>
        </div>

        <!-- 当前章节不在开放范围 -->
        <div v-else-if="chapterBlocked" class="fork-sheet__permission">
          <div class="fork-sheet__permission-icon">
            <el-icon><Reading /></el-icon>
          </div>
          <p class="fork-sheet__permission-text">这一章不在作者开放抱走的范围内</p>
          <p class="fork-sheet__permission-subtext">请换一章试试，或在章节末尾找到带开放标记的章节</p>
        </div>

        <!-- 已抱走过 -->
        <div v-else-if="alreadyForked" class="fork-sheet__permission">
          <div class="fork-sheet__permission-icon fork-sheet__permission-icon--success">
            <el-icon><CircleCheckFilled /></el-icon>
          </div>
          <p class="fork-sheet__permission-text">你已经从这一章抱走过啦</p>
          <p class="fork-sheet__permission-subtext">去「我的 → 抱走记录」查看你的分支作品</p>
        </div>

        <!-- 抱走表单 -->
        <div v-else class="fork-sheet__body">
          <!-- 信息卡 -->
          <div class="fork-sheet__info">
            <div class="fork-sheet__info-row">
              <span class="fork-sheet__info-label">源作品</span>
              <span class="fork-sheet__info-value">{{ novelTitle }}</span>
            </div>
            <div class="fork-sheet__info-row">
              <span class="fork-sheet__info-label">分叉点</span>
              <span class="fork-sheet__info-value">第 {{ chapter }} 章</span>
            </div>
            <p class="fork-sheet__info-hint">
              将复制截至第 {{ chapter }} 章的全部设定（角色、世界观、大纲、前文），你可以从这一章开始写出不同的故事走向
            </p>
          </div>

          <!-- 作者寄语 -->
          <div v-if="authorNote" class="fork-sheet__author-note">
            <span class="fork-sheet__author-note-label">作者寄语</span>
            <p class="fork-sheet__author-note-text">{{ authorNote }}</p>
          </div>

          <!-- 新标题 -->
          <div class="fork-sheet__field">
            <label class="fork-sheet__label">新作品标题</label>
            <input
              v-model="newTitle"
              class="fork-sheet__input"
              type="text"
              placeholder="给你的分支作品起个名字"
              maxlength="60"
            />
          </div>

          <!-- 公开/私有 -->
          <div class="fork-sheet__field">
            <label class="fork-sheet__label">作品可见性</label>
            <div class="fork-sheet__visibility">
              <button
                :class="['fork-sheet__visibility-btn', { active: isPublic }]"
                @click="isPublic = true"
              >
                <span class="fork-sheet__visibility-label">
                  <el-icon><View /></el-icon>
                  <span>公开</span>
                </span>
                <span class="fork-sheet__visibility-desc">出现在原作故事树</span>
              </button>
              <button
                :class="['fork-sheet__visibility-btn', { active: !isPublic }]"
                @click="isPublic = false"
              >
                <span class="fork-sheet__visibility-label">
                  <el-icon><Lock /></el-icon>
                  <span>私密</span>
                </span>
                <span class="fork-sheet__visibility-desc">仅自己可见</span>
              </button>
            </div>
          </div>
        </div>

        <!-- 底部按钮 -->
        <div v-if="canFork" class="fork-sheet__footer">
          <button
            class="fork-sheet__submit"
            :disabled="fork.forking.value"
            @click="handleFork"
          >
            <el-icon v-if="fork.forking.value" class="is-loading"><MagicStick /></el-icon>
            <el-icon v-else><MagicStick /></el-icon>
            <span>{{ fork.forking.value ? '正在抱走...' : '确认抱走' }}</span>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.fork-sheet-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  color: var(--nw-text-primary);
}

.fork-sheet {
  width: 100%;
  max-width: 480px;
  max-height: 90vh;
  background: var(--nw-bg-secondary);
  border-radius: 20px 20px 0 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.fork-sheet__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid color-mix(in srgb, var(--nw-border) 46%, transparent);
}

.fork-sheet__title {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  color: var(--nw-text-primary);
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.fork-sheet__title-icon {
  color: var(--mobile-focus-accent);
}

.fork-sheet__close {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: color-mix(in srgb, var(--nw-text-primary) 5%, transparent);
  color: var(--nw-text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.fork-sheet__body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 权限/状态提示 */
.fork-sheet__permission,
.fork-sheet__loading {
  padding: 48px 24px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.fork-sheet__permission-icon {
  font-size: 48px;
  line-height: 1;
  color: var(--mobile-focus-accent);
}

.fork-sheet__permission-icon--danger {
  color: var(--mobile-focus-status-danger);
}

.fork-sheet__permission-icon--success {
  color: var(--mobile-focus-status-success);
}

.fork-sheet__permission-text {
  margin: 0;
  font-size: 15px;
  color: var(--nw-text-secondary);
  line-height: 1.6;
}

.fork-sheet__permission-subtext {
  margin: 0;
  font-size: 13px;
  color: var(--nw-text-muted);
}

.fork-sheet__loading-dots {
  display: flex;
  gap: 6px;
}

.fork-sheet__loading-dots span {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--nw-text-muted);
  animation: fork-bounce 1.4s infinite ease-in-out both;
}

.fork-sheet__loading-dots span:nth-child(1) { animation-delay: -0.32s; }
.fork-sheet__loading-dots span:nth-child(2) { animation-delay: -0.16s; }

@keyframes fork-bounce {
  0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
  40% { transform: scale(1); opacity: 1; }
}

/* 信息卡 */
.fork-sheet__info {
  background: var(--mobile-focus-surface-muted);
  border-radius: 12px;
  padding: 14px;
}

.fork-sheet__info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0;
}

.fork-sheet__info-label {
  font-size: 13px;
  color: var(--nw-text-muted);
}

.fork-sheet__info-value {
  font-size: 14px;
  font-weight: 600;
  color: var(--nw-text-primary);
}

.fork-sheet__info-hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--nw-text-muted);
  line-height: 1.6;
}

/* 作者寄语 */
.fork-sheet__author-note {
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--mobile-focus-status-gold) 18%, var(--nw-bg-secondary)),
    color-mix(in srgb, var(--mobile-focus-status-gold) 28%, var(--nw-bg-secondary))
  );
  border-radius: 12px;
  padding: 12px 14px;
}

.fork-sheet__author-note-label {
  font-size: 11px;
  font-weight: 700;
  color: color-mix(in srgb, var(--mobile-focus-status-gold) 86%, var(--nw-text-primary));
}

.fork-sheet__author-note-text {
  margin: 4px 0 0;
  font-size: 13px;
  color: color-mix(in srgb, var(--mobile-focus-status-gold) 70%, var(--nw-text-primary));
  line-height: 1.6;
}

/* 表单字段 */
.fork-sheet__field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.fork-sheet__label {
  font-size: 13px;
  font-weight: 600;
  color: var(--nw-text-primary);
}

.fork-sheet__input {
  width: 100%;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--nw-border) 70%, transparent);
  border-radius: 10px;
  font-size: 15px;
  color: var(--nw-text-primary);
  background: var(--nw-bg-secondary);
  -webkit-user-select: text;
  touch-action: manipulation;
}

.fork-sheet__input:focus {
  outline: none;
  border-color: var(--mobile-focus-accent-strong);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--mobile-focus-accent-strong) 10%, transparent);
}

/* 可见性 */
.fork-sheet__visibility {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.fork-sheet__visibility-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px;
  border: 2px solid color-mix(in srgb, var(--nw-border) 70%, transparent);
  border-radius: 12px;
  background: var(--nw-bg-secondary);
  font-size: 14px;
  font-weight: 600;
  color: var(--nw-text-secondary);
  cursor: pointer;
  transition: all 0.15s;
}

.fork-sheet__visibility-btn.active {
  border-color: var(--mobile-focus-accent-strong);
  background: color-mix(in srgb, var(--mobile-focus-accent-strong) 8%, var(--nw-bg-secondary));
  color: color-mix(in srgb, var(--mobile-focus-accent-strong) 86%, var(--nw-text-primary));
}

.fork-sheet__visibility-label {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.fork-sheet__visibility-desc {
  font-size: 11px;
  font-weight: 400;
  color: var(--nw-text-muted);
}

/* 底部 */
.fork-sheet__footer {
  flex-shrink: 0;
  padding: 12px 16px;
  padding-bottom: max(12px, env(safe-area-inset-bottom));
  border-top: 1px solid color-mix(in srgb, var(--nw-border) 46%, transparent);
}

.fork-sheet__submit {
  width: 100%;
  padding: 14px;
  border: 0;
  border-radius: 14px;
  background: linear-gradient(135deg, var(--mobile-focus-accent-strong), color-mix(in srgb, var(--mobile-focus-accent-strong) 88%, var(--nw-text-primary)));
  color: var(--mobile-focus-on-accent);
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.fork-sheet__submit:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.fork-sheet__submit:active:not(:disabled) {
  transform: scale(0.98);
}
</style>
