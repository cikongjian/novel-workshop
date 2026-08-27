<script setup lang="ts">
import { computed, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { RefreshRight, MagicStick } from '@element-plus/icons-vue';
import { chat } from '../../api';
import { GENRE_LABELS, type NovelGenre } from '../../types';
import { extractApiErrorMessage, isRecoverableLongRunningRequestError } from '../../utils/api-error';
import {
  buildIdeaKickstartPrompt,
  normalizeBookTitle,
  parseIdeaKickstartPayload,
  type IdeaKickstartCard,
} from '../../utils/idea-kickstart';

interface Props {
  title: string;
  genre: NovelGenre;
  synopsis: string;
  seedIdea: string;
  mode?: 'desktop' | 'mobile';
}

type ChatUsage = {
  inputTokens?: number;
  outputTokens?: number;
};

const IDEA_MAX_TOKENS = 2200;

const props = withDefaults(defineProps<Props>(), {
  mode: 'desktop',
});

const emit = defineEmits<{
  (e: 'update:title', value: string): void;
  (e: 'update:synopsis', value: string): void;
  (e: 'update:seedIdea', value: string): void;
}>();

const loading = ref(false);
const errorText = ref('');
const ideas = ref<IdeaKickstartCard[]>([]);
const generatedAt = ref('');

const panelModeClass = computed(() => `idea-kickstart--${props.mode}`);
const genreLabel = computed(() => GENRE_LABELS[props.genre] ?? props.genre);
const hasIdeaContext = computed(() => (
  props.seedIdea.trim().length > 0 || props.synopsis.trim().length > 0 || props.title.trim().length > 0
));

const sourceSummary = computed(() => {
  const parts: string[] = [];
  if (props.title.trim()) parts.push(`标题：${props.title.trim()}`);
  if (props.synopsis.trim()) parts.push(`简介：${props.synopsis.trim().slice(0, 40)}`);
  if (props.seedIdea.trim()) parts.push(`想法：${props.seedIdea.trim().slice(0, 50)}`);
  if (parts.length === 0) return '没输入也能生成，按当前题材给你开书脑洞';
  return parts.join(' ｜ ');
});

function isIdeaRequestTimeout(error: unknown): boolean {
  const message = extractApiErrorMessage(error, '').toLowerCase();
  return message.includes('timeout')
    || message.includes('timed out')
    || message.includes('超时')
    || message.includes('aborted')
    || message.includes('gateway time-out')
    || message.includes('gateway timeout')
    || message.includes('504')
    || isRecoverableLongRunningRequestError(error);
}

function buildIdeaFailureMessage(error: unknown): string {
  if (isIdeaRequestTimeout(error)) {
    return '脑洞生成在等待返回结果时被中断了。常见原因是 60 秒网关超时或模型响应过慢。已保留当前输入，请稍后重试；如果持续复现，请调大 `/api/generate/chat` 的代理超时。';
  }
  return extractApiErrorMessage(error, '生成失败，请稍后重试');
}

function buildRequestMessage(forceFresh: boolean): string {
  const prompt = buildIdeaKickstartPrompt({
    title: props.title,
    genre: props.genre,
    synopsis: props.synopsis,
    seedIdea: props.seedIdea,
  });

  if (!forceFresh || ideas.value.length === 0) return prompt;

  const previousIdeas = ideas.value
    .map(item => `${item.label}：${item.title}｜${item.hook}`)
    .join('\n');

  return [
    prompt,
    '',
    '补充要求：请和上一轮明显不同，不要重复以下方案。',
    previousIdeas,
  ].join('\n');
}

async function generateIdeas(forceFresh = false) {
  if (loading.value) return;

  loading.value = true;
  errorText.value = '';
  try {
    const { reply, usage } = await chat({
      message: buildRequestMessage(forceFresh),
      // Keep the browser waiting slightly longer than the backend model timeout,
      // otherwise the client can drop a nearly-finished response first.
      timeout: 330_000,
      maxTokens: IDEA_MAX_TOKENS,
      temperature: 0.85,
    });
    const parsed = parseIdeaKickstartPayload(reply);
    if (!parsed?.ideas.length) {
      const outputTokens = (usage as ChatUsage | undefined)?.outputTokens ?? 0;
      if (outputTokens >= IDEA_MAX_TOKENS) {
        throw new Error('AI 返回被截断，脑洞方案没生成完整。已自动放宽上限；如果还复现，继续点一次通常会恢复。');
      }
      throw new Error('AI 返回格式不可解析');
    }
    ideas.value = parsed.ideas;
    generatedAt.value = new Date().toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (err) {
    const failureMessage = buildIdeaFailureMessage(err);
    if (isIdeaRequestTimeout(err)) {
      errorText.value = failureMessage;
      ElMessage.warning(failureMessage);
    } else {
      errorText.value = failureMessage;
      ElMessage.error(failureMessage);
    }
  } finally {
    loading.value = false;
  }
}

function applyIdea(card: IdeaKickstartCard) {
  emit('update:title', normalizeBookTitle(card.title));
  emit('update:synopsis', card.synopsis);
  emit('update:seedIdea', card.seedIdea);
  ElMessage.success('已填入书名、简介和开书提示');
}

function applySeedIdea(card: IdeaKickstartCard) {
  emit('update:seedIdea', card.seedIdea);
  ElMessage.success('已填入开书提示');
}
</script>

<template>
  <section class="idea-kickstart" :class="panelModeClass">
    <div class="idea-kickstart__head">
      <div>
        <div class="idea-kickstart__eyebrow">
          <el-icon><MagicStick /></el-icon>
          <span>脑洞开书助手</span>
        </div>
        <h3>一键生成开书方案</h3>
      </div>

      <div class="idea-kickstart__actions">
        <button
          class="idea-kickstart__action idea-kickstart__action--primary"
          type="button"
          :disabled="loading"
          @click="generateIdeas(false)"
        >
          {{ loading ? '生成中...' : (hasIdeaContext ? '拓展当前脑洞' : '直接给我脑洞') }}
        </button>
        <button
          class="idea-kickstart__action"
          type="button"
          :disabled="loading || ideas.length === 0"
          @click="generateIdeas(true)"
        >
          <el-icon><RefreshRight /></el-icon>
          <span>换一批</span>
        </button>
      </div>
    </div>

    <div class="idea-kickstart__meta">
      <span class="idea-kickstart__tag">{{ genreLabel }}</span>
      <span>{{ sourceSummary }}</span>
      <span v-if="generatedAt">最近生成：{{ generatedAt }}</span>
    </div>

    <p v-if="errorText" class="idea-kickstart__error">{{ errorText }}</p>

    <div v-if="ideas.length === 0" class="idea-kickstart__empty">
      <span>填一句开局、人设或卖点，AI 帮你扩成完整开书方案。</span>
    </div>

    <div v-else class="idea-kickstart__grid">
      <article
        v-for="(card, index) in ideas"
        :key="card.key"
        class="idea-kickstart__card"
        :style="{ animationDelay: `${index * 0.25}s` }"
      >
        <div class="idea-kickstart__card-head">
          <span class="idea-kickstart__card-label">{{ card.label }}</span>
          <strong>{{ card.title }}</strong>
        </div>

        <p v-if="card.hook" class="idea-kickstart__hook">{{ card.hook }}</p>
        <p class="idea-kickstart__synopsis">{{ card.synopsis }}</p>

        <dl class="idea-kickstart__facts">
          <div v-if="card.protagonist">
            <dt>主角</dt>
            <dd>{{ card.protagonist }}</dd>
          </div>
          <div v-if="card.world">
            <dt>设定</dt>
            <dd>{{ card.world }}</dd>
          </div>
          <div v-if="card.conflict">
            <dt>冲突</dt>
            <dd>{{ card.conflict }}</dd>
          </div>
          <div v-if="card.opening">
            <dt>开篇</dt>
            <dd>{{ card.opening }}</dd>
          </div>
        </dl>

        <p v-if="card.whyItCanPop" class="idea-kickstart__pop-reason">
          爆点理由：{{ card.whyItCanPop }}
        </p>

        <div class="idea-kickstart__seed">
          <span>推荐开书提示</span>
          <p>{{ card.seedIdea }}</p>
        </div>

        <div class="idea-kickstart__card-actions">
          <button class="idea-kickstart__card-btn idea-kickstart__card-btn--primary" type="button" @click="applyIdea(card)">
            采用整套
          </button>
          <button class="idea-kickstart__card-btn" type="button" @click="applySeedIdea(card)">
            只填开书提示
          </button>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.idea-kickstart {
  display: grid;
  gap: 14px;
  width: 100%;
  min-width: 0;
  padding: 16px;
  box-sizing: border-box;
  border: 1px solid color-mix(in srgb, var(--el-color-primary) 12%, var(--el-border-color));
  border-radius: 18px;
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--el-color-primary) 10%, transparent), transparent 30%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(248, 250, 252, 0.98));
}

