<template>
  <div v-if="visible" class="character-mailbox mobile-focus-light-vars" :class="{ 'character-mailbox--fullscreen': mode !== 'picker' }">
    <!-- 角色选择 -->
    <div v-if="mode === 'picker'" class="character-mailbox__sheet">
      <div class="character-mailbox__header">
        <span class="character-mailbox__title">和角色互动</span>
        <button class="character-mailbox__close" @click="close">关闭</button>
      </div>

      <!-- 最近来信预览 -->
      <div v-if="recentLetters.length > 0" class="character-mailbox__recent">
        <div class="character-mailbox__recent-header">
          <span class="character-mailbox__recent-title">最近来信</span>
          <button class="character-mailbox__recent-more" @click="showHistory">查看全部 ({{ mailbox.letters.value.length }})</button>
        </div>
        <div class="character-mailbox__recent-list">
          <button
            v-for="letter in recentLetters"
            :key="letter.id"
            class="character-mailbox__recent-item"
            @click="viewLetter(letter)"
          >
            <div class="character-mailbox__recent-avatar">
              <span>{{ letter.characterName?.charAt(0) }}</span>
            </div>
            <div class="character-mailbox__recent-body">
              <div class="character-mailbox__recent-meta">
                <span class="character-mailbox__recent-char">{{ letter.characterName }}</span>
                <span class="character-mailbox__recent-time">{{ formatTime(letter.createdAt) }}</span>
              </div>
              <div class="character-mailbox__recent-preview">{{ letter.replyContent.slice(0, 50) }}...</div>
            </div>
          </button>
        </div>
      </div>

      <div v-if="mailbox.loadingCharacters.value" class="character-mailbox__loading">加载中...</div>
      <div v-else-if="mailbox.characters.value.length === 0" class="character-mailbox__empty">
        暂无可互动的角色
      </div>
      <div v-else class="character-mailbox__grid">
        <div
          v-for="char in mailbox.characters.value"
          :key="char.id"
          class="character-mailbox__char"
        >
          <div class="character-mailbox__char-info" @click="openDetail(char)">
            <div class="character-mailbox__avatar-wrapper">
              <div class="character-mailbox__avatar">
                <img v-if="char.portraitImagePath" :src="portraitUrl(char.id)" alt="" />
                <span v-else>{{ char.name.charAt(0) }}</span>
              </div>
              <button
                class="character-mailbox__collect-star"
                :class="{ 'is-active': collectedSet.has(char.id) }"
                :disabled="collectingId === char.id"
                title="收藏角色"
                @click.stop="toggleCollect(char)"
              >
                <span v-if="collectingId === char.id">…</span>
                <el-icon v-else-if="collectedSet.has(char.id)"><StarFilled /></el-icon>
                <el-icon v-else><Star /></el-icon>
              </button>
            </div>
            <div class="character-mailbox__char-name">{{ char.name }}</div>
            <div class="character-mailbox__char-role">{{ char.roleLabel }}</div>
          </div>
          <div class="character-mailbox__char-actions">
            <button class="character-mailbox__char-btn" @click="selectCharacter(char)">写信</button>
            <button class="character-mailbox__char-btn character-mailbox__char-btn--chat" @click="openChat(char)">对话</button>
          </div>
        </div>
      </div>
      <div class="character-mailbox__footer">
        <button class="character-mailbox__btn character-mailbox__btn--ghost" @click="showHistory">
          查看信箱
          <span v-if="mailbox.letters.value.length > 0" class="character-mailbox__badge">{{ mailbox.letters.value.length }}</span>
        </button>
        <button class="character-mailbox__btn character-mailbox__btn--ghost" @click="emit('openMoments')">朋友圈</button>
        <button class="character-mailbox__btn character-mailbox__btn--ghost" @click="close">取消</button>
      </div>
    </div>

    <!-- 写信 -->
    <div v-else-if="mode === 'compose'" class="character-mailbox__sheet character-mailbox__sheet--full">
      <div class="character-mailbox__header">
        <button class="character-mailbox__back" @click="mode = 'picker'">返回</button>
        <span class="character-mailbox__title">给 {{ selectedCharacter?.name }} 写信</span>
        <span></span>
      </div>
      <div class="character-mailbox__compose">
        <textarea
          v-model="message"
          class="character-mailbox__textarea"
          placeholder="写下你想问角色的话..."
          maxlength="500"
          :disabled="mailbox.sending.value"
        ></textarea>
        <div class="character-mailbox__count">{{ message.length }}/500</div>
      </div>
      <div class="character-mailbox__hint">可以问角色的动机、感受、秘密...</div>
      <div class="character-mailbox__footer">
        <button class="character-mailbox__btn character-mailbox__btn--ghost" @click="mode = 'picker'" :disabled="mailbox.sending.value">取消</button>
        <button
          class="character-mailbox__btn character-mailbox__btn--primary"
          :disabled="!message.trim() || mailbox.sending.value"
          @click="submit"
        >
          {{ mailbox.sending.value ? '寄出中...' : '寄出' }}
        </button>
      </div>
    </div>

    <!-- 回信展示 -->
    <div v-else-if="mode === 'reply'" class="character-mailbox__sheet character-mailbox__sheet--full">
      <div class="character-mailbox__header">
        <button class="character-mailbox__back" @click="backFromReply">返回</button>
        <span class="character-mailbox__title">来自 {{ replyLetter?.characterName }} 的回信</span>
        <span></span>
      </div>
      <div class="character-mailbox__reply">
        <div class="character-mailbox__reply-avatar">
          <span>{{ replyLetter?.characterName?.charAt(0) }}</span>
        </div>
        <div class="character-mailbox__reply-content">{{ replyLetter?.replyContent }}</div>
      </div>
      <div class="character-mailbox__original">
        <div class="character-mailbox__original-label">你的来信</div>
        <div class="character-mailbox__original-text">{{ replyLetter?.readerMessage }}</div>
      </div>
      <div class="character-mailbox__footer">
        <button class="character-mailbox__btn character-mailbox__btn--ghost" @click="close">关闭</button>
        <button class="character-mailbox__btn character-mailbox__btn--primary" @click="writeAgain">再写一封</button>
      </div>
    </div>

    <!-- 历史信件 -->
    <div v-else-if="mode === 'history'" class="character-mailbox__sheet character-mailbox__sheet--full">
      <div class="character-mailbox__header">
        <button class="character-mailbox__back" @click="mode = 'picker'">返回</button>
        <span class="character-mailbox__title">我的角色信箱</span>
        <span></span>
      </div>
      <div v-if="mailbox.loadingLetters.value" class="character-mailbox__loading">加载中...</div>
      <div v-else-if="mailbox.letters.value.length === 0" class="character-mailbox__empty">
        还没有信件，去给角色写第一封信吧
      </div>
      <div v-else class="character-mailbox__list">
        <div
          v-for="letter in mailbox.letters.value"
          :key="letter.id"
          class="character-mailbox__letter"
        >
          <button
            class="character-mailbox__letter-body"
            @click="viewLetter(letter)"
          >
            <div class="character-mailbox__letter-header">
              <span class="character-mailbox__letter-char">给 {{ letter.characterName }}</span>
              <span class="character-mailbox__letter-time">{{ formatTime(letter.createdAt) }}</span>
            </div>
            <div class="character-mailbox__letter-preview">{{ letter.replyContent.slice(0, 40) }}...</div>
          </button>
          <button
            class="character-mailbox__letter-delete"
            @click.stop="deleteConfirm(letter)"
            :disabled="deletingId === letter.id"
          >
            {{ deletingId === letter.id ? '…' : '删除' }}
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- 角色详情弹层 -->
  <MobileCharacterDetailSheet
    :visible="detailVisible"
    :novel-id="novelId"
    :character-id="detailCharacterId"
    @close="detailVisible = false"
    @character-updated="mailbox.loadCharacters(novelId)"
  />
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { Star, StarFilled } from '@element-plus/icons-vue';
import { useCharacterMailbox } from '../../composables/useCharacterMailbox';
import { toggleCharacterCardCollect, fetchMyCharacterCardCollections } from '../../api/character-cards';
import type { WritableCharacter, LetterRecord } from '../../api/character-mail';
import MobileCharacterDetailSheet from './MobileCharacterDetailSheet.vue';

