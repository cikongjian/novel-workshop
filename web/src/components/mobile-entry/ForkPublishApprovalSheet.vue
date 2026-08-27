<script setup lang="ts">
import { computed, ref, watch, type Component } from 'vue';
import {
  CircleCheck,
  CircleClose,
  Clock,
  Close,
  DocumentChecked,
  EditPen,
  Picture,
  WarningFilled,
} from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import {
  checkForkPublish,
  submitForkPublishRequest,
  type ForkPublishCheck,
} from '../../api/forks';
import '../../styles/fork-publish-sheets.css';

const props = defineProps<{
  visible: boolean;
  novelId: string;
}>();

const emit = defineEmits<{
  close: [];
  approved: [];
}>();

const loading = ref(false);
const submitting = ref(false);
const checkResult = ref<ForkPublishCheck | null>(null);
const message = ref('');

const isFork = computed(() => !!checkResult.value?.isFork);
const checks = computed(() => checkResult.value?.checks);

const canSubmit = computed(() => {
  if (!checks.value) return false;
  return checks.value.titleChanged &&
    checks.value.coverChanged &&
    checks.value.hasCover &&
    checks.value.approvalStatus !== 'pending' &&
    checks.value.approvalStatus !== 'approved';
});

type RequirementTone = 'pass' | 'fail' | 'pending' | 'idle';

interface PublishRequirement {
  id: string;
  title: string;
  detail: string;
  tone: RequirementTone;
  icon: Component;
}

const approvalTone = computed<RequirementTone>(() => {
  const status = checks.value?.approvalStatus;
  if (status === 'approved') return 'pass';
  if (status === 'pending') return 'pending';
  if (status === 'rejected') return 'fail';
  return 'idle';
});

const approvalTitle = computed(() => {
  const status = checks.value?.approvalStatus;
  if (status === 'approved') return '原作者已确认';
  if (status === 'pending') return '原作者确认中';
  if (status === 'rejected') return '上次申请未通过';
  return '待提交给原作者';
});

const requirements = computed<PublishRequirement[]>(() => [
  {
    id: 'title',
    title: '标题已形成分支识别',
    detail: '避免和原作混淆，让读者能快速识别这是你的版本。',
    tone: checks.value?.titleChanged ? 'pass' : 'fail',
    icon: EditPen,
  },
  {
    id: 'cover-ready',
    title: '已准备书城封面',
    detail: '发布页需要有可展示的封面资产。',
    tone: checks.value?.hasCover ? 'pass' : 'fail',
    icon: Picture,
  },
  {
    id: 'cover-diff',
    title: '封面已和原作区分',
    detail: '分支作品应有独立视觉，不能沿用原作封面。',
    tone: checks.value?.coverChanged ? 'pass' : 'fail',
    icon: Picture,
  },
  {
    id: 'approval',
    title: approvalTitle.value,
    detail: approvalTone.value === 'pass'
      ? '授权已完成，可以继续进入书城发布。'
      : approvalTone.value === 'pending'
        ? '申请已送达，等待原作者处理。'
        : approvalTone.value === 'fail'
          ? '根据反馈调整后，可以再次提交申请。'
          : '补齐前置项后，把上架说明发给原作者确认。',
    tone: approvalTone.value,
    icon: DocumentChecked,
  },
]);

const missingCount = computed(() => requirements.value.filter((item) => item.tone === 'fail').length);

const statusCard = computed(() => {
  const status = checks.value?.approvalStatus;
  if (!isFork.value) {
    return { tone: 'success', icon: CircleCheck, title: '原创作品可直接发布', text: '这部作品不需要原作者确认，可以继续进入书城发布流程。' };
  }
  if (status === 'approved') {
    return { tone: 'success', icon: CircleCheck, title: '发布确认已完成', text: '分支授权已经就绪，现在可以继续发布到书城。' };
  }
  if (status === 'pending') {
    return { tone: 'pending', icon: Clock, title: '申请已送达原作者', text: '通过后会解锁书城发布入口，你可以先继续完善作品信息。' };
  }
  if (status === 'rejected') {
    return { tone: 'danger', icon: CircleClose, title: '这次申请暂未通过', text: '参考原作者反馈调整标题、封面或说明后，可重新提交。' };
  }
  if (missingCount.value > 0) {
    return { tone: 'warning', icon: WarningFilled, title: `还差 ${missingCount.value} 项发布准备`, text: '先补齐未完成项，再把这部作品送交原作者确认。' };
  }
  return { tone: 'ready', icon: DocumentChecked, title: '已具备提交条件', text: '补一句上架说明，让原作者更快判断这条分支的发布价值。' };
});

