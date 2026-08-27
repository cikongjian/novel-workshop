<script setup lang="ts">
/**
 * 抱走设置弹层 — 作者配置作品的抱走权限与可抱走章节
 */
import { ref, watch, computed, type Component } from 'vue';
import { Close, CollectionTag, Connection, DocumentChecked, Lock, Reading } from '@element-plus/icons-vue';
import { useFork } from '../../composables/useFork';
import { fetchChapters } from '../../api/chapters';
import type { ForkPermission, ForkChapterMode } from '../../api/forks';

const props = defineProps<{
  visible: boolean;
  novelId: string;
}>();

const emit = defineEmits<{
  close: [];
}>();

const fork = useFork();
const allowFork = ref(true);
const permission = ref<ForkPermission>('all');
const chapterMode = ref<ForkChapterMode>('all');
const allowedChapters = ref<number[]>([]);
const authorNote = ref('');
const saving = ref(false);

// 章节列表
interface ChapterLite { chapterNumber: number; title: string; }
const chapters = ref<ChapterLite[]>([]);
const chaptersLoading = ref(false);

const permissionOptions: { value: ForkPermission; icon: Component; label: string; desc: string }[] = [
  { value: 'all', icon: Connection, label: '开放', desc: '任何读者都可抱走' },
  { value: 'followers', icon: CollectionTag, label: '仅收藏者', desc: '收藏过本作的读者才能抱走' },
  { value: 'closed', icon: Lock, label: '关闭', desc: '不允许任何人抱走' },
];

const chapterModeOptions: { value: ForkChapterMode; icon: Component; label: string; desc: string }[] = [
  { value: 'all', icon: Reading, label: '全部章节', desc: '读者可从任意已发布章节抱走' },
  { value: 'selected', icon: DocumentChecked, label: '指定章节', desc: '仅勾选的章节可被抱走' },
];

const selectedCount = computed(() => allowedChapters.value.length);

function toggleChapter(num: number) {
  const idx = allowedChapters.value.indexOf(num);
  if (idx >= 0) {
    allowedChapters.value.splice(idx, 1);
  } else {
    allowedChapters.value.push(num);
    allowedChapters.value.sort((a, b) => a - b);
  }
}

function selectAll() {
  allowedChapters.value = chapters.value.map((c) => c.chapterNumber);
}

function clearAll() {
  allowedChapters.value = [];
}

async function loadChapters() {
  chaptersLoading.value = true;
  try {
    const list = await fetchChapters(props.novelId);
    chapters.value = list.map((c) => ({ chapterNumber: c.chapterNumber, title: c.title }));
  } catch {
    chapters.value = [];
  } finally {
    chaptersLoading.value = false;
  }
}

watch(
  () => props.visible,
  async (v) => {
    if (v) {
      await fork.loadConfig(props.novelId);
      if (fork.config.value) {
        allowFork.value = fork.config.value.allowFork;
        permission.value = fork.config.value.permission;
        chapterMode.value = fork.config.value.chapterMode;
        allowedChapters.value = [...fork.config.value.allowedChapters];
        authorNote.value = fork.config.value.authorNote;
      }
      // 切换到 selected 模式时再懒加载章节列表
      if (chapterMode.value === 'selected' && chapters.value.length === 0) {
        await loadChapters();
      }
    }
  },
  { immediate: true },
);

// 切换到 selected 模式时自动加载章节
watch(chapterMode, async (m) => {
  if (m === 'selected' && chapters.value.length === 0) {
    await loadChapters();
  }
});

async function handleSave() {
  // 校验：selected 模式必须至少选一章
  if (allowFork.value && chapterMode.value === 'selected' && allowedChapters.value.length === 0) {
    const { ElMessage } = await import('element-plus');
    ElMessage.warning('请至少选择一个可抱走的章节');
    return;
  }
  saving.value = true;
  const finalPermission = allowFork.value ? permission.value : 'closed';
  await fork.saveConfig(props.novelId, {
    allowFork: allowFork.value,
    permission: finalPermission,
    chapterMode: chapterMode.value,
    allowedChapters: allowedChapters.value,
    authorNote: authorNote.value.trim(),
  });
  saving.value = false;
  emit('close');
}

