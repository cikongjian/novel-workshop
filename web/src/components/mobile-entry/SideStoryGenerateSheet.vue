<script setup lang="ts">
import { ref, watch, type Component } from 'vue';
import { ElMessage } from 'element-plus';
import { Close, Coffee, EditPen, Film, Key, MagicStick, Reading, Switch as SwitchIcon, User } from '@element-plus/icons-vue';
import { useSideStory } from '../../composables/useSideStory';
import { useSideStoryPermission } from '../../composables/useSideStoryPermission';
import { fetchCharacters } from '../../api/characters';
import type { CharacterProfile } from '../../types';
import type { SideStorySceneType } from '../../api/side-stories';

const props = defineProps<{
  visible: boolean;
  novelId: string;
  preselectCharacterId?: string | null;
}>();

const emit = defineEmits<{
  close: [];
  generated: [storyId: string];
}>();

const sideStory = useSideStory();
const permission = useSideStoryPermission();
const characters = ref<CharacterProfile[]>([]);
const selectedCharacterIds = ref<string[]>([]);
const sceneType = ref<SideStorySceneType>('childhood');
const customScene = ref('');
const wordCount = ref(2000);
const loadingChars = ref(false);

const sceneOptions: { value: SideStorySceneType; label: string; desc: string; icon: Component }[] = [
  { value: 'childhood', label: '角色童年', desc: '回溯成长经历', icon: User },
  { value: 'daily', label: '日常番外', desc: '轻松温馨的日常', icon: Coffee },
  { value: 'what-if', label: '如果线', desc: '不同选择的平行宇宙', icon: SwitchIcon },
  { value: 'prequel', label: '前传故事', desc: '正文之前的事件', icon: Reading },
  { value: 'custom', label: '自定义', desc: '你来设定场景', icon: EditPen },
];

async function loadCharacters() {
  if (!props.novelId) return;
  loadingChars.value = true;
  try {
    const list = await fetchCharacters(props.novelId);
    characters.value = list.filter((c) => c.mailboxEnabled);
  } catch {
    characters.value = [];
  } finally {
    loadingChars.value = false;
  }
}

function toggleCharacter(id: string) {
  const idx = selectedCharacterIds.value.indexOf(id);
  if (idx >= 0) {
    selectedCharacterIds.value.splice(idx, 1);
  } else {
    selectedCharacterIds.value.push(id);
  }
}

function portraitUrl(charId: string): string {
  return `/api/novels/${props.novelId}/characters/${charId}/portrait?w=120`;
}

async function handleGenerate() {
  if (permission.needsLogin.value) {
    ElMessage.warning('请先登录');
    return;
  }
  if (permission.checked.value && !permission.hasApiKey.value) {
    ElMessage.warning('需要在「我的 → API 设置」配置自己的 AI Key 才能生成番外');
    return;
  }
  if (selectedCharacterIds.value.length === 0) {
    ElMessage.warning('请至少选择一个角色');
    return;
  }
  if (sceneType.value === 'custom' && !customScene.value.trim()) {
    ElMessage.warning('请输入自定义场景描述');
    return;
  }

  await sideStory.generate({
    novelId: props.novelId,
    characterIds: selectedCharacterIds.value,
    sceneType: sceneType.value,
    customScene: sceneType.value === 'custom' ? customScene.value.trim() : undefined,
    wordCount: wordCount.value,
  });

  if (!sideStory.error.value) {
    ElMessage.success('番外生成完成！');
    emit('close');
  } else {
    ElMessage.error(sideStory.error.value);
  }
}

function handleClose() {
  if (sideStory.generating.value) return; // 生成中不允许关闭
  emit('close');
}

