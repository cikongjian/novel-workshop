import type { BillingRechargePackage } from '../api/billing';

export type BillingFocusableProductId = 'kickstart' | 'chapter-boost' | 'publish-pack';

export type BillingCenterFocusOptions = {
  productId?: BillingFocusableProductId | null;
  packageId?: string | null;
  recommendedPackage?: BillingRechargePackage | null;
};

export function parseBillingFocusableProductId(value: unknown): BillingFocusableProductId | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === 'kickstart' || raw === 'chapter-boost' || raw === 'publish-pack') {
    return raw;
  }
  return null;
}

export function buildBillingCenterLocation(options: BillingCenterFocusOptions = {}) {
  const query: Record<string, string> = {};
  const packageId = options.packageId ?? options.recommendedPackage?.id ?? null;
  if (packageId) {
    query.focusPackage = packageId;
  }
  if (options.productId) {
    query.forProduct = options.productId;
  }
  return {
    path: '/m/me',
    query,
  };
}
