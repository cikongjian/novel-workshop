import { computed, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import {
  fetchPublicHomepage,
  fetchPublicHomepageChapter,
  type PublicHomepageChapterPayload,
  type PublicHomepagePayload,
  type PublicHomepageShowcaseNovel,
} from '../api/homepage';
import { brand, formatCopyright } from '../config/brand';

const FALLBACK_HOMEPAGE: PublicHomepagePayload = {
  brandSubtitle: '把灵感、故事线与成稿推进放进同一条长篇流程',
  variant: {
    heroTitle: '从一句话灵感，到多章故事线与长篇成稿',
    heroDescription: '先推演百章节奏与数章故事线，再批量生成正文；需要换路线时可从任意章节分支续写，并用一致性检查把长篇稳住。',
    primaryActionLabel: '进入创作台',
    primaryActionRoute: '/dashboard',
    secondaryActionLabel: '查看定价',
    secondaryActionRoute: '/pricing',
    capabilities: ['故事线推演', '批量生成', '分支续写', '一致性体检'],
    highlights: [],
  },
  showcase: {
    eyebrow: 'FEATURED NOVELS',
    title: '代表作品试读',
    description: '用真实样章直接展示长篇生成、批量改写与长线一致性的成稿效果。',
    items: [],
  },
  footer: {
    companyName: brand.displayName,
    copyrightText: formatCopyright(),
    icpNumber: '',
    icpLink: '',
    policeNumber: '',
    policeLink: '',
    supportEmail: '',
    address: '',
    privacyLabel: '隐私政策',
    privacyLink: '/privacy',
    termsLabel: '用户协议',
    termsLink: '/terms',
    contactLabel: '联系我们',
    contactLink: '',
    contacts: [],
    navGroups: [
      {
        title: '产品',
        links: [
          { label: '首页', href: '/' },
          { label: '登录', href: '/login' },
          { label: '工作台', href: '/dashboard' },
        ],
      },
      {
        title: '帮助',
        links: [],
      },
      {
        title: '法务',
        links: [
          { label: '隐私政策', href: '/privacy' },
          { label: '用户协议', href: '/terms' },
        ],
      },
    ],
  },
};

export function useHomepagePublicData() {
  const loading = ref(true);
  const previewLoading = ref(false);
  const homepage = ref<PublicHomepagePayload>(FALLBACK_HOMEPAGE);
  const preview = ref<PublicHomepageChapterPayload | null>(null);
  const previewVisible = ref(false);

  const variant = computed(() => homepage.value.variant);
  const showcaseItems = computed<PublicHomepageShowcaseNovel[]>(() => homepage.value.showcase.items);

  async function loadHomepage() {
    loading.value = true;
    try {
      const payload = await fetchPublicHomepage();
      homepage.value = { ...FALLBACK_HOMEPAGE, ...payload, footer: { ...FALLBACK_HOMEPAGE.footer, ...payload.footer } };
    } catch (error) {
      const message = error instanceof Error ? error.message : '加载首页内容失败';
      ElMessage.error(message);
    } finally {
      loading.value = false;
    }
  }

  async function openPreview(novelId: string, chapterNumber: number) {
    previewLoading.value = true;
    previewVisible.value = true;
    try {
      preview.value = await fetchPublicHomepageChapter(novelId, chapterNumber);
    } catch (error) {
      previewVisible.value = false;
      const message = error instanceof Error ? error.message : '加载章节预览失败';
      ElMessage.error(message);
    } finally {
      previewLoading.value = false;
    }
  }

  function closePreview() {
    previewVisible.value = false;
    preview.value = null;
  }

  onMounted(() => {
    void loadHomepage();
  });

  return {
    variant,
    closePreview,
    homepage,
    loading,
    openPreview,
    preview,
    previewLoading,
    previewVisible,
    showcaseItems,
  };
}
