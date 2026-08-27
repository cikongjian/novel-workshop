<template>
  <div v-if="visible" class="character-moments mobile-focus-light-vars">
    <div class="character-moments__sheet">
      <div class="character-moments__header">
        <button class="character-moments__back" @click="close">关闭</button>
        <span class="character-moments__title">角色朋友圈</span>
        <button v-if="isOwner" class="character-moments__gen-toggle" @click="showGenerate = !showGenerate">
          {{ showGenerate ? '收起' : '生成' }}
        </button>
      </div>

      <!-- 作者生成面板 -->
      <div v-if="showGenerate" class="character-moments__generate">
        <div v-if="loadingCharacters" class="character-moments__gen-hint">加载角色中...</div>
        <div v-else-if="characters.length === 0" class="character-moments__gen-hint">暂无可发动态的角色</div>
        <template v-else>
          <div class="character-moments__gen-row">
            <select v-model="genCharacter" class="character-moments__select">
              <option value="">选择角色</option>
              <option v-for="c in characters" :key="c.id" :value="c.id">{{ c.name }} · {{ c.roleLabel }}</option>
            </select>
            <select v-model="genType" class="character-moments__select">
              <option value="mood">心情</option>
              <option value="plot">剧情吐槽</option>
              <option value="daily">日常碎片</option>
              <option value="dream">梦境</option>
              <option value="reveal">爆料</option>
              <option value="night">深夜</option>
              <option value="challenge">挑衅</option>
            </select>
          </div>
          <div class="character-moments__gen-row">
            <label class="character-moments__check">
              <input type="checkbox" v-model="genWithComments" />
              <span>带角色互评</span>
            </label>
            <button
              class="character-moments__gen-btn"
              :disabled="!genCharacter || moments.generating.value"
              @click="doGenerate"
            >
              {{ moments.generating.value ? '生成中...' : '生成动态' }}
            </button>
          </div>
        </template>
      </div>

      <!-- 动态流 -->
      <div v-if="moments.loading.value && moments.moments.value.length === 0" class="character-moments__loading">
        加载中...
      </div>
      <div v-if="moments.moments.value.length === 0 && !moments.hotMoment.value && !moments.loading.value" class="character-moments__empty">
        还没有角色冒出过泡，点击右上角「生成」立即让角色发一条
      </div>
      <div v-else class="character-moments__list">
        <!-- 角色筛选栏 -->
        <div v-if="characterChips.length >= 1" class="character-moments__filter">
          <button
            class="character-moments__filter-chip"
            :class="{ 'character-moments__filter-chip--active': !filterCharId }"
            @click="filterCharId = ''"
          >
            全部
          </button>
          <button
            v-for="ch in characterChips"
            :key="ch.id"
            class="character-moments__filter-chip"
            :class="{ 'character-moments__filter-chip--active': filterCharId === ch.id }"
            @click="filterCharId = filterCharId === ch.id ? '' : ch.id"
          >
            {{ ch.name }}<span v-if="ch.streak >= 2" class="character-moments__streak">{{ ch.streak }}天</span>
          </button>
        </div>

        <!-- 本周最热 -->
        <div v-if="moments.hotMoment.value && !filterCharId" class="character-moments__hot">
          <div class="character-moments__hot-badge">本周最热</div>
          <MomentCard
            :key="moments.hotMoment.value.id"
            :moment="moments.hotMoment.value"
            :novel-id="novelId"
            :liked="likedIds.has(moments.hotMoment.value.id)"
            :blocked-reader-ids="blockedIds"
            :is-owner="isOwner"
            @like="onLike"
            @comment="onComment"
            @report-comment="onReportComment"
            @block-reader="onBlockReader"
            @delete-comment="onDeleteComment"
          />
        </div>
        <MomentCard
          v-for="moment in filteredMoments"
          :key="moment.id"
          :moment="moment"
          :novel-id="novelId"
          :liked="likedIds.has(moment.id)"
          :blocked-reader-ids="blockedIds"
          :is-owner="isOwner"
          @like="onLike"
          @comment="onComment"
          @report-comment="onReportComment"
          @block-reader="onBlockReader"
          @delete-comment="onDeleteComment"
        />
        <button
          v-if="moments.hasMore.value"
          class="character-moments__more"
          :disabled="moments.loading.value"
          @click="moments.loadMore(novelId)"
        >
          {{ moments.loading.value ? '加载中...' : '查看更多' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch, computed } from 'vue';
import { ElMessage } from 'element-plus';
import { useCharacterMoments } from '../../composables/useCharacterMoments';
import { fetchCharacters } from '../../api/characters';
import { reportMomentComment, deleteMomentComment } from '../../api/character-moments';
import { CHARACTER_ROLE_LABELS, type CharacterProfile } from '../../types';
import type { MomentType } from '../../api/character-moments';
import MomentCard from './MomentCard.vue';

const props = defineProps<{
  visible: boolean;
  novelId: string;
  /** 是否作者本人（控制生成按钮可见性） */
  isOwner?: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const moments = useCharacterMoments();
const allCharacters = ref<CharacterProfile[]>([]);
const loadingCharacters = ref(false);
const showGenerate = ref(false);
const genCharacter = ref('');
const genType = ref<MomentType>('mood');
const genWithComments = ref(true);
/** 本地跟踪已点赞的动态 ID */
const likedIds = reactive(new Set<string>());
/** 角色筛选 */
const filterCharId = ref('');

/** 本地屏蔽的读者 ID（localStorage） */
const blockedIds = reactive(new Set<string>(
  JSON.parse(localStorage.getItem('moments_blocked_ids') || '[]') as string[],
));

function saveBlockedIds() {
  localStorage.setItem('moments_blocked_ids', JSON.stringify([...blockedIds]));
}

/** 可发朋友圈的角色：已开启朋友圈 + 未退场/死亡 */
const characters = computed(() =>
  allCharacters.value.filter(
    c => c.momentsEnabled !== false && c.status !== 'dead' && c.status !== 'exited' && c.name?.length >= 2,
  ).map(c => ({
    id: c.id,
    name: c.name,
    role: c.role,
    roleLabel: CHARACTER_ROLE_LABELS[c.role] || c.role,
  })),
);

/** 动态流中出现过的角色（用于筛选栏） */
const characterChips = computed(() => {
  const seen = new Map<string, { id: string; name: string; streak: number }>();
  for (const m of moments.moments.value) {
    if (!seen.has(m.characterId)) {
      // 计算该角色的连续发帖天数
      const charPosts = moments.moments.value
        .filter(p => p.characterId === m.characterId)
        .map(p => p.createdAt)
        .sort((a, b) => b - a);
      let streak = 0;
      if (charPosts.length > 0) {
        const now = new Date().toDateString();
        const latest = new Date(charPosts[0]).toDateString();
        if (latest === now) {
          streak = 1;
          for (let i = 1; i < charPosts.length; i++) {
            const currD = new Date(charPosts[i - 1]).toDateString();
            const prevD = new Date(charPosts[i]).toDateString();
            if (currD !== prevD && Date.parse(currD) - Date.parse(prevD) === 86400000) {
              streak++;
            } else break;
          }
        }
      }
      seen.set(m.characterId, { id: m.characterId, name: m.characterName, streak });
    }
  }
  return [...seen.values()];
});

/** 按角色筛选后的动态流 */
const filteredMoments = computed(() => {
  if (!filterCharId.value) return moments.moments.value;
  return moments.moments.value.filter(m => m.characterId === filterCharId.value);
});

watch(
  () => props.visible,
  (val) => {
    if (val && props.novelId) {
      showGenerate.value = false;
      genCharacter.value = '';
      moments.load(props.novelId);
    }
  },
);

async function loadCharacters() {
  loadingCharacters.value = true;
  try {
    allCharacters.value = await fetchCharacters(props.novelId);
  } catch {
    allCharacters.value = [];
  } finally {
    loadingCharacters.value = false;
  }
}

watch(showGenerate, (val) => {
  if (val && allCharacters.value.length === 0) {
    loadCharacters();
  }
});

function close() {
  emit('close');
}

async function onLike(momentId: string) {
  const res = await moments.like(momentId);
  if (res) {
    if (res.liked) {
      likedIds.add(momentId);
    } else {
      likedIds.delete(momentId);
    }
  }
}

async function onComment(momentId: string, content: string) {
  await moments.comment(momentId, content);
}

async function onReportComment(_momentId: string, commentId: string) {
  try {
    await reportMomentComment({ momentId: _momentId, commentId });
    ElMessage.success('已举报');
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.error || '举报失败');
  }
}

function onBlockReader(authorId: string) {
  blockedIds.add(authorId);
  saveBlockedIds();
  ElMessage.success('已屏蔽该读者');
}

async function onDeleteComment(momentId: string, commentId: string) {
  try {
    await deleteMomentComment(momentId, commentId);
    // 从本地状态中移除该评论
    const target = moments.moments.value.find(m => m.id === momentId);
    if (target) {
      target.comments = target.comments.filter(c => c.id !== commentId);
    }
    ElMessage.success('评论已删除');
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.error || '删除失败');
  }
}

