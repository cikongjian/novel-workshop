<template>
  <div v-if="visible" class="interactive-setup mobile-focus-light-vars">
    <div class="interactive-setup__backdrop" @click="close" />
    <div class="interactive-setup__panel">
      <div class="interactive-setup__header">
        <span class="interactive-setup__title">互动连载设置</span>
        <button class="interactive-setup__close" @click="close">关闭</button>
      </div>

      <div class="interactive-setup__body">
        <!-- 已开启：显示当前配置 + 控制按钮 -->
        <template v-if="config?.enabled">
          <!-- 阶段状态 -->
          <div class="interactive-setup__status" :class="`interactive-setup__status--${config.phase}`">
            <span class="interactive-setup__status-dot" />
            <span class="interactive-setup__status-text">{{ phaseLabel }}</span>
          </div>

          <!-- idle 阶段：启动第一轮按钮 -->
          <div v-if="config.phase === 'idle'" class="interactive-setup__idle-cta">
            <p class="interactive-setup__idle-tip">已就绪，点击下方按钮开启第一轮自动连载</p>
            <button
              class="interactive-setup__btn interactive-setup__btn--accent"
              :disabled="submitting"
              @click="start"
            >{{ submitting ? '启动中...' : '启动第一轮连载' }}</button>
          </div>

          <!-- 配置参数（可修改） -->
          <div class="interactive-setup__field">
            <label class="interactive-setup__label">每轮发布章节数</label>
            <div class="interactive-setup__seg">
              <button
                v-for="n in [1, 2, 3]"
                :key="n"
                class="interactive-setup__seg-btn"
                :class="{ 'interactive-setup__seg-btn--active': form.chaptersPerRound === n }"
                :disabled="submitting"
                @click="form.chaptersPerRound = n"
              >{{ n }} 章</button>
            </div>
          </div>

          <div class="interactive-setup__field">
            <label class="interactive-setup__label">投票持续时长</label>
            <div class="interactive-setup__seg">
              <button
                v-for="h in [12, 24, 48, 72]"
                :key="h"
                class="interactive-setup__seg-btn"
                :class="{ 'interactive-setup__seg-btn--active': form.voteDurationHours === h }"
                :disabled="submitting"
                @click="form.voteDurationHours = h"
              >{{ h }} 小时</button>
            </div>
          </div>

          <div class="interactive-setup__field">
            <label class="interactive-setup__label">最低推进票数</label>
            <p class="interactive-setup__hint">投票截止时总票数低于此值将暂停推进</p>
            <input
              v-model.number="form.minVotesToAdvance"
              type="number"
              min="0"
              max="100"
              class="interactive-setup__input"
              :disabled="submitting"
            />
          </div>

          <!-- 修改提示 -->
          <p v-if="dirty" class="interactive-setup__dirty-tip">配置已修改，点击下方保存生效</p>

          <!-- 错误提示 -->
          <div v-if="error" class="interactive-setup__error">{{ error }}</div>

          <!-- 操作按钮 -->
          <div class="interactive-setup__footer">
            <button
              v-if="dirty"
              class="interactive-setup__btn interactive-setup__btn--primary"
              :disabled="submitting"
              @click="saveConfig"
            >{{ submitting ? '保存中...' : '保存配置' }}</button>

            <button
              v-if="config.paused"
              class="interactive-setup__btn interactive-setup__btn--accent"
              :disabled="submitting"
              @click="resume"
            >恢复自动推进</button>
            <button
              v-else
              class="interactive-setup__btn interactive-setup__btn--ghost"
              :disabled="submitting"
              @click="pause"
            >暂停推进</button>

            <button
              class="interactive-setup__btn interactive-setup__btn--danger"
              :disabled="submitting"
              @click="disable"
            >关闭互动模式</button>
          </div>
        </template>

        <!-- 未开启：引导开启 -->
        <template v-else>
          <div class="interactive-setup__intro">
            <p class="interactive-setup__intro-title">让读者决定剧情走向</p>
            <p class="interactive-setup__intro-desc">
              开启后，系统按下方节奏自动发布章节，并在每轮末尾由 AI 生成剧情走向投票。
              读者投票决定下一章走向，达到票数阈值则自动推进，无人投票则停留等待。
            </p>
          </div>

          <div class="interactive-setup__field">
            <label class="interactive-setup__label">每轮发布章节数</label>
            <div class="interactive-setup__seg">
              <button
                v-for="n in [1, 2, 3]"
                :key="n"
                class="interactive-setup__seg-btn"
                :class="{ 'interactive-setup__seg-btn--active': form.chaptersPerRound === n }"
                @click="form.chaptersPerRound = n"
              >{{ n }} 章</button>
            </div>
          </div>

          <div class="interactive-setup__field">
            <label class="interactive-setup__label">投票持续时长</label>
            <div class="interactive-setup__seg">
              <button
                v-for="h in [12, 24, 48, 72]"
                :key="h"
                class="interactive-setup__seg-btn"
                :class="{ 'interactive-setup__seg-btn--active': form.voteDurationHours === h }"
                @click="form.voteDurationHours = h"
              >{{ h }} 小时</button>
            </div>
          </div>

          <div class="interactive-setup__field">
            <label class="interactive-setup__label">最低推进票数</label>
            <p class="interactive-setup__hint">投票截止时总票数低于此值将暂停推进</p>
            <input
              v-model.number="form.minVotesToAdvance"
              type="number"
              min="0"
              max="100"
              class="interactive-setup__input"
            />
          </div>

          <div v-if="error" class="interactive-setup__error">{{ error }}</div>

          <div class="interactive-setup__footer">
            <button class="interactive-setup__btn interactive-setup__btn--ghost" @click="close">取消</button>
            <button
              class="interactive-setup__btn interactive-setup__btn--primary"
              :disabled="submitting"
              @click="enable"
            >{{ submitting ? '开启中...' : '开启互动连载' }}</button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, toRef, watch } from 'vue';