.idea-kickstart--mobile {
  padding: 14px;
  border-radius: 20px;
  border-color: color-mix(in srgb, var(--star-brand-sky) 18%, var(--nw-border));
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--star-brand-sky) 12%, transparent), transparent 34%),
    linear-gradient(180deg, var(--nw-bg-secondary), var(--nw-bg-primary));
}

.idea-kickstart--mobile .idea-kickstart__eyebrow {
  background: color-mix(in srgb, var(--star-brand-sky) 10%, var(--nw-bg-secondary));
  color: var(--star-brand-sky);
}

.idea-kickstart--mobile .idea-kickstart__head h3 {
  color: var(--nw-text-primary);
}

.idea-kickstart--mobile .idea-kickstart__head p {
  color: var(--nw-text-secondary);
}

.idea-kickstart--mobile .idea-kickstart__action,
.idea-kickstart--mobile .idea-kickstart__card-btn {
  background: var(--nw-bg-secondary);
  border-color: color-mix(in srgb, var(--star-brand-sky) 16%, var(--nw-border));
  color: var(--nw-text-primary);
}

.idea-kickstart--mobile .idea-kickstart__action--primary,
.idea-kickstart--mobile .idea-kickstart__card-btn--primary {
  background: linear-gradient(135deg, var(--star-brand-sky), var(--star-brand-teal));
  color: #f8fafc;
}

