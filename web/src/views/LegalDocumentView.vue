<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowLeft } from '@element-plus/icons-vue';
import { getLegalDocumentBySlug } from '../components/legal/legal-documents';

const route = useRoute();
const router = useRouter();

const documentSlug = computed(() => String(route.meta.documentSlug ?? ''));
const documentData = computed(() => getLegalDocumentBySlug(documentSlug.value));

function goHome() {
  void router.push('/');
}
</script>

<template>
  <div class="legal-doc-page">
    <div class="legal-doc-shell">
      <header class="legal-doc-topbar">
        <button class="legal-doc-back" type="button" @click="goHome">
          <el-icon :size="18"><ArrowLeft /></el-icon>
        </button>
      </header>

      <main class="legal-doc-main">
        <template v-if="documentData">
          <section class="legal-doc-hero">
            <p class="legal-doc-kicker">Legal Notice</p>
            <h1>{{ documentData.title }}</h1>
            <p class="legal-doc-note">{{ documentData.subtitle }}</p>
            <div class="legal-doc-dates">
              <span>生效：{{ documentData.effectiveDate }}</span>
              <span>更新：{{ documentData.updatedAt }}</span>
            </div>
          </section>

          <section class="legal-doc-body">
            <article
              v-for="section in documentData.sections"
              :key="section.title"
              class="legal-doc-block"
            >
              <h3>{{ section.title }}</h3>
              <p v-for="paragraph in section.paragraphs ?? []" :key="paragraph">{{ paragraph }}</p>
              <ul v-if="section.items?.length">
                <li v-for="item in section.items" :key="item">{{ item }}</li>
              </ul>
            </article>
          </section>
        </template>

        <section v-else class="legal-doc-body legal-doc-empty">
          <strong>文档暂未上线</strong>
          <p>该法务页面还在配置中，可先返回首页。</p>
          <button class="legal-doc-btn-primary" type="button" @click="goHome">
            返回首页
          </button>
        </section>
      </main>

      <footer class="legal-doc-footer">
        <button class="legal-doc-btn-secondary" type="button" @click="goHome">
          返回书城
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.legal-doc-page {
  min-height: 100vh;
  background: var(--nw-bg-primary);
  color: var(--nw-text-primary);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
}

.legal-doc-shell {
  max-width: 480px;
  margin: 0 auto;
  padding: 0 14px 32px;
}

.legal-doc-topbar {
  display: flex;
  align-items: center;
  padding: 12px 0;
}

.legal-doc-back {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: 1px solid var(--nw-border);
  border-radius: 12px;
  background: var(--nw-bg-card);
  color: var(--nw-text-secondary);
  cursor: pointer;
  font-size: 14px;
}

.legal-doc-back:hover {
  background: color-mix(in srgb, var(--nw-bg-card) 95%, var(--nw-bg-primary));
  border-color: var(--nw-text-muted);
}

.legal-doc-main {
  display: grid;
  gap: 14px;
}

.legal-doc-hero {
  display: grid;
  gap: 8px;
  padding: 18px 16px;
  border-radius: 22px;
  border: 1px solid var(--nw-border);
  background: var(--nw-bg-card);
}

.legal-doc-kicker {
  margin: 0;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--star-brand-sky);
}

.legal-doc-hero h1 {
  margin: 0;
  font-size: clamp(22px, 6vw, 28px);
  line-height: 1.2;
  letter-spacing: -0.02em;
  color: var(--nw-text-primary);
}

.legal-doc-note {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--nw-text-secondary);
}

.legal-doc-dates {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.legal-doc-dates span {
  font-size: 12px;
  color: var(--nw-text-secondary);
  padding: 4px 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--star-brand-sky) 8%, transparent);
}

.legal-doc-body {
  display: grid;
  gap: 12px;
}

.legal-doc-block {
  display: grid;
  gap: 8px;
  padding: 16px;
  border-radius: 16px;
  border: 1px solid var(--nw-border);
  background: var(--nw-bg-card);
}

.legal-doc-block h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--nw-text-primary);
}

.legal-doc-block p {
  margin: 0;
  font-size: 14px;
  line-height: 1.78;
  color: var(--nw-text-secondary);
}

.legal-doc-block ul {
  margin: 0;
  padding-left: 18px;
  display: grid;
  gap: 4px;
}

.legal-doc-block li {
  font-size: 14px;
  line-height: 1.7;
  color: var(--nw-text-secondary);
}

.legal-doc-empty {
  padding: 32px 16px;
  text-align: center;
  border-radius: 22px;
  border: 1px solid var(--nw-border);
  background: var(--nw-bg-card);
}

.legal-doc-empty strong {
  font-size: 18px;
  color: var(--nw-text-primary);
}

.legal-doc-empty p {
  margin: 8px 0 16px;
  font-size: 14px;
  color: var(--nw-text-secondary);
}

.legal-doc-btn-primary,
.legal-doc-btn-secondary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 38px;
  padding: 0 16px;
  border-radius: 999px;
  border: 1px solid transparent;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.legal-doc-btn-primary {
  background: var(--star-brand-sky);
  color: var(--nw-bg-card);
}

.legal-doc-btn-secondary {
  border-color: var(--nw-border);
  background: var(--nw-bg-card);
  color: var(--nw-text-secondary);
}

.legal-doc-footer {
  padding: 20px 0 12px;
  text-align: center;
}
</style>