import type { Ref } from 'vue';
import { useInteractiveNovel } from '../../composables/useInteractiveNovel';

const props = defineProps<{
  visible: boolean;
  novelId: string;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'changed'): void;
}>();

const novelIdRef = toRef(props, 'novelId') as Ref<string>;
const { config, loading, submitting, error, loadConfig, enable: doEnable, disable: doDisable, updateParams, pause: doPause, resume: doResume, start: doStart } =
  useInteractiveNovel(novelIdRef);

const form = reactive({
  chaptersPerRound: 1,
  voteDurationHours: 24,
  minVotesToAdvance: 3,
});

// 打开时加载配置
watch(
  () => props.visible,
  async (v) => {
    if (v && props.novelId) {
      await loadConfig();
      syncFormFromConfig();
    }
  },
  { immediate: true },
);

function syncFormFromConfig() {
  if (config.value) {
    form.chaptersPerRound = config.value.chaptersPerRound;
    form.voteDurationHours = config.value.voteDurationHours;
    form.minVotesToAdvance = config.value.minVotesToAdvance;
  }
}

const dirty = computed(() => {
  if (!config.value) return false;
  return (
    form.chaptersPerRound !== config.value.chaptersPerRound ||
    form.voteDurationHours !== config.value.voteDurationHours ||
    form.minVotesToAdvance !== config.value.minVotesToAdvance
  );
});

const phaseLabel = computed(() => {
  const phase = config.value?.phase;
  if (!phase) return '';
  const labels: Record<string, string> = {
    idle: '等待启动',
    generating: '正在生成本轮章节',
    publishing: '正在发布章节',
    vote_open: '投票进行中',
    vote_closing: '投票截止，正在计票',
    advancing: '已采纳走向，准备下一轮',
    stalled: '票数不足，暂停推进',
  };
  return labels[phase] ?? phase;
});

function close() {
  emit('close');
}

async function enable() {
  const ok = await doEnable({
    chaptersPerRound: form.chaptersPerRound,
    voteDurationHours: form.voteDurationHours,
    minVotesToAdvance: form.minVotesToAdvance,
  });
  if (ok) emit('changed');
}

async function saveConfig() {
  const ok = await updateParams({
    chaptersPerRound: form.chaptersPerRound,
    voteDurationHours: form.voteDurationHours,
    minVotesToAdvance: form.minVotesToAdvance,
  });
  if (ok) emit('changed');
}

async function disable() {
  const ok = await doDisable();
  if (ok) emit('changed');
}

async function pause() {
  const ok = await doPause();
  if (ok) emit('changed');
}

async function resume() {
  const ok = await doResume();
  if (ok) emit('changed');
}

async function start() {
  const ok = await doStart();
  if (ok) emit('changed');
}
</script>

<style scoped>
.interactive-setup {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.interactive-setup__backdrop {
  position: absolute;
  inset: 0;
  background: color-mix(in srgb, var(--nw-text-primary) 45%, transparent);
  backdrop-filter: blur(2px);
}

.interactive-setup__panel {
  position: relative;
  width: 100%;
  max-width: 480px;
  max-height: 85vh;
  background: var(--nw-bg-secondary);
  border-radius: 20px 20px 0 0;
  display: flex;
  flex-direction: column;
  animation: interactive-setup-slide-up 0.25s ease;
}

@keyframes interactive-setup-slide-up {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}

.interactive-setup__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid color-mix(in srgb, var(--nw-border) 46%, transparent);
}

.interactive-setup__title {
  font-size: 16px;
  font-weight: 600;
  color: var(--nw-text-primary);
}

.interactive-setup__close {
  background: none;
  border: none;
  color: var(--nw-text-muted);
  font-size: 14px;
  padding: 4px 8px;
  cursor: pointer;
}

.interactive-setup__body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}

.interactive-setup__status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 12px;
  margin-bottom: 20px;
  background: color-mix(in srgb, var(--mobile-focus-accent) 12%, var(--nw-bg-secondary));
  color: color-mix(in srgb, var(--mobile-focus-accent) 88%, var(--nw-text-primary));
  font-size: 13px;
}

