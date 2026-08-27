<script setup lang="ts">
import { computed } from 'vue';
import { InfoFilled, WarningFilled } from '@element-plus/icons-vue';
import type { HomepageFooter } from '../../api/settings';
import {
  PLATFORM_DISCLAIMER_SECTIONS,
  PLATFORM_DISCLAIMER_SUMMARY,
  PLATFORM_DISCLAIMER_TAGS,
} from './platform-disclaimer';

const props = defineProps<{
  modelValue: boolean;
  footer?: HomepageFooter;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
}>();

const dialogVisible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
});

const complianceItems = computed(() => {
  const footer = props.footer;
  if (!footer) return [];

  const items: Array<{ key: string; label: string; value: string; href?: string }> = [];
  if (footer.icpNumber.trim()) {
    items.push({
      key: 'icp',
      label: 'ICP备案',
      value: footer.icpNumber.trim(),
      href: footer.icpLink.trim() || undefined,
    });
  }
  if (footer.policeNumber.trim()) {
    items.push({
      key: 'police',
      label: '公安备案',
      value: footer.policeNumber.trim(),
      href: footer.policeLink.trim() || undefined,
    });
  }
  if (footer.privacyLabel.trim() && footer.privacyLink.trim()) {
    items.push({
      key: 'privacy',
      label: '隐私政策',
      value: footer.privacyLabel.trim(),
      href: footer.privacyLink.trim(),
    });
  }
  if (footer.termsLabel.trim() && footer.termsLink.trim()) {
    items.push({
      key: 'terms',
      label: '用户协议',
      value: footer.termsLabel.trim(),
      href: footer.termsLink.trim(),
    });
  }
  return items;
});

function isExternalHref(href: string) {
  return /^https?:\/\//.test(href);
}
</script>

<template>
  <el-dialog
    v-model="dialogVisible"
    title="版权与免责说明"
    width="min(92vw, 760px)"
    top="8vh"
    class="platform-disclaimer-dialog"
  >
    <div class="platform-disclaimer">
      <section class="platform-disclaimer__hero">
        <div class="platform-disclaimer__hero-icon">
          <el-icon :size="28"><WarningFilled /></el-icon>
        </div>
        <div class="platform-disclaimer__hero-copy">
          <strong>技术测试平台，不承担出版与分发责任</strong>
          <p>{{ PLATFORM_DISCLAIMER_SUMMARY }}</p>
          <div class="platform-disclaimer__tags">
            <span v-for="tag in PLATFORM_DISCLAIMER_TAGS" :key="tag">{{ tag }}</span>
          </div>
        </div>
      </section>

      <section
        v-for="section in PLATFORM_DISCLAIMER_SECTIONS"
        :key="section.title"
        class="platform-disclaimer__section"
      >
        <h3>{{ section.title }}</h3>
        <ul>
          <li v-for="item in section.items" :key="item">{{ item }}</li>
        </ul>
      </section>

      <section v-if="complianceItems.length" class="platform-disclaimer__section platform-disclaimer__compliance">
        <h3>备案与协议入口</h3>
        <div class="platform-disclaimer__compliance-list">
          <template v-for="item in complianceItems" :key="item.key">
            <a
              v-if="item.href"
              class="platform-disclaimer__compliance-item"
              :href="item.href"
              :target="isExternalHref(item.href) ? '_blank' : undefined"
              :rel="isExternalHref(item.href) ? 'noreferrer' : undefined"
            >
              <span>{{ item.label }}</span>
              <strong>{{ item.value }}</strong>
            </a>
            <div v-else class="platform-disclaimer__compliance-item">
              <span>{{ item.label }}</span>
              <strong>{{ item.value }}</strong>
            </div>
          </template>
        </div>
      </section>

      <section class="platform-disclaimer__notice">
        <el-icon :size="16"><InfoFilled /></el-icon>
        <p>继续使用平台，即视为你理解并接受以上说明，并承诺对自己提交、生成、展示、导出或传播的内容自行承担相应责任。</p>
      </section>
    </div>

    <template #footer>
      <div class="platform-disclaimer__footer">
        <el-button type="primary" @click="dialogVisible = false">我已知悉</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.platform-disclaimer {
  display: grid;
  gap: 16px;
}

.platform-disclaimer__hero {
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

.platform-disclaimer__hero-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--star-brand-sky) 12%, transparent);
  color: var(--star-brand-sky);
}