watch(
  () => props.visible,
  (v) => {
    if (v) {
      void loadCharacters();
      void permission.checkPermission();
      if (props.preselectCharacterId) {
        selectedCharacterIds.value = [props.preselectCharacterId];
      }
    } else {
      selectedCharacterIds.value = [];
      sceneType.value = 'childhood';
      customScene.value = '';
      sideStory.reset();
    }
  },
  { immediate: true },
);
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="side-story-gen-overlay mobile-focus-light-vars">
      <div class="side-story-gen-sheet">
        <!-- 生成中界面 -->
        <div v-if="sideStory.generating.value" class="side-story-gen__generating">
          <span class="side-story-gen__gen-icon">
            <el-icon><Film /></el-icon>
          </span>
          <h3 class="side-story-gen__gen-title">AI 正在创作番外...</h3>
          <div class="side-story-gen__gen-content">
            {{ sideStory.streamingContent.value || '正在构思故事...' }}
          </div>
          <div class="side-story-gen__gen-loading">
            <span class="side-story-gen__dot"></span>
            <span class="side-story-gen__dot"></span>
            <span class="side-story-gen__dot"></span>
          </div>
        </div>

        <!-- 配置界面 -->
        <div v-else class="side-story-gen__form">
          <div class="side-story-gen__header">
            <h3 class="side-story-gen__title">
              <span class="side-story-gen__title-icon">
                <el-icon><Film /></el-icon>
              </span>
              <span>生成番外</span>
            </h3>
            <button class="side-story-gen__close" @click="handleClose">
              <el-icon><Close /></el-icon>
            </button>
          </div>

          <!-- 权限不足提示 -->
          <div v-if="permission.needsLogin.value || (permission.checked.value && !permission.hasApiKey.value)" class="side-story-gen__permission">
            <span class="side-story-gen__permission-icon">
              <el-icon><Key /></el-icon>
            </span>
            <p v-if="permission.needsLogin.value" class="side-story-gen__permission-text">
              登录后即可用你自己的 AI Key 生成番外
            </p>
            <p v-else class="side-story-gen__permission-text">
              生成番外需要配置自己的 AI Key<br>请先在「我的 → API 设置」中添加
            </p>
          </div>

          <!-- 表单内容 -->
          <template v-else>
          <div class="side-story-gen__body">
            <!-- 角色选择 -->
            <div class="side-story-gen__section">
              <label class="side-story-gen__label">选择角色</label>
              <div v-if="loadingChars" class="side-story-gen__loading">加载角色中...</div>
              <div v-else-if="characters.length === 0" class="side-story-gen__empty">
                暂无可选角色
              </div>
              <div v-else class="side-story-gen__chars">
                <button
                  v-for="char in characters"
                  :key="char.id"
                  class="side-story-gen__char"
                  :class="{ 'side-story-gen__char--active': selectedCharacterIds.includes(char.id) }"
                  @click="toggleCharacter(char.id)"
                >
                  <div class="side-story-gen__char-avatar">
                    <img v-if="char.portraitImagePath" :src="portraitUrl(char.id)" alt="" />
                    <span v-else>{{ char.name.charAt(0) }}</span>
                  </div>
                  <span class="side-story-gen__char-name">{{ char.name }}</span>
                </button>
              </div>
            </div>

            <!-- 场景类型 -->
            <div class="side-story-gen__section">
              <label class="side-story-gen__label">场景类型</label>
              <div class="side-story-gen__scenes">
                <button
                  v-for="opt in sceneOptions"
                  :key="opt.value"
                  class="side-story-gen__scene"
                  :class="{ 'side-story-gen__scene--active': sceneType === opt.value }"
                  @click="sceneType = opt.value"
                >
                  <span class="side-story-gen__scene-icon">
                    <el-icon><component :is="opt.icon" /></el-icon>
                  </span>
                  <span class="side-story-gen__scene-label">{{ opt.label }}</span>
                  <span class="side-story-gen__scene-desc">{{ opt.desc }}</span>
                </button>
              </div>
            </div>

            <!-- 自定义场景 -->
            <div v-if="sceneType === 'custom'" class="side-story-gen__section">
              <label class="side-story-gen__label">场景描述</label>
              <textarea
                v-model="customScene"
                class="side-story-gen__textarea"
                placeholder="描述你想要的场景，如：角色在雨夜相遇..."
                rows="3"
              />
            </div>

            <!-- 字数 -->
            <div class="side-story-gen__section">
              <label class="side-story-gen__label">字数</label>
              <div class="side-story-gen__wordcount">
                <button
                  v-for="wc in [1500, 2000, 3000]"
                  :key="wc"
                  class="side-story-gen__wc-btn"
                  :class="{ 'side-story-gen__wc-btn--active': wordCount === wc }"
                  @click="wordCount = wc"
                >
                  {{ wc }} 字
                </button>
              </div>
            </div>
          </div>

          <!-- 底部按钮 -->
          <div class="side-story-gen__footer">
            <button
              class="side-story-gen__submit"
              :disabled="selectedCharacterIds.length === 0"
              @click="handleGenerate"
            >
              <el-icon><MagicStick /></el-icon>
              <span>生成番外</span>
            </button>
          </div>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.side-story-gen-overlay {
  position: fixed;
  inset: 0;
  z-index: 3200;
  background: color-mix(in srgb, var(--nw-text-primary) 50%, transparent);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.side-story-gen-sheet {
  background: var(--nw-bg-secondary);
  border-radius: 20px 20px 0 0;
  width: 100%;
  max-width: 540px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 生成中 */
.side-story-gen__generating {
  padding: 40px 24px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.side-story-gen__gen-icon {
  width: 56px;
  height: 56px;
  border-radius: 18px;
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, color-mix(in srgb, var(--mobile-focus-accent) 18%, var(--nw-bg-secondary)), color-mix(in srgb, var(--mobile-focus-accent-strong) 14%, var(--nw-bg-secondary)));
  color: color-mix(in srgb, var(--mobile-focus-accent) 88%, var(--nw-text-primary));
  font-size: 26px;
}

.side-story-gen__gen-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--nw-text-primary);
  margin: 0;
}