const props = defineProps<{
  visible: boolean;
  novelId: string;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'openChat', char: WritableCharacter): void;
  (e: 'openMoments'): void;
}>();

const mailbox = useCharacterMailbox();

type Mode = 'picker' | 'compose' | 'reply' | 'history';
const mode = ref<Mode>('picker');
const selectedCharacter = ref<WritableCharacter | null>(null);
const message = ref('');
const replyLetter = ref<LetterRecord | null>(null);
/** 标记回信是否来自新建写信（用于决定返回行为） */
const replyFromCompose = ref(false);
/** 正在删除的信件 ID */
const deletingId = ref('');
/** 角色收藏状态 */
const collectedSet = ref(new Set<string>());
const collectingId = ref('');
/** 详情弹层 */
const detailVisible = ref(false);
const detailCharacterId = ref<string | null>(null);

function openChat(char: WritableCharacter) {
  emit('openChat', char);
}

/** 加载当前用户的角色收藏状态 */
async function loadCollections() {
  try {
    const collections = await fetchMyCharacterCardCollections();
    collectedSet.value = new Set(collections.map((c) => c.characterId));
  } catch {
    collectedSet.value = new Set();
  }
}

/** 收藏/取消收藏角色 */
async function toggleCollect(char: WritableCharacter) {
  collectingId.value = char.id;
  try {
    const result = await toggleCharacterCardCollect({
      characterId: char.id,
      novelId: props.novelId,
      characterName: char.name,
    });
    if (result.collected) {
      collectedSet.value.add(char.id);
    } else {
      collectedSet.value.delete(char.id);
    }
  } catch {
    // 静默失败
  } finally {
    collectingId.value = '';
  }
}

