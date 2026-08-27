<script setup lang="ts">
/**
 * 桌面端·趣味中心（CP化学反应 + 金句广场）
 * CP：复用 computeChemistry + computeCharacterRadar（纯规则，无 API）
 * 金句：复用 fetchCharacterGrowth（quotes）
 */
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { extractApiErrorMessage } from '../../utils/api-error';
import { fetchNovels, type NovelMetadata } from '../../api/novels';
import { fetchCharacters } from '../../api/characters';
import { fetchCharacterGrowth, type CharacterQuote } from '../../api/character-growth';
import { computeChemistry, toDualRadarSeries, type ChemistryResult } from '../../composables/useRelationshipScore';
import { computeCharacterRadar, getRadarLabel, type RadarDimension } from '../../composables/useCharacterRadar';
import { getPanguCreationErrorMessage, usePanguNovelCreation } from '../../composables/usePanguNovelCreation';
import { getCangjieCreationErrorMessage, useCangjieNovelCreation } from '../../composables/useCangjieNovelCreation';
import { useCangjieSession } from '../../composables/useCangjieSession';
import { useDesktopCreate } from '../../composables/useDesktopCreate';
import { organizeCangjieStory, sendCangjieChat, CANGJIE_CHECKLIST_GROUP_LABELS, CANGJIE_CHECKLIST_GROUP_ORDER, type CangjieChecklistGroup } from '../../api/cangjie';
import type { CharacterProfile } from '../../types';
import type { EChartsOption } from 'echarts';
import Icon from '../../components/shared/Icon.vue';
import NwChart from '../../components/shared/NwChart.vue';

const router = useRouter();
const activeTab = ref<'cp' | 'quotes' | 'radar' | 'pangu' | 'cangjie' | 'fate'>('cp');
const { openDna } = useDesktopCreate();

// ===== 共享数据 =====
const novels = ref<NovelMetadata[]>([]);
const characters = ref<CharacterProfile[]>([]);
const dataLoading = ref(false);

async function loadData(): Promise<void> {
  dataLoading.value = true;
  try {
    novels.value = await fetchNovels();
    if (novels.value.length) await selectNovel(novels.value[0].id);
  } catch { /* 未登录 */ }
  finally { dataLoading.value = false; }
}
loadData();

const selectedNovelId = ref('');
async function selectNovel(id: string): Promise<void> {
  selectedNovelId.value = id;
  characters.value = [];
  cpResult.value = null;
  quotes.value = [];
  try {
    characters.value = await fetchCharacters(id);
    if (characters.value.length >= 2) {
      charA.value = characters.value[0].id;
      charB.value = characters.value[1].id;
      void runCp();
    }
    void loadQuotes();
  } catch { /* ignore */ }
}

// ===== CP 化学反应 =====
const charA = ref('');
const charB = ref('');
const cpResult = ref<ChemistryResult | null>(null);

const charAProfile = computed(() => characters.value.find(c => c.id === charA.value) ?? null);
const charBProfile = computed(() => characters.value.find(c => c.id === charB.value) ?? null);

function runCp(): void {
  if (!charAProfile.value || !charBProfile.value || charA.value === charB.value) return;
  cpResult.value = computeChemistry(charAProfile.value, charBProfile.value);
}

const dualRadarOption = computed<EChartsOption | null>(() => {
  if (!cpResult.value || !charAProfile.value || !charBProfile.value) return null;
  const series = toDualRadarSeries(cpResult.value.dimsA, cpResult.value.dimsB, charAProfile.value.name, charBProfile.value.name);
  return {
    radar: {
      indicator: cpResult.value.dimsA.map(d => ({ name: d.label, max: 100 })),
      radius: '60%',
      axisName: { color: '#64748b', fontSize: 11 },
      splitLine: { lineStyle: { color: 'rgba(148,163,184,0.2)' } },
    },
    series: [series as never],
  };
});

// ===== 金句广场 =====
const quotes = ref<Array<CharacterQuote & { characterName?: string }>>([]);
const quoteLoading = ref(false);

async function loadQuotes(): Promise<void> {
  if (!selectedNovelId.value) return;
  quoteLoading.value = true;
  quotes.value = [];
  try {
    for (const ch of characters.value.slice(0, 8)) {
      const growth = await fetchCharacterGrowth(selectedNovelId.value, ch.id);
      const tagged = (growth.quotes ?? []).map(q => ({ ...q, characterName: ch.name }));
      quotes.value.push(...tagged);
    }
    quotes.value.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  } catch { /* ignore */ }
  finally { quoteLoading.value = false; }
}

function scoreColor(score: number): string {
  if (score >= 90) return 'var(--nw-danger)';
  if (score >= 80) return 'var(--nw-warning)';
  if (score >= 70) return 'var(--nw-accent-start)';
  return 'var(--nw-text-muted)';
}

// ===== 角色雷达图 =====
const radarCharId = ref('');
const radarDims = ref<RadarDimension[]>([]);
const radarLabels = ref<string[]>([]);

const radarCharProfile = computed(() =>
  characters.value.find((c) => c.id === radarCharId.value) || null
);

