import type { BillingRechargePackage } from '../api/billing';

export type BillingProductAccessStatus = 'available' | 'insufficient' | 'unavailable';

export type BillingProductAccess = {
  status: BillingProductAccessStatus;
  statusLabel: string;
  tone: 'success' | 'warning' | 'danger';
  balancePoints: number;
  requiredPoints: number | null;
  gapPoints: number;
  recommendedPackage: BillingRechargePackage | null;
};

function getPackageTotalPoints(pkg: BillingRechargePackage): number {
  return pkg.points + pkg.bonusPoints;
}

export function resolveBillingProductAccess(params: {
  balancePoints?: number | null;
  requiredPoints?: number | null;
  packages?: BillingRechargePackage[];
}): BillingProductAccess {
  const balancePoints = Math.max(0, params.balancePoints ?? 0);
  const requiredPoints = params.requiredPoints ?? null;
  const packages = params.packages ?? [];

  if (!requiredPoints || requiredPoints <= 0) {
    return {
      status: 'unavailable',
      statusLabel: '未开放',
      tone: 'danger',
      balancePoints,
      requiredPoints: null,
      gapPoints: 0,
      recommendedPackage: null,
    };
  }

  if (balancePoints >= requiredPoints) {
    return {
      status: 'available',
      statusLabel: '可直接使用',
      tone: 'success',
      balancePoints,
      requiredPoints,
      gapPoints: 0,
      recommendedPackage: null,
    };
  }

  const sortedPackages = [...packages].sort((a, b) => getPackageTotalPoints(a) - getPackageTotalPoints(b));
  const recommendedPackage = sortedPackages.find((pkg) => balancePoints + getPackageTotalPoints(pkg) >= requiredPoints)
    ?? sortedPackages[sortedPackages.length - 1]
    ?? null;

  return {
    status: 'insufficient',
    statusLabel: '积分不足',
    tone: 'warning',
    balancePoints,
    requiredPoints,
    gapPoints: requiredPoints - balancePoints,
    recommendedPackage,
  };
}

export function formatRechargePackageSummary(pkg: BillingRechargePackage | null): string {
  if (!pkg) return '';
  const totalPoints = getPackageTotalPoints(pkg);
  return `${pkg.title}（到账 ${totalPoints} 积分）`;
}
