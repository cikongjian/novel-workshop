<script setup lang="ts">
import { computed } from 'vue';
import type { HomepageFooter } from '../../api/settings';
import BrandEmblem from '../brand/BrandEmblem.vue';
import { getHomepageFooterContacts } from '../../utils/homepage-footer-contacts';
import { brand, formatCopyright } from '../../config/brand';

const props = defineProps<{
  footer: HomepageFooter;
}>();

const metaItems = computed(() => {
  const items: Array<{ key: string; label: string; value: string; href?: string }> = [];
  if (props.footer.icpNumber.trim()) {
    items.push({
      key: 'icp',
      label: 'ICP备案',
      value: props.footer.icpNumber.trim(),
      href: props.footer.icpLink.trim() || undefined,
    });
  }
  if (props.footer.policeNumber.trim()) {
    items.push({
      key: 'police',
      label: '公安备案',
      value: props.footer.policeNumber.trim(),
      href: props.footer.policeLink.trim() || undefined,
    });
  }
  if (props.footer.address.trim()) {
    items.push({
      key: 'address',
      label: '办公地址',
      value: props.footer.address.trim(),
    });
  }
  for (const contact of getHomepageFooterContacts(props.footer)) {
    items.push({
      key: contact.key,
      label: contact.label,
      value: contact.value,
      href: contact.href,
    });
  }
  return items;
});

const commonLinks = computed(() => {
  const items: Array<{ key: string; label: string; href: string; highlight?: boolean }> = [];
  if (props.footer.privacyLabel.trim() && props.footer.privacyLink.trim()) {
    items.push({
      key: 'privacy',
      label: props.footer.privacyLabel.trim(),
      href: props.footer.privacyLink.trim(),
    });
  }
  if (props.footer.termsLabel.trim() && props.footer.termsLink.trim()) {
    items.push({
      key: 'terms',
      label: props.footer.termsLabel.trim(),
      href: props.footer.termsLink.trim(),
    });
  }
  if (props.footer.contactLabel.trim() && props.footer.contactLink.trim()) {
    items.push({
      key: 'contact',
      label: props.footer.contactLabel.trim(),
      href: props.footer.contactLink.trim(),
    });
  }
  return items;
});

function isExternalHref(href: string) {
  return /^https?:\/\//.test(href);
}
</script>

<template>
  <footer class="landing-footer star-brand-panel">
    <div class="footer-main">
      <div class="footer-brand">
        <p class="star-brand-kicker footer-kicker">
          <BrandEmblem :size="14" />
          <span>备案与服务</span>
        </p>
        <div class="footer-brand-copy">
          <strong>{{ footer?.companyName || brand.displayName }}</strong>
          <p>{{ footer?.copyrightText || formatCopyright() }}</p>
        </div>
      </div>

      <div v-if="commonLinks.length > 0" class="footer-links" aria-label="法务链接">
        <a
          v-for="item in commonLinks"
          :key="item.key"
          :href="item.href"
          :target="isExternalHref(item.href) ? '_blank' : undefined"
          :rel="isExternalHref(item.href) ? 'noreferrer' : undefined"
          :class="['footer-link', item.highlight ? 'footer-link-highlight' : '']"
        >
          {{ item.label }}
        </a>
      </div>
    </div>

    <div v-if="metaItems.length > 0" class="footer-meta" aria-label="备案与联系信息">
      <template v-for="item in metaItems" :key="item.key">
        <a
          v-if="item.href"
          :href="item.href"
          :target="isExternalHref(item.href) ? '_blank' : undefined"
          :rel="isExternalHref(item.href) ? 'noreferrer' : undefined"
          class="footer-meta-item"
        >
          <span>{{ item.label }}</span>
          <strong>{{ item.value }}</strong>
        </a>
        <div v-else class="footer-meta-item">
          <span>{{ item.label }}</span>
          <strong>{{ item.value }}</strong>
        </div>
      </template>
    </div>
  </footer>
</template>

<style scoped>
.landing-footer {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px 20px;
  border-radius: 20px;
  border-color: color-mix(in srgb, var(--star-brand-sky) 24%, var(--nw-border));
  background:
    linear-gradient(
      145deg,
      color-mix(in srgb, var(--star-brand-sky) 6%, var(--nw-bg-secondary)),
      color-mix(in srgb, var(--star-brand-teal) 4%, var(--nw-bg-secondary))
    );
}

.footer-main {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.footer-brand {
  display: grid;
  gap: 8px;
}

.footer-kicker {
  color: color-mix(in srgb, var(--star-brand-sky) 72%, var(--nw-text-secondary));
}

.footer-brand-copy {
  display: grid;
  gap: 6px;
}

.footer-brand-copy strong {
  color: var(--nw-text-primary);
  font-size: 20px;
}

.footer-brand-copy p {
  margin: 0;
  color: var(--nw-text-secondary);
  font-size: 14px;
  line-height: 1.65;
}

.footer-links {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.footer-link {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--star-brand-sky) 26%, var(--nw-border));
  background: color-mix(in srgb, var(--star-brand-sky) 10%, var(--nw-bg-card));
  color: color-mix(in srgb, var(--star-brand-sky) 84%, var(--nw-text-primary));
  font-size: 12px;
  font-weight: 600;
  text-decoration: none;
}

.footer-link-highlight {
  border-color: #ef4444;
  background: color-mix(in srgb, #ef4444 12%, var(--nw-bg-card));
  color: #ef4444;
}

.footer-meta {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 10px;
}

.footer-meta-item {
  display: grid;
  align-content: center;
  gap: 4px;
  min-height: 66px;
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--star-brand-sky) 16%, var(--nw-border));
  background: color-mix(in srgb, var(--star-brand-sky) 6%, var(--nw-bg-card));
  text-decoration: none;
}

.footer-meta-item span {
  color: var(--nw-text-muted);
  font-size: 11px;
}

.footer-meta-item strong {
  color: var(--nw-text-primary);
  font-size: 13px;
  line-height: 1.5;
  word-break: break-word;
}

@media (max-width: 980px) {
  .footer-main {
    flex-direction: column;
    align-items: flex-start;
  }
}

@media (max-width: 720px) {
  .landing-footer {
    padding: 14px;
    gap: 10px;
  }

  .footer-brand-copy strong {
    font-size: 17px;
  }

  .footer-brand-copy p {
    font-size: 12px;
  }

  .footer-link {
    min-height: 26px;
    padding: 0 10px;
    font-size: 11px;
  }

  .footer-meta {
    grid-template-columns: 1fr;
    gap: 8px;
  }

  .footer-meta-item {
    min-height: 58px;
    padding: 9px 10px;
  }

  .footer-meta-item span {
    font-size: 10px;
  }

  .footer-meta-item strong {
    font-size: 12px;
  }
}
</style>