const radarOption = computed<EChartsOption | null>(() => {
  if (radarDims.value.length === 0) return null;
  return {
    radar: {
      indicator: radarDims.value.map((d) => ({ name: d.label, max: 100 })),
      radius: '65%',
      axisName: { color: 'var(--nw-text-secondary)', fontSize: 12 },
      splitLine: { lineStyle: { color: 'color-mix(in srgb, var(--nw-border) 60%, transparent)' } },
      splitArea: { areaStyle: { color: ['transparent'] } },
    },
    series: [
      {
        type: 'radar',
        data: [
          {
            value: radarDims.value.map((d) => d.value),
            name: radarCharProfile.value?.name || '',
            areaStyle: {
              color: {
                type: 'radial',
                x: 0.5,
                y: 0.5,
                r: 0.5,
                colorStops: [
                  { offset: 0, color: 'color-mix(in srgb, var(--nw-accent-start) 40%, transparent)' },
                  { offset: 1, color: 'color-mix(in srgb, var(--nw-accent-end) 20%, transparent)' },
                ],
              },
            },
            lineStyle: { color: 'var(--nw-accent-strong)', width: 2 },
            itemStyle: { color: 'var(--nw-accent-strong)' },
          },
        ],
      },
    ],
  };
});

watch(
  () => characters.value,
  (chars) => {
    if (chars.length > 0 && !radarCharId.value) {
      radarCharId.value = chars[0].id;
    }
  },
  { immediate: true }
);

watch(
  [radarCharId, () => characters.value],
  () => {
    if (radarCharProfile.value) {
      radarDims.value = computeCharacterRadar(radarCharProfile.value);
      radarLabels.value = getRadarLabel(radarDims.value);
    }
  },
  { immediate: true }
);

// ===== 盘古开天 =====
const pangu = usePanguNovelCreation();
const panguSeedIdea = ref('');

const panguSeedLength = computed(() => panguSeedIdea.value.trim().length);
const canCreatePangu = computed(() => panguSeedLength.value > 0 && !pangu.creatingNovel.value);

async function generatePangu() {
  const seed = panguSeedIdea.value.trim();
  if (!seed) {
    ElMessage.warning('先写下一个开篇灵感');
    return;
  }
  try {
    const novelId = await pangu.createNovel(seed);
    ElMessage.success('盘古开天已启动，首章正在生成');
    void router.push({ path: `/desktop/novel/${novelId}`, query: { compose: '1' } });
  } catch (err) {
    ElMessage.error(getPanguCreationErrorMessage(err));
  }
}

// ===== 仓颉造字 =====
const cangjieSession = useCangjieSession();
const cangjieCreation = useCangjieNovelCreation();
const cangjieDraft = ref('');
const cangjieSending = ref(false);
const cangjieOrganizing = ref(false);
const cangjieView = ref<'chat' | 'review'>('chat');

const PROMPT_CHIPS = [
  '我有一个主角，但还没想好冲突',
  '想写反套路重生，开局要更狠',
  '世界里有一条不能触碰的规则',
  '先帮我追问，把故事核拎出来',
];

const cangjieCanSend = computed(() => Boolean(cangjieDraft.value.trim()) && !cangjieSending.value);
const cangjieCanOrganize = computed(() => cangjieSession.hasUserMessages.value && !cangjieOrganizing.value && !cangjieSending.value);

async function cangjieSendMessage() {
  const content = cangjieDraft.value.trim();
  if (!content) return;
  cangjieDraft.value = '';
  cangjieSession.appendMessage('user', content);
  cangjieSending.value = true;
  try {
    const reply = await sendCangjieChat(cangjieSession.messages.value);
    cangjieSession.appendMessage(reply.role, reply.content);
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '发送失败，请稍后重试'));
  } finally {
    cangjieSending.value = false;
  }
}

async function cangjieOrganizeStory() {
  if (!cangjieSession.hasUserMessages.value) {
    ElMessage.warning('先聊出一个故事方向');
    return;
  }
  cangjieOrganizing.value = true;
  try {
    const checklist = await organizeCangjieStory(cangjieSession.messages.value);
    cangjieSession.setChecklist(checklist);
    cangjieView.value = 'review';
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '整理失败，请稍后重试'));
  } finally {
    cangjieOrganizing.value = false;
  }
}

function cangjieUsePrompt(prompt: string) {
  cangjieDraft.value = cangjieDraft.value.trim() ? `${cangjieDraft.value.trim()}\n${prompt}` : prompt;
}

async function cangjieResetSession() {
  try {
    await ElMessageBox.confirm('当前聊天和整理结果会清空。', '重新开始仓颉造字', {
      confirmButtonText: '重新开始',
      cancelButtonText: '保留',
      type: 'warning',
    });
  } catch {
    return;
  }
  cangjieSession.resetSession();
  cangjieView.value = 'chat';
}

// 仓颉复盘相关
const cangjieGroupedChecklist = computed(() => CANGJIE_CHECKLIST_GROUP_ORDER
  .map(group => ({
    group,
    label: CANGJIE_CHECKLIST_GROUP_LABELS[group],
    items: cangjieSession.organizedChecklist.value.filter(item => item.group === group),
  }))
  .filter(group => group.items.length));

