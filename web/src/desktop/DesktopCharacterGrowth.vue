<script setup lang="ts">
/**
 * 桌面端·角色成长 & 深度互动
 * 整合：成长时间线、金句、高光场面、人物关系、角色信箱
 */
import { computed, onMounted, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import {
  fetchCharacterGrowth,
  type CharacterGrowthData,
  type CharacterQuote,
  type CharacterScene,
  type CharacterStateSnapshot,
  type RelationCard,
} from '../api/character-growth';
import {
  fetchNovelLetters,
  type LetterRecord,
  type CharacterLetterStat,
} from '../api/character-mail';
import { fetchCharacters } from '../api/characters';
import type { CharacterProfile } from '../api/characters';
import { extractApiErrorMessage } from '../api/errors';
import StateView from '../components/shared/StateView.vue';
import Icon from '../components/shared/Icon.vue';
import Modal from '../components/shared/Modal.vue';

const props = defineProps<{ novelId: string }>();

// ===== 角色列表 =====
const characters = ref<CharacterProfile[]>([]);
const selectedCharId = ref<string | null>(null);
const charactersLoading = ref(false);

const selectedCharacter = computed(() =>
  characters.value.find((c) => c.id === selectedCharId.value) || null
);

async function loadCharacters() {
  if (!props.novelId) return;
  charactersLoading.value = true;
  try {
    const result = await fetchCharacters(props.novelId);
    characters.value = result || [];
    if (characters.value.length > 0 && !selectedCharId.value) {
      selectedCharId.value = characters.value[0].id;
    }
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '加载角色失败'));
  } finally {
    charactersLoading.value = false;
  }
}

// ===== Tab =====
const activeTab = ref<'growth' | 'quotes' | 'scenes' | 'relations' | 'mailbox'>('growth');

// ===== 成长数据 =====
const growthData = ref<CharacterGrowthData | null>(null);
const growthLoading = ref(false);

async function loadGrowthData() {
  if (!props.novelId || !selectedCharId.value) return;
  growthLoading.value = true;
  try {
    growthData.value = await fetchCharacterGrowth(props.novelId, selectedCharId.value);
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '加载成长数据失败'));
  } finally {
    growthLoading.value = false;
  }
}

// ===== 信箱数据 =====
const letterStats = ref<CharacterLetterStat[]>([]);
const letters = ref<LetterRecord[]>([]);
const mailLoading = ref(false);

async function loadLetters() {
  if (!props.novelId) return;
  mailLoading.value = true;
  try {
    const result = await fetchNovelLetters(props.novelId);
    letterStats.value = result.stats || [];
    letters.value = result.letters || [];
  } catch (err) {
    // 信箱功能可能未开启，静默失败
    letters.value = [];
    letterStats.value = [];
  } finally {
    mailLoading.value = false;
  }
}

// ===== 信件详情 =====
const letterDetailVisible = ref(false);
const selectedLetter = ref<LetterRecord | null>(null);

function openLetterDetail(letter: LetterRecord) {
  selectedLetter.value = letter;
  letterDetailVisible.value = true;
}

// ===== 工具函数 =====
function formatDate(ts: number | string): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getRoleLabel(role: string): string {
  const map: Record<string, string> = {
    protagonist: '主角',
    antagonist: '反派',
    supporting: '配角',
    cameo: '客串',
  };
  return map[role] || role;
}

function getCharAvatar(charId: string): string {
  const char = characters.value.find((c) => c.id === charId);
  if (!char?.portraitImagePath) return '';
  return `/api/novels/${props.novelId}/characters/${charId}/portrait?w=80`;
}

// ===== 计算属性 =====
const quotes = computed(() => growthData.value?.quotes || []);
const scenes = computed(() => growthData.value?.scenes || []);
const relations = computed(() => growthData.value?.relations || []);
const snapshots = computed(() => growthData.value?.snapshots || []);

