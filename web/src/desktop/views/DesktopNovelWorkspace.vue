<script setup lang="ts">
/**
 * 桌面端·作品工作台
 * 真实数据：fetchNovel + fetchChapters（需登录，未登录数据层 401 自动跳登录）。
 * 功能：作品元信息展示 + 章节目录 + 编辑信息（标题/简介/状态，updateNovel）。
 * 阅读/章节生成暂跳移动端（桌面阅读器/编辑器为后续对齐项）。
 */
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useAsyncData } from '../../composables/useAsyncData';
import { useNovelRealtimeStatus } from '../../composables/useNovelRealtimeStatus';
import { useAgentsStore } from '../../stores/agents';
import { extractProgressLines } from '../../utils/agent-progress';
import { AGENT_NAMES, type AgentRole } from '../../types';
import { extractApiErrorMessage, isAbortError } from '../../api/errors';
import { fetchNovel, updateNovel, getCoverUrl } from '../../api/novels';
import { fetchChapters, generateChapterTitle, backfillChapterTitles, deleteChapter as apiDeleteChapter } from '../../api/chapters';
import { generateChapter, cancelBatch, finalizeChapter } from '../../api/generate';
import { exportNovel } from '../../api/novels';
import type { StylePresetOption } from '../../config/chapter-generation-options';
import DesktopGenerateDialog from '../DesktopGenerateDialog.vue';
import DesktopBatchDialog from '../DesktopBatchDialog.vue';
import DesktopCoverDialog from '../DesktopCoverDialog.vue';
import DesktopCharacters from './DesktopCharacters.vue';
import DesktopOutline from './DesktopOutline.vue';
import DesktopPublish from './DesktopPublish.vue';
import DesktopWorld from './DesktopWorld.vue';
import DesktopInteractive from './DesktopInteractive.vue';
import DesktopForks from './DesktopForks.vue';
import DesktopComic from './DesktopComic.vue';
import DesktopAudioDrama from '../DesktopAudioDrama.vue';
import DesktopSideStories from '../DesktopSideStories.vue';
import DesktopCharacterGrowth from '../DesktopCharacterGrowth.vue';
import {
  STATUS_LABELS,
  GENRE_LABELS,
  CHAPTER_STATUS_LABELS,
  type NovelMetadata,
  type NovelStatus,
  type ChapterSummary,
  type ChapterStatus,
} from '../../types';
import StateView from '../../components/shared/StateView.vue';
import StatCard from '../../components/shared/StatCard.vue';
import Icon from '../../components/shared/Icon.vue';
import Modal from '../../components/shared/Modal.vue';
import DesktopChapterReader from '../DesktopChapterReader.vue';

interface Payload {
  novel: NovelMetadata;
  chapters: ChapterSummary[];
}

const route = useRoute();
const router = useRouter();
const novelId = computed(() => String(route.params.id || ''));

const { data, loading, error, run } = useAsyncData<Payload, []>(
  async () => {
    const [novel, chapters] = await Promise.all([
      fetchNovel(novelId.value),
      fetchChapters(novelId.value),
    ]);
    return { novel, chapters };
  },
  { immediate: true },
);
watch(novelId, () => { void run(); });

/** 实时生成进度（WebSocket → agents store）。解构出 computed 以便模板自动解包。 */
const { isGeneratingHere, generatingChapterNumber, activeAgentLabel, progressDescription } = useNovelRealtimeStatus(novelId);

const agents = useAgentsStore();
const PIPELINE_AGENTS: AgentRole[] = ['outline', 'world-builder', 'character', 'writer', 'editor', 'reader'];
const activeAgentRoles = computed<AgentRole[]>(() => agents.getNovelActiveAgentList(novelId.value));
const assistantLines = computed(() => extractProgressLines(agents.getNovelOutput(novelId.value, 'writing-assistant')));

const ROLE_ICON: Record<string, string> = {
  outline: 'compass',
  'world-builder': 'globe',
  character: 'user',
  writer: 'feather',
  editor: 'checkCircle',
  reader: 'bookOpen',
};

