<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { Upload, Delete, Document, Warning, ChatLineSquare } from '@element-plus/icons-vue';
import ConsolePageHeader from '../components/layout/ConsolePageHeader.vue';
import SliderCaptcha from '../components/auth/SliderCaptcha.vue';
import LandingFooterSection from '../components/landing/LandingFooterSection.vue';
import DisclaimerFooter from '../components/beta/DisclaimerFooter.vue';
import { useHomepagePublicData } from '../composables/useHomepagePublicData';
import { useAuthStore } from '../stores/auth';
import { getBookStoreList, getBookStorePublicChapterPage } from '../api/bookstore';
import api from '../api';
import '../styles/complaint-center-console.css';

const router = useRouter();
const authStore = useAuthStore();
const { homepage } = useHomepagePublicData();
const CHAPTER_PAGE_SIZE = 80;

// 页面头部指标
const headerMetrics = [
  { key: 'sla', label: '响应时效', value: '24小时内', detail: '首次回复' },
];

// 表单数据
const form = ref({
  type: '' as 'plagiarism' | 'illegal' | 'other',
  targetType: 'book' as 'book' | 'chapter',
  targetId: '',
  targetTitle: '',
  chapterId: '' as '' | number,
  description: '',
  reporterName: '',
  reporterPhone: '',
  reporterEmail: '',
});

// 图片上传
const imageList = ref<Array<{ id: string; data: string; name: string }>>([]);
const uploadingImage = ref(false);

// 作品搜索
const searchingBooks = ref(false);
const selectedBookId = ref('');
const bookOptions = ref<Array<{ value: string; label: string; novelId: string }>>([]);

// 章节选项
const chapterOptions = ref<Array<{ value: number; label: string }>>([]);
const loadingChapters = ref(false);
const chapterPage = ref(0);
const chapterTotal = ref(0);
const chapterHasMore = ref(false);

// 验证码
const sliderCaptchaRef = ref();
const captchaVerified = ref(false);
const captchaPayload = ref<{ challengeId: string; position: number; duration: number } | null>(null);

const formRef = ref();
const submitting = ref(false);

// 举报类型
const reportTypes = [
  { value: 'plagiarism', label: '侵权抄袭', icon: Document },
  { value: 'illegal', label: '违规内容', icon: Warning },
  { value: 'other', label: '其他问题', icon: ChatLineSquare },
];

// 表单校验
const formRules = computed(() => ({
  type: [{ required: true, message: '请选择举报类型', trigger: 'change' }],
  description: [
    { required: true, message: '请描述具体问题', trigger: 'blur' },
    { min: 10, message: '请至少输入10个字', trigger: 'blur' },
  ],
  reporterName: [
    { required: true, message: '请填写真实姓名', trigger: 'blur' },
    { min: 2, message: '姓名至少2个字', trigger: 'blur' },
  ],
  reporterPhone: [
    { required: true, message: '请填写手机号', trigger: 'blur' },
    { pattern: /^1[3-9]\d{9}$/, message: '请输入正确的手机号', trigger: 'blur' },
  ],
  reporterEmail: [
    { required: true, message: '请填写邮箱', trigger: 'blur' },
    { type: 'email', message: '请输入正确的邮箱地址', trigger: 'blur' },
  ],
}));

// 搜索作品
async function searchBooks(query: string) {
  if (!query || query.length < 2) {
    bookOptions.value = [];
    return;
  }
  searchingBooks.value = true;
  try {
    const result = await getBookStoreList({
      keyword: query,
      page: 1,
      pageSize: 20,
    });
    bookOptions.value = result.items.map(book => ({
      value: book.id,
      label: book.title,
      novelId: book.novelId,
    }));
  } catch (err) {
    bookOptions.value = [];
  } finally {
    searchingBooks.value = false;
  }
}

function resetChapterOptions() {
  form.value.chapterId = '';
  chapterOptions.value = [];
  loadingChapters.value = false;
  chapterPage.value = 0;
  chapterTotal.value = 0;
  chapterHasMore.value = false;
}

