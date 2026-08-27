const BILLING_USER_ID_KEY = 'novel-workshop.billing.user-id';

function buildBillingUserId(): string {
  return `bill_${crypto.randomUUID()}`;
}

export function readOrCreateBillingUserId(): string {
  const stored = localStorage.getItem(BILLING_USER_ID_KEY)?.trim();
  if (stored) return stored;
  const next = buildBillingUserId();
  localStorage.setItem(BILLING_USER_ID_KEY, next);
  return next;
}