/** 推断每个 Agent 的阶段状态：done(已完成)/active(运行中)/pending(待命) */
function agentStatus(role: AgentRole): 'done' | 'active' | 'pending' {
  if (activeAgentRoles.value.includes(role)) return 'active';
  const firstActiveIdx = PIPELINE_AGENTS.findIndex((r) => activeAgentRoles.value.includes(r));
  if (firstActiveIdx === -1) return 'pending';
  return PIPELINE_AGENTS.indexOf(role) < firstActiveIdx ? 'done' : 'pending';
}

const errorMessage = computed(() => {
  if (!error.value || isAbortError(error.value)) return '';
  return extractApiErrorMessage(error.value);
});
const stateError = computed(() => (errorMessage.value ? error.value : null));
const novel = computed<NovelMetadata | null>(() => data.value?.novel ?? null);
const chapters = computed<ChapterSummary[]>(() => data.value?.chapters ?? []);
const cover = computed(() => (novel.value ? getCoverUrl(novel.value.id) : ''));
const coverFailed = ref(false);
function onCoverError(): void {
  coverFailed.value = true;
}

// 编辑信息弹窗
const editVisible = ref(false);
const saving = ref(false);
const editForm = ref({ title: '', synopsis: '', status: 'planning' as NovelStatus });
const statusOptions = Object.entries(STATUS_LABELS) as [NovelStatus, string][];

function openEdit(): void {
  if (!novel.value) return;
  editForm.value = {
    title: novel.value.title,
    synopsis: novel.value.synopsis || '',
    status: novel.value.status,
  };
  editVisible.value = true;
}

async function saveEdit(): Promise<void> {
  if (!editForm.value.title.trim()) {
    ElMessage.warning('请输入标题');
    return;
  }
  saving.value = true;
  try {
    const updated = await updateNovel(novelId.value, {
      title: editForm.value.title.trim(),
      synopsis: editForm.value.synopsis.trim(),
      status: editForm.value.status,
    });
    if (data.value) data.value = { ...data.value, novel: updated };
    ElMessage.success('已保存');
    editVisible.value = false;
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '保存失败'));
  } finally {
    saving.value = false;
  }
}

function fmt(n: number): string {
  return n >= 10000 ? `${(n / 10000).toFixed(1)}万` : String(n);
}
function fmtDate(s?: string | Date): string {
  const d = typeof s === 'string' ? new Date(s) : s;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('zh-CN') : '—';
}
function chapterLabel(s: ChapterStatus): string {
  return CHAPTER_STATUS_LABELS[s] ?? s;
}

function back(): void {
  router.push('/desktop/novels');
}

/** 章节阅读弹窗 */
const readerVisible = ref(false);
const readerNum = ref(1);
const chapterTotal = computed(() => novel.value?.chapterCount || chapters.value.length);

/** AI 封面弹窗 */
const coverDialogVisible = ref(false);

/** 模块 Tab 切换 */
const activeModule = ref<'characters' | 'world' | 'outline' | 'publish' | 'interactive' | 'forks' | 'comic' | 'audio' | 'side-stories' | 'growth'>('characters');

function readChapter(num: number): void {
  readerNum.value = num;
  readerVisible.value = true;
}
function manageChapters(): void {
  // 章节管理已在工作台内（章节目录区），滚动到该区域
  document.querySelector('.workspace-tabs')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** 章节生成（复用 api.generateChapter） */
const generating = ref(false);
const genDialogVisible = ref(false);
const genChapterNum = ref(1);
const nextChapterNumber = computed(() => {
  const maxNum = chapters.value.reduce((m, c) => Math.max(m, c.chapterNumber), 0);
  return maxNum + 1;
});
function openGenerate(): void {
  genChapterNum.value = nextChapterNumber.value;
  genDialogVisible.value = true;
}
async function handleGenerate(opts: { userDirection?: string; stylePreset: StylePresetOption; styleNotes?: string; startupPlatformProfile?: 'auto' | 'fanqie' | 'qidian'; maxWordCount: number }): Promise<void> {
  generating.value = true;
  try {
    await generateChapter({
      novelId: novelId.value,
      chapterNumber: genChapterNum.value,
      userDirection: opts.userDirection,
      stylePreset: opts.stylePreset,
      styleNotes: opts.styleNotes,
      startupPlatformProfile: opts.startupPlatformProfile,
      maxWordCount: opts.maxWordCount,
    });
    ElMessage.success(`第 ${genChapterNum.value} 章生成任务已启动，完成后会自动定稿`);
    await run();
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '生成失败，请稍后重试'));
  } finally {
    generating.value = false;
  }
}