const cangjieReadySelected = computed(() => cangjieSession.selectedChecklist.value
  .map(item => ({
    ...item,
    title: item.title.trim(),
    content: item.content.trim(),
  }))
  .filter(item => item.title && item.content));

const cangjieAllSelected = computed(() => cangjieSession.organizedChecklist.value.length > 0
  && cangjieSession.organizedChecklist.value.every(item => item.selected));
const cangjieSelectedSummary = computed(() => `${cangjieReadySelected.value.length} / ${cangjieSession.organizedChecklist.value.length}`);
const cangjieCanCreate = computed(() => cangjieReadySelected.value.length > 0 && !cangjieCreation.creatingNovel.value);

function cangjieToggleAll() {
  cangjieSession.selectAllChecklist(!cangjieAllSelected.value);
}

async function cangjieCreateNovel() {
  if (!cangjieReadySelected.value.length) {
    ElMessage.warning('保留至少一个完整故事核心');
    return;
  }
  try {
    const { novelId } = await cangjieCreation.createNovel({
      messages: cangjieSession.messages.value,
      checklist: cangjieReadySelected.value,
    });
    ElMessage.success('仓颉已把故事核心铸成新书，首章正在生成');
    cangjieSession.resetSession();
    void router.push({ path: `/desktop/novel/${novelId}`, query: { compose: '1' } });
  } catch (err) {
    ElMessage.error(getCangjieCreationErrorMessage(err));
  }
}

function cangjieGroupLabel(group: CangjieChecklistGroup): string {
  return CANGJIE_CHECKLIST_GROUP_LABELS[group];
}

// ===== 命运抉择 =====
type FateDoor = {
  key: string;
  title: string;
  subtitle: string;
  desc: string;
  tab?: 'pangu' | 'cangjie' | 'cp' | 'radar' | 'quotes';
  action?: 'dna';
  route?: string;
  icon: string;
  status: 'ready' | 'soon';
  color: string;
};

const FATE_DOORS: FateDoor[] = [
  {
    key: 'pangu',
    title: '盘古开天',
    subtitle: '一灵感，开出全篇首章',
    desc: '把你想写的内容交给脑洞大师，直接启动新书与首章',
    tab: 'pangu',
    icon: 'zap',
    status: 'ready',
    color: '#f59e0b',
  },
  {
    key: 'dna',
    title: '女娲造人',
    subtitle: '测爽点，铸就主角人格',
    desc: '测出你的爽点 DNA，让 AI 捏出主角人格与开局命运',
    action: 'dna',
    icon: 'users',
    status: 'ready',
    color: '#ec4899',
  },
  {
    key: 'cangjie',
    title: '仓颉造字',
    subtitle: '聊剧情，敲定故事核心',
    desc: '对话梳理世界观、冲突与关系，沉淀可执行的故事核心',
    tab: 'cangjie',
    icon: 'messageCircle',
    status: 'ready',
    color: '#8b5cf6',
  },
  {
    key: 'chemistry',
    title: 'CP 化学反应',
    subtitle: '看羁绊，迸发角色火花',
    desc: '分析角色间的化学反应强度，发现意想不到的 CP 组合',
    tab: 'cp',
    icon: 'heart',
    status: 'ready',
    color: '#ef4444',
  },
  {
    key: 'radar',
    title: '角色雷达',
    subtitle: '看维度，立体人物画像',
    desc: '六维雷达图全方位展示角色特质，让人物更鲜活立体',
    tab: 'radar',
    icon: 'radar',
    status: 'ready',
    color: '#06b6d4',
  },
  {
    key: 'quotes',
    title: '金句广场',
    subtitle: '品高光，收录角色名场面',
    desc: '收集角色的高光台词，按热度排序，名场面一目了然',
    tab: 'quotes',
    icon: 'quote',
    status: 'ready',
    color: '#10b981',
  },
];

function handleFateDoor(door: FateDoor) {
  if (door.status === 'soon') {
    ElMessage.info('功能即将开启，敬请期待');
    return;
  }
  if (door.tab) {
    activeTab.value = door.tab;
  } else if (door.action === 'dna') {
    openDna();
  } else if (door.route) {
    void router.push(door.route);
  }
}
</script>

