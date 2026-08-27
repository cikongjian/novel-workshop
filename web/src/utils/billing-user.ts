const BILLING_USER_ID_KEY = 'novel-workshop.billing.user-id';

function buildBillingUserId(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `bill_${rand}`;
}

export function readOrCreateBillingUserId(): string {
  const stored = localStorage.getItem(BILLING_USER_ID_KEY)?.trim();
  if (stored) return stored;
  const next = buildBillingUserId();
  localStorage.setItem(BILLING_USER_ID_KEY, next);
  return next;
}