.platform-disclaimer__hero-copy {
  display: grid;
  gap: 8px;
}

.platform-disclaimer__hero-copy strong {
  color: var(--nw-text-primary);
  font-size: 16px;
  line-height: 1.4;
}

.platform-disclaimer__hero-copy p {
  margin: 0;
  color: var(--nw-text-secondary);
  font-size: 13px;
  line-height: 1.7;
}

.platform-disclaimer__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.platform-disclaimer__tags span {
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

.platform-disclaimer__section {
  display: grid;
  gap: 10px;
  padding: 14px 16px;
  border-radius: 16px;
  border: 1px solid color-mix(in srgb, var(--star-brand-sky) 14%, var(--nw-border));
  background: color-mix(in srgb, var(--nw-bg-secondary) 88%, var(--nw-bg-card));
}

.platform-disclaimer__section h3 {
  margin: 0;
  color: var(--nw-text-primary);
  font-size: 14px;
}

.platform-disclaimer__section ul {
  margin: 0;
  padding-left: 18px;
  display: grid;
  gap: 8px;
}

.platform-disclaimer__section li {
  color: var(--nw-text-secondary);
  font-size: 13px;
  line-height: 1.7;
}

.platform-disclaimer__compliance-list {
  display: grid;
  gap: 8px;
}

.platform-disclaimer__compliance-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 34px;
  padding: 0 10px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--star-brand-sky) 7%, transparent);
  color: var(--nw-text-secondary);
  text-decoration: none;
}

.platform-disclaimer__compliance-item span {
  flex: 0 0 auto;
  color: var(--nw-text-muted);
  font-size: 12px;
}

.platform-disclaimer__compliance-item strong {
  min-width: 0;
  overflow-wrap: anywhere;
  color: var(--nw-text-primary);
  font-size: 12px;
  font-weight: 700;
  text-align: right;
}

.platform-disclaimer__notice {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px;
  align-items: start;
  padding: 12px 14px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--star-brand-sky) 10%, var(--nw-bg-card));
  color: var(--nw-text-muted);
}

.platform-disclaimer__notice p {
  margin: 0;
  font-size: 12px;
  line-height: 1.65;
}

.platform-disclaimer__footer {
  display: flex;
  justify-content: flex-end;
}

:deep(.platform-disclaimer-dialog .el-dialog) {
  border-radius: 24px;
  overflow: hidden;
}

:deep(.platform-disclaimer-dialog .el-dialog__header) {
  margin-right: 0;
  padding: 20px 24px 8px;
}

:deep(.platform-disclaimer-dialog .el-dialog__title) {
  font-size: 18px;
  font-weight: 700;
  color: var(--nw-text-primary);
}

:deep(.platform-disclaimer-dialog .el-dialog__body) {
  padding: 12px 24px 8px;
  max-height: 62vh;
  overflow-y: auto;
}

:deep(.platform-disclaimer-dialog .el-dialog__footer) {
  padding: 0 24px 20px;
}

@media (max-width: 720px) {
  .platform-disclaimer {
    gap: 12px;
  }

  .platform-disclaimer__hero {
    grid-template-columns: 1fr;
    padding: 14px;
    border-color: color-mix(in srgb, var(--star-brand-sky) 22%, var(--nw-border));
    background:
      radial-gradient(circle at top right, color-mix(in srgb, var(--star-brand-sky) 10%, transparent), transparent 36%),
      color-mix(in srgb, var(--nw-bg-secondary) 92%, var(--nw-bg-card));
  }

  .platform-disclaimer__hero-copy strong {
    font-size: 15px;
  }

  .platform-disclaimer__hero-copy p,
  .platform-disclaimer__section li,
  .platform-disclaimer__compliance-item span,
  .platform-disclaimer__compliance-item strong {
    font-size: 12px;
  }

  .platform-disclaimer__section {
    padding: 12px 14px;
  }

  .platform-disclaimer__compliance-item {
    align-items: flex-start;
    flex-direction: column;
    gap: 3px;
    padding: 8px 10px;
  }

  .platform-disclaimer__compliance-item strong {
    text-align: left;
  }

  :deep(.platform-disclaimer-dialog .el-dialog__header) {
    padding: 18px 18px 6px;
  }

  :deep(.platform-disclaimer-dialog .el-dialog__body) {
    padding: 10px 18px 6px;
  }

  :deep(.platform-disclaimer-dialog .el-dialog__footer) {
    padding: 0 18px 18px;
  }
}
</style>