.interactive-setup__status--stalled {
  background: color-mix(in srgb, var(--mobile-focus-status-gold) 14%, var(--nw-bg-secondary));
  color: color-mix(in srgb, var(--mobile-focus-status-gold) 86%, var(--nw-text-primary));
}

.interactive-setup__status--vote_open {
  background: color-mix(in srgb, var(--mobile-focus-status-success) 12%, var(--nw-bg-secondary));
  color: color-mix(in srgb, var(--mobile-focus-status-success) 86%, var(--nw-text-primary));
}

.interactive-setup__status--generating,
.interactive-setup__status--publishing {
  background: color-mix(in srgb, var(--mobile-focus-accent) 12%, var(--nw-bg-secondary));
  color: color-mix(in srgb, var(--mobile-focus-accent) 88%, var(--nw-text-primary));
}

.interactive-setup__idle-cta {
  margin-bottom: 20px;
  padding: 16px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--mobile-focus-status-success) 10%, var(--nw-bg-secondary)), color-mix(in srgb, var(--mobile-focus-accent) 10%, var(--nw-bg-secondary)));
  border-radius: 14px;
  text-align: center;
}

.interactive-setup__idle-tip {
  margin: 0 0 12px;
  font-size: 13px;
  color: color-mix(in srgb, var(--mobile-focus-status-success) 86%, var(--nw-text-primary));
  line-height: 1.5;
}

.interactive-setup__status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
  animation: interactive-setup-pulse 1.5s ease-in-out infinite;
}

@keyframes interactive-setup-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.interactive-setup__field {
  margin-bottom: 18px;
}

.interactive-setup__label {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: var(--nw-text-secondary);
  margin-bottom: 8px;
}

.interactive-setup__hint {
  font-size: 12px;
  color: var(--nw-text-muted);
  margin: -4px 0 8px;
}

.interactive-setup__seg {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.interactive-setup__seg-btn {
  flex: 1;
  min-width: 64px;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--nw-border) 58%, transparent);
  background: var(--mobile-focus-surface);
  border-radius: 10px;
  font-size: 13px;
  color: var(--nw-text-secondary);
  cursor: pointer;
  transition: all 0.15s;
}

.interactive-setup__seg-btn--active {
  border-color: var(--mobile-focus-accent);
  background: color-mix(in srgb, var(--mobile-focus-accent) 12%, var(--nw-bg-secondary));
  color: color-mix(in srgb, var(--mobile-focus-accent) 88%, var(--nw-text-primary));
  font-weight: 600;
}

.interactive-setup__input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--nw-border) 58%, transparent);
  border-radius: 10px;
  font-size: 14px;
  color: var(--nw-text-primary);
  background: var(--nw-bg-secondary);
  box-sizing: border-box;
}

.interactive-setup__intro {
  margin-bottom: 20px;
  padding: 16px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--mobile-focus-accent) 10%, var(--nw-bg-secondary)), color-mix(in srgb, var(--mobile-focus-status-success) 10%, var(--nw-bg-secondary)));
  border-radius: 14px;
}

.interactive-setup__intro-title {
  margin: 0 0 8px;
  font-size: 15px;
  font-weight: 600;
  color: color-mix(in srgb, var(--mobile-focus-accent) 88%, var(--nw-text-primary));
}

.interactive-setup__intro-desc {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--nw-text-secondary);
}

.interactive-setup__dirty-tip {
  margin: 0 0 12px;
  padding: 8px 12px;
  background: color-mix(in srgb, var(--mobile-focus-status-gold) 12%, var(--nw-bg-secondary));
  color: color-mix(in srgb, var(--mobile-focus-status-gold) 86%, var(--nw-text-primary));
  font-size: 12px;
  border-radius: 8px;
}

.interactive-setup__error {
  margin: 0 0 12px;
  padding: 10px 12px;
  background: color-mix(in srgb, var(--mobile-focus-status-danger) 10%, var(--nw-bg-secondary));
  color: color-mix(in srgb, var(--mobile-focus-status-danger) 86%, var(--nw-text-primary));
  font-size: 13px;
  border-radius: 8px;
}

.interactive-setup__footer {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 8px;
}

.interactive-setup__btn {
  flex: 1;
  min-width: 100px;
  padding: 12px 16px;
  border: none;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.15s;
}

.interactive-setup__btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.interactive-setup__btn--primary {
  background: linear-gradient(135deg, var(--mobile-focus-accent), color-mix(in srgb, var(--mobile-focus-accent) 86%, var(--nw-text-primary)));
  color: var(--mobile-focus-on-accent);
}

.interactive-setup__btn--accent {
  background: linear-gradient(135deg, var(--mobile-focus-status-success), color-mix(in srgb, var(--mobile-focus-status-success) 78%, var(--nw-text-primary)));
  color: var(--mobile-focus-on-accent);
}

.interactive-setup__btn--ghost {
  background: var(--mobile-focus-surface-muted);
  color: var(--nw-text-secondary);
}

.interactive-setup__btn--danger {
  background: color-mix(in srgb, var(--mobile-focus-status-danger) 10%, var(--nw-bg-secondary));
  color: var(--mobile-focus-status-danger);
}
</style>
