<script setup lang="ts">
import { ref, watch } from 'vue';
import { useShareCard, type ShareCardData } from '../../composables/useShareCard';
import { CloseBold } from '@element-plus/icons-vue';

const props = defineProps<{
  visible: boolean;
  data: ShareCardData;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const share = useShareCard();
const selectedTemplateId = ref(share.templates[0].id);
const previewUrl = ref<string | null>(null);
const saving = ref(false);
const sharing = ref(false);

/** 模板色块预览 */
const SWATCH_COLORS: Record<string, [string, string]> = {
  warm: ['#fdfaf4', '#b8860b'],
  dark: ['#1a1a2e', '#d4a853'],
  clean: ['#ffffff', '#0ea5e9'],
};
function templateSwatchStyle(id: string) {
  const [bg, accent] = SWATCH_COLORS[id] ?? ['#fff', '#999'];
  return { background: bg, borderColor: accent };
}

watch(
  () => props.visible,
  async (val) => {
    if (val && props.data.text) {
      selectedTemplateId.value = share.templates[0].id;
      await regenerate();
    }
  },
);

watch(selectedTemplateId, async (id) => {
  share.selectTemplate(id);
  if (props.visible) await regenerate();
});

async function regenerate() {
  previewUrl.value = null;
  previewUrl.value = await share.generateCard(props.data);
}

async function handleSave() {
  if (!previewUrl.value) return;
  saving.value = true;
  try {
    const a = document.createElement('a');
    a.href = previewUrl.value;
    a.download = '章节分享卡.png';
    a.click();
  } finally {
    saving.value = false;
  }
}

async function handleShare() {
  sharing.value = true;
  try {
    await share.shareImage(previewUrl.value ?? undefined);
  } finally {
    sharing.value = false;
  }
}
</script>

<template>
  <Transition name="sheet-slide-up">
    <div v-if="visible" class="share-card-viewer" @click.self="emit('close')">
      <div class="share-card-viewer__sheet">
        <div class="share-card-viewer__header">
          <h3>分享卡片</h3>
          <button class="share-card-viewer__close" @click="emit('close')">
            <el-icon :size="20"><CloseBold /></el-icon>
          </button>
        </div>

        <div class="share-card-viewer__templates">
          <button
            v-for="t in share.templates"
            :key="t.id"
            :class="['share-card-viewer__tpl-btn', { 'is-active': selectedTemplateId === t.id }]"
            @click="selectedTemplateId = t.id"
          >
            <span
              class="share-card-viewer__tpl-swatch"
              :style="templateSwatchStyle(t.id)"
            />
            {{ t.name }}
          </button>
        </div>

        <div class="share-card-viewer__preview">
          <div v-if="share.generating.value" class="share-card-viewer__loading">
            生成中...
          </div>
          <img
            v-else-if="previewUrl"
            :src="previewUrl"
            alt="分享卡片预览"
            class="share-card-viewer__image"
          />
          <div v-else class="share-card-viewer__loading">
            无法生成预览
          </div>
        </div>

        <div class="share-card-viewer__actions">
          <button class="share-card-viewer__action share-card-viewer__action--primary" @click="handleShare" :disabled="sharing || !previewUrl">
            {{ sharing ? '分享中...' : '分享给朋友' }}
          </button>
          <button class="share-card-viewer__action" @click="handleSave" :disabled="saving || !previewUrl">
            {{ saving ? '保存中...' : '保存到相册' }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.share-card-viewer {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.share-card-viewer__sheet {
  width: 100%;
  max-width: 480px;
  max-height: 90vh;
  background: #fff;
  border-radius: 16px 16px 0 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.share-card-viewer__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 14px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.share-card-viewer__header h3 {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
}

.share-card-viewer__close {
  background: none;
  border: none;
  cursor: pointer;
  color: #64748b;
  padding: 4px;
}

.share-card-viewer__templates {
  display: flex;
  gap: 8px;
  padding: 12px 14px;
  overflow-x: auto;
}

.share-card-viewer__tpl-btn {
  background: #f1f5f9;
  border: 1.5px solid transparent;
  padding: 6px 14px;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
  color: #475569;
}

.share-card-viewer__tpl-btn.is-active {
  border-color: #0ea5e9;
  color: #0ea5e9;
  background: rgba(14, 165, 233, 0.06);
}

.share-card-viewer__tpl-swatch {
  display: inline-block;
  width: 16px;
  height: 16px;
  border-radius: 4px;
  border: 1.5px solid;
  vertical-align: middle;
  margin-right: 6px;
  flex-shrink: 0;
}

.share-card-viewer__preview {
  flex: 1;
  overflow-y: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  min-height: 200px;
  background: #f8fafc;
}

.share-card-viewer__image {
  max-width: 100%;
  max-height: 400px;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
}

.share-card-viewer__loading {
  color: #94a3b8;
  font-size: 14px;
}

.share-card-viewer__actions {
  display: flex;
  gap: 10px;
  padding: 14px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
}

.share-card-viewer__action {
  flex: 1;
  padding: 12px;
  border-radius: 10px;
  background: #f1f5f9;
  border: none;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  color: #334155;
}

.share-card-viewer__action--primary {
  background: #0ea5e9;
  color: #fff;
}

.share-card-viewer__action:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.sheet-slide-up-enter-active,
.sheet-slide-up-leave-active {
  transition: opacity 0.25s ease;
}

.sheet-slide-up-enter-active .share-card-viewer__sheet,
.sheet-slide-up-leave-active .share-card-viewer__sheet {
  transition: transform 0.25s ease;
}

.sheet-slide-up-enter-from,
.sheet-slide-up-leave-to {
  opacity: 0;
}

.sheet-slide-up-enter-from .share-card-viewer__sheet,
.sheet-slide-up-leave-to .share-card-viewer__sheet {
  transform: translateY(100%);
}
</style>