// 选择作品
async function handleBookSelect(bookId: string) {
  selectedBookId.value = bookId || '';
  resetChapterOptions();

  if (!bookId) {
    form.value.targetId = '';
    form.value.targetTitle = '';
    return;
  }

  const book = bookOptions.value.find(b => b.value === bookId);
  if (book) {
    form.value.targetId = book.novelId;
    form.value.targetTitle = book.label;
  }

  if (form.value.targetType === 'chapter') {
    await loadChapters(bookId);
  }
}

// 加载章节列表
async function loadChapters(bookId: string) {
  if (!bookId || loadingChapters.value || !chapterHasMore.value && chapterPage.value > 0) return;

  const nextPage = chapterPage.value + 1;
  loadingChapters.value = true;
  try {
    const page = await getBookStorePublicChapterPage(bookId, {
      page: nextPage,
      pageSize: CHAPTER_PAGE_SIZE,
      order: 'asc',
    });
    const existing = new Set(chapterOptions.value.map(item => item.value));
    const nextOptions = page.items
      .filter(ch => !existing.has(ch.chapterNumber))
      .map(ch => ({
        value: ch.chapterNumber,
        label: `第${ch.chapterNumber}章 ${ch.title}`,
      }));
    chapterOptions.value = [...chapterOptions.value, ...nextOptions];
    chapterPage.value = page.page;
    chapterTotal.value = page.total;
    chapterHasMore.value = page.hasMore;
  } catch (err) {
    if (nextPage === 1) {
      resetChapterOptions();
    }
  } finally {
    loadingChapters.value = false;
  }
}

async function loadMoreChapters() {
  if (!selectedBookId.value) return;
  await loadChapters(selectedBookId.value);
}

// 监听举报对象类型变化
async function handleTargetTypeChange() {
  form.value.targetId = '';
  form.value.targetTitle = '';
  selectedBookId.value = '';
  resetChapterOptions();
  bookOptions.value = [];
}

// 处理图片上传
async function handleImageUpload(file: File) {
  const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (!validTypes.includes(file.type)) {
    ElMessage.warning('仅支持 JPG、PNG、WebP、GIF 格式');
    return;
  }
  const maxSize = 5 * 1024 * 1024;
  if (file.size > maxSize) {
    ElMessage.warning('图片大小不能超过 5MB');
    return;
  }
  if (imageList.value.length >= 3) {
    ElMessage.warning('最多上传 3 张图片');
    return;
  }

  uploadingImage.value = true;
  try {
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = (e.target?.result as string).split(',')[1];
      imageList.value.push({
        id: `${Date.now()}-${Math.random()}`,
        data: base64,
        name: file.name,
      });
    };
    reader.readAsDataURL(file);
  } finally {
    uploadingImage.value = false;
  }
}

// 删除图片
function removeImage(id: string) {
  const index = imageList.value.findIndex(img => img.id === id);
  if (index > -1) imageList.value.splice(index, 1);
}

// 验证码验证完成
function handleCaptchaVerified(payload: { challengeId: string; position: number; duration: number }) {
  captchaVerified.value = true;
  captchaPayload.value = payload;
}

function clearCaptchaState() {
  captchaVerified.value = false;
  captchaPayload.value = null;
}

// 重置验证码
function resetCaptcha() {
  clearCaptchaState();
  sliderCaptchaRef.value?.reset();
}