function handleClose() {
  if (saving.value) return;
  emit('close');
}
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="fork-settings-overlay mobile-focus-light-vars">
      <div class="fork-settings-sheet">
        <!-- 顶部 -->
        <div class="fork-settings__header">
          <div class="fork-settings__heading">
            <span class="fork-settings__heading-icon">
              <el-icon><Connection /></el-icon>
            </span>
            <div>
              <span class="fork-settings__kicker">分支权限</span>
              <h3 class="fork-settings__title">抱走设置</h3>
            </div>
          </div>
          <button class="fork-settings__close" @click="handleClose">
            <el-icon><Close /></el-icon>
          </button>
        </div>

        <!-- 内容 -->
        <div class="fork-settings__body">
          <!-- 总开关 -->
          <div class="fork-settings__section">
            <div class="fork-settings__switch-row">
              <div class="fork-settings__switch-info">
                <span class="fork-settings__switch-label">允许读者抱走</span>
                <span class="fork-settings__switch-desc">开启后读者可以从任意章节抱走你的作品，开启二创</span>
              </div>
              <label class="fork-settings__switch">
                <input v-model="allowFork" type="checkbox" />
                <span class="fork-settings__switch-slider"></span>
              </label>
            </div>
          </div>

          <!-- 权限模式 -->
          <div v-if="allowFork" class="fork-settings__section">
            <label class="fork-settings__section-label">谁可以抱走</label>
            <div class="fork-settings__permission-list">
              <button
                v-for="opt in permissionOptions"
                :key="opt.value"
                :class="['fork-settings__permission-item', { active: permission === opt.value }]"
                @click="permission = opt.value"
              >
                <span class="fork-settings__permission-icon">
                  <el-icon><component :is="opt.icon" /></el-icon>
                </span>
                <div class="fork-settings__permission-content">
                  <span class="fork-settings__permission-label">{{ opt.label }}</span>
                  <span class="fork-settings__permission-desc">{{ opt.desc }}</span>
                </div>
                <span v-if="permission === opt.value" class="fork-settings__permission-check">
                  <el-icon><DocumentChecked /></el-icon>
                </span>
              </button>
            </div>
          </div>

          <!-- 作者寄语 -->
          <div v-if="allowFork" class="fork-settings__section">
            <label class="fork-settings__section-label">给抱走者的寄语（可选）</label>
            <textarea
              v-model="authorNote"
              class="fork-settings__textarea"
              placeholder="比如：期待你的二创，欢迎在分支里探索不同的可能性～"
              maxlength="200"
              rows="3"
            ></textarea>
            <span class="fork-settings__char-count">{{ authorNote.length }} / 200</span>
          </div>

          <!-- 章节开放范围 -->
          <div v-if="allowFork" class="fork-settings__section">
            <label class="fork-settings__section-label">哪些章节可以抱走</label>
            <div class="fork-settings__permission-list">
              <button
                v-for="opt in chapterModeOptions"
                :key="opt.value"
                :class="['fork-settings__permission-item', { active: chapterMode === opt.value }]"
                @click="chapterMode = opt.value"
              >
                <span class="fork-settings__permission-icon">
                  <el-icon><component :is="opt.icon" /></el-icon>
                </span>
                <div class="fork-settings__permission-content">
                  <span class="fork-settings__permission-label">{{ opt.label }}</span>
                  <span class="fork-settings__permission-desc">{{ opt.desc }}</span>
                </div>
                <span v-if="chapterMode === opt.value" class="fork-settings__permission-check">
                  <el-icon><DocumentChecked /></el-icon>
                </span>
              </button>
            </div>

            <!-- 章节选择列表 -->
            <div v-if="chapterMode === 'selected'" class="fork-settings__chapters">
              <div class="fork-settings__chapters-toolbar">
                <span class="fork-settings__chapters-count">
                  已选 {{ selectedCount }} 章
                </span>
                <div class="fork-settings__chapters-actions">
                  <button class="fork-settings__chapters-action" @click="selectAll">全选</button>
                  <button class="fork-settings__chapters-action" @click="clearAll">清空</button>
                </div>
              </div>

              <div v-if="chaptersLoading" class="fork-settings__chapters-loading">加载章节中...</div>
              <div v-else-if="chapters.length === 0" class="fork-settings__chapters-empty">
                暂无章节，请先发布章节
              </div>
              <div v-else class="fork-settings__chapters-list">
                <label
                  v-for="ch in chapters"
                  :key="ch.chapterNumber"
                  :class="['fork-settings__chapter-item', { checked: allowedChapters.includes(ch.chapterNumber) }]"
                >
                  <input
                    type="checkbox"
                    :checked="allowedChapters.includes(ch.chapterNumber)"
                    @change="toggleChapter(ch.chapterNumber)"
                  />
                  <span class="fork-settings__chapter-num">第 {{ ch.chapterNumber }} 章</span>
                  <span class="fork-settings__chapter-title">{{ ch.title || '(未命名)' }}</span>
                </label>
              </div>
            </div>
          </div>

          <!-- 关闭提示 -->
          <div v-if="!allowFork" class="fork-settings__closed-hint">
            <span class="fork-settings__closed-icon">
              <el-icon><Lock /></el-icon>
            </span>
            <p class="fork-settings__closed-text">已关闭抱走功能，读者将无法从你的作品创建分支</p>
          </div>
        </div>

        <!-- 底部 -->
        <div class="fork-settings__footer">
          <button
            class="fork-settings__save"
            :disabled="saving"
            @click="handleSave"
          >
            {{ saving ? '保存中...' : '保存设置' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.fork-settings-overlay {
  position: fixed;
  inset: 0;
  z-index: 3000;
  background: color-mix(in srgb, var(--nw-text-primary) 42%, transparent);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.fork-settings-sheet {
  width: 100%;
  max-width: 480px;
  max-height: 88vh;
  background: var(--nw-bg-secondary);
  border-radius: 24px 24px 0 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 -18px 44px color-mix(in srgb, var(--nw-text-primary) 18%, transparent);
}

.fork-settings__header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 18px 20px 14px;
  border-bottom: 1px solid color-mix(in srgb, var(--nw-border) 58%, transparent);
}

.fork-settings__heading {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.fork-settings__heading-icon {
  width: 38px;
  height: 38px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, color-mix(in srgb, var(--mobile-focus-accent) 16%, var(--nw-bg-secondary)), color-mix(in srgb, var(--mobile-focus-accent-strong) 14%, var(--nw-bg-secondary)));
  color: color-mix(in srgb, var(--mobile-focus-accent) 86%, var(--nw-text-primary));
}

.fork-settings__kicker {
  display: block;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--mobile-focus-status-teal);
}

.fork-settings__title {
  margin: 2px 0 0;
  font-size: 19px;
  line-height: 1.25;
  color: var(--nw-text-primary);
}

.fork-settings__close {
  width: 42px;
  height: 42px;
  border: none;
  border-radius: 50%;
  background: color-mix(in srgb, var(--nw-text-primary) 7%, transparent);
  color: var(--nw-text-secondary);
  display: grid;
  place-items: center;
  cursor: pointer;
}

.fork-settings__body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px 18px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.fork-settings__section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.fork-settings__section-label {
  font-size: 13px;
  font-weight: 800;
  color: var(--nw-text-secondary);
}

/* 总开关 */
.fork-settings__switch-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: color-mix(in srgb, var(--mobile-focus-surface-muted) 82%, transparent);
  border: 1px solid color-mix(in srgb, var(--nw-border) 46%, transparent);
  border-radius: 18px;
}

