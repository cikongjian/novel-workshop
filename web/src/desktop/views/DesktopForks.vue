<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { fetchChapters } from '../../api/chapters';
import {
  clearForksByNovel,
  deleteForkRecord,
  fetchForkConfig,
  fetchForksByNovel,
  fetchForkStats,
  fetchReceivedForkPublishRequests,
  reviewForkPublishRequest,
  updateForkConfig,
  type ForkChapterMode,
  type ForkConfig,
  type ForkPermission,
  type ForkPublishRequest,
  type ForkRecord,
  type ForkStats,
} from '../../api/forks';
import { extractApiErrorMessage } from '../../api/errors';
import type { ChapterSummary } from '../../types';
import Icon from '../../components/shared/Icon.vue';
import StateView from '../../components/shared/StateView.vue';

const props = defineProps<{ novelId: string }>();
const router = useRouter();

const loading = ref(false);
const saving = ref(false);
const deletingRecordId = ref<string | null>(null);
const reviewingId = ref<string | null>(null);
const clearing = ref(false);
const config = ref<ForkConfig | null>(null);
const records = ref<ForkRecord[]>([]);
const stats = ref<ForkStats | null>(null);
const chapters = ref<ChapterSummary[]>([]);
const requests = ref<ForkPublishRequest[]>([]);
const reviewComment = ref<Record<string, string>>({});

const permissionOptions: { value: ForkPermission; label: string; desc: string }[] = [
  { value: 'all', label: '所有读者', desc: '任何读者都可以从允许章节创建分支' },
  { value: 'followers', label: '仅收藏者', desc: '收藏过本作的读者才能创建分支' },
  { value: 'closed', label: '关闭', desc: '不允许读者创建分支' },
];
const chapterModeOptions: { value: ForkChapterMode; label: string; desc: string }[] = [
  { value: 'all', label: '全部章节', desc: '读者可以从任意已公开章节创建分支' },
  { value: 'selected', label: '指定章节', desc: '只允许从勾选章节创建分支' },
];
const pendingRequests = computed(() => requests.value.filter((item) => item.status === 'pending'));
const selectedChapters = computed(() => config.value?.allowedChapters ?? []);

function fmtDate(s?: string | Date): string {
  const d = typeof s === 'string' ? new Date(s) : s;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
}

async function load(): Promise<void> {
  if (!props.novelId) return;
  loading.value = true;
  try {
    const [nextConfig, forkRes, nextStats, chapterList, requestRes] = await Promise.all([
      fetchForkConfig(props.novelId),
      fetchForksByNovel(props.novelId).catch(() => ({ records: [] as ForkRecord[], total: 0 })),
      fetchForkStats(props.novelId).catch(() => null),
      fetchChapters(props.novelId).catch(() => []),
      fetchReceivedForkPublishRequests().catch(() => ({ requests: [] as ForkPublishRequest[] })),
    ]);
    config.value = nextConfig;
    records.value = forkRes.records;
    stats.value = nextStats;
    chapters.value = chapterList;
    requests.value = requestRes.requests.filter((item) => item.originalNovelId === props.novelId);
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '分支创作加载失败'));
  } finally {
    loading.value = false;
  }
}

function toggleChapter(num: number): void {
  if (!config.value) return;
  const next = new Set(config.value.allowedChapters);
  if (next.has(num)) next.delete(num);
  else next.add(num);
  config.value.allowedChapters = [...next].sort((a, b) => a - b);
}

function selectAllChapters(): void {
  if (!config.value) return;
  config.value.allowedChapters = chapters.value.map((item) => item.chapterNumber);
}

function clearSelectedChapters(): void {
  if (!config.value) return;
  config.value.allowedChapters = [];
}

async function saveConfig(): Promise<void> {
  if (!config.value) return;
  if (config.value.allowFork && config.value.chapterMode === 'selected' && !config.value.allowedChapters.length) {
    ElMessage.warning('请至少选择一个可创建分支的章节');
    return;
  }
  saving.value = true;
  try {
    config.value = await updateForkConfig(props.novelId, {
      allowFork: config.value.allowFork,
      permission: config.value.allowFork ? config.value.permission : 'closed',
      chapterMode: config.value.chapterMode,
      allowedChapters: config.value.allowedChapters,
      authorNote: config.value.authorNote.trim(),
    } as Partial<ForkConfig>);
    ElMessage.success('分支设置已保存');
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '保存失败'));
  } finally {
    saving.value = false;
  }
}