// 提交举报
async function submitReport() {
  if (!formRef.value) return;

  await formRef.value.validate(async (valid: boolean) => {
    if (!valid) return;

    if (!authStore.isAuthenticated) {
      ElMessage.warning('请先登录');
      router.push('/login');
      return;
    }

    if ((form.value.targetType === 'book' || form.value.targetType === 'chapter') && !form.value.targetId) {
      ElMessage.warning('请先搜索并选择作品');
      return;
    }

    if (form.value.targetType === 'chapter' && !form.value.chapterId) {
      ElMessage.warning('请选择要举报的章节');
      return;
    }

    if (!captchaVerified.value || !captchaPayload.value) {
      ElMessage.warning('请先完成滑动验证');
      return;
    }

    submitting.value = true;
    try {
      const reportData: any = {
        novelId: form.value.targetId,
        reportType: form.value.type,
        reason: form.value.description,
        evidence: imageList.value.map(img => img.data),
        reporterName: form.value.reporterName,
        reporterPhone: form.value.reporterPhone,
        reporterEmail: form.value.reporterEmail,
        sliderCaptcha: captchaPayload.value,
      };

      if (form.value.targetType === 'chapter' && form.value.chapterId) {
        reportData.chapterId = String(form.value.chapterId);
      }

      await api.post('/reports/submit', reportData);

      ElMessage.success('提交成功，我们会在24小时内处理您的问题');
      formRef.value.resetFields();
      form.value.targetTitle = '';
      form.value.targetId = '';
      form.value.chapterId = '';
      form.value.reporterName = '';
      form.value.reporterPhone = '';
      form.value.reporterEmail = '';
      imageList.value = [];
      bookOptions.value = [];
      selectedBookId.value = '';
      resetChapterOptions();
      resetCaptcha();
    } catch (error: any) {
      ElMessage.error(error.response?.data?.error || '提交失败，请稍后重试');
    } finally {
      submitting.value = false;
    }
  });
}
</script>