<template>
  <div class="desktop-funhub">
    <!-- 作品选择 + Tab -->
    <div class="funhub-toolbar nw-panel">
      <select v-if="novels.length" v-model="selectedNovelId" class="nw-input funhub-novel-select" @change="selectNovel(selectedNovelId)">
        <option v-for="n in novels" :key="n.id" :value="n.id">{{ n.title }}</option>
      </select>
      <div class="outline-tabs">
        <button class="outline-tab" :class="{ 'is-active': activeTab === 'cp' }" @click="activeTab = 'cp'">
          <Icon name="sparkles" :size="14" /> CP 化学反应
        </button>
        <button class="outline-tab" :class="{ 'is-active': activeTab === 'radar' }" @click="activeTab = 'radar'">
          <Icon name="radar" :size="14" /> 角色雷达
        </button>
        <button class="outline-tab" :class="{ 'is-active': activeTab === 'quotes' }" @click="activeTab = 'quotes'">
          <Icon name="bookOpen" :size="14" /> 金句广场
        </button>
        <button class="outline-tab" :class="{ 'is-active': activeTab === 'pangu' }" @click="activeTab = 'pangu'">
          <Icon name="zap" :size="14" /> 盘古开天
        </button>
        <button class="outline-tab" :class="{ 'is-active': activeTab === 'cangjie' }" @click="activeTab = 'cangjie'">
          <Icon name="messageCircle" :size="14" /> 仓颉造字
        </button>
        <button class="outline-tab" :class="{ 'is-active': activeTab === 'fate' }" @click="activeTab = 'fate'">
          <Icon name="shuffle" :size="14" /> 命运抉择
        </button>
      </div>
    </div>

    <div v-if="!novels.length && !dataLoading" class="nw-state nw-state--empty">
      <p class="nw-state__title">还没有作品</p>
      <p class="nw-state__desc">创建作品并生成章节后，角色互动数据会自动出现。</p>
    </div>

    <!-- CP 化学反应 -->
    <template v-if="activeTab === 'cp' && novels.length">
      <div class="nw-panel">
        <div class="nw-panel__head">
          <h2 class="nw-panel__title">选择角色</h2>
        </div>
        <div class="cover-form-grid" style="padding: var(--nw-space-5)">
          <div class="nw-field">
            <label class="nw-field-label">角色 A</label>
            <select v-model="charA" class="nw-input" @change="runCp">
              <option value="">— 选择 —</option>
              <option v-for="c in characters" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
          </div>
          <div class="nw-field">
            <label class="nw-field-label">角色 B</label>
            <select v-model="charB" class="nw-input" @change="runCp">
              <option value="">— 选择 —</option>
              <option v-for="c in characters" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
          </div>
        </div>
      </div>

      <div v-if="cpResult" class="nw-panel cp-result">
        <div class="cp-hero">
          <div class="cp-pair">
            <span class="cp-avatar">{{ charAProfile?.name?.slice(0, 1) }}</span>
            <span class="cp-name">{{ charAProfile?.name }}</span>
          </div>
          <div class="cp-score-block">
            <span class="cp-score" :style="{ color: scoreColor(cpResult.score) }">{{ cpResult.score }}</span>
            <span class="cp-label">{{ cpResult.label }}</span>
          </div>
          <div class="cp-pair">
            <span class="cp-avatar">{{ charBProfile?.name?.slice(0, 1) }}</span>
            <span class="cp-name">{{ charBProfile?.name }}</span>
          </div>
        </div>
        <p class="cp-desc">{{ cpResult.description }}</p>
        <NwChart v-if="dualRadarOption" :option="dualRadarOption" height="280px" />
      </div>
    </template>

    <!-- 金句广场 -->
    <template v-if="activeTab === 'quotes' && novels.length">
      <div v-if="quoteLoading" class="nw-state nw-state--loading">
        <span class="nw-state__spinner" />
        <span>收集金句中…</span>
      </div>
      <div v-else-if="quotes.length" class="quote-grid">
        <div v-for="(q, i) in quotes" :key="i" class="quote-card">
          <div class="quote-card-mark">"</div>
          <p class="quote-card-text">{{ q.text }}</p>
          <div class="quote-card-meta">
            <span class="nw-tag">{{ q.characterName }}</span>
            <span class="quote-card-chapter">第 {{ q.chapter }} 章</span>
            <span v-if="q.score" class="quote-card-score" :style="{ color: scoreColor(q.score) }">{{ q.score }}分</span>
          </div>
        </div>
      </div>
      <div v-else class="nw-state nw-state--empty">
        <p class="nw-state__title">暂无金句</p>
        <p class="nw-state__desc">生成章节后，角色的高光台词会自动收录。</p>
      </div>
    </template>

    <!-- 角色雷达 -->
    <template v-if="activeTab === 'radar' && novels.length">
      <div class="nw-panel">
        <div class="nw-panel__head">
          <h2 class="nw-panel__title">选择角色</h2>
        </div>
        <div class="cover-form-grid" style="padding: var(--nw-space-5)">
          <div class="nw-field">
            <label class="nw-field-label">角色</label>
            <select v-model="radarCharId" class="nw-input">
              <option v-for="c in characters" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
          </div>
        </div>
      </div>

      <div v-if="radarDims.length" class="nw-panel radar-result">
        <div class="radar-hero">
          <div class="radar-char-info">
            <span class="radar-avatar">{{ radarCharProfile?.name?.slice(0, 1) }}</span>
            <div>
              <div class="radar-name">{{ radarCharProfile?.name }}</div>
              <div class="radar-labels">
                <span v-for="(label, i) in radarLabels" :key="i" class="radar-label">{{ label }}</span>
              </div>
            </div>
          </div>
        </div>
        <NwChart v-if="radarOption" :option="radarOption" height="340px" />
        <div class="radar-dims">
          <div v-for="dim in radarDims" :key="dim.key" class="radar-dim-item">
            <span class="radar-dim-label">{{ dim.label }}</span>
            <div class="radar-dim-bar">
              <div class="radar-dim-fill" :style="{ width: dim.value + '%' }"></div>
            </div>
            <span class="radar-dim-value">{{ dim.value }}</span>
          </div>
        </div>
      </div>
    </template>

    <!-- 盘古开天 -->
    <template v-if="activeTab === 'pangu'">
      <div class="nw-panel pangu-panel">
        <div class="pangu-header">
          <div class="pangu-icon">
            <Icon name="zap" :size="28" />
          </div>
          <div>
            <h2 class="pangu-title">盘古开天 · 一键开篇</h2>
            <p class="pangu-desc">一灵感，开出全篇首章。把灵感变成可编辑的新书项目，首章样稿同步落地。</p>
          </div>
        </div>

        <div class="pangu-form">
          <div class="nw-field">
            <label class="nw-field-label">创作灵感</label>
            <textarea
              v-model="panguSeedIdea"
              class="nw-textarea"
              rows="8"
              maxlength="800"
              :disabled="pangu.creatingNovel.value"
              placeholder="想写什么，一句话也可以。比如：被雪藏的演员在综艺现场意外翻红，靠一段旧片段重回顶流。"
            />
          </div>
          <div class="pangu-meta">
            <span>{{ panguSeedLength }} / 800</span>
            <span>{{ pangu.creatingNovel.value ? '开书任务提交中' : '书名、设定、大纲和首章会自动生成' }}</span>
          </div>
          <button
            class="desktop-btn desktop-btn--primary pangu-generate-btn"
            :disabled="!canCreatePangu"
            @click="generatePangu"
          >
            <Icon name="sparkles" :size="16" />
            {{ pangu.creatingNovel.value ? '脑洞大师正在开天...' : '开出全篇首章' }}
          </button>
        </div>
      </div>
    </template>

    <!-- 仓颉造字 -->
    <template v-if="activeTab === 'cangjie'">
      <div class="nw-panel cangjie-panel">
        <div class="cangjie-header">
          <div class="cangjie-icon">
            <Icon name="messageCircle" :size="28" />
          </div>
          <div>
            <h2 class="cangjie-title">仓颉造字 · 聊出故事核心</h2>
            <p class="cangjie-desc">对话梳理世界观、冲突与关系，沉淀可执行的故事核心，一键开书。</p>
          </div>
          <div class="cangjie-header-actions">
            <button v-if="cangjieView === 'chat'" class="desktop-btn" :disabled="!cangjieCanOrganize" @click="cangjieOrganizeStory">
              <Icon name="listChecks" :size="14" />
              {{ cangjieOrganizing ? '整理中…' : '整理故事核心' }}
            </button>
            <button v-if="cangjieView === 'review'" class="desktop-btn" @click="cangjieView = 'chat'">
              <Icon name="messageCircle" :size="14" /> 返回聊天
            </button>
            <button class="desktop-btn" @click="cangjieResetSession">
              <Icon name="refreshCw" :size="14" /> 重新开始
            </button>
          </div>
        </div>

        <!-- 聊天视图 -->
        <div v-if="cangjieView === 'chat'" class="cangjie-chat">
          <div class="cangjie-messages">
            <div v-if="cangjieSession.messages.value.length === 0 && !cangjieSending" class="cangjie-empty">
              <div class="cangjie-empty-icon"><Icon name="sparkles" :size="32" /></div>
              <h3>和仓颉聊聊你的故事</h3>
              <p>把人物、冲突或开局说出来，AI 会帮你追问梳理，最后整理成开书清单。</p>
              <div class="cangjie-prompt-chips">
                <button v-for="chip in PROMPT_CHIPS" :key="chip" class="cangjie-chip" type="button" @click="cangjieUsePrompt(chip)">
                  {{ chip }}
                </button>
              </div>
            </div>
            <div v-for="msg in cangjieSession.messages.value" :key="msg.id" class="cangjie-msg" :class="`is-${msg.role}`">
              <div class="cangjie-msg-avatar">
                <Icon v-if="msg.role === 'user'" name="user" :size="16" />
                <Icon v-else name="bot" :size="16" />
              </div>
              <div class="cangjie-msg-bubble">{{ msg.content }}</div>
            </div>
            <div v-if="cangjieSending" class="cangjie-msg is-assistant">
              <div class="cangjie-msg-avatar"><Icon name="bot" :size="16" /></div>
              <div class="cangjie-msg-bubble cangjie-msg-bubble--typing">
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
              </div>
            </div>
          </div>
          <div class="cangjie-input-area">
            <textarea
              v-model="cangjieDraft"
              class="nw-textarea cangjie-input"
              rows="3"
              placeholder="说说你想写的故事..."
              @keydown.ctrl.enter="cangjieSendMessage"
              @keydown.meta.enter="cangjieSendMessage"
            />
            <div class="cangjie-input-actions">
              <span class="cangjie-hint">Ctrl + Enter 发送</span>
              <button class="desktop-btn desktop-btn--primary" :disabled="!cangjieCanSend" @click="cangjieSendMessage">
                <Icon name="send" :size="14" /> 发送
              </button>
            </div>
          </div>
        </div>

        <!-- 复盘确认视图 -->
        <div v-else class="cangjie-review">
          <template v-if="cangjieSession.hasChecklist.value">
            <div class="cangjie-review-summary">
              <div>
                <h3>开书清单</h3>
                <p>已选 {{ cangjieSelectedSummary }} 项，留下真正要写进新书的部分。</p>
              </div>
              <button class="desktop-btn" :disabled="cangjieCreation.creatingNovel.value" @click="cangjieToggleAll">
                <Icon name="checkSquare" :size="14" />
                {{ cangjieAllSelected ? '清空选择' : '全部选中' }}
              </button>
            </div>

            <div v-for="group in cangjieGroupedChecklist" :key="group.group" class="cangjie-review-group">
              <div class="cangjie-review-group-title">{{ group.label }}</div>
              <div v-for="item in group.items" :key="item.id" class="cangjie-review-item" :class="{ 'is-off': !item.selected }">
                <label class="cangjie-review-toggle">
                  <input v-model="item.selected" type="checkbox" :disabled="cangjieCreation.creatingNovel.value" />
                  <span class="cangjie-checkmark"></span>
                </label>
                <div class="cangjie-review-body">
                  <input v-model="item.title" class="nw-input cangjie-review-title" maxlength="40" :disabled="cangjieCreation.creatingNovel.value" />
                  <textarea v-model="item.content" class="nw-textarea cangjie-review-content" rows="2" maxlength="260" :disabled="cangjieCreation.creatingNovel.value" />
                </div>
              </div>
            </div>

            <div class="cangjie-review-actions">
              <button class="desktop-btn desktop-btn--primary" :disabled="!cangjieCanCreate" @click="cangjieCreateNovel">
                <Icon name="sparkles" :size="16" />
                {{ cangjieCreation.creatingNovel.value ? '正在开书...' : '用这些开书' }}
              </button>
            </div>
          </template>

          <div v-else class="cangjie-review-empty">
            <h3>故事核心还没成形</h3>
            <p>先在聊天里把人物、冲突或开局聊出来，再整理成开书清单。</p>
            <button class="desktop-btn desktop-btn--primary" @click="cangjieView = 'chat'">去聊天</button>
          </div>
        </div>
      </div>
    </template>

    <!-- 命运抉择 -->
    <template v-if="activeTab === 'fate'">
      <div class="nw-panel fate-panel">
        <div class="fate-header">
          <div class="fate-icon">
            <Icon name="shuffle" :size="28" />
          </div>
          <div>
            <h2 class="fate-title">命运仪式 · 选择你的创作之道</h2>
            <p class="fate-desc">六大趣味创作工具，总有一款适合你。选择一扇门，开启你的创作之旅。</p>
          </div>
        </div>

        <div class="fate-door-grid">
          <button
            v-for="door in FATE_DOORS"
            :key="door.key"
            class="fate-door-card"
            type="button"
            :class="{ 'is-soon': door.status === 'soon' }"
            :style="{ '--door-color': door.color }"
            @click="handleFateDoor(door)"
          >
            <div class="fate-door-icon">
              <Icon :name="door.icon" :size="28" />
            </div>
            <div class="fate-door-content">
              <div class="fate-door-title-row">
                <span class="fate-door-title">{{ door.title }}</span>
                <span v-if="door.status === 'soon'" class="fate-door-badge">即将开启</span>
              </div>
              <div class="fate-door-subtitle">{{ door.subtitle }}</div>
              <div class="fate-door-desc">{{ door.desc }}</div>
            </div>
            <Icon name="chevronRight" :size="18" class="fate-door-arrow" />
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.desktop-funhub {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-5);
}