async function doGenerate() {
  if (!genCharacter.value) return;
  const moment = await moments.generate({
    novelId: props.novelId,
    characterId: genCharacter.value,
    type: genType.value,
    withComments: genWithComments.value,
  });
  if (moment) {
    showGenerate.value = false;
    genCharacter.value = '';
  }
}
</script>

<style scoped>
.character-moments {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  color: var(--nw-text-primary);
}
.character-moments__sheet {
  width: 100%;
  max-width: 480px;
  background: var(--mobile-focus-surface-muted);
  height: 100dvh;
  display: flex;
  flex-direction: column;
}
.character-moments__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  background: var(--nw-bg-secondary);
  border-bottom: 1px solid color-mix(in srgb, var(--nw-border) 46%, transparent);
  flex-shrink: 0;
}
.character-moments__back,
.character-moments__gen-toggle {
  background: none;
  border: none;
  font-size: 14px;
  color: var(--mobile-focus-accent);
  cursor: pointer;
  padding: 4px 8px;
}
.character-moments__title {
  font-size: 16px;
  font-weight: 600;
  color: var(--nw-text-primary);
}
.character-moments__generate {
  background: var(--nw-bg-secondary);
  padding: 12px 16px;
  border-bottom: 1px solid color-mix(in srgb, var(--nw-border) 46%, transparent);
  flex-shrink: 0;
}
.character-moments__gen-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}
.character-moments__gen-row:last-child {
  margin-bottom: 0;
}
.character-moments__select {
  flex: 1;
  height: 36px;
  border: 1px solid color-mix(in srgb, var(--nw-border) 70%, transparent);
  border-radius: 8px;
  padding: 0 10px;
  font-size: 14px;
  color: var(--nw-text-primary);
  background: var(--nw-bg-secondary);
  outline: none;
}
.character-moments__check {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--nw-text-secondary);
  cursor: pointer;
  flex: 1;
}
.character-moments__gen-btn {
  border: none;
  background: linear-gradient(135deg, var(--mobile-focus-accent), var(--mobile-focus-accent-strong));
  color: var(--mobile-focus-on-accent);
  font-size: 14px;
  font-weight: 600;
  padding: 8px 18px;
  border-radius: 8px;
  cursor: pointer;
  flex-shrink: 0;
}
.character-moments__gen-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.character-moments__gen-hint {
  font-size: 13px;
  color: var(--nw-text-muted);
  text-align: center;
  padding: 8px 0;
}
.character-moments__loading,
.character-moments__empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--nw-text-muted);
  font-size: 14px;
}
.character-moments__list {
  flex: 1;
  overflow-y: auto;
  padding: 10px 12px;
  -webkit-overflow-scrolling: touch;
}
.character-moments__more {
  display: block;
  width: 100%;
  padding: 12px;
  border: none;
  background: none;
  color: var(--mobile-focus-accent);
  font-size: 14px;
  cursor: pointer;
}
.character-moments__more:disabled {
  color: var(--nw-text-muted);
}