.fork-settings__switch-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.fork-settings__switch-label {
  font-size: 15px;
  font-weight: 800;
  color: var(--nw-text-primary);
}

.fork-settings__switch-desc {
  font-size: 13px;
  color: var(--nw-text-muted);
  line-height: 1.5;
}

.fork-settings__switch {
  position: relative;
  display: inline-block;
  width: 48px;
  height: 28px;
  flex-shrink: 0;
}

.fork-settings__switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.fork-settings__switch-slider {
  position: absolute;
  cursor: pointer;
  inset: 0;
  background: color-mix(in srgb, var(--nw-border) 70%, var(--nw-bg-secondary));
  border-radius: 28px;
  transition: 0.2s;
}

.fork-settings__switch-slider::before {
  content: '';
  position: absolute;
  height: 22px;
  width: 22px;
  left: 3px;
  bottom: 3px;
  background: var(--nw-bg-secondary);
  border-radius: 50%;
  transition: 0.2s;
  box-shadow: 0 2px 7px color-mix(in srgb, var(--nw-text-primary) 22%, transparent);
}

.fork-settings__switch input:checked + .fork-settings__switch-slider {
  background: linear-gradient(135deg, var(--mobile-focus-accent), var(--mobile-focus-accent-strong));
}

.fork-settings__switch input:checked + .fork-settings__switch-slider::before {
  transform: translateX(20px);
}