<template>
  <div class="cc-page">
    <div class="cc-page__header">
      <ConsolePageHeader
        eyebrow="帮助中心"
        title="提交举报"
        subtitle="发现违规内容或遇到问题？请告诉我们，我们会尽快处理。"
        :metrics="headerMetrics"
      >
        <template #actions>
          <el-button v-if="authStore.isAuthenticated" plain @click="router.push('/admin/report-center')">
            我的举报
          </el-button>
        </template>
      </ConsolePageHeader>
    </div>

    <div class="cc-body">
      <!-- 表单面板 -->
      <section class="cc-form-panel">
        <el-form
          ref="formRef"
          :model="form"
          :rules="formRules"
          label-width="0"
        >
          <!-- 举报类型 -->
          <div class="cc-type-group">
            <div class="cc-type-label">选择问题类型</div>
            <div class="cc-type-list">
              <label
                v-for="type in reportTypes"
                :key="type.value"
                class="cc-type-card"
                :class="{ 'cc-type-card--active': form.type === type.value }"
              >
                <input
                  :id="`type-${type.value}`"
                  v-model="form.type"
                  type="radio"
                  :value="type.value"
                  class="cc-type-input"
                />
                <div class="cc-type-icon">
                  <el-icon :size="28"><component :is="type.icon" /></el-icon>
                </div>
                <span class="cc-type-text">{{ type.label }}</span>
              </label>
            </div>
          </div>

          <!-- 举报对象 -->
          <div class="cc-target-section">
            <div class="cc-section-label">要举报的内容</div>

            <el-radio-group v-model="form.targetType" @change="handleTargetTypeChange" class="cc-target-toggle">
              <el-radio-button value="book">整部作品</el-radio-button>
              <el-radio-button value="chapter">单章内容</el-radio-button>
            </el-radio-group>

            <!-- 选择作品 -->
            <div v-if="form.targetType === 'book' || form.targetType === 'chapter'" class="cc-field">
              <el-select
                v-model="selectedBookId"
                filterable
                remote
                remote-show-suffix
                :remote-method="searchBooks"
                :loading="searchingBooks"
                placeholder="搜索作品名称..."
                clearable
                style="width: 100%"
                @change="handleBookSelect"
              >
                <el-option
                  v-for="item in bookOptions"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value"
                />
              </el-select>
            </div>

            <!-- 选择章节 -->
            <div v-if="form.targetType === 'chapter'" class="cc-field">
              <el-select
                v-model="form.chapterId"
                placeholder="选择章节"
                clearable
                style="width: 100%"
                :loading="loadingChapters"
                :disabled="!selectedBookId"
              >
                <el-option
                  v-for="item in chapterOptions"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value"
                />
                <div v-if="chapterHasMore || chapterOptions.length > 0" class="cc-chapter-select-footer">
                  <span class="cc-chapter-select-footer__meta">
                    已加载 {{ chapterOptions.length }}{{ chapterTotal ? ` / ${chapterTotal}` : '' }} 章
                  </span>
                  <el-button
                    v-if="chapterHasMore"
                    link
                    type="primary"
                    :loading="loadingChapters"
                    @click.stop="loadMoreChapters"
                  >
                    继续加载章节
                  </el-button>
                </div>
              </el-select>
            </div>
          </div>

          <!-- 问题描述 -->
          <div class="cc-field">
            <label class="cc-field-label">请描述具体问题</label>
            <el-input
              v-model="form.description"
              type="textarea"
              :rows="4"
              placeholder="请详细说明您发现的问题，包括具体位置、内容等..."
              maxlength="500"
              show-word-limit
            />
          </div>

          <!-- 截图上传 -->
          <div class="cc-field">
            <label class="cc-field-label">截图证据（可选）</label>
            <div class="cc-upload-section">
              <el-upload
                :auto-upload="false"
                :show-file-list="false"
                accept="image/jpeg,image/png,image/webp,image/gif"
                :on-change="(_, file) => handleImageUpload(file.raw)"
              >
                <el-button :loading="uploadingImage" plain>
                  <el-icon><Upload /></el-icon>
                  上传截图
                </el-button>
              </el-upload>
              <span class="cc-upload-hint">最多3张，每张不超过5MB</span>

              <div v-if="imageList.length > 0" class="cc-image-list">
                <div v-for="img in imageList" :key="img.id" class="cc-image-item">
                  <img :src="`data:image/jpeg;base64,${img.data}`" alt="截图" />
                  <el-button
                    type="danger"
                    size="small"
                    circle
                    @click="removeImage(img.id)"
                  >
                    <el-icon><Delete /></el-icon>
                  </el-button>
                </div>
              </div>
            </div>
          </div>

          <!-- 联系信息 -->
          <div class="cc-contact-section">
            <div class="cc-section-label">您的联系信息</div>
            <p class="cc-contact-hint">需要填写与实名认证一致的信息</p>

            <div class="cc-contact-grid">
              <div class="cc-field">
                <label class="cc-field-label">真实姓名</label>
                <el-input
                  v-model="form.reporterName"
                  placeholder="与实名认证一致"
                  clearable
                />
              </div>
              <div class="cc-field">
                <label class="cc-field-label">手机号</label>
                <el-input
                  v-model="form.reporterPhone"
                  placeholder="与实名认证一致"
                  clearable
                  maxlength="11"
                />
              </div>
              <div class="cc-field cc-field-full">
                <label class="cc-field-label">邮箱</label>
                <el-input
                  v-model="form.reporterEmail"
                  placeholder="用于接收处理结果通知"
                  clearable
                />
              </div>
            </div>
          </div>

          <!-- 验证码 -->
          <div class="cc-captcha-section">
            <SliderCaptcha
              ref="sliderCaptchaRef"
              @verified="handleCaptchaVerified"
              @challenge-reset="clearCaptchaState"
            />
          </div>

          <!-- 提交按钮 -->
          <div class="cc-submit-section">
            <el-button
              type="primary"
              size="large"
              :loading="submitting"
              :disabled="!captchaVerified"
              @click="submitReport"
            >
              {{ submitting ? '提交中...' : '提交举报' }}
            </el-button>
          </div>
        </el-form>
      </section>
    </div>

    <div class="cc-footer-wrapper">
      <LandingFooterSection :footer="homepage.footer" />
      <DisclaimerFooter />
    </div>
  </div>
</template>