.side-story-gen__gen-content {
  width: 100%;
  max-height: 300px;
  overflow-y: auto;
  text-align: left;
  font-size: 14px;
  line-height: 1.8;
  color: var(--nw-text-secondary);
  padding: 16px;
  background: var(--mobile-focus-surface-muted);
  border-radius: 12px;
  white-space: pre-wrap;
}

.side-story-gen__gen-loading {
  display: flex;
  gap: 6px;
}

.side-story-gen__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--mobile-focus-accent);
  animation: gen-bounce 1s infinite ease-in-out;
}

.side-story-gen__dot:nth-child(2) { animation-delay: 0.15s; }
.side-story-gen__dot:nth-child(3) { animation-delay: 0.3s; }

@keyframes gen-bounce {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
  30% { transform: translateY(-8px); opacity: 1; }
}

/* 表单 */
.side-story-gen__form {
  display: flex;
  flex-direction: column;
  max-height: 90vh;
}

/* 权限不足提示 */
.side-story-gen__permission {
  padding: 48px 24px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.side-story-gen__permission-icon {
  width: 56px;
  height: 56px;
  border-radius: 18px;
  display: grid;
  place-items: center;
  background: color-mix(in srgb, var(--mobile-focus-accent) 12%, var(--nw-bg-secondary));
  color: color-mix(in srgb, var(--mobile-focus-accent) 88%, var(--nw-text-primary));
  font-size: 26px;
}

.side-story-gen__permission-text {
  margin: 0;
  font-size: 15px;
  line-height: 1.8;
  color: var(--nw-text-muted);
}

.side-story-gen__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid color-mix(in srgb, var(--nw-border) 46%, transparent);
  flex-shrink: 0;
}

.side-story-gen__title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 18px;
  font-weight: 700;
  color: var(--nw-text-primary);
  margin: 0;
}

.side-story-gen__title-icon {
  width: 28px;
  height: 28px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  background: color-mix(in srgb, var(--mobile-focus-accent) 12%, var(--nw-bg-secondary));
  color: color-mix(in srgb, var(--mobile-focus-accent) 88%, var(--nw-text-primary));
}

.side-story-gen__close {
  width: 32px;
  height: 32px;
  border: 0;
  background: transparent;
  cursor: pointer;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--nw-text-muted);
}

.side-story-gen__close:hover {
  background: color-mix(in srgb, var(--nw-text-primary) 5%, transparent);
}

.side-story-gen__body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}

