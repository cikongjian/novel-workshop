import type { HomepageFooter, HomepageFooterContact, HomepageFooterContactType } from '../api/settings';

export const HOMEPAGE_FOOTER_CONTACT_TYPE_OPTIONS: Array<{ value: HomepageFooterContactType; label: string }> = [
  { value: 'email', label: '邮箱' },
  { value: 'qq', label: 'QQ群' },
  { value: 'wechat', label: '微信' },
  { value: 'wecom', label: '企业微信' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'phone', label: '电话' },
  { value: 'other', label: '其他' },
];

const CONTACT_TYPE_LABEL_MAP = new Map(
  HOMEPAGE_FOOTER_CONTACT_TYPE_OPTIONS.map((item) => [item.value, item.label] as const),
);

export type HomepageFooterDisplayContact = {
  key: string;
  type: HomepageFooterContactType;
  label: string;
  value: string;
  href?: string;
};

export function getHomepageFooterContactTypeLabel(type: HomepageFooterContactType): string {
  return CONTACT_TYPE_LABEL_MAP.get(type) ?? '联系方式';
}

export function createDefaultHomepageFooterContact(
  type: HomepageFooterContactType = 'wechat',
): HomepageFooterContact {
  return {
    type,
    label: getHomepageFooterContactTypeLabel(type),
    value: '',
    href: '',
  };
}

export function getHomepageFooterContacts(footer: HomepageFooter): HomepageFooterDisplayContact[] {
  const items: HomepageFooterDisplayContact[] = [];
  const seen = new Set<string>();

  const pushItem = (
    key: string,
    type: HomepageFooterContactType,
    rawLabel: string,
    rawValue: string,
    rawHref?: string,
  ) => {
    const value = rawValue.trim();
    if (!value) return;
    const label = rawLabel.trim() || getHomepageFooterContactTypeLabel(type);
    const href = rawHref?.trim() || (type === 'email' ? `mailto:${value}` : '');
    const dedupeKey = `${type}|${value}|${href}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    items.push({
      key,
      type,
      label,
      value,
      href: href || undefined,
    });
  };

  pushItem('legacy-email', 'email', '联系邮箱', footer.supportEmail);

  footer.contacts.forEach((contact, index) => {
    pushItem(
      `contact-${index}`,
      contact.type,
      contact.label,
      contact.value,
      contact.href,
    );
  });

  return items;
}