/** 批量生成 */
const batchDialogVisible = ref(false);
async function cancelBatchRun(): Promise<void> {
  try {
    await cancelBatch(novelId.value);
    ElMessage.success('已取消批量生成');
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '取消失败'));
  }
}

/** 导出作品 */
const exporting = ref(false);
async function doExport(format: 'markdown' | 'txt' | 'html' | 'epub'): Promise<void> {
  exporting.value = true;
  try {
    const result = await exportNovel(novelId.value, format, { includeMetadata: true, includeToc: true });
    let blob: Blob;
    let filename: string;
    const safeTitle = novel.value?.title?.replace(/[<>:"/\\|?*]/g, '_') ?? 'export';
    if (result instanceof Blob) {
      blob = result;
      filename = `${safeTitle}.${format}`;
    } else {
      blob = new Blob([result.content], { type: 'text/plain;charset=utf-8' });
      filename = `${safeTitle}.${format === 'markdown' ? 'md' : format}`;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    ElMessage.success(`已导出 ${filename}`);
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '导出失败'));
  } finally {
    exporting.value = false;
  }
}

/** 逐章操作 */
const titleGenLoading = ref<number | null>(null);
const finalizeLoading = ref<number | null>(null);
const backfillLoading = ref(false);

async function quickGenTitle(num: number): Promise<void> {
  titleGenLoading.value = num;
  try {
    const res = await generateChapterTitle(novelId.value, num);
    if (res.adopted) ElMessage.success(`已更新标题：${res.title}`);
    else ElMessage.info(`建议标题：${res.candidateTitle}（未自动采用）`);
    await run();
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '标题生成失败'));
  } finally {
    titleGenLoading.value = null;
  }
}

async function quickFinalize(num: number): Promise<void> {
  finalizeLoading.value = num;
  try {
    ElMessage.info('正在定稿，提取角色/世界/剧情上下文…');
    await finalizeChapter(novelId.value, num);
    ElMessage.success(`第 ${num} 章已定稿，角色/世界/剧情已入库`);
    await run();
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '定稿失败'));
  } finally {
    finalizeLoading.value = null;
  }
}

async function backfillTitles(): Promise<void> {
  backfillLoading.value = true;
  try {
    const res = await backfillChapterTitles(novelId.value);
    ElMessage.success(res.message || `已补全 ${res.updated}/${res.total} 章`);
    await run();
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '补全失败'));
  } finally {
    backfillLoading.value = false;
  }
}

async function quickDeleteChapter(num: number): Promise<void> {
  try {
    await ElMessageBox.confirm(`删除第 ${num} 章？此操作不可撤销。`, '删除章节', { type: 'warning', confirmButtonText: '删除' });
  } catch { return; }
  try {
    await apiDeleteChapter(novelId.value, num);
    ElMessage.success('已删除');
    await run();
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '删除失败'));
  }
}

function chapterRowAction(cmd: string, num: number): void {
  if (cmd === 'read') readChapter(num);
  else if (cmd === 'title') void quickGenTitle(num);
  else if (cmd === 'delete') void quickDeleteChapter(num);
}
</script>

