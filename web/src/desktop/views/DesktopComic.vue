<script setup lang="ts">
/**
 * 桌面端·章节漫画
 * 复用 useComicChapter（与 MobileComicStrip 同一逻辑）。
 * 流程：设计场景 → 勾选 → 生成漫画 → 漫画条（panel strip）→ 重绘/删除/发布。
 */
import { computed, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useComicChapter } from '../../composables/useComicChapter';
import { useComicFeature } from '../../composables/useComicFeature';
import { comicPanelUrl, type ComicPanel } from '../../api/comic';
import { fetchChapters } from '../../api/chapters';
import { extractApiErrorMessage } from '../../api/errors';
import Icon from '../../components/shared/Icon.vue';
import StateView from '../../components/shared/StateView.vue';

const props = defineProps<{ novelId: string }>();
const emit = defineEmits<{ 'request-refresh': [] }>();

/** 章节选择器 */
const selectedChapter = ref(1);
const chapters = ref<Array<{ chapterNumber: number; title: string }>>([]);
const { comicEnabled } = useComicFeature();

const {
  manifest, panelBlobs, sceneList,
  loading, generating, designing, publishing,
  regeneratingPanelIndexes, error: comicError,
  comicStyle, setComicStyle,
  load, generate, design, generateSelected,
  regeneratePanel, removePanel, removeScene, reorderPanels, publish,
} = useComicChapter(
  () => props.novelId,
  () => selectedChapter.value,
);

watch(() => [props.novelId, selectedChapter.value], () => { void load(); }, { immediate: true });

/** 加载章节列表 */
async function loadChapters(): Promise<void> {
  try {
    const list = await fetchChapters(props.novelId);
    chapters.value = list.map(ch => ({ chapterNumber: ch.chapterNumber, title: ch.title }));
    if (list.length) selectedChapter.value = list[list.length - 1].chapterNumber;
  } catch { /* ignore */ }
}
loadChapters();

const STYLE_PRESETS = [
  { value: '', label: '自动' },
  { value: 'manga', label: '日漫' },
  { value: 'webtoon', label: '韩漫' },
  { value: 'manhua', label: '国漫' },
  { value: 'comic', label: '美漫' },
  { value: 'chibi', label: 'Q版' },
  { value: 'watercolor', label: '水彩' },
  { value: 'pixel', label: '像素' },
];

/** 选中的场景 */
const selectedSceneIds = ref<Set<string>>(new Set());
const showScenes = computed(() => sceneList.value && sceneList.value.scenes.length > 0);

function toggleScene(sceneId: string): void {
  const next = new Set(selectedSceneIds.value);
  if (next.has(sceneId)) next.delete(sceneId);
  else next.add(sceneId);
  selectedSceneIds.value = next;
}

async function doDesign(): Promise<void> {
  try {
    await design('replace');
    ElMessage.success(`已设计 ${sceneList.value?.scenes.length ?? 0} 个场景`);
  } catch (err) { ElMessage.error(extractApiErrorMessage(err, '场景设计失败')); }
}

async function doGenerateSelected(): Promise<void> {
  const ids = [...selectedSceneIds.value];
  if (!ids.length) { ElMessage.warning('请先勾选要生成的场景'); return; }
  try {
    const result = await generateSelected(ids, comicStyle.value || undefined);
    ElMessage.success(`已提交 ${result.total} 格漫画生成`);
    selectedSceneIds.value = new Set();
    emit('request-refresh');
  } catch (err) { ElMessage.error(extractApiErrorMessage(err, '生成失败')); }
}

async function doGenerateAll(): Promise<void> {
  try {
    await ElMessageBox.confirm('直接生成全章漫画（跳过场景设计）？', '一键生成', { type: 'info', confirmButtonText: '生成' });
  } catch { return; }
  try {
    await generate(comicStyle.value || undefined);
    ElMessage.success('漫画生成已提交');
    emit('request-refresh');
  } catch (err) { ElMessage.error(extractApiErrorMessage(err, '生成失败')); }
}

async function doRegenerate(panel: ComicPanel): Promise<void> {
  try {
    await regeneratePanel(panel.panelIndex, comicStyle.value || undefined);
    ElMessage.success(`第 ${panel.panelIndex + 1} 格已重绘`);
  } catch (err) { ElMessage.error(extractApiErrorMessage(err, '重绘失败')); }
}

async function doRemove(panel: ComicPanel): Promise<void> {
  try {
    await ElMessageBox.confirm(`删除第 ${panel.panelIndex + 1} 格？`, '删除', { type: 'warning', confirmButtonText: '删除' });
  } catch { return; }
  try {
    await removePanel(panel.panelIndex);
    ElMessage.success('已删除');
  } catch (err) { ElMessage.error(extractApiErrorMessage(err, '删除失败')); }
}

async function doPublish(): Promise<void> {
  try {
    await ElMessageBox.confirm('发布漫画？发布后书城读者可查看。', '发布', { type: 'info', confirmButtonText: '发布' });
  } catch { return; }
  try {
    await publish();
    ElMessage.success('漫画已发布');
    emit('request-refresh');
  } catch (err) { ElMessage.error(extractApiErrorMessage(err, '发布失败')); }
}

function panelUrl(panel: ComicPanel): string {
  const blob = panelBlobs.value[panel.panelIndex];
  if (blob) return blob;
  if (!panel.imagePath) return '';
  return comicPanelUrl(props.novelId, selectedChapter.value, panel.imagePath);
}

const panels = computed(() => manifest.value?.panels ?? []);
</script>