<style scoped>
.cc-page {
  min-height: 100vh;
  background:
    radial-gradient(circle at 6% -12%, color-mix(in srgb, #ef4444 16%, transparent), transparent 42%),
    radial-gradient(circle at 94% -8%, color-mix(in srgb, #f97316 12%, transparent), transparent 46%),
    var(--nw-bg-primary);
}

.cc-page__header {
  max-width: 1280px;
  margin: 0 auto;
  padding: 24px 20px 0;
}

.cc-body {
  max-width: 1280px;
  margin: 0 auto;
  padding: 24px 20px 48px;
}

.cc-form-panel {
  padding: 24px;
  border-radius: 18px;
  border: 1px solid var(--nw-border);
  background: linear-gradient(140deg, rgba(255, 245, 245, 0.92), rgba(255, 241, 242, 0.88));
  box-shadow: var(--nw-shadow-sm);
}

.cc-form-panel .el-form {
  display: grid;
  gap: 20px;
}

/* 举报类型卡片 */
.cc-type-group {
  margin-bottom: 32px;
}

.cc-type-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--nw-text-primary);
  margin-bottom: 12px;
}

.cc-type-list {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.cc-type-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 20px;
  border-radius: 16px;
  border: 2px solid var(--nw-border);
  background: linear-gradient(140deg, rgba(255, 250, 250, 0.9), rgba(255, 248, 248, 0.86));
  cursor: pointer;
  transition: all 0.2s ease;
}

.cc-type-card:hover {
  border-color: #ef4444;
  background: linear-gradient(140deg, rgba(254, 242, 242, 0.92), rgba(254, 235, 235, 0.88));
}

.cc-type-card--active {
  border-color: #ef4444;
  background: linear-gradient(140deg, rgba(254, 226, 226, 0.95), rgba(254, 215, 215, 0.9));
}

.cc-type-input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.cc-type-icon {
  width: 48px;
  height: 48px;
  display: grid;
  place-items: center;
  border-radius: 14px;
  background: color-mix(in srgb, var(--el-color-primary) 8%, transparent);
  color: var(--el-color-primary);
}

.cc-type-text {
  font-size: 15px;
  font-weight: 600;
  color: var(--nw-text-primary);
}

/* 举报对象区域 */
.cc-target-section {
  padding: 18px;
  border-radius: 16px;
  border: 1px solid var(--nw-border);
  background: color-mix(in srgb, rgba(239, 68, 68, 0.04), transparent);
  margin-bottom: 24px;
}

.cc-section-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--nw-text-primary);
  margin-bottom: 12px;
}

.cc-target-toggle {
  margin-bottom: 16px;
}

.cc-field {
  margin-bottom: 20px;
}

.cc-field-label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--nw-text-secondary);
  margin-bottom: 8px;
}

.cc-chapter-select-footer {
  position: sticky;
  bottom: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 12px;
  border-top: 1px solid var(--nw-border);
  background: color-mix(in srgb, var(--nw-bg-primary) 94%, transparent);
}

.cc-chapter-select-footer__meta {
  font-size: 12px;
  color: var(--nw-text-muted);
}