/* 权限模式 */
.fork-settings__permission-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.fork-settings__permission-item {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 76px;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--nw-border) 66%, transparent);
  border-radius: 18px;
  background: color-mix(in srgb, var(--mobile-focus-surface) 82%, transparent);
  cursor: pointer;
  text-align: left;
  transition: transform 0.16s ease, border-color 0.16s ease, background 0.16s ease;
}

.fork-settings__permission-item.active {
  border-color: color-mix(in srgb, var(--mobile-focus-accent) 42%, transparent);
  background: linear-gradient(135deg, color-mix(in srgb, var(--mobile-focus-accent) 10%, var(--nw-bg-secondary)), color-mix(in srgb, var(--mobile-focus-accent-strong) 8%, var(--nw-bg-secondary)));
}

.fork-settings__permission-item:active {
  transform: scale(0.99);
}

.fork-settings__permission-icon {
  width: 38px;
  height: 38px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border-radius: 14px;
  background: color-mix(in srgb, var(--nw-text-primary) 4%, transparent);
  color: var(--mobile-focus-status-teal);
  font-size: 18px;
}

.fork-settings__permission-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.fork-settings__permission-label {
  font-size: 15px;
  font-weight: 800;
  color: var(--nw-text-primary);
}

.fork-settings__permission-desc {
  font-size: 13px;
  line-height: 1.45;
  color: var(--nw-text-muted);
}

.fork-settings__permission-check {
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: color-mix(in srgb, var(--mobile-focus-accent-strong) 12%, transparent);
  font-size: 14px;
  color: var(--mobile-focus-status-teal);
  font-weight: 700;
  flex-shrink: 0;
}

/* 寄语 */
.fork-settings__textarea {
  width: 100%;
  padding: 13px 14px;
  border: 1px solid color-mix(in srgb, var(--nw-border) 70%, transparent);
  border-radius: 16px;
  font-size: 14px;
  line-height: 1.7;
  color: var(--nw-text-primary);
  background: color-mix(in srgb, var(--nw-bg-secondary) 82%, transparent);
  resize: none;
  font-family: inherit;
  -webkit-user-select: text;
  touch-action: manipulation;
  box-sizing: border-box;
}

.fork-settings__textarea:focus {
  outline: none;
  border-color: color-mix(in srgb, var(--mobile-focus-accent) 48%, transparent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--mobile-focus-accent) 10%, transparent);
}

.fork-settings__char-count {
  align-self: flex-end;
  font-size: 11px;
  color: var(--nw-text-muted);
}