async function loadCheck() {
  loading.value = true;
  try {
    checkResult.value = await checkForkPublish(props.novelId);
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error ?? '发布预检失败');
    checkResult.value = null;
  } finally {
    loading.value = false;
  }
}

async function handleSubmit() {
  if (!canSubmit.value || submitting.value) return;
  submitting.value = true;
  try {
    await submitForkPublishRequest(props.novelId, message.value.trim() || undefined);
    ElMessage.success('发布申请已送达原作者');
    message.value = '';
    await loadCheck();
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error ?? '提交发布申请失败');
  } finally {
    submitting.value = false;
  }
}

watch(
  () => props.visible,
  async (visible) => {
    if (visible) {
      message.value = '';
      await loadCheck();
    } else {
      checkResult.value = null;
    }
  },
  { immediate: true },
);

function handleClose() {
  if (submitting.value) return;
  emit('close');
}
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="fork-publish-overlay mobile-focus-light-vars">
      <section class="fork-publish-sheet" role="dialog" aria-modal="true" aria-label="分支作品发布申请">
        <header class="fork-publish__header">
          <div class="fork-publish__heading">
            <span class="fork-publish__heading-icon"><el-icon><DocumentChecked /></el-icon></span>
            <div>
              <span class="fork-publish__kicker">上架确认</span>
              <h3 class="fork-publish__title">分支作品发布申请</h3>
            </div>
          </div>
          <button class="fork-publish__close" type="button" aria-label="关闭" @click="handleClose">
            <el-icon><Close /></el-icon>
          </button>
        </header>

        <main class="fork-publish__body">
          <div v-if="loading" class="fork-publish__loading">
            <span class="fork-publish__spinner"></span>
            <p>正在核对发布准备度</p>
          </div>

          <template v-else-if="checkResult">
            <article v-if="isFork" class="fork-publish__source">
              <span>分支来源</span>
              <strong>《{{ checkResult.originalTitle }}》</strong>
              <p>发布到书城前，需要让标题、封面和原作者确认都清楚到位。</p>
            </article>

            <section class="fork-publish__status" :class="`is-${statusCard.tone}`">
              <span class="fork-publish__status-icon">
                <el-icon><component :is="statusCard.icon" /></el-icon>
              </span>
              <div>
                <strong>{{ statusCard.title }}</strong>
                <p>{{ statusCard.text }}</p>
              </div>
            </section>

            <template v-if="isFork">
              <section class="fork-publish__requirements" aria-label="发布准入项">
                <div v-for="item in requirements" :key="item.id" class="fork-publish__requirement" :class="`is-${item.tone}`">
                  <span class="fork-publish__requirement-icon">
                    <el-icon><component :is="item.icon" /></el-icon>
                  </span>
                  <div class="fork-publish__requirement-copy">
                    <strong>{{ item.title }}</strong>
                    <p>{{ item.detail }}</p>
                  </div>
                  <span class="fork-publish__requirement-mark">
                    <el-icon v-if="item.tone === 'pass'"><CircleCheck /></el-icon>
                    <el-icon v-else-if="item.tone === 'fail'"><CircleClose /></el-icon>
                    <el-icon v-else-if="item.tone === 'pending'"><Clock /></el-icon>
                    <span v-else></span>
                  </span>
                </div>
              </section>

              <section v-if="checkResult.currentRequest?.status === 'rejected' && checkResult.currentRequest.reviewComment" class="fork-publish__feedback">
                <span>原作者反馈</span>
                <p>{{ checkResult.currentRequest.reviewComment }}</p>
              </section>

              <section v-if="canSubmit" class="fork-publish__submit-section">
                <label class="fork-publish__label" for="fork-publish-message">给原作者的上架说明</label>
                <textarea
                  id="fork-publish-message"
                  v-model="message"
                  class="fork-publish__textarea"
                  placeholder="说清楚这条分支的亮点、改写方向或想触达的读者。"
                  maxlength="300"
                  rows="4"
                ></textarea>
                <span class="fork-publish__char-count">{{ message.length }} / 300</span>
              </section>
            </template>
          </template>
        </main>

        <footer v-if="checkResult && isFork && (canSubmit || checks?.approvalStatus === 'approved')" class="fork-publish__footer">
          <button v-if="canSubmit" class="fork-publish__submit-btn" type="button" :disabled="submitting" @click="handleSubmit">
            {{ submitting ? '提交中...' : '提交给原作者确认' }}
          </button>
          <button v-else class="fork-publish__submit-btn is-success" type="button" @click="emit('approved')">
            继续发布到书城
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>
