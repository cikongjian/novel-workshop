<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { ArrowLeft, MagicStick } from '@element-plus/icons-vue';
import { getPanguCreationErrorMessage, usePanguNovelCreation } from '../composables/usePanguNovelCreation';
import { useThemeMode } from '../composables/useThemeMode';
import '../styles/mobile-fun-features.css';

const router = useRouter();
const { isDark: isDarkTheme, isWarmNight } = useThemeMode();
const pangu = usePanguNovelCreation();
const seedIdea = ref('');

const normalizedSeedIdea = computed(() => seedIdea.value.trim());
const seedLength = computed(() => normalizedSeedIdea.value.length);
const canCreate = computed(() => seedLength.value > 0 && !pangu.creatingNovel.value);

async function handleCreate() {
  if (!normalizedSeedIdea.value) {
    ElMessage.warning('先写下一个开篇灵感');
    return;
  }

  try {
    const novelId = await pangu.createNovel(normalizedSeedIdea.value);
    ElMessage.success('盘古开天已启动，首章正在生成');
    void router.push({ path: `/m/novel/${novelId}`, query: { compose: '1' } });
  } catch (err) {
    ElMessage.error(getPanguCreationErrorMessage(err));
  }
}
</script>

<template>
  <div class="mobile-fun-page mobile-focus-page" :class="{ 'mobile-focus-page--dark': isDarkTheme, 'mobile-focus-page--warm-night': isWarmNight }">
    <div class="mf-topbar">
      <button class="mf-topbar__back" type="button" @click="router.back()">
        <el-icon :size="18"><ArrowLeft /></el-icon>
      </button>
      <span class="mf-topbar__title">盘古开天</span>
    </div>

    <section class="pangu-kickstart-hero" aria-labelledby="pangu-kickstart-title">
      <p>盘古开天</p>
      <h1 id="pangu-kickstart-title">一灵感，开出全篇首章</h1>
      <span>把灵感变成可编辑的新书项目，首章样稿同步落地。</span>
    </section>

    <form class="mf-card mf-card--glow pangu-kickstart-card" @submit.prevent="handleCreate">
      <label class="pangu-kickstart-field" for="pangu-seed-idea">
        <span>创作灵感</span>
        <textarea
          id="pangu-seed-idea"
          v-model="seedIdea"
          rows="9"
          maxlength="800"
          :disabled="pangu.creatingNovel.value"
          placeholder="想写什么，一句话也可以。比如：被雪藏的演员在综艺现场意外翻红，靠一段旧片段重回顶流。"
        />
      </label>

      <div class="pangu-kickstart-meta">
        <span>{{ seedLength }} / 800</span>
        <span>{{ pangu.creatingNovel.value ? '开书任务提交中' : '书名、设定、大纲和首章会自动生成' }}</span>
      </div>

      <button class="mf-btn mf-btn--primary mf-btn--block pangu-kickstart-submit" type="submit" :disabled="!canCreate">
        <el-icon :size="16"><MagicStick /></el-icon>
        <span>{{ pangu.creatingNovel.value ? '脑洞大师正在开天...' : '开出全篇首章' }}</span>
      </button>
    </form>
  </div>
</template>