.idea-kickstart--mobile .idea-kickstart__meta {
  color: var(--nw-text-secondary);
}

.idea-kickstart--mobile .idea-kickstart__tag {
  background: color-mix(in srgb, var(--nw-text-primary) 6%, transparent);
  color: var(--nw-text-primary);
}

.idea-kickstart--mobile .idea-kickstart__error {
  color: var(--nw-danger);
}

.idea-kickstart--mobile .idea-kickstart__empty {
  background: color-mix(in srgb, var(--nw-text-primary) 4%, transparent);
  color: var(--nw-text-secondary);
}

.idea-kickstart--mobile .idea-kickstart__card {
  border-color: var(--nw-border);
  background: var(--nw-bg-secondary);
}

.idea-kickstart--mobile .idea-kickstart__card-label {
  background: color-mix(in srgb, var(--star-brand-teal) 12%, transparent);
  color: var(--star-brand-teal);
}

.idea-kickstart--mobile .idea-kickstart__card-head strong {
  color: var(--nw-text-primary);
}

.idea-kickstart--mobile .idea-kickstart__hook {
  color: var(--star-brand-teal);
}

.idea-kickstart--mobile .idea-kickstart__synopsis,
.idea-kickstart--mobile .idea-kickstart__facts dd,
.idea-kickstart--mobile .idea-kickstart__seed p,
.idea-kickstart--mobile .idea-kickstart__pop-reason {
  color: var(--nw-text-secondary);
}

.idea-kickstart--mobile .idea-kickstart__facts dt,
.idea-kickstart--mobile .idea-kickstart__seed span {
  color: var(--nw-text-primary);
}

.idea-kickstart--mobile .idea-kickstart__seed {
  background: color-mix(in srgb, var(--nw-text-primary) 4%, transparent);
}

.idea-kickstart--desktop {
  gap: 12px;
  padding: 14px;
  border-color: rgba(96, 165, 250, 0.18);
  background:
    radial-gradient(circle at top right, rgba(59, 130, 246, 0.16), transparent 34%),
    radial-gradient(circle at bottom left, rgba(14, 165, 233, 0.08), transparent 28%),
    linear-gradient(180deg, rgba(10, 18, 40, 0.98), rgba(8, 16, 34, 0.96));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.idea-kickstart__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.idea-kickstart__head > div:first-child {
  min-width: 0;
}

.idea-kickstart__eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--el-color-primary) 10%, rgba(255, 255, 255, 0.9));
  color: var(--el-color-primary);
  font-size: 12px;
  font-weight: 700;
}

.idea-kickstart__head h3 {
  margin: 10px 0 4px;
  font-size: 18px;
  line-height: 1.2;
  color: #0f172a;
}

.idea-kickstart__head p {
  margin: 0;
  color: #64748b;
  font-size: 13px;
  line-height: 1.6;
}

.idea-kickstart__actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
  flex-wrap: wrap;
}

.idea-kickstart__action,
.idea-kickstart__card-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 38px;
  padding: 0 14px;
  border: 1px solid color-mix(in srgb, var(--el-color-primary) 16%, var(--el-border-color));
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.88);
  color: #1e293b;
  font-size: 13px;
  font-weight: 600;
}

.idea-kickstart__action:disabled,
.idea-kickstart__card-btn:disabled {
  opacity: 0.55;
}

.idea-kickstart__action--primary,
.idea-kickstart__card-btn--primary {
  border-color: transparent;
  background: linear-gradient(135deg, var(--el-color-primary), #06b6d4);
  color: white;
  box-shadow: 0 10px 24px rgba(37, 99, 235, 0.18);
}

.idea-kickstart__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  color: #64748b;
  font-size: 12px;
  line-height: 1.6;
}

.idea-kickstart__tag {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.06);
  color: #0f172a;
  font-weight: 700;
}

.idea-kickstart__error {
  margin: 0;
  color: #dc2626;
  font-size: 13px;
}

.idea-kickstart__empty {
  display: grid;
  gap: 6px;
  padding: 14px;
  border-radius: 14px;
  background: rgba(15, 23, 42, 0.04);
  color: #475569;
  font-size: 13px;
  line-height: 1.7;
}