/* ===== 角色雷达 ===== */
.radar-result {
  padding: var(--nw-space-6);
}

.radar-hero {
  margin-bottom: var(--nw-space-5);
}

.radar-char-info {
  display: flex;
  align-items: center;
  gap: var(--nw-space-4);
}

.radar-avatar {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--nw-accent-gradient);
  color: #fff;
  display: grid;
  place-items: center;
  font-size: 22px;
  font-weight: 700;
  font-family: var(--nw-font-display);
}

.radar-name {
  font-size: 20px;
  font-weight: 700;
  color: var(--nw-text-primary);
  margin-bottom: 4px;
}

.radar-labels {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.radar-label {
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
  background: color-mix(in srgb, var(--nw-accent-start) 15%, transparent);
  color: var(--nw-accent-strong);
}

.radar-dims {
  margin-top: var(--nw-space-5);
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-3);
}

.radar-dim-item {
  display: flex;
  align-items: center;
  gap: var(--nw-space-3);
}

.radar-dim-label {
  width: 70px;
  font-size: 13px;
  color: var(--nw-text-secondary);
  flex-shrink: 0;
}

.radar-dim-bar {
  flex: 1;
  height: 8px;
  border-radius: 999px;
  background: var(--nw-bg-secondary);
  overflow: hidden;
}