const filteredLetters = computed(() => {
  if (!selectedCharId.value) return letters.value;
  return letters.value.filter((l) => l.characterId === selectedCharId.value);
});

watch(
  () => selectedCharId.value,
  () => {
    if (activeTab.value !== 'mailbox') {
      void loadGrowthData();
    }
  }
);

watch(
  () => activeTab.value,
  (tab) => {
    if (tab === 'mailbox') {
      if (letters.value.length === 0) void loadLetters();
    } else {
      if (!growthData.value && selectedCharId.value) void loadGrowthData();
    }
  }
);

watch(
  () => props.novelId,
  () => {
    void loadCharacters();
  },
  { immediate: true }
);
</script>

<template>
  <div class="desktop-character-growth">
    <div class="cg-layout">
      <!-- 左侧角色列表 -->
      <div class="nw-panel cg-char-panel">
        <div class="nw-panel__head">
          <h2 class="nw-panel__title">角色</h2>
        </div>
        <div v-loading="charactersLoading" class="cg-char-list">
          <button
            v-for="char in characters"
            :key="char.id"
            class="cg-char-item"
            :class="{ 'is-active': selectedCharId === char.id }"
            type="button"
            @click="selectedCharId = char.id"
          >
            <div class="cg-char-avatar">
              <img v-if="getCharAvatar(char.id)" :src="getCharAvatar(char.id)" :alt="char.name" />
              <span v-else>{{ char.name?.[0] || '?' }}</span>
            </div>
            <div class="cg-char-info">
              <div class="cg-char-name">{{ char.name }}</div>
              <div class="cg-char-role">{{ getRoleLabel(char.role || '') }}</div>
            </div>
          </button>
          <div v-if="!charactersLoading && characters.length === 0" class="cg-empty">
            暂无角色
          </div>
        </div>
      </div>

      <!-- 右侧内容区 -->
      <div class="cg-content">
        <!-- Tab 切换 -->
        <div class="nw-panel cg-tabs-panel">
          <div class="cg-tabs">
            <button
              v-for="tab in [
                { key: 'growth', label: '成长轨迹', icon: 'trendingUp' },
                { key: 'quotes', label: '金句', icon: 'quote' },
                { key: 'scenes', label: '高光场面', icon: 'star' },
                { key: 'relations', label: '人物关系', icon: 'users' },
                { key: 'mailbox', label: '角色信箱', icon: 'mail' },
              ]"
              :key="tab.key"
              class="cg-tab"
              :class="{ 'is-active': activeTab === tab.key }"
              @click="activeTab = tab.key as any"
            >
              <Icon :name="tab.icon" :size="14" />
              {{ tab.label }}
            </button>
          </div>
        </div>

        <!-- 成长轨迹 -->
        <div v-if="activeTab === 'growth'" class="nw-panel">
          <div class="nw-panel__head">
            <h2 class="nw-panel__title">成长轨迹</h2>
            <span v-if="selectedCharacter" class="cg-subtitle">{{ selectedCharacter.name }}</span>
          </div>
          <StateView :loading="growthLoading" :error="null">
            <div v-if="snapshots.length === 0 && !growthLoading" class="cg-empty">
              <Icon name="trendingUp" :size="40" />
              <p>暂无成长数据</p>
              <p class="cg-hint">角色成长数据基于已定稿章节自动生成</p>
            </div>

            <div v-else class="cg-timeline">
              <div
                v-for="(snap, idx) in snapshots"
                :key="snap.id"
                class="cg-timeline-item"
                :class="{ 'is-critical': snap.isCritical }"
              >
                <div class="cg-timeline-dot">
                  <span v-if="snap.isCritical" class="cg-critical-badge">!</span>
                </div>
                <div class="cg-timeline-content">
                  <div class="cg-timeline-chapter">第 {{ snap.chapterNumber }} 章</div>
                  <div class="cg-timeline-stats">
                    <div class="cg-stat-mini">
                      <span class="cg-stat-label">情绪</span>
                      <span class="cg-stat-value">{{ snap.emotionState?.primary || '—' }}</span>
                    </div>
                    <div class="cg-stat-mini">
                      <span class="cg-stat-label">压力</span>
                      <span class="cg-stat-value">{{ snap.stress }}%</span>
                    </div>
                    <div class="cg-stat-mini">
                      <span class="cg-stat-label">目标进度</span>
                      <span class="cg-stat-value">{{ snap.goalProgress }}%</span>
                    </div>
                  </div>
                  <div v-if="snap.beliefShift" class="cg-timeline-belief">
                    <span class="cg-belief-label">信念转变：</span>
                    {{ snap.beliefShift }}
                  </div>
                  <div v-if="snap.trustChanges?.length" class="cg-timeline-trust">
                    <span class="cg-trust-label">关系变化：</span>
                    <span
                      v-for="(tc, i) in snap.trustChanges"
                      :key="i"
                      class="cg-trust-tag"
                      :class="tc.delta > 0 ? 'is-up' : 'is-down'"
                    >
                      {{ tc.targetId }} {{ tc.delta > 0 ? '+' : '' }}{{ tc.delta }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </StateView>
        </div>

        <!-- 金句 -->
        <div v-else-if="activeTab === 'quotes'" class="nw-panel">
          <div class="nw-panel__head">
            <h2 class="nw-panel__title">角色金句</h2>
            <span v-if="selectedCharacter" class="cg-subtitle">{{ selectedCharacter.name }}</span>
          </div>
          <StateView :loading="growthLoading" :error="null">
            <div v-if="quotes.length === 0 && !growthLoading" class="cg-empty">
              <Icon name="quote" :size="40" />
              <p>暂无金句</p>
            </div>
            <div v-else class="cg-quote-list">
              <div
                v-for="(quote, idx) in quotes"
                :key="idx"
                class="cg-quote-card"
              >
                <div class="cg-quote-mark">"</div>
                <p class="cg-quote-text">{{ quote.text }}</p>
                <div class="cg-quote-meta">
                  <span>第 {{ quote.chapter }} 章</span>
                  <div class="cg-quote-score">
                    <Icon name="star" :size="12" />
                    {{ quote.score.toFixed(1) }}
                  </div>
                </div>
              </div>
            </div>
          </StateView>
        </div>

        <!-- 高光场面 -->
        <div v-else-if="activeTab === 'scenes'" class="nw-panel">
          <div class="nw-panel__head">
            <h2 class="nw-panel__title">高光场面</h2>
            <span v-if="selectedCharacter" class="cg-subtitle">{{ selectedCharacter.name }}</span>
          </div>
          <StateView :loading="growthLoading" :error="null">
            <div v-if="scenes.length === 0 && !growthLoading" class="cg-empty">
              <Icon name="star" :size="40" />
              <p>暂无高光场面</p>
            </div>
            <div v-else class="cg-scene-list">
              <div
                v-for="(scene, idx) in scenes"
                :key="idx"
                class="cg-scene-card"
              >
                <div class="cg-scene-chapter">第 {{ scene.chapter }} 章</div>
                <p class="cg-scene-text">{{ scene.text }}</p>
              </div>
            </div>
          </StateView>
        </div>

        <!-- 人物关系 -->
        <div v-else-if="activeTab === 'relations'" class="nw-panel">
          <div class="nw-panel__head">
            <h2 class="nw-panel__title">人物关系</h2>
            <span v-if="selectedCharacter" class="cg-subtitle">{{ selectedCharacter.name }}</span>
          </div>
          <StateView :loading="growthLoading" :error="null">
            <div v-if="relations.length === 0 && !growthLoading" class="cg-empty">
              <Icon name="users" :size="40" />
              <p>暂无关系数据</p>
            </div>
            <div v-else class="cg-relation-grid">
              <div
                v-for="rel in relations"
                :key="rel.otherId"
                class="cg-relation-card"
              >
                <div class="cg-relation-head">
                  <div class="cg-relation-avatar">
                    {{ rel.otherName?.[0] || '?' }}
                  </div>
                  <div class="cg-relation-info">
                    <div class="cg-relation-name">{{ rel.otherName }}</div>
                    <div class="cg-relation-label">{{ rel.label }}</div>
                  </div>
                </div>
                <div class="cg-relation-stats">
                  <div class="cg-stat-mini">
                    <span class="cg-stat-label">相遇</span>
                    <span class="cg-stat-value">{{ rel.encounters }} 次</span>
                  </div>
                  <div class="cg-stat-mini">
                    <span class="cg-stat-label">同框</span>
                    <span class="cg-stat-value">{{ rel.coAppearances }} 次</span>
                  </div>
                  <div class="cg-stat-mini">
                    <span class="cg-stat-label">最近</span>
                    <span class="cg-stat-value">第 {{ rel.lastChapter }} 章</span>
                  </div>
                </div>
                <div v-if="rel.bestExchange" class="cg-relation-exchange">
                  <div class="cg-exchange-title">名交锋</div>
                  <div class="cg-exchange-lines">
                    <div
                      v-for="(line, i) in rel.bestExchange.lines"
                      :key="i"
                      class="cg-exchange-line"
                    >
                      <span class="cg-exchange-speaker">
                        {{ line.speakerId === selectedCharId ? selectedCharacter?.name : rel.otherName }}：
                      </span>
                      {{ line.text }}
                    </div>
                  </div>
                  <div class="cg-exchange-chapter">第 {{ rel.bestExchange.chapter }} 章</div>
                </div>
              </div>
            </div>
          </StateView>
        </div>

        <!-- 角色信箱 -->
        <div v-else-if="activeTab === 'mailbox'" class="nw-panel">
          <div class="nw-panel__head">
            <h2 class="nw-panel__title">角色信箱</h2>
            <span class="cg-subtitle">{{ letters.length }} 封来信</span>
          </div>
          <StateView :loading="mailLoading" :error="null">
            <div v-if="letters.length === 0 && !mailLoading" class="cg-empty">
              <Icon name="mail" :size="40" />
              <p>暂无读者来信</p>
              <p class="cg-hint">读者可通过角色信箱功能给角色写信</p>
            </div>
            <div v-else class="cg-mail-list">
              <div
                v-for="letter in filteredLetters"
                :key="letter.id"
                class="cg-mail-card"
                @click="openLetterDetail(letter)"
              >
                <div class="cg-mail-head">
                  <div class="cg-mail-reader">
                    <Icon name="user" :size="14" />
                    {{ letter.readerName }}
                  </div>
                  <div class="cg-mail-date">{{ formatDate(letter.createdAt) }}</div>
                </div>
                <div class="cg-mail-char">致 {{ letter.characterName }}</div>
                <p class="cg-mail-preview">{{ letter.readerMessage?.slice(0, 80) }}{{ letter.readerMessage?.length > 80 ? '…' : '' }}</p>
                <div class="cg-mail-status">
                  <span class="cg-mail-reply-badge">
                    <Icon name="reply" :size="12" /> 已回复
                  </span>
                </div>
              </div>
            </div>
          </StateView>
        </div>
      </div>
    </div>

    <!-- 信件详情弹窗 -->
    <Modal v-model="letterDetailVisible" title="信件详情" width="600px">
      <div v-if="selectedLetter" class="cg-letter-detail">
        <div class="cg-letter-head">
          <div class="cg-letter-from">
            <Icon name="user" :size="16" />
            <span>{{ selectedLetter.readerName }}</span>
          </div>
          <div class="cg-letter-to">
            <Icon name="arrowRight" :size="14" />
            <span>{{ selectedLetter.characterName }}</span>
          </div>
          <div class="cg-letter-date">{{ formatDate(selectedLetter.createdAt) }}</div>
        </div>

        <div class="cg-letter-section">
          <div class="cg-letter-label">读者来信</div>
          <div class="cg-letter-content reader">{{ selectedLetter.readerMessage }}</div>
        </div>

        <div class="cg-letter-section">
          <div class="cg-letter-label">{{ selectedLetter.characterName }} 的回复</div>
          <div class="cg-letter-content reply">{{ selectedLetter.replyContent }}</div>
        </div>
      </div>
      <template #footer>
        <button class="desktop-btn desktop-btn--primary" @click="letterDetailVisible = false">关闭</button>
      </template>
    </Modal>
  </div>
</template>

<style scoped>
.desktop-character-growth {
  width: 100%;
}

.cg-layout {
  display: grid;
  grid-template-columns: 240px 1fr;
  gap: var(--nw-space-5);
  align-items: start;
}

/* 角色列表 */
.cg-char-panel {
  position: sticky;
  top: 20px;
}

.cg-char-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 600px;
  overflow-y: auto;
}

