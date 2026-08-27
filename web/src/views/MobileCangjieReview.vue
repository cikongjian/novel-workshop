<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { ArrowLeft, Check, MagicStick } from '@element-plus/icons-vue';
import {
  CANGJIE_CHECKLIST_GROUP_LABELS,
  CANGJIE_CHECKLIST_GROUP_ORDER,
  type CangjieChecklistGroup,
} from '../api/cangjie';
import {
  getCangjieCreationErrorMessage,
  useCangjieNovelCreation,
} from '../composables/useCangjieNovelCreation';
import { useCangjieSession } from '../composables/useCangjieSession';
import '../styles/mobile-fun-features.css';

const router = useRouter();
const session = useCangjieSession();
const creation = useCangjieNovelCreation();

const groupedChecklist = computed(() => CANGJIE_CHECKLIST_GROUP_ORDER
  .map(group => ({
    group,
    label: CANGJIE_CHECKLIST_GROUP_LABELS[group],
    items: session.organizedChecklist.value.filter(item => item.group === group),
  }))
  .filter(group => group.items.length));

const readySelectedChecklist = computed(() => session.selectedChecklist.value
  .map(item => ({
    ...item,
    title: item.title.trim(),
    content: item.content.trim(),
  }))
  .filter(item => item.title && item.content));

const allSelected = computed(() => session.organizedChecklist.value.length > 0
  && session.organizedChecklist.value.every(item => item.selected));
const selectedSummary = computed(() => `${readySelectedChecklist.value.length} / ${session.organizedChecklist.value.length}`);
const canCreate = computed(() => readySelectedChecklist.value.length > 0 && !creation.creatingNovel.value);

function groupLabel(group: CangjieChecklistGroup): string {
  return CANGJIE_CHECKLIST_GROUP_LABELS[group];
}

function toggleAll() {
  session.selectAllChecklist(!allSelected.value);
}

async function createNovel() {
  if (!readySelectedChecklist.value.length) {
    ElMessage.warning('保留至少一个完整故事核心');
    return;
  }

  try {
    const { novelId } = await creation.createNovel({
      messages: session.messages.value,
      checklist: readySelectedChecklist.value,
    });
    ElMessage.success('仓颉已把故事核心铸成新书，首章正在生成');
    session.resetSession();
    void router.push({ path: `/m/novel/${novelId}`, query: { compose: '1' } });
  } catch (err) {
    ElMessage.error(getCangjieCreationErrorMessage(err));
  }
}
</script>

<template>
  <div class="mobile-fun-page cangjie-review-page">
    <div class="mf-topbar">
      <button class="mf-topbar__back" type="button" @click="router.push('/m/fun/cangjie')">
        <el-icon :size="18"><ArrowLeft /></el-icon>
      </button>
      <span class="mf-topbar__title">确认故事核心</span>
    </div>

    <template v-if="session.hasChecklist.value">
      <section class="cangjie-review-summary" aria-labelledby="cangjie-review-title">
        <p>开书清单</p>
        <h1 id="cangjie-review-title">留下真正要写进新书的部分</h1>
        <span>已选 {{ selectedSummary }} 项，标题和内容可以直接改到更准确。</span>
        <button class="mf-btn mf-btn--outline" type="button" :disabled="creation.creatingNovel.value" @click="toggleAll">
          <el-icon :size="15"><Check /></el-icon>
          <span>{{ allSelected ? '清空选择' : '全部选中' }}</span>
        </button>
      </section>

      <section
        v-for="group in groupedChecklist"
        :key="group.group"
        class="cangjie-review-group"
        :aria-label="group.label"
      >
        <div class="cangjie-review-group__title">{{ group.label }}</div>
        <article
          v-for="item in group.items"
          :key="item.id"
          class="cangjie-review-item"
          :class="{ 'cangjie-review-item--off': !item.selected }"
        >
          <label class="cangjie-review-item__toggle">
            <input v-model="item.selected" type="checkbox" :disabled="creation.creatingNovel.value" />
            <span aria-hidden="true" />
          </label>
          <div class="cangjie-review-item__body">
            <input
              v-model="item.title"
              class="cangjie-review-input cangjie-review-input--title"
              :aria-label="`${groupLabel(item.group)}标题`"
              maxlength="40"
              :disabled="creation.creatingNovel.value"
            />
            <textarea
              v-model="item.content"
              class="cangjie-review-input cangjie-review-input--content"
              :aria-label="`${groupLabel(item.group)}内容`"
              rows="3"
              maxlength="260"
              :disabled="creation.creatingNovel.value"
            />
          </div>
        </article>
      </section>

      <div class="cangjie-review-actions">
        <button class="mf-btn mf-btn--primary mf-btn--block" type="button" :disabled="!canCreate" @click="createNovel">
          <el-icon :size="16"><MagicStick /></el-icon>
          <span>{{ creation.creatingNovel.value ? '正在开书...' : '用这些开书' }}</span>
        </button>
        <button class="mf-btn mf-btn--outline mf-btn--block" type="button" :disabled="creation.creatingNovel.value" @click="router.push('/m/fun/cangjie')">
          返回继续聊
        </button>
      </div>
    </template>

    <section v-else class="cangjie-review-empty">
      <h1>故事核心还没成形</h1>
      <p>回到仓颉造字，把人物、冲突或开局聊出来，再整理成开书清单。</p>
      <button class="mf-btn mf-btn--primary mf-btn--block" type="button" @click="router.push('/m/fun/cangjie')">
        回到仓颉造字
      </button>
    </section>
  </div>
</template>
