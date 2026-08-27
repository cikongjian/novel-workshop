<script setup lang="ts">
/**
 * 抱走记录面板 — 统计 + 记录列表 + 清空（作者专属操作）
 * UI 风格对齐移动端工作区（fork-publish-sheets 风格）
 */
import { computed, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Close, Delete, Document, Lock, TrendCharts, User } from '@element-plus/icons-vue';
import {
  fetchForksByNovel,
  fetchForkStats,
  deleteForkRecord,
  clearForksByNovel,
  type ForkRecord,
  type ForkStats,
  type ForkChapterStat,
} from '../../api/forks';

const props = defineProps<{
  visible: boolean;
  novelId: string;
  /** 是否为作者（作者可看私密、可清空） */
  isOwner?: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

const records = ref<ForkRecord[]>([]);
const stats = ref<ForkStats | null>(null);
const loading = ref(false);
const clearingAll = ref(false);

const hasData = computed(() => records.value.length > 0);

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatRelative(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return mins <= 1 ? '刚刚' : `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return formatDate(iso);
}

const topChapterStats = computed<ForkChapterStat[]>(() =>
  stats.value?.byChapter?.slice(0, 5) ?? [],
);

async function loadData() {
  if (!props.novelId) return;
  loading.value = true;
  try {
    const [recordsRes, statsRes] = await Promise.all([
      fetchForksByNovel(props.novelId),
      fetchForkStats(props.novelId).catch(() => null),
    ]);
    records.value = recordsRes.records;
    stats.value = statsRes;
  } catch {
    ElMessage.error('加载抱走记录失败');
  } finally {
    loading.value = false;
  }
}

async function handleDelete(record: ForkRecord) {
  if (!props.isOwner) return;
  try {
    await ElMessageBox.confirm(
      `确定删除「${record.forkedByName || '匿名读者'}」的抱走记录吗？不会影响已生成的分支作品。`,
      '删除记录',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' },
    );
  } catch {
    return;
  }
  try {
    await deleteForkRecord(record.id);
    records.value = records.value.filter((r) => r.id !== record.id);
    ElMessage.success('已删除');
  } catch {
    ElMessage.error('删除失败');
  }
}

async function handleClearAll() {
  if (!props.isOwner) return;
  try {
    await ElMessageBox.confirm(
      `确定清空全部 ${records.value.length} 条抱走记录吗？不会影响已生成的分支作品。`,
      '清空全部记录',
      { confirmButtonText: '清空', cancelButtonText: '取消', type: 'warning' },
    );
  } catch {
    return;
  }
  clearingAll.value = true;
  try {
    const { removed } = await clearForksByNovel(props.novelId);
    records.value = [];
    stats.value = null;
    ElMessage.success(`已清空 ${removed} 条记录`);
  } catch {
    ElMessage.error('清空失败');
  } finally {
    clearingAll.value = false;
  }
}

watch(
  () => props.visible,
  (v) => {
    if (v) void loadData();
    else { records.value = []; stats.value = null; }
  },
  { immediate: true },
);

function handleClose() {
  if (clearingAll.value) return;
  emit('close');
}
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="fork-records-overlay mobile-focus-light-vars" @click.self="handleClose">
      <section class="fork-records-sheet" role="dialog" aria-modal="true" aria-label="抱走记录">
        <!-- Header -->
        <header class="fork-records__header">
          <div class="fork-records__heading">
            <span class="fork-records__heading-icon">
              <el-icon><TrendCharts /></el-icon>
            </span>
            <div>
              <span class="fork-records__kicker">分叉足迹</span>
              <h3 class="fork-records__title">抱走记录</h3>
            </div>
          </div>
          <div class="fork-records__head-actions">
            <button class="fork-records__close" type="button" aria-label="关闭" @click="handleClose">
              <el-icon><Close /></el-icon>
            </button>
          </div>
        </header>

        <!-- Body -->
        <main class="fork-records__body">
          <!-- Loading -->
          <div v-if="loading" class="fork-records__loading">
            <span class="fork-records__spinner"></span>
            <p>正在读取抱走记录</p>
          </div>

          <!-- Stats Cards -->
          <template v-else-if="hasData">
            <section class="fork-records__stats" :class="{ 'fork-records__stats--two': !isOwner }">
              <div class="fork-records__stat-card">
                <span class="fork-records__stat-value">{{ stats?.total ?? records.length }}</span>
                <span class="fork-records__stat-label">总抱走次数</span>
              </div>
              <div class="fork-records__stat-card">
                <span class="fork-records__stat-value">{{ stats?.publicCount ?? '-' }}</span>
                <span class="fork-records__stat-label">
                  <el-icon><Document /></el-icon>公开
                </span>
              </div>
              <div v-if="isOwner" class="fork-records__stat-card">
                <span class="fork-records__stat-value">{{ stats?.privateCount ?? '-' }}</span>
                <span class="fork-records__stat-label">
                  <el-icon><Lock /></el-icon>私密
                </span>
              </div>
            </section>

            <!-- Hot chapters -->
            <section v-if="topChapterStats.length" class="fork-records__hot-chapters">
              <span class="fork-records__hot-label">热门抱走章节</span>
              <div class="fork-records__hot-list">
                <span
                  v-for="(item, idx) in topChapterStats"
                  :key="item.chapter"
                  class="fork-records__hot-chip"
                  :class="{ 'is-top': idx === 0 }"
                >
                  第 {{ item.chapter }} 章 <em>{{ item.count }}次</em>
                </span>
              </div>
            </section>

            <!-- Latest time -->
            <p v-if="stats?.latestForkAt" class="fork-records__latest">
              最近抱走：{{ formatRelative(stats.latestForkAt) }}
            </p>

            <!-- Record list -->
            <section class="fork-records__list">
              <div
                v-for="record in records"
                :key="record.id"
                class="fork-records__item"
              >
                <div class="fork-records__item-avatar">
                  <el-icon><User /></el-icon>
                </div>
                <div class="fork-records__item-content">
                  <div class="fork-records__item-top">
                    <span class="fork-records__item-name">{{ record.forkedByName || '匿名读者' }}</span>
                    <span v-if="!record.isPublic" class="fork-records__item-badge is-private">
                      <el-icon><Lock /></el-icon>私密
                    </span>
                    <span v-else class="fork-records__item-badge is-public">公开</span>
                  </div>
                  <p class="fork-records__item-meta">
                    第 {{ record.fromChapter }} 章抱走 · {{ formatRelative(record.createdAt) }}
                  </p>
                </div>
                <button
                  v-if="isOwner"
                  class="fork-records__item-delete"
                  type="button"
                  aria-label="删除"
                  @click.stop="handleDelete(record)"
                >
                  <el-icon><Delete /></el-icon>
                </button>
              </div>
            </section>
          </template>

          <!-- Empty -->
          <div v-else class="fork-records__empty">
            <span class="fork-records__empty-icon">
              <el-icon><TrendCharts /></el-icon>
            </span>
            <strong>还没有人抱走这部作品</strong>
            <p>读者从任意章节抱走后，会在这里展示统计和记录</p>
          </div>
        </main>

        <!-- Footer -->
        <footer v-if="hasData" class="fork-records__footer">
          <button
            v-if="isOwner"
            class="fork-records__footer-btn is-danger"
            type="button"
            :disabled="clearingAll"
            @click="handleClearAll"
          >
            <el-icon><Delete /></el-icon>
            {{ clearingAll ? '清空中...' : `清空记录（${records.length} 条）` }}
          </button>
          <button v-else class="fork-records__footer-btn" type="button" @click="handleClose">
            知道了
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.fork-records-overlay {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: color-mix(in srgb, var(--nw-text-primary) 42%, transparent);
  backdrop-filter: blur(6px);
  color: var(--nw-text-primary);
}

.fork-records-sheet {
  width: 100%;
  max-width: 480px;
  max-height: 88vh;
  background: var(--nw-bg-secondary);
  border-radius: 24px 24px 0 0;
  box-shadow: 0 -18px 44px color-mix(in srgb, var(--nw-text-primary) 18%, transparent);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Header */
.fork-records__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  padding: 18px 20px 14px;
  border-bottom: 1px solid color-mix(in srgb, var(--nw-border) 46%, transparent);
  flex-shrink: 0;
}

.fork-records__heading {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.fork-records__heading-icon {
  width: 38px;
  height: 38px;
  border-radius: 14px;
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--mobile-focus-accent) 16%, var(--nw-bg-secondary)),
    color-mix(in srgb, var(--mobile-focus-accent-strong) 14%, var(--nw-bg-secondary))
  );
  display: grid;
  place-items: center;
  font-size: 18px;
  color: var(--mobile-focus-accent);
  flex-shrink: 0;
}

.fork-records__kicker {
  display: block;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: color-mix(in srgb, var(--mobile-focus-accent-strong) 86%, var(--nw-text-primary));
}

.fork-records__title {
  margin: 2px 0 0;
  font-size: 19px;
  line-height: 1.25;
  color: var(--nw-text-primary);
}

.fork-records__head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.fork-records__close {
  width: 42px;
  height: 42px;
  border: none;
  border-radius: 50%;
  background: color-mix(in srgb, var(--nw-text-primary) 5%, transparent);
  color: var(--nw-text-secondary);
  display: grid;
  place-items: center;
  cursor: pointer;
  flex-shrink: 0;
}

.fork-records__close:active {
  background: color-mix(in srgb, var(--nw-text-primary) 10%, transparent);
}

/* Body */
.fork-records__body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px 18px;
}

/* Loading */
.fork-records__loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 48px 0;
  color: var(--nw-text-muted);
  font-size: 13px;
}

.fork-records__spinner {
  width: 30px;
  height: 30px;
  border: 3px solid color-mix(in srgb, var(--mobile-focus-accent-strong) 18%, transparent);
  border-top-color: var(--mobile-focus-accent-strong);
  border-radius: 50%;
  animation: fork-records-spin 0.8s linear infinite;
}

@keyframes fork-records-spin {
  to { transform: rotate(360deg); }
}

/* Stats */
.fork-records__stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-bottom: 16px;
}

.fork-records__stats--two {
  grid-template-columns: repeat(2, 1fr);
}

.fork-records__stat-card {
  min-height: 98px;
  background: color-mix(in srgb, var(--nw-bg-secondary) 76%, transparent);
  border: 1px solid color-mix(in srgb, var(--nw-border) 54%, transparent);
  border-radius: 18px;
  padding: 12px 10px;
  text-align: center;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 6px;
}

.fork-records__stat-value {
  font-size: 24px;
  font-weight: 800;
  color: var(--nw-text-primary);
  letter-spacing: -0.03em;
}

.fork-records__stat-label {
  font-size: 11px;
  color: var(--nw-text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
}

/* Hot chapters */
.fork-records__hot-chapters {
  margin-bottom: 14px;
}

.fork-records__hot-label {
  font-size: 11px;
  font-weight: 800;
  color: var(--nw-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  display: block;
  margin-bottom: 8px;
}

.fork-records__hot-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.fork-records__hot-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 11px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--mobile-focus-accent) 8%, var(--nw-bg-secondary));
  border: 1px solid color-mix(in srgb, var(--mobile-focus-accent) 18%, transparent);
  font-size: 12px;
  color: color-mix(in srgb, var(--mobile-focus-accent) 86%, var(--nw-text-primary));
}

.fork-records__hot-chip.is-top {
  background: color-mix(in srgb, var(--mobile-focus-accent-strong) 10%, var(--nw-bg-secondary));
  border-color: color-mix(in srgb, var(--mobile-focus-accent-strong) 28%, transparent);
  color: color-mix(in srgb, var(--mobile-focus-accent-strong) 86%, var(--nw-text-primary));
}

.fork-records__hot-chip em {
  font-style: normal;
  font-weight: 700;
  color: color-mix(in srgb, var(--mobile-focus-accent-strong) 86%, var(--nw-text-primary));
}

/* Latest */
.fork-records__latest {
  margin: 0 0 14px;
  font-size: 12px;
  color: var(--nw-text-muted);
}

/* List */
.fork-records__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.fork-records__item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 18px;
  border: 1px solid color-mix(in srgb, var(--nw-border) 54%, transparent);
  background: color-mix(in srgb, var(--nw-bg-secondary) 76%, transparent);
}

.fork-records__item-avatar {
  width: 40px;
  height: 40px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--mobile-focus-accent) 10%, var(--nw-bg-secondary));
  display: grid;
  place-items: center;
  font-size: 16px;
  color: color-mix(in srgb, var(--mobile-focus-accent) 86%, var(--nw-text-primary));
  flex-shrink: 0;
}

.fork-records__item-content {
  flex: 1;
  min-width: 0;
}

.fork-records__item-top {
  display: flex;
  align-items: center;
  gap: 8px;
}

.fork-records__item-name {
  font-size: 14px;
  font-weight: 800;
  color: var(--nw-text-primary);
}

.fork-records__item-badge {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
}

.fork-records__item-badge.is-public {
  background: color-mix(in srgb, var(--mobile-focus-accent-strong) 10%, var(--nw-bg-secondary));
  color: color-mix(in srgb, var(--mobile-focus-accent-strong) 86%, var(--nw-text-primary));
}

.fork-records__item-badge.is-private {
  background: color-mix(in srgb, var(--nw-text-muted) 10%, var(--nw-bg-secondary));
  color: var(--nw-text-secondary);
}

.fork-records__item-meta {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--nw-text-muted);
}

.fork-records__item-delete {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 12px;
  background: color-mix(in srgb, var(--mobile-focus-status-danger) 6%, var(--nw-bg-secondary));
  color: var(--mobile-focus-status-danger);
  display: grid;
  place-items: center;
  cursor: pointer;
  flex-shrink: 0;
  opacity: 0.72;
  transition: opacity 0.15s;
}

.fork-records__item:hover .fork-records__item-delete {
  opacity: 1;
}

.fork-records__item-delete:active {
  background: color-mix(in srgb, var(--mobile-focus-status-danger) 15%, var(--nw-bg-secondary));
}

/* Empty */
.fork-records__empty {
  min-height: 240px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 12px;
  text-align: center;
  color: var(--nw-text-muted);
}

.fork-records__empty-icon {
  width: 56px;
  height: 56px;
  border-radius: 18px;
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--mobile-focus-accent) 16%, var(--nw-bg-secondary)),
    color-mix(in srgb, var(--mobile-focus-accent-strong) 14%, var(--nw-bg-secondary))
  );
  display: grid;
  place-items: center;
  font-size: 26px;
  color: var(--mobile-focus-accent);
}

.fork-records__empty strong {
  font-size: 15px;
  color: var(--nw-text-primary);
}

.fork-records__empty p {
  margin: 0;
  font-size: 13px;
  color: var(--nw-text-muted);
  max-width: 240px;
}

/* Footer */
.fork-records__footer {
  flex-shrink: 0;
  padding: 12px 20px;
  padding-bottom: max(12px, env(safe-area-inset-bottom));
  border-top: 1px solid color-mix(in srgb, var(--nw-border) 42%, transparent);
  background: color-mix(in srgb, var(--nw-bg-secondary) 94%, transparent);
  display: flex;
  gap: 10px;
}

.fork-records__footer-btn {
  flex: 1;
  min-height: 50px;
  padding: 0 16px;
  border: none;
  border-radius: 14px;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: linear-gradient(135deg, var(--mobile-focus-accent), var(--mobile-focus-accent-strong));
  color: var(--mobile-focus-on-accent);
  box-shadow: 0 12px 28px color-mix(in srgb, var(--mobile-focus-accent) 22%, transparent);
}

.fork-records__footer-btn.is-danger {
  border: 1px solid color-mix(in srgb, var(--mobile-focus-status-danger) 18%, transparent);
  background: color-mix(in srgb, var(--mobile-focus-status-danger) 8%, var(--nw-bg-secondary));
  color: color-mix(in srgb, var(--mobile-focus-status-danger) 86%, var(--nw-text-primary));
  box-shadow: none;
}

.fork-records__footer-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.fork-records__footer-btn:active:not(:disabled) {
  transform: scale(0.98);
}
</style>