<template>
  <div class="desktop-comic">
    <!-- 工具栏 -->
    <div class="nw-panel__head" style="padding:0 0 var(--nw-space-4)">
      <h2 class="nw-panel__title"><Icon name="layers" :size="16" /> 章节漫画</h2>
      <div class="comic-actions">
        <select v-if="chapters.length" v-model.number="selectedChapter" class="nw-input comic-chapter-select">
          <option v-for="ch in chapters" :key="ch.chapterNumber" :value="ch.chapterNumber">第 {{ ch.chapterNumber }} 章{{ ch.title ? ' · ' + ch.title.slice(0, 12) : '' }}</option>
        </select>
        <select v-model="comicStyle" class="nw-input comic-style-select" @change="setComicStyle(($event.target as HTMLSelectElement).value)">
          <option v-for="s in STYLE_PRESETS" :key="s.value" :value="s.value">{{ s.label }}</option>
        </select>
        <button class="desktop-btn" :disabled="designing" @click="doDesign">
          <Icon name="bookOpen" :size="14" /> {{ designing ? '设计中…' : '设计场景' }}
        </button>
        <button v-if="showScenes" class="desktop-btn desktop-btn--primary" :disabled="generating || selectedSceneIds.size === 0" @click="doGenerateSelected">
          <Icon name="sparkles" :size="14" /> {{ generating ? '生成中…' : `生成(${selectedSceneIds.size})` }}
        </button>
        <button class="desktop-btn" :disabled="generating" @click="doGenerateAll">
          <Icon name="sparkles" :size="14" /> {{ generating ? '生成中…' : '一键生成' }}
        </button>
        <button v-if="panels.length && manifest?.status === 'draft'" class="desktop-btn" :disabled="publishing" @click="doPublish">
          <Icon name="checkCircle" :size="14" /> {{ publishing ? '发布中…' : '发布' }}
        </button>
      </div>
    </div>

    <!-- 场景设计区 -->
    <div v-if="showScenes" class="nw-panel" style="margin-bottom:var(--nw-space-4)">
      <div class="nw-panel__head">
        <h3 class="nw-panel__title">场景设计（{{ sceneList?.scenes.length }} 场）</h3>
        <span class="nw-tag" :class="{ 'priority-low': manifest?.status === 'published' }">{{ manifest?.status === 'published' ? '已发布' : '草稿' }}</span>
      </div>
      <div class="comic-scene-grid">
        <div
          v-for="scene in sceneList?.scenes ?? []"
          :key="scene.sceneId"
          class="comic-scene-card"
          :class="{ 'is-selected': selectedSceneIds.has(scene.sceneId) }"
          @click="toggleScene(scene.sceneId)"
        >
          <div class="comic-scene-head">
            <span class="comic-scene-shot">{{ scene.shotType }}</span>
            <span class="comic-scene-emotion">{{ scene.emotion }}</span>
          </div>
          <div class="comic-scene-title">{{ scene.title }}</div>
          <p v-if="scene.visualDescription" class="comic-scene-desc">{{ scene.visualDescription }}</p>
          <div v-if="scene.dialogue" class="comic-scene-dialogue">「{{ scene.dialogue }}」</div>
          <div v-if="scene.characters?.length" class="comic-scene-chars">
            <span v-for="c in scene.characters.slice(0,3)" :key="c.name" class="nw-tag nw-tag--muted">{{ c.name }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 漫画条 -->
    <StateView :loading="loading" :error="comicError ? new Error(comicError) : null" :error-message="comicError" :empty="!loading && panels.length === 0" @retry="load">
      <template #empty>
        <div class="comic-empty">
          <Icon name="layers" :size="48" />
          <p class="nw-state__title">暂无漫画</p>
          <p class="nw-state__desc">先「设计场景」再勾选生成，或直接「一键生成」全章漫画。</p>
        </div>
      </template>

      <div class="comic-strip">
        <div v-for="panel in panels" :key="panel.panelIndex" class="comic-panel">
          <div class="comic-panel-img-wrap" :class="{ 'is-failed': !panel.imagePath, 'is-regenerating': regeneratingPanelIndexes.has(panel.panelIndex) }">
            <img v-if="panelUrl(panel) && !regeneratingPanelIndexes.has(panel.panelIndex)" :src="panelUrl(panel)" class="comic-panel-img" loading="lazy" />
            <div v-else-if="regeneratingPanelIndexes.has(panel.panelIndex)" class="comic-panel-loading">
              <span class="gen-panel-spin" /> <span>重绘中…</span>
            </div>
            <div v-else class="comic-panel-failed"><Icon name="close" :size="24" /><span>生成失败</span></div>
            <span class="comic-panel-index">{{ panel.panelIndex + 1 }}</span>
          </div>
          <div v-if="panel.narration || panel.dialogue" class="comic-panel-text">
            <p v-if="panel.narration" class="comic-panel-narration">{{ panel.narration }}</p>
            <p v-if="panel.dialogue" class="comic-panel-dialogue">「{{ panel.dialogue }}」</p>
          </div>
          <div class="comic-panel-actions">
            <button class="chapter-action" title="重绘" :disabled="regeneratingPanelIndexes.has(panel.panelIndex)" @click="doRegenerate(panel)">
              <Icon name="refresh" :size="14" />
            </button>
            <button class="chapter-action chapter-action--danger" title="删除" @click="doRemove(panel)">
              <Icon name="close" :size="14" />
            </button>
          </div>
        </div>
      </div>
    </StateView>
  </div>
</template>