.cg-char-item {
  display: flex;
  align-items: center;
  gap: var(--nw-space-3);
  padding: var(--nw-space-2half) var(--nw-space-3);
  border-radius: var(--nw-radius-md);
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: background var(--nw-duration-fast) var(--nw-ease-smooth);
  color: inherit;
  font: inherit;
}

.cg-char-item:hover {
  background: var(--nw-bg-secondary);
}

.cg-char-item.is-active {
  background: color-mix(in srgb, var(--nw-accent-start) 12%, var(--nw-bg-secondary));
}

.cg-char-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  overflow: hidden;
  background: var(--nw-accent-gradient);
  color: #fff;
  display: grid;
  place-items: center;
  font-weight: 600;
  font-size: 14px;
  flex-shrink: 0;
}

.cg-char-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cg-char-info {
  flex: 1;
  min-width: 0;
}

.cg-char-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--nw-text-primary);
}

.cg-char-role {
  font-size: 12px;
  color: var(--nw-text-muted);
}

/* 内容区 */
.cg-content {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-5);
}

/* Tab */
.cg-tabs-panel {
  padding: var(--nw-space-2) var(--nw-space-3);
}

.cg-tabs {
  display: flex;
  gap: var(--nw-space-1);
  flex-wrap: wrap;
}