.radar-dim-fill {
  height: 100%;
  border-radius: 999px;
  background: var(--nw-accent-gradient);
  transition: width 0.6s ease;
}

.radar-dim-value {
  width: 36px;
  text-align: right;
  font-size: 13px;
  font-weight: 600;
  color: var(--nw-text-primary);
}

/* ===== 盘古开天 ===== */
.pangu-panel {
  padding: var(--nw-space-7);
}

.pangu-header {
  display: flex;
  gap: var(--nw-space-4);
  margin-bottom: var(--nw-space-6);
}

.pangu-icon {
  width: 56px;
  height: 56px;
  border-radius: var(--nw-radius-lg);
  background: var(--nw-accent-gradient);
  color: #fff;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}

.pangu-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--nw-text-primary);
  margin: 0 0 4px 0;
  font-family: var(--nw-font-display);
}

.pangu-desc {
  font-size: 14px;
  color: var(--nw-text-secondary);
  margin: 0;
}

.pangu-form {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-5);
  margin-bottom: var(--nw-space-6);
}

.pangu-meta {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--nw-text-muted);
}

.pangu-generate-btn {
  width: 100%;
  justify-content: center;
  gap: 8px;
  font-size: 15px;
  padding: var(--nw-space-4);
}



/* ===== 仓颉造字 ===== */
.cangjie-panel {
  padding: var(--nw-space-6);
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-5);
}

