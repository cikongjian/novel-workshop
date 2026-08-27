<script setup lang="ts">
import { computed, ref } from 'vue';
import type { HomepageFooter } from '../../api/settings';
import { getHomepageFooterContacts } from '../../utils/homepage-footer-contacts';
import PlatformDisclaimerDialog from '../legal/PlatformDisclaimerDialog.vue';
import { brand } from '../../config/brand';

const props = defineProps<{
  footer: HomepageFooter;
}>();

const disclaimerVisible = ref(false);

const legalLinks = computed(() => {
  const items: Array<{ key: string; label: string; href?: string; dialog?: boolean }> = [];
  if (props.footer.privacyLabel.trim() && props.footer.privacyLink.trim()) {
    items.push({ key: 'privacy', label: props.footer.privacyLabel.trim(), href: props.footer.privacyLink.trim() });
  }
  if (props.footer.termsLabel.trim() && props.footer.termsLink.trim()) {
    items.push({ key: 'terms', label: props.footer.termsLabel.trim(), href: props.footer.termsLink.trim() });
  }
  if (props.footer.contactLabel.trim() && props.footer.contactLink.trim()) {
    items.push({ key: 'contact', label: props.footer.contactLabel.trim(), href: props.footer.contactLink.trim() });
  }
  items.push({ key: 'disclaimer', label: '合规说明', dialog: true });
  return items;
});

const compactCopyright = computed(() => {
  const companyName = props.footer.companyName.trim() || brand.displayName;
  const year = props.footer.copyrightText.match(/20\d{2}/)?.[0] || '2026';
  return `${companyName} · © ${year}`;
});

const contactItems = computed(() => getHomepageFooterContacts(props.footer).slice(0, 4));

function isExternalHref(href: string) {
  return /^https?:\/\//.test(href);
}
</script>

<template>
  <footer class="landing-footer-compact">
    <div class="landing-footer-compact__mainline">
      <p class="landing-footer-compact__copyright">{{ compactCopyright }}</p>
    </div>

    <div v-if="legalLinks.length" class="landing-footer-compact__subline" aria-label="法务链接">
      <template v-for="item in legalLinks" :key="item.key">
        <button
          v-if="item.dialog"
          class="landing-footer-compact__subitem"
          type="button"
          @click="disclaimerVisible = true"
        >
          {{ item.label }}
        </button>
        <a
          v-else
          class="landing-footer-compact__subitem"
          :href="item.href"
          :target="isExternalHref(item.href!) ? '_blank' : undefined"
          :rel="isExternalHref(item.href!) ? 'noreferrer' : undefined"
        >
          {{ item.label }}
        </a>
      </template>
    </div>

    <div v-if="contactItems.length" class="landing-footer-compact__contacts" aria-label="联系方式">
      <template v-for="item in contactItems" :key="item.key">
        <a
          v-if="item.href"
          class="landing-footer-compact__contact"
          :href="item.href"
          :target="isExternalHref(item.href) ? '_blank' : undefined"
          :rel="isExternalHref(item.href) ? 'noreferrer' : undefined"
        >
          <span>{{ item.label }}</span>
          <strong>{{ item.value }}</strong>
        </a>
        <div v-else class="landing-footer-compact__contact">
          <span>{{ item.label }}</span>
          <strong>{{ item.value }}</strong>
        </div>
      </template>
    </div>
  </footer>
  <PlatformDisclaimerDialog v-model="disclaimerVisible" :footer="footer" />
</template>

<style scoped>
.landing-footer-compact {
  display: grid;
  justify-items: center;
  gap: 5px;
  padding: 9px 14px;
  border-top: 1px solid color-mix(in srgb, var(--star-brand-sky) 18%, rgba(125, 211, 252, 0.12));
  color: rgba(203, 213, 225, 0.72);
}

.landing-footer-compact__mainline,
.landing-footer-compact__subline,
.landing-footer-compact__contacts {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 5px 10px;
  min-width: 0;
}

.landing-footer-compact__copyright {
  margin: 0;
  color: rgba(226, 232, 240, 0.78);
  font-size: 11px;
  font-weight: 700;
  line-height: 1.45;
}

.landing-footer-compact__subitem,
.landing-footer-compact__contact {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  text-decoration: none;
}

.landing-footer-compact__subitem {
  color: rgba(148, 163, 184, 0.86);
  font-size: 10px;
  line-height: 1.45;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  font-family: inherit;
}

.landing-footer-compact__subitem::before,
.landing-footer-compact__contact::before {
  content: '·';
  color: rgba(148, 163, 184, 0.54);
}

.landing-footer-compact__contact span {
  font-size: 10px;
  color: rgba(148, 163, 184, 0.86);
}

.landing-footer-compact__contact strong {
  font-size: 10px;
  font-weight: 600;
  color: rgba(191, 219, 254, 0.9);
}

@media (max-width: 860px) {
  .landing-footer-compact {
    gap: 4px;
    padding: 8px 12px;
  }

  .landing-footer-compact__mainline,
  .landing-footer-compact__subline,
  .landing-footer-compact__contacts {
    gap: 4px 8px;
  }
}
</style>
