<script setup lang="ts">
import { ref, watch, type Component } from 'vue';
import { useRouter } from 'vue-router';
import {
  ChatLineRound,
  CircleCheck,
  CircleClose,
  Clock,
  Close,
  DocumentChecked,
  Link,
  Message,
} from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import {
  fetchReceivedForkPublishRequests,
  reviewForkPublishRequest,
  type ForkPublishRequest,
  type ForkPublishStatus,
} from '../../api/forks';
import '../../styles/fork-publish-sheets.css';

const props = defineProps<{
  visible: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

const router = useRouter();
const requests = ref<ForkPublishRequest[]>([]);
const loading = ref(false);
const reviewingId = ref<string | null>(null);
const reviewComment = ref<Record<string, string>>({});

const statusMap: Record<ForkPublishStatus, { text: string; tone: string; icon: Component }> = {
  pending: { text: '待处理', tone: 'pending', icon: Clock },
  approved: { text: '已通过', tone: 'approved', icon: CircleCheck },
  rejected: { text: '已拒绝', tone: 'rejected', icon: CircleClose },
  expired: { text: '已过期', tone: 'expired', icon: Clock },
};

async function loadRequests() {
  loading.value = true;
  try {
    const { requests: list } = await fetchReceivedForkPublishRequests();
    requests.value = list;
  } catch {
    requests.value = [];
  } finally {
    loading.value = false;
  }
}

async function handleReview(req: ForkPublishRequest, decision: 'approved' | 'rejected') {
  if (reviewingId.value) return;
  reviewingId.value = req.id;
  try {
    const comment = reviewComment.value[req.id]?.trim() || undefined;
    await reviewForkPublishRequest(req.id, decision, comment);
    ElMessage.success(decision === 'approved' ? '已放行这条分支' : '已退回申请');
    await loadRequests();
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error ?? '审批操作失败');
  } finally {
    reviewingId.value = null;
  }
}

function goToFork(req: ForkPublishRequest) {
  router.push(`/m/novel/${req.forkedNovelId}`);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

watch(
  () => props.visible,
  (visible) => {
    if (visible) void loadRequests();
  },
  { immediate: true },
);
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="fork-review-overlay mobile-focus-light-vars">
      <section class="fork-review-sheet" role="dialog" aria-modal="true" aria-label="分支发布审批">
        <header class="fork-review__header">
          <div class="fork-review__heading">
            <span class="fork-review__heading-icon"><el-icon><DocumentChecked /></el-icon></span>
            <div>
              <span class="fork-review__kicker">发布确认</span>
              <h3 class="fork-review__title">分支发布审批</h3>
            </div>
          </div>
          <button class="fork-review__close" type="button" aria-label="关闭" @click="emit('close')">
            <el-icon><Close /></el-icon>
          </button>
        </header>

        <main class="fork-review__body">
          <div v-if="loading" class="fork-review__loading">
            <span class="fork-review__spinner"></span>
            <p>正在读取待处理申请</p>
          </div>

          <section v-else-if="requests.length === 0" class="fork-review__empty">
            <span class="fork-review__empty-icon"><el-icon><Message /></el-icon></span>
            <strong>暂时没有新的发布申请</strong>
            <p>读者准备把分支作品上架时，会在这里进入你的确认队列。</p>
          </section>

          <div v-else class="fork-review__list">
            <article v-for="req in requests" :key="req.id" class="fork-review__item">
              <div class="fork-review__item-top">
                <div class="fork-review__applicant">
                  <span class="fork-review__avatar">{{ (req.requesterName || '读').slice(0, 1) }}</span>
                  <div>
                    <strong>{{ req.requesterName || '匿名读者' }}</strong>
                    <span>{{ formatDate(req.createdAt) }} 提交</span>
                  </div>
                </div>
                <span class="fork-review__status" :class="`is-${statusMap[req.status].tone}`">
                  <el-icon><component :is="statusMap[req.status].icon" /></el-icon>
                  {{ statusMap[req.status].text }}
                </span>
              </div>

              <div class="fork-review__work-card">
                <div class="fork-review__work-row">
                  <span>申请发布</span>
                  <button type="button" @click="goToFork(req)">
                    《{{ req.forkedTitle }}》
                    <el-icon><Link /></el-icon>
                  </button>
                </div>
                <div class="fork-review__work-row">
                  <span>分支来源</span>
                  <strong>《{{ req.originalTitle }}》</strong>
                </div>
              </div>

              <section v-if="req.message" class="fork-review__message">
                <span><el-icon><ChatLineRound /></el-icon> 上架说明</span>
                <p>{{ req.message }}</p>
              </section>

              <section v-if="req.reviewComment && req.status !== 'pending'" class="fork-review__reviewed">
                <span>你的处理意见</span>
                <p>{{ req.reviewComment }}</p>
              </section>

              <template v-if="req.status === 'pending'">
                <textarea
                  v-model="reviewComment[req.id]"
                  class="fork-review__textarea"
                  placeholder="可补充一句处理意见，方便对方调整后再次提交。"
                  rows="3"
                  maxlength="200"
                ></textarea>
                <div class="fork-review__actions">
                  <button class="fork-review__btn fork-review__btn--reject" type="button" :disabled="reviewingId === req.id" @click="handleReview(req, 'rejected')">
                    退回调整
                  </button>
                  <button class="fork-review__btn fork-review__btn--approve" type="button" :disabled="reviewingId === req.id" @click="handleReview(req, 'approved')">
                    允许发布
                  </button>
                </div>
              </template>
            </article>
          </div>
        </main>
      </section>
    </div>
  </Teleport>
</template>