.side-story-gen__section {
  margin-bottom: 20px;
}

.side-story-gen__label {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: var(--nw-text-secondary);
  margin-bottom: 10px;
}

.side-story-gen__loading,
.side-story-gen__empty {
  padding: 20px;
  text-align: center;
  color: var(--nw-text-muted);
  font-size: 14px;
}

/* 角色选择 */
.side-story-gen__chars {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  padding-bottom: 4px;
}

.side-story-gen__char {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 10px;
  border: 2px solid color-mix(in srgb, var(--nw-border) 58%, transparent);
  border-radius: 12px;
  background: var(--mobile-focus-surface);
  cursor: pointer;
  min-width: 72px;
  transition: all 0.15s;
}

.side-story-gen__char--active {
  border-color: var(--mobile-focus-accent);
  background: color-mix(in srgb, var(--mobile-focus-accent) 12%, var(--nw-bg-secondary));
}

.side-story-gen__char-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  overflow: hidden;
  background: linear-gradient(135deg, var(--mobile-focus-accent), var(--mobile-focus-accent-strong));
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--mobile-focus-on-accent);
  font-weight: 600;
}

.side-story-gen__char-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.side-story-gen__char-name {
  font-size: 12px;
  color: var(--nw-text-secondary);
  font-weight: 500;
}

/* 场景选择 */
.side-story-gen__scenes {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.side-story-gen__scene {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 12px;
  border: 2px solid color-mix(in srgb, var(--nw-border) 58%, transparent);
  border-radius: 12px;
  background: var(--mobile-focus-surface);
  cursor: pointer;
  text-align: left;
  transition: all 0.15s;
}

.side-story-gen__scene--active {
  border-color: var(--mobile-focus-accent);
  background: color-mix(in srgb, var(--mobile-focus-accent) 12%, var(--nw-bg-secondary));
}

.side-story-gen__scene-icon {
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  color: color-mix(in srgb, var(--mobile-focus-accent) 88%, var(--nw-text-primary));
  font-size: 18px;
}

.side-story-gen__scene-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--nw-text-primary);
}

.side-story-gen__scene-desc {
  font-size: 11px;
  color: var(--nw-text-muted);
}

/* 自定义输入 */
.side-story-gen__textarea {
  width: 100%;
  border: 1px solid color-mix(in srgb, var(--nw-border) 58%, transparent);
  border-radius: 12px;
  padding: 12px;
  font-size: 14px;
  color: var(--nw-text-primary);
  resize: none;
  outline: none;
  font-family: inherit;
  background: var(--mobile-focus-surface-muted);
}

.side-story-gen__textarea:focus {
  border-color: var(--mobile-focus-accent);
  background: var(--nw-bg-secondary);
}

/* 字数 */
.side-story-gen__wordcount {
  display: flex;
  gap: 8px;
}

.side-story-gen__wc-btn {
  flex: 1;
  padding: 10px;
  border: 2px solid color-mix(in srgb, var(--nw-border) 58%, transparent);
  border-radius: 10px;
  background: var(--mobile-focus-surface);
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  color: var(--nw-text-muted);
  transition: all 0.15s;
}

.side-story-gen__wc-btn--active {
  border-color: var(--mobile-focus-accent);
  background: color-mix(in srgb, var(--mobile-focus-accent) 12%, var(--nw-bg-secondary));
  color: color-mix(in srgb, var(--mobile-focus-accent) 88%, var(--nw-text-primary));
}

/* 底部 */
.side-story-gen__footer {
  padding: 12px 20px;
  border-top: 1px solid color-mix(in srgb, var(--nw-border) 46%, transparent);
  padding-bottom: max(12px, env(safe-area-inset-bottom));
}

.side-story-gen__submit {
  width: 100%;
  padding: 14px;
  border: 0;
  border-radius: 14px;
  background: linear-gradient(135deg, var(--mobile-focus-accent), var(--mobile-focus-accent-strong));
  color: var(--mobile-focus-on-accent);
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: all 0.15s;
}

.side-story-gen__submit:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.side-story-gen__submit:not(:disabled):active {
  transform: scale(0.98);
}
</style>