async function removeRecord(record: ForkRecord): Promise<void> {
  try {
    await ElMessageBox.confirm(`删除 ${record.forkedByName || '读者'} 的分支记录？不会删除已生成的分支作品。`, '删除记录', { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' });
  } catch { return; }
  deletingRecordId.value = record.id;
  try {
    await deleteForkRecord(record.id);
    records.value = records.value.filter((item) => item.id !== record.id);
    ElMessage.success('已删除记录');
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '删除失败'));
  } finally {
    deletingRecordId.value = null;
  }
}

async function clearRecords(): Promise<void> {
  if (!records.value.length) return;
  try {
    await ElMessageBox.confirm(`清空全部 ${records.value.length} 条分支记录？不会删除已生成的分支作品。`, '清空记录', { type: 'warning', confirmButtonText: '清空', cancelButtonText: '取消' });
  } catch { return; }
  clearing.value = true;
  try {
    const res = await clearForksByNovel(props.novelId);
    records.value = [];
    stats.value = null;
    ElMessage.success(`已清空 ${res.removed} 条记录`);
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '清空失败'));
  } finally {
    clearing.value = false;
  }
}

async function reviewRequest(req: ForkPublishRequest, decision: 'approved' | 'rejected'): Promise<void> {
  reviewingId.value = req.id;
  try {
    await reviewForkPublishRequest(req.id, decision, reviewComment.value[req.id]?.trim() || undefined);
    ElMessage.success(decision === 'approved' ? '已通过发布申请' : '已退回发布申请');
    await load();
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '审批失败'));
  } finally {
    reviewingId.value = null;
  }
}

function openForkNovel(record: ForkRecord): void {
  router.push(`/desktop/novel/${record.forkedNovelId}`);
}

function openRequestNovel(req: ForkPublishRequest): void {
  router.push(`/desktop/novel/${req.forkedNovelId}`);
}

void load();
</script>