/* 联系信息区域 */
.cc-contact-section {
  margin: 24px 0;
  padding: 18px;
  border-radius: 16px;
  background: linear-gradient(140deg, rgba(255, 247, 240, 0.88), rgba(255, 245, 235, 0.84));
  border: 1px solid color-mix(in srgb, #f97316 18%, var(--nw-border));
}

.cc-contact-hint {
  margin: 0 0 16px;
  font-size: 13px;
  color: var(--nw-text-secondary);
}

.cc-contact-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

.cc-field-full {
  grid-column: 1 / -1;
}

/* 上传区域 */
.cc-upload-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cc-upload-hint {
  font-size: 12px;
  color: var(--nw-text-muted);
}

.cc-image-list {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.cc-image-item {
  position: relative;
  width: 80px;
  height: 80px;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--nw-border);
}

.cc-image-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cc-image-item .el-button {
  position: absolute;
  bottom: 4px;
  right: 4px;
}

/* 验证码区域 */
.cc-captcha-section {
  margin: 24px 0;
}

/* 提交区域 */
.cc-submit-section {
  margin-top: 32px;
  padding-top: 24px;
  border-top: 1px solid var(--nw-border);
}

.cc-submit-section .el-button {
  width: 100%;
  height: 48px;
  font-size: 16px;
}

/* 响应式 */
@media (max-width: 768px) {
  .cc-page__header {
    padding: 16px 12px 0;
  }

  .cc-body {
    padding: 16px 12px 32px;
  }

  .cc-form-panel {
    padding: 16px;
    border-radius: 14px;
  }

  .cc-type-group {
    margin-bottom: 20px;
  }

  .cc-type-list {
    grid-template-columns: 1fr;
    gap: 10px;
  }

  .cc-type-card {
    padding: 16px;
    flex-direction: row;
    justify-content: flex-start;
    gap: 12px;
  }

  .cc-type-icon {
    width: 40px;
    height: 40px;
    flex-shrink: 0;
  }

  .cc-type-icon .el-icon {
    font-size: 22px;
  }

  .cc-type-text {
    font-size: 14px;
  }

  .cc-target-section {
    padding: 14px;
    border-radius: 12px;
    margin-bottom: 16px;
  }

  .cc-section-label {
    font-size: 13px;
  }

  .cc-field {
    margin-bottom: 14px;
  }

  .cc-field-label {
    font-size: 12px;
  }

  .cc-contact-section {
    padding: 14px;
    border-radius: 12px;
    margin: 16px 0;
  }

  .cc-contact-hint {
    font-size: 12px;
    margin-bottom: 12px;
  }

  .cc-contact-grid {
    grid-template-columns: 1fr;
    gap: 12px;
  }

  .cc-image-list {
    gap: 8px;
  }

  .cc-image-item {
    width: 64px;
    height: 64px;
  }

  .cc-captcha-section {
    margin: 16px 0;
  }

  .cc-submit-section {
    margin-top: 20px;
    padding-top: 16px;
  }

  .cc-submit-section .el-button {
    height: 44px;
    font-size: 15px;
  }

  .cc-footer-wrapper {
    padding: 0 12px;
  }
}

/* 暗黑模式 */
html.dark .cc-page {
  background:
    radial-gradient(circle at 6% -12%, rgba(239, 68, 68, 0.12), transparent 42%),
    radial-gradient(circle at 94% -8%, rgba(249, 115, 22, 0.10), transparent 46%),
    var(--nw-bg-primary);
}

html.dark .cc-type-card {
  border-color: rgba(239, 68, 68, 0.2);
  background: linear-gradient(140deg, rgba(35, 20, 20, 0.88), rgba(30, 15, 15, 0.84));
}

html.dark .cc-type-card:hover {
  border-color: rgba(239, 68, 68, 0.4);
  background: linear-gradient(140deg, rgba(45, 20, 20, 0.92), rgba(40, 15, 15, 0.88));
}

html.dark .cc-type-card--active {
  border-color: rgba(239, 68, 68, 0.5);
  background: linear-gradient(140deg, rgba(55, 25, 25, 0.95), rgba(50, 20, 20, 0.9));
}

html.dark .cc-type-icon {
  background: color-mix(in srgb, rgba(239, 68, 68, 0.15), transparent);
  color: #f87171;
}

html.dark .cc-contact-section {
  background: linear-gradient(140deg, rgba(40, 25, 15, 0.9), rgba(35, 20, 10, 0.86));
  border-color: rgba(249, 115, 22, 0.25);
}

html.dark .cc-target-section {
  background: linear-gradient(140deg, rgba(40, 20, 20, 0.85), rgba(35, 15, 15, 0.82));
  border-color: rgba(239, 68, 68, 0.18);
}

html.dark .cc-form-panel {
  background: linear-gradient(140deg, rgba(40, 20, 20, 0.9), rgba(35, 15, 15, 0.86));
  border-color: rgba(239, 68, 68, 0.2);
}
</style>