.cg-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: var(--nw-radius-md);
  border: none;
  background: transparent;
  font-size: 13px;
  font-weight: 500;
  color: var(--nw-text-secondary);
  cursor: pointer;
  transition: all var(--nw-duration-fast) var(--nw-ease-smooth);
}

.cg-tab:hover {
  background: var(--nw-bg-secondary);
  color: var(--nw-text-primary);
}

.cg-tab.is-active {
  background: var(--nw-accent-gradient);
  color: #fff;
}

.cg-subtitle {
  font-size: 13px;
  color: var(--nw-text-muted);
  font-weight: 400;
}

/* 空状态 */
.cg-empty {
  padding: var(--nw-space-10) var(--nw-space-6);
  text-align: center;
  color: var(--nw-text-muted);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--nw-space-2);
}

.cg-empty p {
  margin: 0;
  font-size: 14px;
}

.cg-hint {
  font-size: 12px !important;
  opacity: 0.7;
}

/* 时间线 */
.cg-timeline {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-4);
  padding-left: var(--nw-space-3);
  position: relative;
}

.cg-timeline::before {
  content: '';
  position: absolute;
  left: 9px;
  top: 4px;
  bottom: 4px;
  width: 2px;
  background: var(--nw-border);
}

.cg-timeline-item {
  display: flex;
  gap: var(--nw-space-4);
  position: relative;
}

