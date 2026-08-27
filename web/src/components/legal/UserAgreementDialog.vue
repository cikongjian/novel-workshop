<script setup lang="ts">
import { computed } from 'vue';
import { InfoFilled, Document } from '@element-plus/icons-vue';
import { brand } from '../../config/brand';
import {
  USER_AGREEMENT_SECTIONS,
  USER_AGREEMENT_EFFECTIVE_DATE,
} from './user-agreement';

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
}>();

const dialogVisible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
});
</script>

<template>
  <el-dialog
    v-model="dialogVisible"
    title="用户协议与隐私政策"
    width="min(92vw, 760px)"
    top="8vh"
    class="user-agreement-dialog"
  >
    <div class="user-agreement">
      <section class="user-agreement__hero">
        <div class="user-agreement__hero-icon">
          <el-icon :size="28"><Document /></el-icon>
        </div>
        <div class="user-agreement__hero-copy">
          <strong>{{ brand.displayName }} 用户协议与隐私政策</strong>
          <p>在使用本平台前，请仔细阅读以下条款。注册或使用平台即视为您理解并接受本协议全部内容。</p>
          <div class="user-agreement__tags">
            <span>公益测试项目</span>
            <span>非盈利运营</span>
            <span>AI 辅助创作</span>
            <span>版权归创作者</span>
            <span>请定期备份</span>
          </div>
        </div>
      </section>

      <section
        v-for="section in USER_AGREEMENT_SECTIONS"
        :key="section.title"
        class="user-agreement__section"
      >
        <h3>{{ section.title }}</h3>
        <p v-for="(p, i) in section.paragraphs" :key="'p' + i" class="user-agreement__paragraph">
          {{ p }}
        </p>
        <ul v-if="section.items?.length">
          <li v-for="item in section.items" :key="item">{{ item }}</li>
        </ul>
      </section>

      <section class="user-agreement__notice">
        <el-icon :size="16"><InfoFilled /></el-icon>
        <p>
          本协议自 {{ USER_AGREEMENT_EFFECTIVE_DATE }} 起生效。继续使用平台，即视为您已阅读、理解并同意本协议全部条款，并承诺遵守相关法律法规和平台规则。
        </p>
      </section>
    </div>

    <template #footer>
      <div class="user-agreement__footer">
        <el-button type="primary" @click="dialogVisible = false">我已阅读并知悉</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.user-agreement {
  display: grid;
  gap: 16px;
}

.user-agreement__hero {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 14px;
  padding: 16px;
  border-radius: 18px;
  border: 1px solid color-mix(in srgb, var(--star-brand-sky) 20%, var(--nw-border));
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--star-brand-sky) 10%, transparent), transparent 36%),
    color-mix(in srgb, var(--nw-bg-secondary) 92%, var(--nw-bg-card));
}

.user-agreement__hero-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--star-brand-sky) 12%, transparent);
  color: var(--star-brand-sky);
}

.user-agreement__hero-copy {
  display: grid;
  gap: 8px;
}

.user-agreement__hero-copy strong {
  color: var(--nw-text-primary);
  font-size: 16px;
  line-height: 1.4;
}

.user-agreement__hero-copy p {
  margin: 0;
  color: var(--nw-text-secondary);
  font-size: 13px;
  line-height: 1.7;
}

.user-agreement__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.user-agreement__tags span {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--star-brand-sky) 18%, var(--nw-border));
  background: color-mix(in srgb, var(--star-brand-sky) 8%, transparent);
  color: color-mix(in srgb, var(--star-brand-sky) 78%, var(--nw-text-primary));
  font-size: 11px;
  font-weight: 700;
}

.user-agreement__section {
  display: grid;
  gap: 10px;
  padding: 14px 16px;
  border-radius: 16px;
  border: 1px solid color-mix(in srgb, var(--star-brand-sky) 14%, var(--nw-border));
  background: color-mix(in srgb, var(--nw-bg-secondary) 88%, var(--nw-bg-card));
}

.user-agreement__section h3 {
  margin: 0;
  color: var(--nw-text-primary);
  font-size: 14px;
}

.user-agreement__paragraph {
  margin: 0;
  color: var(--nw-text-secondary);
  font-size: 13px;
  line-height: 1.7;
}

.user-agreement__section ul {
  margin: 0;
  padding-left: 18px;
  display: grid;
  gap: 8px;
}

.user-agreement__section li {
  color: var(--nw-text-secondary);
  font-size: 13px;
  line-height: 1.7;
}

.user-agreement__notice {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px;
  align-items: start;
  padding: 12px 14px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--star-brand-sky) 10%, var(--nw-bg-card));
  color: var(--nw-text-muted);
}

.user-agreement__notice p {
  margin: 0;
  font-size: 12px;
  line-height: 1.65;
}

.user-agreement__footer {
  display: flex;
  justify-content: flex-end;
}

:deep(.user-agreement-dialog .el-dialog) {
  border-radius: 24px;
  overflow: hidden;
}

:deep(.user-agreement-dialog .el-dialog__header) {
  margin-right: 0;
  padding: 20px 24px 8px;
}

:deep(.user-agreement-dialog .el-dialog__title) {
  font-size: 18px;
  font-weight: 700;
  color: var(--nw-text-primary);
}

:deep(.user-agreement-dialog .el-dialog__body) {
  padding: 12px 24px 8px;
  max-height: 62vh;
  overflow-y: auto;
}

:deep(.user-agreement-dialog .el-dialog__footer) {
  padding: 0 24px 20px;
}

@media (max-width: 720px) {
  .user-agreement {
    gap: 12px;
  }

  .user-agreement__hero {
    grid-template-columns: 1fr;
    padding: 14px;
  }

  .user-agreement__hero-copy strong {
    font-size: 15px;
  }

  .user-agreement__hero-copy p,
  .user-agreement__section li,
  .user-agreement__paragraph {
    font-size: 12px;
  }

  .user-agreement__section {
    padding: 12px 14px;
  }

  :deep(.user-agreement-dialog .el-dialog__header) {
    padding: 18px 18px 6px;
  }

  :deep(.user-agreement-dialog .el-dialog__body) {
    padding: 10px 18px 6px;
  }

  :deep(.user-agreement-dialog .el-dialog__footer) {
    padding: 0 18px 18px;
  }
}
</style>