<template>
  <div class="desktop-novel">
    <button class="desktop-back" @click="back">
      <Icon name="arrowLeft" :size="16" /> 返回
    </button>

    <StateView :loading="loading && !data" :error="stateError" :error-message="errorMessage" @retry="run">
      <template #loading>
        <div class="desktop-detail-skeleton" />
      </template>

      <template v-if="novel">
        <!-- 作品头 -->
        <div class="nw-panel detail-header">
          <div class="detail-cover cover-clickable" @click="coverDialogVisible = true">
            <img v-if="cover && !coverFailed" :src="cover" class="detail-cover-img" @error="onCoverError" />
            <span v-else class="detail-cover-fallback">{{ novel.title.slice(0, 1) }}</span>
            <div class="cover-hover-hint"><Icon name="sparkles" :size="16" /> 更换封面</div>
          </div>
          <div class="detail-meta">
            <div class="detail-tags">
              <span class="nw-tag">{{ GENRE_LABELS[novel.genre] || novel.genre }}</span>
              <span class="nw-tag nw-tag--muted">{{ STATUS_LABELS[novel.status] || novel.status }}</span>
            </div>
            <h1 class="detail-title">{{ novel.title }}</h1>
            <div class="detail-sub">
              更新于 {{ fmtDate(novel.updatedAt) }}
              <span class="detail-dot" />
              {{ chapters.length }} 章
            </div>
            <p v-if="novel.synopsis" class="novel-synopsis">{{ novel.synopsis }}</p>
            <div class="detail-actions">
              <button class="desktop-btn desktop-btn--primary" @click="openEdit">
                <Icon name="pen" :size="16" /> 编辑信息
              </button>
              <button class="desktop-btn" @click="manageChapters">
                <Icon name="layers" :size="16" /> 章节管理
              </button>
              <el-dropdown trigger="click" @command="(cmd: string) => doExport(cmd as 'markdown' | 'txt' | 'html' | 'epub')">
                <button class="desktop-btn" :disabled="exporting"><Icon name="bookOpen" :size="16" /> 导出</button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="markdown">Markdown (.md)</el-dropdown-item>
                    <el-dropdown-item command="txt">纯文本 (.txt)</el-dropdown-item>
                    <el-dropdown-item command="html">HTML</el-dropdown-item>
                    <el-dropdown-item command="epub">EPUB 电子书</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </div>
        </div>

        <!-- 统计 -->
        <div class="desktop-kpi-row">
          <StatCard icon="pen" accent="emerald" :value="fmt(novel.wordCount || 0)" label="累计字数" />
          <StatCard icon="book" accent="indigo" :value="novel.chapterCount || chapters.length" label="章节数" />
          <StatCard icon="layers" accent="sky" :value="novel.targetChapters || '—'" label="目标章节" />
          <StatCard icon="sparkles" accent="amber" :value="chapters.filter((c) => c.status === 'finalized').length" label="已定稿" />
        </div>

        <!-- 章节目录 -->
        <div class="nw-panel">
          <div class="nw-panel__head">
            <h2 class="nw-panel__title">章节目录 <span class="desktop-section-count">{{ chapters.length }}</span></h2>
            <button class="desktop-btn" :disabled="generating" @click="manageChapters">章节管理</button>
            <button class="desktop-btn" :disabled="backfillLoading" @click="backfillTitles">
              <Icon name="sparkles" :size="14" /> {{ backfillLoading ? '补全中…' : '补全标题' }}
            </button>
            <button class="desktop-btn" :disabled="generating || agents.batchRunning" @click="batchDialogVisible = true">
              <Icon name="layers" :size="14" /> 批量生成
            </button>
            <button class="desktop-btn desktop-btn--primary" :disabled="generating || agents.batchRunning" @click="openGenerate">
              <Icon name="plus" :size="14" /> {{ generating ? '生成中…' : `生成第 ${nextChapterNumber} 章` }}
            </button>
          </div>

          <div v-if="agents.batchRunning && agents.batchNovelId === novelId" class="batch-panel">
            <span class="gen-panel-spin" />
            <div class="batch-info">
              <div class="gen-panel-title">批量生成 · {{ agents.batchCurrentIndex + 1 }} / {{ agents.batchTotalItems }} 章</div>
              <div class="batch-bar"><div class="batch-bar-fill" :style="{ width: (agents.batchProgress || 0) + '%' }" /></div>
            </div>
            <button class="desktop-btn reader-danger" @click="cancelBatchRun">取消</button>
          </div>

          <div v-if="generating || isGeneratingHere" class="gen-panel">
            <div class="gen-panel-head">
              <span class="gen-panel-spin" />
              <div>
                <div class="gen-panel-title">正在生成第 {{ generatingChapterNumber ?? genChapterNum }} 章 · {{ activeAgentLabel }}</div>
                <div class="gen-panel-sub">{{ progressDescription }}</div>
              </div>
            </div>
            <div class="gen-flow">
              <template v-for="(role, i) in PIPELINE_AGENTS" :key="role">
                <div class="gen-agent-card" :class="agentStatus(role)">
                  <div class="gen-agent-avatar"><Icon :name="ROLE_ICON[role]" :size="20" /></div>
                  <div class="gen-agent-name">{{ AGENT_NAMES[role] }}</div>
                  <div class="gen-agent-badge">
                    <template v-if="agentStatus(role) === 'active'"><span class="gen-live-dot" />运行中</template>
                    <template v-else-if="agentStatus(role) === 'done'">✓ 完成</template>
                    <template v-else>待命</template>
                  </div>
                </div>
                <div
                  v-if="i < PIPELINE_AGENTS.length - 1"
                  class="gen-connector"
                  :class="{ flowing: agentStatus(PIPELINE_AGENTS[i + 1]) !== 'pending' }"
                >
                  <span class="gen-chevron c1" />
                  <span class="gen-chevron c2" />
                  <span class="gen-chevron c3" />
                </div>
              </template>
            </div>
            <div v-if="assistantLines.length" class="gen-stream">
              <div v-for="(line, i) in assistantLines.slice(-5)" :key="i" class="gen-stream-line">{{ line }}</div>
            </div>
          </div>

          <div class="reader-chapter-list">
            <div v-for="ch in chapters" :key="ch.chapterNumber" class="reader-chapter-item">
              <div class="reader-chapter-num" @click="readChapter(ch.chapterNumber)">{{ ch.chapterNumber }}</div>
              <div class="reader-chapter-info" @click="readChapter(ch.chapterNumber)">
                <div class="reader-chapter-title">{{ ch.title || `第${ch.chapterNumber}章` }}</div>
                <div class="reader-chapter-meta">
                  <span class="nw-tag" :class="{ 'nw-tag--muted': ch.status === 'outlined' }">{{ chapterLabel(ch.status) }}</span>
                  <span><Icon name="pen" :size="11" /> {{ fmt(ch.wordCount || 0) }} 字</span>
                </div>
              </div>
              <div class="chapter-actions">
                <button class="chapter-action" title="阅读" @click.stop="readChapter(ch.chapterNumber)">
                  <Icon name="bookOpen" :size="14" />
                </button>
                <button
                  class="chapter-action"
                  :title="finalizeLoading === ch.chapterNumber ? '定稿中…' : (ch.status === 'finalized' ? '已定稿' : '定稿')"
                  :disabled="finalizeLoading === ch.chapterNumber || ch.status === 'outlined' || ch.status === 'finalized'"
                  @click.stop="quickFinalize(ch.chapterNumber)"
                >
                  <Icon name="checkCircle" :size="14" />
                </button>
                <button
                  class="chapter-action"
                  :title="titleGenLoading === ch.chapterNumber ? '生成中…' : 'AI 生成标题'"
                  :disabled="titleGenLoading === ch.chapterNumber"
                  @click.stop="quickGenTitle(ch.chapterNumber)"
                >
                  <Icon name="sparkles" :size="14" />
                </button>
                <button class="chapter-action chapter-action--danger" title="删除" @click.stop="quickDeleteChapter(ch.chapterNumber)">
                  <Icon name="close" :size="14" />
                </button>
              </div>
            </div>
            <div v-if="!chapters.length" class="detail-empty-row">暂无章节，去生成第一章</div>
          </div>
        </div>

        <!-- Tab 切换区 -->
        <div class="workspace-tabs">
          <button class="workspace-tab" :class="{ 'is-active': activeModule === 'characters' }" @click="activeModule = 'characters'">
            <Icon name="user" :size="14" /> 角色
          </button>
          <button class="workspace-tab" :class="{ 'is-active': activeModule === 'world' }" @click="activeModule = 'world'">
            <Icon name="globe" :size="14" /> 世界
          </button>
          <button class="workspace-tab" :class="{ 'is-active': activeModule === 'outline' }" @click="activeModule = 'outline'">
            <Icon name="bookOpen" :size="14" /> 大纲
          </button>
          <button class="workspace-tab" :class="{ 'is-active': activeModule === 'comic' }" @click="activeModule = 'comic'">
            <Icon name="layers" :size="14" /> 漫画
          </button>
          <button class="workspace-tab" :class="{ 'is-active': activeModule === 'audio' }" @click="activeModule = 'audio'">
            <Icon name="headset" :size="14" /> 广播剧
          </button>
          <button class="workspace-tab" :class="{ 'is-active': activeModule === 'side-stories' }" @click="activeModule = 'side-stories'">
            <Icon name="bookmark" :size="14" /> 番外
          </button>
          <button class="workspace-tab" :class="{ 'is-active': activeModule === 'growth' }" @click="activeModule = 'growth'">
            <Icon name="trendingUp" :size="14" /> 角色成长
          </button>
          <button class="workspace-tab" :class="{ 'is-active': activeModule === 'publish' }" @click="activeModule = 'publish'">
            <Icon name="store" :size="14" /> 发布
          </button>
          <button class="workspace-tab" :class="{ 'is-active': activeModule === 'forks' }" @click="activeModule = 'forks'">
            <Icon name="gitBranch" :size="14" /> 分支创作
          </button>
          <button class="workspace-tab" :class="{ 'is-active': activeModule === 'interactive' }" @click="activeModule = 'interactive'">
            <Icon name="sparkles" :size="14" /> 互动
          </button>
        </div>

        <DesktopCharacters v-if="activeModule === 'characters'" :novel-id="novelId" />
        <DesktopWorld v-else-if="activeModule === 'world'" :novel-id="novelId" />
        <DesktopOutline v-else-if="activeModule === 'outline'" :novel-id="novelId" />
        <DesktopComic v-else-if="activeModule === 'comic'" :novel-id="novelId" />
        <DesktopAudioDrama v-else-if="activeModule === 'audio'" :novel-id="novelId" />
        <DesktopSideStories v-else-if="activeModule === 'side-stories'" :novel-id="novelId" />
        <DesktopCharacterGrowth v-else-if="activeModule === 'growth'" :novel-id="novelId" />
        <DesktopPublish v-else-if="activeModule === 'publish'" :novel-id="novelId" @request-refresh="run" />
        <DesktopForks v-else-if="activeModule === 'forks'" :novel-id="novelId" />
        <DesktopInteractive v-else-if="activeModule === 'interactive'" :novel-id="novelId" />
      </template>
    </StateView>

    <!-- 编辑信息弹窗 -->
    <Modal v-model="editVisible" title="编辑作品信息" width="540px">
      <div class="nw-field">
        <label class="nw-field-label">标题</label>
        <input v-model="editForm.title" class="nw-input" maxlength="60" />
      </div>
      <div class="nw-field">
        <label class="nw-field-label">状态</label>
        <div class="create-genres">
          <button
            v-for="[value, label] in statusOptions"
            :key="value"
            type="button"
            class="desktop-chip"
            :class="{ 'is-active': editForm.status === value }"
            @click="editForm.status = value"
          >{{ label }}</button>
        </div>
      </div>
      <div class="nw-field">
        <label class="nw-field-label">故事概况</label>
        <textarea v-model="editForm.synopsis" class="nw-textarea" maxlength="800" />
      </div>
      <template #footer>
        <button class="desktop-btn" :disabled="saving" @click="editVisible = false">取消</button>
        <button class="desktop-btn desktop-btn--primary" :disabled="saving" @click="saveEdit">
          {{ saving ? '保存中…' : '保存' }}
        </button>
      </template>
    </Modal>

    <DesktopChapterReader
      v-model="readerVisible"
      :novel-id="novelId"
      :chapter-number="readerNum"
      :chapter-count="chapterTotal"
      @request-refresh="run"
    />

    <DesktopGenerateDialog
      v-model="genDialogVisible"
      :chapter-number="genChapterNum"
      @generate="handleGenerate"
    />

    <DesktopBatchDialog
      v-model="batchDialogVisible"
      :novel-id="novelId"
      :start-chapter="nextChapterNumber"
      @started="run"
    />

    <DesktopCoverDialog
      v-model="coverDialogVisible"
      :novel-id="novelId"
      :novel-title="novel?.title ?? ''"
      @updated="run"
    />
  </div>
</template>