.cg-timeline-dot {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--nw-bg-secondary);
  border: 2px solid var(--nw-border);
  flex-shrink: 0;
  position: relative;
  z-index: 1;
  display: grid;
  place-items: center;
}

.cg-timeline-item.is-critical .cg-timeline-dot {
  background: var(--nw-warning);
  border-color: var(--nw-warning);
}

.cg-critical-badge {
  color: #fff;
  font-size: 12px;
  font-weight: 700;
}

.cg-timeline-content {
  flex: 1;
  background: var(--nw-bg-secondary);
  border-radius: var(--nw-radius-md);
  padding: var(--nw-space-3) var(--nw-space-4);
}

.cg-timeline-chapter {
  font-size: 13px;
  font-weight: 600;
  color: var(--nw-accent-strong);
  margin-bottom: var(--nw-space-2);
}

.cg-timeline-stats {
  display: flex;
  gap: var(--nw-space-4);
  margin-bottom: var(--nw-space-2);
}

.cg-stat-mini {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.cg-stat-label {
  font-size: 11px;
  color: var(--nw-text-muted);
}

.cg-stat-value {
  font-size: 14px;
  font-weight: 600;
  color: var(--nw-text-primary);
}

.cg-timeline-belief {
  font-size: 13px;
  color: var(--nw-text-secondary);
  margin-top: var(--nw-space-2);
  padding-top: var(--nw-space-2);
  border-top: 1px dashed var(--nw-border);
}

.cg-belief-label {
  font-weight: 500;
  color: var(--nw-accent-strong);
}

.cg-timeline-trust {
  font-size: 13px;
  color: var(--nw-text-secondary);
  margin-top: var(--nw-space-2);
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.cg-trust-label {
  color: var(--nw-text-muted);
}

.cg-trust-tag {
  font-size: 11px;
  padding: 1px 8px;
  border-radius: 999px;
  font-weight: 500;
}

.cg-trust-tag.is-up {
  background: color-mix(in srgb, var(--nw-success) 15%, transparent);
  color: var(--nw-success);
}

.cg-trust-tag.is-down {
  background: color-mix(in srgb, var(--nw-danger) 15%, transparent);
  color: var(--nw-danger);
}

/* 金句 */
.cg-quote-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: var(--nw-space-3);
}

.cg-quote-card {
  padding: var(--nw-space-4);
  background: var(--nw-bg-secondary);
  border-radius: var(--nw-radius-lg);
  position: relative;
}

.cg-quote-mark {
  font-size: 48px;
  color: var(--nw-accent-strong);
  opacity: 0.2;
  font-family: Georgia, serif;
  line-height: 1;
  position: absolute;
  top: 8px;
  left: 12px;
}

.cg-quote-text {
  margin: 0 0 var(--nw-space-3);
  font-size: 14px;
  line-height: 1.7;
  color: var(--nw-text-primary);
  padding-left: var(--nw-space-4);
}

.cg-quote-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: var(--nw-text-muted);
}