.idea-kickstart__grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 14px;
}

.idea-kickstart__card {
  display: grid;
  gap: 12px;
  padding: 16px;
  border-radius: 16px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: rgba(255, 255, 255, 0.88);
  opacity: 0;
  transform: translateY(16px);
  animation: idea-card-enter 0.45s ease-out forwards;
}

@keyframes idea-card-enter {
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.idea-kickstart__card-head {
  display: grid;
  gap: 6px;
}

.idea-kickstart__card-label {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  min-height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  background: rgba(14, 165, 233, 0.1);
  color: #0369a1;
  font-size: 12px;
  font-weight: 700;
}

.idea-kickstart__card-head strong {
  font-size: 18px;
  line-height: 1.25;
  color: #0f172a;
}

.idea-kickstart__hook,
.idea-kickstart__synopsis,
.idea-kickstart__pop-reason,
.idea-kickstart__seed p,
.idea-kickstart__facts dd {
  margin: 0;
  white-space: pre-wrap;
}

.idea-kickstart__hook {
  color: #0f766e;
  font-size: 13px;
  line-height: 1.6;
  font-weight: 600;
}

.idea-kickstart__synopsis,
.idea-kickstart__facts dd,
.idea-kickstart__seed p,
.idea-kickstart__pop-reason {
  color: #475569;
  font-size: 13px;
  line-height: 1.7;
}

.idea-kickstart__facts {
  display: grid;
  gap: 8px;
  margin: 0;
}

.idea-kickstart__facts div {
  display: grid;
  gap: 4px;
}

.idea-kickstart__facts dt,
.idea-kickstart__seed span {
  color: #0f172a;
  font-size: 12px;
  font-weight: 700;
}

.idea-kickstart__seed {
  display: grid;
  gap: 6px;
  padding: 12px;
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.04);
}

.idea-kickstart__card-actions {
  display: flex;
  gap: 8px;
  margin-top: auto;
}

.idea-kickstart__card-btn {
  flex: 1;
}

.idea-kickstart--desktop .idea-kickstart__head {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}

.idea-kickstart--desktop .idea-kickstart__actions {
  width: 100%;
  justify-content: flex-start;
}

.idea-kickstart--desktop .idea-kickstart__action {
  flex: 0 0 auto;
}

.idea-kickstart--desktop .idea-kickstart__eyebrow {
  background: rgba(99, 102, 241, 0.14);
  color: #a5b4fc;
}

.idea-kickstart--desktop .idea-kickstart__head h3 {
  margin-top: 8px;
  color: #e2e8f0;
  font-size: 15px;
  line-height: 1.45;
}

.idea-kickstart--desktop .idea-kickstart__head p,
.idea-kickstart--desktop .idea-kickstart__meta,
.idea-kickstart--desktop .idea-kickstart__synopsis,
.idea-kickstart--desktop .idea-kickstart__facts dd,
.idea-kickstart--desktop .idea-kickstart__seed p,
.idea-kickstart--desktop .idea-kickstart__pop-reason,
.idea-kickstart--desktop .idea-kickstart__hook,
.idea-kickstart--desktop .idea-kickstart__error {
  color: #94a3b8;
}

.idea-kickstart--desktop .idea-kickstart__tag {
  background: rgba(148, 163, 184, 0.14);
  color: #e2e8f0;
}

.idea-kickstart--desktop .idea-kickstart__empty,
.idea-kickstart--desktop .idea-kickstart__seed {
  background: rgba(255, 255, 255, 0.05);
}

.idea-kickstart--desktop .idea-kickstart__empty {
  padding: 12px 14px;
  color: #a7b4c8;
}

.idea-kickstart--desktop .idea-kickstart__card {
  border-color: rgba(148, 163, 184, 0.14);
  background: rgba(255, 255, 255, 0.05);
}

.idea-kickstart--desktop .idea-kickstart__card-head strong,
.idea-kickstart--desktop .idea-kickstart__facts dt,
.idea-kickstart--desktop .idea-kickstart__seed span {
  color: #e2e8f0;
}

.idea-kickstart--desktop .idea-kickstart__card-label {
  background: rgba(56, 189, 248, 0.16);
  color: #bae6fd;
}

.idea-kickstart--desktop .idea-kickstart__action,
.idea-kickstart--desktop .idea-kickstart__card-btn {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(148, 163, 184, 0.18);
  color: #dbeafe;
}

@media (max-width: 768px) {
  .idea-kickstart__head {
    flex-direction: column;
  }

  .idea-kickstart__actions {
    width: 100%;
  }

  .idea-kickstart__action {
    flex: 1;
  }

  .idea-kickstart__card-actions {
    flex-direction: column;
  }
}
</style>