/** 打开角色详情 */
function openDetail(char: WritableCharacter) {
  detailCharacterId.value = char.id;
  detailVisible.value = true;
}

/** 最近 3 封信 */
const recentLetters = computed(() => mailbox.letters.value.slice(0, 3));

// 打开时加载角色列表 + 历史信件
watch(
  () => props.visible,
  (val) => {
    if (val && props.novelId) {
      mode.value = 'picker';
      message.value = '';
      selectedCharacter.value = null;
      replyLetter.value = null;
      replyFromCompose.value = false;
      mailbox.loadCharacters(props.novelId);
      mailbox.loadLetters(props.novelId);
      loadCollections();
    }
  },
);

function close() {
  emit('close');
}

function selectCharacter(char: WritableCharacter) {
  selectedCharacter.value = char;
  message.value = '';
  mode.value = 'compose';
}

async function submit() {
  if (!selectedCharacter.value || !message.value.trim()) return;
  const letter = await mailbox.send(props.novelId, selectedCharacter.value.id, message.value);
  if (letter) {
    replyLetter.value = letter;
    replyFromCompose.value = true;
    mode.value = 'reply';
  }
}

function writeAgain() {
  message.value = '';
  mode.value = 'compose';
}

function showHistory() {
  mode.value = 'history';
}

function viewLetter(letter: LetterRecord) {
  replyLetter.value = letter;
  replyFromCompose.value = false;
  mode.value = 'reply';
}

/** 回信页返回：从写信来的返回选择器，从历史来的返回历史 */
function backFromReply() {
  if (replyFromCompose.value) {
    mode.value = 'picker';
  } else {
    mode.value = 'history';
  }
}

/** 删除信件 */
async function deleteConfirm(letter: LetterRecord) {
  deletingId.value = letter.id;
  const ok = await mailbox.remove(letter.id);
  if (!ok) {
    deletingId.value = '';
  }
}

function portraitUrl(characterId: string): string {
  return `/api/novels/${props.novelId}/characters/${characterId}/portrait?w=200`;
}

function formatTime(ts: number): string {
  const now = Date.now();
  const diff = now - ts;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return `${Math.floor(diff / 86_400_000)} 天前`;
}
</script>

<style scoped>
.character-mailbox {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  color: var(--nw-text-primary);
}
.character-mailbox--fullscreen {
  align-items: stretch;
}
.character-mailbox__sheet {
  width: 100%;
  max-width: 480px;
  background: var(--nw-bg-secondary);
  border-radius: 20px 20px 0 0;
  padding: 16px;
  display: flex;
  flex-direction: column;
  max-height: 85vh;
}
.character-mailbox__sheet--full {
  border-radius: 0;
  max-width: 480px;
  height: 100dvh;
  max-height: 100dvh;
}
.character-mailbox__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--nw-border) 46%, transparent);
  flex-shrink: 0;
}
.character-mailbox__title {
  font-size: 16px;
  font-weight: 600;
  color: var(--nw-text-primary);
}
.character-mailbox__close,
.character-mailbox__back {
  background: none;
  border: none;
  font-size: 14px;
  color: var(--nw-text-secondary);
  cursor: pointer;
  padding: 4px 8px;
}
.character-mailbox__loading,
.character-mailbox__empty {
  padding: 40px 16px;
  text-align: center;
  color: var(--nw-text-muted);
  font-size: 14px;
}