/* 角色筛选栏 */
.character-moments__filter {
  display: flex;
  gap: 6px;
  margin-bottom: 10px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  padding-bottom: 2px;
}
.character-moments__filter::-webkit-scrollbar {
  display: none;
}
.character-moments__filter-chip {
  flex-shrink: 0;
  border: 1px solid color-mix(in srgb, var(--nw-border) 70%, transparent);
  background: var(--nw-bg-secondary);
  color: var(--nw-text-secondary);
  font-size: 12px;
  font-weight: 500;
  padding: 5px 12px;
  border-radius: 14px;
  cursor: pointer;
  transition: all 0.15s;
}
.character-moments__filter-chip--active {
  background: var(--mobile-focus-accent);
  border-color: var(--mobile-focus-accent);
  color: var(--mobile-focus-on-accent);
}
.character-moments__streak {
  display: inline-block;
  font-size: 10px;
  font-weight: 700;
  background: color-mix(in srgb, var(--mobile-focus-status-gold) 18%, var(--nw-bg-secondary));
  color: color-mix(in srgb, var(--mobile-focus-status-gold) 86%, var(--nw-text-primary));
  padding: 1px 5px;
  border-radius: 6px;
  margin-left: 4px;
  vertical-align: middle;
}

/* 本周最热 */
.character-moments__hot {
  margin-bottom: 14px;
  position: relative;
}
.character-moments__hot-badge {
  display: inline-block;
  font-size: 11px;
  font-weight: 700;
  color: var(--mobile-focus-on-accent);
  background: linear-gradient(135deg, var(--mobile-focus-status-gold), var(--mobile-focus-status-danger));
  padding: 3px 10px;
  border-radius: 10px;
  margin-bottom: -6px;
  position: relative;
  z-index: 1;
  left: 10px;
  top: 8px;
}
</style>