.cg-quote-score {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--nw-warning);
  font-weight: 500;
}

/* 高光场面 */
.cg-scene-list {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-3);
}

.cg-scene-card {
  padding: var(--nw-space-4);
  background: var(--nw-bg-secondary);
  border-radius: var(--nw-radius-lg);
  border-left: 3px solid var(--nw-accent-strong);
}

.cg-scene-chapter {
  font-size: 12px;
  font-weight: 600;
  color: var(--nw-accent-strong);
  margin-bottom: var(--nw-space-2);
}

.cg-scene-text {
  margin: 0;
  font-size: 14px;
  line-height: 1.7;
  color: var(--nw-text-primary);
}

/* 人物关系 */
.cg-relation-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: var(--nw-space-3);
}

.cg-relation-card {
  padding: var(--nw-space-4);
  background: var(--nw-bg-secondary);
  border-radius: var(--nw-radius-lg);
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-3);
}

.cg-relation-head {
  display: flex;
  align-items: center;
  gap: var(--nw-space-3);
}

.cg-relation-avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--nw-accent-gradient);
  color: #fff;
  display: grid;
  place-items: center;
  font-weight: 600;
  font-size: 16px;
}

.cg-relation-info {
  flex: 1;
}

.cg-relation-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--nw-text-primary);
}