/* 最近来信 */
.character-mailbox__recent {
  margin-bottom: 12px;
  flex-shrink: 0;
}
.character-mailbox__recent-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.character-mailbox__recent-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--nw-text-secondary);
}
.character-mailbox__recent-more {
  border: none;
  background: none;
  font-size: 12px;
  color: var(--mobile-focus-accent);
  cursor: pointer;
  padding: 0;
}
.character-mailbox__recent-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.character-mailbox__recent-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--nw-border) 46%, transparent);
  border-radius: 10px;
  background: var(--mobile-focus-surface-muted);
  cursor: pointer;
  text-align: left;
  width: 100%;
}
.character-mailbox__recent-item:active {
  background: color-mix(in srgb, var(--nw-text-primary) 6%, var(--nw-bg-secondary));
}
.character-mailbox__recent-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--mobile-focus-accent) 14%, var(--nw-bg-secondary));
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
  color: color-mix(in srgb, var(--mobile-focus-accent) 86%, var(--nw-text-primary));
  flex-shrink: 0;
}
.character-mailbox__recent-body {
  flex: 1;
  min-width: 0;
}
.character-mailbox__recent-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 2px;
}
.character-mailbox__recent-char {
  font-size: 13px;
  font-weight: 600;
  color: var(--nw-text-primary);
}
.character-mailbox__recent-time {
  font-size: 11px;
  color: var(--nw-text-muted);
}
.character-mailbox__recent-preview {
  font-size: 12px;
  color: var(--nw-text-secondary);
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.character-mailbox__grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  padding: 16px 0;
  overflow-y: auto;
  flex: 1;
}
.character-mailbox__char {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 12px 8px;
  border: 2px solid transparent;
  border-radius: 12px;
  background: var(--mobile-focus-surface-muted);
  transition: border-color 0.2s;
}
.character-mailbox__char-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}
.character-mailbox__char-info:active {
  opacity: 0.7;
}
.character-mailbox__char-actions {
  display: flex;
  gap: 6px;
  width: 100%;
}
.character-mailbox__char-btn {
  flex: 1;
  padding: 5px 0;
  border: 0;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  background: color-mix(in srgb, var(--mobile-focus-accent) 14%, var(--nw-bg-secondary));
  color: color-mix(in srgb, var(--mobile-focus-accent) 86%, var(--nw-text-primary));
  transition: all 0.15s;
}
.character-mailbox__char-btn:active {
  transform: scale(0.95);
}
.character-mailbox__char-btn--chat {
  background: linear-gradient(135deg, var(--mobile-focus-accent), var(--mobile-focus-accent-strong));
  color: var(--mobile-focus-on-accent);
}
.character-mailbox__avatar {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--mobile-focus-accent) 14%, var(--nw-bg-secondary));
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  font-size: 20px;
  font-weight: 600;
  color: color-mix(in srgb, var(--mobile-focus-accent) 86%, var(--nw-text-primary));
}
.character-mailbox__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.character-mailbox__avatar-wrapper {
  position: relative;
  display: inline-block;
}
.character-mailbox__collect-star {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 50%;
  background: color-mix(in srgb, var(--nw-bg-secondary) 90%, transparent);
  font-size: 14px;
  line-height: 1;
  color: var(--nw-text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 1px 3px color-mix(in srgb, var(--nw-text-primary) 10%, transparent);
  transition: all 0.15s;
}
.character-mailbox__collect-star:active {
  transform: scale(0.9);
}
.character-mailbox__collect-star.is-active {
  background: color-mix(in srgb, var(--mobile-focus-status-gold) 18%, var(--nw-bg-secondary));
  color: var(--mobile-focus-status-gold);
}
.character-mailbox__collect-star:disabled {
  opacity: 0.5;
}
.character-mailbox__char-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--nw-text-primary);
}
.character-mailbox__char-role {
  font-size: 11px;
  color: var(--nw-text-muted);
}
.character-mailbox__compose {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 16px 0;
}
.character-mailbox__textarea {
  flex: 1;
  width: 100%;
  border: 1px solid color-mix(in srgb, var(--nw-border) 70%, transparent);
  border-radius: 12px;
  padding: 12px;
  font-size: 15px;
  line-height: 1.6;
  resize: none;
  outline: none;
  color: var(--nw-text-primary);
  background: var(--nw-bg-secondary);
  font-family: inherit;
}
.character-mailbox__textarea:focus {
  border-color: var(--mobile-focus-accent);
}
.character-mailbox__count {
  text-align: right;
  font-size: 12px;
  color: var(--nw-text-muted);
  margin-top: 4px;
}
.character-mailbox__hint {
  font-size: 12px;
  color: var(--nw-text-muted);
  padding: 4px 0 12px;
}
.character-mailbox__reply {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  background: color-mix(in srgb, var(--mobile-focus-status-gold) 10%, var(--nw-bg-secondary));
  border-radius: 12px;
  margin: 16px 0;
}
.character-mailbox__reply-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--mobile-focus-status-gold) 28%, var(--nw-bg-secondary));
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 600;
  color: color-mix(in srgb, var(--mobile-focus-status-gold) 86%, var(--nw-text-primary));
  margin-bottom: 12px;
}
.character-mailbox__reply-content {
  font-size: 15px;
  line-height: 1.8;
  color: var(--nw-text-primary);
  white-space: pre-wrap;
}
.character-mailbox__original {
  padding: 12px;
  background: var(--mobile-focus-surface-muted);
  border-radius: 8px;
  margin-bottom: 12px;
}
.character-mailbox__original-label {
  font-size: 12px;
  color: var(--nw-text-muted);
  margin-bottom: 4px;
}
.character-mailbox__original-text {
  font-size: 13px;
  color: var(--nw-text-secondary);
  line-height: 1.6;
}
.character-mailbox__list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}
.character-mailbox__letter {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--nw-border) 46%, transparent);
  border-radius: 10px;
  margin-bottom: 8px;
  background: var(--nw-bg-secondary);
}
.character-mailbox__letter-body {
  flex: 1;
  min-width: 0;
  text-align: left;
  border: none;
  background: none;
  padding: 0;
  cursor: pointer;
}
.character-mailbox__letter-body:active {
  opacity: 0.7;
}
.character-mailbox__letter-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}
.character-mailbox__letter-char {
  font-size: 14px;
  font-weight: 600;
  color: var(--nw-text-primary);
}
.character-mailbox__letter-time {
  font-size: 11px;
  color: var(--nw-text-muted);
}
.character-mailbox__letter-preview {
  font-size: 13px;
  color: var(--nw-text-secondary);
  line-height: 1.5;
}
.character-mailbox__letter-delete {
  flex-shrink: 0;
  padding: 6px 10px;
  border: none;
  border-radius: 6px;
  background: color-mix(in srgb, var(--mobile-focus-status-danger) 10%, var(--nw-bg-secondary));
  color: var(--mobile-focus-status-danger);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}
.character-mailbox__letter-delete:active {
  background: color-mix(in srgb, var(--mobile-focus-status-danger) 16%, var(--nw-bg-secondary));
}
.character-mailbox__letter-delete:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.character-mailbox__footer {
  display: flex;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid color-mix(in srgb, var(--nw-border) 46%, transparent);
  flex-shrink: 0;
}
.character-mailbox__btn {
  flex: 1;
  height: 44px;
  border: none;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  position: relative;
}
.character-mailbox__btn--ghost {
  background: var(--mobile-focus-surface-muted);
  color: var(--nw-text-secondary);
}
.character-mailbox__btn--primary {
  background: linear-gradient(135deg, var(--mobile-focus-accent), var(--mobile-focus-accent-strong));
  color: var(--mobile-focus-on-accent);
}
.character-mailbox__btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.character-mailbox__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: var(--mobile-focus-accent);
  color: var(--mobile-focus-on-accent);
  font-size: 11px;
  font-weight: 700;
  margin-left: 4px;
  vertical-align: middle;
}
</style>