.cangjie-header {
  display: flex;
  gap: var(--nw-space-4);
  align-items: flex-start;
}

.cangjie-icon {
  width: 56px;
  height: 56px;
  border-radius: var(--nw-radius-lg);
  background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);
  color: #fff;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}

.cangjie-header > div:nth-child(2) {
  flex: 1;
}

.cangjie-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--nw-text-primary);
  margin: 0 0 4px 0;
  font-family: var(--nw-font-display);
}

.cangjie-desc {
  font-size: 14px;
  color: var(--nw-text-secondary);
  margin: 0;
}

.cangjie-header-actions {
  display: flex;
  gap: var(--nw-space-2);
  flex-shrink: 0;
}

/* 聊天视图 */
.cangjie-chat {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-4);
}

.cangjie-messages {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-4);
  max-height: 480px;
  overflow-y: auto;
  padding: var(--nw-space-4);
  background: var(--nw-bg-secondary);
  border-radius: var(--nw-radius-lg);
}

.cangjie-empty {
  text-align: center;
  padding: var(--nw-space-8) var(--nw-space-6);
  color: var(--nw-text-muted);
}

.cangjie-empty-icon {
  margin-bottom: var(--nw-space-4);
  color: var(--nw-accent-strong);
}

.cangjie-empty h3 {
  font-size: 18px;
  font-weight: 600;
  color: var(--nw-text-primary);
  margin: 0 0 var(--nw-space-2) 0;
}

.cangjie-empty p {
  font-size: 14px;
  margin: 0 0 var(--nw-space-5) 0;
}

.cangjie-prompt-chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--nw-space-2);
  justify-content: center;
}

.cangjie-chip {
  padding: 6px 14px;
  border-radius: 999px;
  border: 1px solid var(--nw-border);
  background: var(--nw-bg-primary);
  color: var(--nw-text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.cangjie-chip:hover {
  border-color: var(--nw-accent-start);
  color: var(--nw-accent-strong);
}

.cangjie-msg {
  display: flex;
  gap: var(--nw-space-3);
  align-items: flex-start;
}

.cangjie-msg.is-user {
  flex-direction: row-reverse;
}

.cangjie-msg-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}

.cangjie-msg.is-user .cangjie-msg-avatar {
  background: var(--nw-accent-gradient);
  color: #fff;
}

.cangjie-msg.is-assistant .cangjie-msg-avatar {
  background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);
  color: #fff;
}

.cangjie-msg-bubble {
  max-width: 70%;
  padding: 10px 14px;
  border-radius: var(--nw-radius-lg);
  font-size: 14px;
  line-height: 1.6;
  color: var(--nw-text-primary);
  white-space: pre-wrap;
  word-break: break-word;
}

.cangjie-msg.is-user .cangjie-msg-bubble {
  background: var(--nw-accent-gradient);
  color: #fff;
  border-bottom-right-radius: 4px;
}

.cangjie-msg.is-assistant .cangjie-msg-bubble {
  background: var(--nw-bg-primary);
  border: 1px solid var(--nw-border);
  border-bottom-left-radius: 4px;
}

.cangjie-msg-bubble--typing {
  display: flex;
  gap: 4px;
  padding: 14px 16px;
}

.typing-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--nw-text-muted);
  animation: typing 1.4s infinite ease-in-out;
}

.typing-dot:nth-child(2) { animation-delay: 0.2s; }
.typing-dot:nth-child(3) { animation-delay: 0.4s; }

@keyframes typing {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
  30% { transform: translateY(-4px); opacity: 1; }
}

.cangjie-input-area {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-2);
}

.cangjie-input {
  resize: vertical;
  min-height: 80px;
}

.cangjie-input-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.cangjie-hint {
  font-size: 12px;
  color: var(--nw-text-muted);
}

/* 复盘确认视图 */
.cangjie-review {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-5);
}