.cg-relation-label {
  font-size: 12px;
  color: var(--nw-accent-strong);
  font-weight: 500;
}

.cg-relation-stats {
  display: flex;
  gap: var(--nw-space-4);
}

.cg-relation-exchange {
  padding: var(--nw-space-3);
  background: color-mix(in srgb, var(--nw-accent-start) 8%, transparent);
  border-radius: var(--nw-radius-md);
}

.cg-exchange-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--nw-accent-strong);
  margin-bottom: var(--nw-space-2);
}

.cg-exchange-lines {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-1);
}

.cg-exchange-line {
  font-size: 13px;
  line-height: 1.5;
  color: var(--nw-text-secondary);
}

.cg-exchange-speaker {
  font-weight: 500;
  color: var(--nw-text-primary);
}

.cg-exchange-chapter {
  font-size: 11px;
  color: var(--nw-text-muted);
  margin-top: var(--nw-space-2);
  text-align: right;
}

/* 信箱 */
.cg-mail-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--nw-space-3);
}

.cg-mail-card {
  padding: var(--nw-space-3) var(--nw-space-4);
  background: var(--nw-bg-secondary);
  border-radius: var(--nw-radius-lg);
  cursor: pointer;
  transition: all var(--nw-duration-fast) var(--nw-ease-smooth);
}

.cg-mail-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px color-mix(in srgb, var(--nw-shadow-color) 15%, transparent);
}

.cg-mail-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--nw-space-1);
}

.cg-mail-reader {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
  color: var(--nw-text-primary);
}

.cg-mail-date {
  font-size: 12px;
  color: var(--nw-text-muted);
}

.cg-mail-char {
  font-size: 12px;
  color: var(--nw-accent-strong);
  margin-bottom: var(--nw-space-2);
}

.cg-mail-preview {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--nw-text-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-bottom: var(--nw-space-2);
}

.cg-mail-status {
  display: flex;
  justify-content: flex-end;
}

.cg-mail-reply-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--nw-success) 15%, transparent);
  color: var(--nw-success);
  font-weight: 500;
}

/* 信件详情 */
.cg-letter-detail {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-4);
}

.cg-letter-head {
  display: flex;
  align-items: center;
  gap: var(--nw-space-3);
  padding-bottom: var(--nw-space-3);
  border-bottom: 1px solid var(--nw-border);
  flex-wrap: wrap;
}

.cg-letter-from {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 500;
  color: var(--nw-text-primary);
}

.cg-letter-to {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--nw-accent-strong);
  font-weight: 500;
}

.cg-letter-date {
  margin-left: auto;
  font-size: 13px;
  color: var(--nw-text-muted);
}

.cg-letter-section {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-2);
}

.cg-letter-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--nw-text-secondary);
}

.cg-letter-content {
  padding: var(--nw-space-4);
  border-radius: var(--nw-radius-md);
  line-height: 1.8;
  font-size: 14px;
  white-space: pre-wrap;
}

.cg-letter-content.reader {
  background: var(--nw-bg-secondary);
  color: var(--nw-text-primary);
}

.cg-letter-content.reply {
  background: color-mix(in srgb, var(--nw-accent-start) 10%, var(--nw-bg-secondary));
  color: var(--nw-text-primary);
}

@media (max-width: 900px) {
  .cg-layout {
    grid-template-columns: 1fr;
  }

  .cg-char-panel {
    position: static;
  }

  .cg-char-list {
    flex-direction: row;
    flex-wrap: wrap;
    max-height: none;
  }
}
</style>