<template>
  <div class="desktop-forks-module">
    <StateView :loading="loading">
      <template v-if="config">
        <section class="fork-hero nw-panel">
          <div>
            <p class="fork-kicker">分支创作</p>
            <h2>让读者从你的章节长出新故事</h2>
            <p>配置谁可以创建分支、允许从哪些章节开始，并处理读者准备上架的分支作品。</p>
          </div>
          <button class="desktop-btn" type="button" :disabled="loading" @click="load"><Icon name="refresh" :size="14" /> 刷新</button>
        </section>

        <section class="desktop-kpi-row fork-kpi-row">
          <div class="nw-panel fork-kpi"><strong>{{ stats?.total ?? records.length }}</strong><span>总分支</span></div>
          <div class="nw-panel fork-kpi"><strong>{{ stats?.publicCount ?? records.filter((r) => r.isPublic).length }}</strong><span>公开分支</span></div>
          <div class="nw-panel fork-kpi"><strong>{{ stats?.privateCount ?? records.filter((r) => !r.isPublic).length }}</strong><span>私有分支</span></div>
          <div class="nw-panel fork-kpi"><strong>{{ pendingRequests.length }}</strong><span>待审批</span></div>
        </section>

        <section class="nw-panel fork-config-panel">
          <div class="nw-panel__head">
            <h3 class="nw-panel__title"><Icon name="settings" :size="16" /> 分支设置</h3>
            <button class="desktop-btn desktop-btn--primary" type="button" :disabled="saving" @click="saveConfig">
              <Icon name="checkCircle" :size="14" /> {{ saving ? '保存中…' : '保存设置' }}
            </button>
          </div>
          <div class="fork-config-grid">
            <div class="fork-setting-card fork-setting-card--switch">
              <div><strong>允许创建分支</strong><span>开启后读者可基于章节创建自己的剧情线</span></div>
              <label class="admin-toggle">
                <input v-model="config.allowFork" type="checkbox" />
                <span class="admin-toggle-track" :class="{ on: config.allowFork }"><span class="admin-toggle-thumb" /></span>
              </label>
            </div>

            <div class="fork-setting-card">
              <strong>谁可以创建</strong>
              <div class="fork-option-list">
                <button v-for="opt in permissionOptions" :key="opt.value" class="fork-option" :class="{ active: config.permission === opt.value }" type="button" :disabled="!config.allowFork" @click="config.permission = opt.value">
                  <span>{{ opt.label }}</span><small>{{ opt.desc }}</small>
                </button>
              </div>
            </div>

            <div class="fork-setting-card">
              <strong>可创建章节</strong>
              <div class="fork-option-list">
                <button v-for="opt in chapterModeOptions" :key="opt.value" class="fork-option" :class="{ active: config.chapterMode === opt.value }" type="button" :disabled="!config.allowFork" @click="config.chapterMode = opt.value">
                  <span>{{ opt.label }}</span><small>{{ opt.desc }}</small>
                </button>
              </div>
            </div>

            <div class="fork-setting-card fork-setting-card--wide">
              <strong>作者说明</strong>
              <textarea v-model="config.authorNote" class="nw-input" rows="4" maxlength="300" placeholder="写给想创建分支的读者，例如世界观边界、角色使用约定或二创鼓励语。" />
            </div>

            <div v-if="config.chapterMode === 'selected'" class="fork-setting-card fork-setting-card--wide">
              <div class="fork-card-head">
                <strong>指定章节</strong>
                <div class="fork-card-actions"><button class="desktop-btn" type="button" @click="selectAllChapters">全选</button><button class="desktop-btn" type="button" @click="clearSelectedChapters">清空</button></div>
              </div>
              <div class="fork-chapter-pills">
                <button v-for="chapter in chapters" :key="chapter.chapterNumber" class="fork-chapter-pill" :class="{ active: selectedChapters.includes(chapter.chapterNumber) }" type="button" @click="toggleChapter(chapter.chapterNumber)">
                  第 {{ chapter.chapterNumber }} 章 · {{ chapter.title || '未命名' }}
                </button>
              </div>
            </div>
          </div>
        </section>

        <section class="nw-panel">
          <div class="nw-panel__head">
            <h3 class="nw-panel__title"><Icon name="gitBranch" :size="16" /> 分支记录 <span class="desktop-section-count">{{ records.length }}</span></h3>
            <button class="desktop-btn" type="button" :disabled="clearing || !records.length" @click="clearRecords">清空记录</button>
          </div>
          <StateView :empty="!records.length">
            <template #empty><p class="nw-state__title">还没有读者创建分支</p><p class="nw-state__desc">当读者从阅读页创建分支后，会出现在这里。</p></template>
            <div class="fork-record-grid">
              <article v-for="record in records" :key="record.id" class="fork-record-card">
                <div class="fork-record-card-main" @click="openForkNovel(record)">
                  <span class="fork-record-badge">第 {{ record.fromChapter }} 章</span>
                  <strong>{{ record.forkedByName || '读者' }} 的分支</strong>
                  <small>{{ fmtDate(record.createdAt) }} · {{ record.isPublic ? '公开' : '私有' }}</small>
                </div>
                <button class="desktop-btn" type="button" :disabled="deletingRecordId === record.id" @click="removeRecord(record)">
                  {{ deletingRecordId === record.id ? '删除中…' : '删除记录' }}
                </button>
              </article>
            </div>
          </StateView>
        </section>

        <section class="nw-panel">
          <div class="nw-panel__head">
            <h3 class="nw-panel__title"><Icon name="checkCircle" :size="16" /> 发布审批 <span class="desktop-section-count">{{ requests.length }}</span></h3>
          </div>
          <StateView :empty="!requests.length">
            <template #empty><p class="nw-state__title">暂无发布申请</p><p class="nw-state__desc">读者想把分支上架时，会进入这里等待你的确认。</p></template>
            <div class="fork-request-list">
              <article v-for="req in requests" :key="req.id" class="fork-request-card">
                <div class="fork-request-top">
                  <div><strong>《{{ req.forkedTitle }}》</strong><span>{{ req.requesterName || '读者' }} · {{ fmtDate(req.createdAt) }}</span></div>
                  <span class="nw-tag" :class="req.status === 'pending' ? 'priority-medium' : 'priority-low'">{{ req.status }}</span>
                </div>
                <p v-if="req.message">{{ req.message }}</p>
                <textarea v-if="req.status === 'pending'" v-model="reviewComment[req.id]" class="nw-input" rows="3" maxlength="200" placeholder="可补充处理意见，方便对方调整。" />
                <div class="fork-request-actions">
                  <button class="desktop-btn" type="button" @click="openRequestNovel(req)">查看分支</button>
                  <button v-if="req.status === 'pending'" class="desktop-btn" type="button" :disabled="reviewingId === req.id" @click="reviewRequest(req, 'rejected')">退回</button>
                  <button v-if="req.status === 'pending'" class="desktop-btn desktop-btn--primary" type="button" :disabled="reviewingId === req.id" @click="reviewRequest(req, 'approved')">通过</button>
                </div>
              </article>
            </div>
          </StateView>
        </section>
      </template>
    </StateView>
  </div>
</template>