.cangjie-review-summary {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--nw-space-4) var(--nw-space-5);
  background: color-mix(in srgb, #8b5cf6 8%, var(--nw-bg-secondary));
  border-radius: var(--nw-radius-lg);
  border: 1px solid color-mix(in srgb, #8b5cf6 20%, var(--nw-border));
}

.cangjie-review-summary h3 {
  font-size: 16px;
  font-weight: 600;
  color: var(--nw-text-primary);
  margin: 0 0 4px 0;
}

.cangjie-review-summary p {
  font-size: 13px;
  color: var(--nw-text-secondary);
  margin: 0;
}

.cangjie-review-group {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-3);
}

.cangjie-review-group-title {
  font-size: 14px;
  font-weight: 600;
  color: #8b5cf6;
}

.cangjie-review-item {
  display: flex;
  gap: var(--nw-space-3);
  padding: var(--nw-space-4);
  background: var(--nw-bg-secondary);
  border-radius: var(--nw-radius-md);
  border: 1px solid var(--nw-border);
  transition: opacity 0.2s ease;
}

.cangjie-review-item.is-off {
  opacity: 0.5;
}

.cangjie-review-toggle {
  position: relative;
  flex-shrink: 0;
  margin-top: 4px;
  cursor: pointer;
}

.cangjie-review-toggle input {
  position: absolute;
  opacity: 0;
  cursor: pointer;
}

.cangjie-checkmark {
  display: block;
  width: 18px;
  height: 18px;
  border: 2px solid var(--nw-border);
  border-radius: 4px;
  background: var(--nw-bg-primary);
  transition: all 0.2s ease;
}

.cangjie-review-toggle input:checked ~ .cangjie-checkmark {
  background: var(--nw-accent-strong);
  border-color: var(--nw-accent-strong);
}

.cangjie-review-toggle input:checked ~ .cangjie-checkmark::after {
  content: '';
  position: absolute;
  left: 6px;
  top: 2px;
  width: 4px;
  height: 9px;
  border: solid #fff;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}

.cangjie-review-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-2);
  min-width: 0;
}

.cangjie-review-title {
  font-weight: 600;
  font-size: 14px;
}

.cangjie-review-content {
  font-size: 13px;
  resize: vertical;
  min-height: 60px;
}

.cangjie-review-actions {
  display: flex;
  justify-content: center;
}

.cangjie-review-empty {
  text-align: center;
  padding: var(--nw-space-10);
  color: var(--nw-text-muted);
}

.cangjie-review-empty h3 {
  font-size: 18px;
  font-weight: 600;
  color: var(--nw-text-primary);
  margin: 0 0 var(--nw-space-2) 0;
}

.cangjie-review-empty p {
  font-size: 14px;
  margin: 0 0 var(--nw-space-5) 0;
}

/* ===== 命运抉择 ===== */
.fate-panel {
  padding: var(--nw-space-7);
}

.fate-header {
  display: flex;
  gap: var(--nw-space-4);
  margin-bottom: var(--nw-space-6);
}

.fate-icon {
  width: 56px;
  height: 56px;
  border-radius: var(--nw-radius-lg);
  background: linear-gradient(135deg, #f59e0b 0%, #ef4444 100%);
  color: #fff;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}

.fate-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--nw-text-primary);
  margin: 0 0 4px 0;
  font-family: var(--nw-font-display);
}

.fate-desc {
  font-size: 14px;
  color: var(--nw-text-secondary);
  margin: 0;
}

.fate-door-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--nw-space-4);
}

.fate-door-card {
  display: flex;
  align-items: center;
  gap: var(--nw-space-4);
  padding: var(--nw-space-5);
  border-radius: var(--nw-radius-lg);
  border: 1.5px solid var(--nw-border);
  background: var(--nw-bg-primary);
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: left;
  position: relative;
  overflow: hidden;
}

.fate-door-card::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  background: var(--door-color);
  opacity: 0.8;
}

.fate-door-card:hover:not(.is-soon) {
  border-color: var(--door-color);
  transform: translateY(-2px);
  box-shadow: 0 8px 24px -8px color-mix(in srgb, var(--door-color) 30%, transparent);
}

.fate-door-card.is-soon {
  opacity: 0.6;
  cursor: not-allowed;
}

.fate-door-icon {
  width: 52px;
  height: 52px;
  border-radius: var(--nw-radius-md);
  background: color-mix(in srgb, var(--door-color) 12%, transparent);
  color: var(--door-color);
  display: grid;
  place-items: center;
  flex-shrink: 0;
}

.fate-door-content {
  flex: 1;
  min-width: 0;
}

.fate-door-title-row {
  display: flex;
  align-items: center;
  gap: var(--nw-space-2);
  margin-bottom: 4px;
}

.fate-door-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--nw-text-primary);
}

.fate-door-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--nw-bg-secondary);
  color: var(--nw-text-muted);
  font-weight: 500;
}

.fate-door-subtitle {
  font-size: 13px;
  font-weight: 500;
  color: var(--door-color);
  margin-bottom: 4px;
}

.fate-door-desc {
  font-size: 12px;
  color: var(--nw-text-secondary);
  line-height: 1.5;
}

.fate-door-arrow {
  color: var(--nw-text-muted);
  flex-shrink: 0;
  transition: transform 0.2s ease;
}

.fate-door-card:hover:not(.is-soon) .fate-door-arrow {
  transform: translateX(4px);
  color: var(--door-color);
}
</style>