/* 关闭提示 */
.fork-settings__closed-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 32px 16px;
  text-align: center;
  background: color-mix(in srgb, var(--mobile-focus-surface-muted) 82%, transparent);
  border: 1px solid color-mix(in srgb, var(--nw-border) 46%, transparent);
  border-radius: 18px;
}

.fork-settings__closed-icon {
  width: 48px;
  height: 48px;
  display: grid;
  place-items: center;
  border-radius: 16px;
  background: color-mix(in srgb, var(--nw-text-primary) 5%, transparent);
  color: var(--nw-text-muted);
  font-size: 22px;
}

.fork-settings__closed-text {
  margin: 0;
  font-size: 14px;
  color: var(--nw-text-muted);
  line-height: 1.6;
}

/* 底部 */
.fork-settings__footer {
  flex-shrink: 0;
  padding: 12px 20px;
  padding-bottom: max(12px, env(safe-area-inset-bottom));
  border-top: 1px solid color-mix(in srgb, var(--nw-border) 58%, transparent);
  background: color-mix(in srgb, var(--nw-bg-secondary) 94%, transparent);
}

.fork-settings__save {
  width: 100%;
  min-height: 50px;
  padding: 0 16px;
  border: 0;
  border-radius: 14px;
  background: linear-gradient(135deg, var(--mobile-focus-accent), var(--mobile-focus-accent-strong));
  color: var(--mobile-focus-on-accent);
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 12px 28px color-mix(in srgb, var(--mobile-focus-accent) 22%, transparent);
}

.fork-settings__save:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.fork-settings__save:active:not(:disabled) {
  transform: scale(0.98);
}

/* 章节选择 */
.fork-settings__chapters {
  margin-top: 8px;
  border: 1px solid color-mix(in srgb, var(--nw-border) 60%, transparent);
  border-radius: 16px;
  overflow: hidden;
  background: color-mix(in srgb, var(--mobile-focus-surface) 80%, transparent);
}

.fork-settings__chapters-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: color-mix(in srgb, var(--mobile-focus-surface-muted) 72%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--nw-border) 48%, transparent);
}

.fork-settings__chapters-count {
  font-size: 13px;
  font-weight: 800;
  color: var(--nw-text-secondary);
}

.fork-settings__chapters-actions {
  display: flex;
  gap: 12px;
}

.fork-settings__chapters-action {
  border: none;
  background: transparent;
  color: var(--mobile-focus-status-teal);
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  padding: 4px 8px;
}

.fork-settings__chapters-action:active {
  opacity: 0.6;
}

.fork-settings__chapters-loading,
.fork-settings__chapters-empty {
  padding: 24px;
  text-align: center;
  font-size: 13px;
  color: var(--nw-text-muted);
}

.fork-settings__chapters-list {
  max-height: 280px;
  overflow-y: auto;
}

.fork-settings__chapter-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  cursor: pointer;
  border-bottom: 1px solid color-mix(in srgb, var(--nw-border) 36%, transparent);
  transition: background 0.1s;
}

.fork-settings__chapter-item:last-child {
  border-bottom: none;
}

.fork-settings__chapter-item.checked {
  background: color-mix(in srgb, var(--mobile-focus-accent) 7%, transparent);
}

.fork-settings__chapter-item:active {
  background: color-mix(in srgb, var(--mobile-focus-accent) 10%, transparent);
}

.fork-settings__chapter-item input[type='checkbox'] {
  width: 18px;
  height: 18px;
  accent-color: var(--mobile-focus-accent);
  flex-shrink: 0;
  cursor: pointer;
}

.fork-settings__chapter-num {
  font-size: 13px;
  font-weight: 700;
  color: var(--mobile-focus-status-teal);
  flex-shrink: 0;
  min-width: 64px;
}

.fork-settings__chapter-title {
  font-size: 13px;
  color: var(--nw-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}
</style>
