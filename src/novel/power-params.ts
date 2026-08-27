export type PowerSystemParamsV2 = {
  version: '1';
  systemType?: string;
  tierNames?: string[];
  maxTier?: number;
  resourceName?: string;
  recoveryPerChapter?: string;
  defaultCost?: string;
  cooldownRule?: string;
  riskRule?: string;
  breakthroughRule?: string;
  forbiddenActions?: string[];
  keyVerbs?: string[];
};

export type PowerParamsInput = Partial<Omit<PowerSystemParamsV2, 'version'>> & {
  version?: string;
};

const PREFIX = 'power.v2.';

const LIST_SEPARATOR = ' | ';

function normText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function dedupeList(values: string[] | undefined): string[] | undefined {
  if (!values || values.length === 0) return undefined;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = raw.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out.length > 0 ? out : undefined;
}

function clampTier(value: number | undefined): number | undefined {
  if (!Number.isFinite(value)) return undefined;
  const rounded = Math.round(Number(value));
  if (rounded < 1) return 1;
  if (rounded > 99) return 99;
  return rounded;
}

export function normalizePowerParams(input: PowerParamsInput | undefined): PowerSystemParamsV2 | undefined {
  if (!input) return undefined;
  const tierNames = dedupeList(input.tierNames);
  const maxTierFromInput = clampTier(input.maxTier);
  const maxTier = maxTierFromInput ?? (tierNames ? tierNames.length : undefined);

  const normalized: PowerSystemParamsV2 = {
    version: '1',
    systemType: normText(input.systemType),
    tierNames,
    maxTier,
    resourceName: normText(input.resourceName),
    recoveryPerChapter: normText(input.recoveryPerChapter),
    defaultCost: normText(input.defaultCost),
    cooldownRule: normText(input.cooldownRule),
    riskRule: normText(input.riskRule),
    breakthroughRule: normText(input.breakthroughRule),
    forbiddenActions: dedupeList(input.forbiddenActions),
    keyVerbs: dedupeList(input.keyVerbs),
  };

  const hasPayload = Boolean(
    normalized.systemType
    || (normalized.tierNames && normalized.tierNames.length > 0)
    || normalized.maxTier
    || normalized.resourceName
    || normalized.recoveryPerChapter
    || normalized.defaultCost
    || normalized.cooldownRule
    || normalized.riskRule
    || normalized.breakthroughRule
    || (normalized.forbiddenActions && normalized.forbiddenActions.length > 0)
    || (normalized.keyVerbs && normalized.keyVerbs.length > 0),
  );

  return hasPayload ? normalized : undefined;
}

export function writePowerParamsToDetails(
  details: Record<string, string>,
  params: PowerSystemParamsV2 | undefined,
): Record<string, string> {
  const next: Record<string, string> = { ...details };
  Object.keys(next)
    .filter(key => key.startsWith(PREFIX))
    .forEach((key) => {
      delete next[key];
    });

  if (!params) return next;

  next[`${PREFIX}version`] = '1';
  if (params.systemType) next[`${PREFIX}systemType`] = params.systemType;
  if (params.tierNames && params.tierNames.length > 0) next[`${PREFIX}tierNames`] = params.tierNames.join(LIST_SEPARATOR);
  if (params.maxTier) next[`${PREFIX}maxTier`] = String(params.maxTier);
  if (params.resourceName) next[`${PREFIX}resourceName`] = params.resourceName;
  if (params.recoveryPerChapter) next[`${PREFIX}recoveryPerChapter`] = params.recoveryPerChapter;
  if (params.defaultCost) next[`${PREFIX}defaultCost`] = params.defaultCost;
  if (params.cooldownRule) next[`${PREFIX}cooldownRule`] = params.cooldownRule;
  if (params.riskRule) next[`${PREFIX}riskRule`] = params.riskRule;
  if (params.breakthroughRule) next[`${PREFIX}breakthroughRule`] = params.breakthroughRule;
  if (params.forbiddenActions && params.forbiddenActions.length > 0) {
    next[`${PREFIX}forbiddenActions`] = params.forbiddenActions.join(LIST_SEPARATOR);
  }
  if (params.keyVerbs && params.keyVerbs.length > 0) {
    next[`${PREFIX}keyVerbs`] = params.keyVerbs.join(LIST_SEPARATOR);
  }
  return next;
}

function parseList(raw: string | undefined): string[] | undefined {
  if (!raw) return undefined;
  const values = raw
    .split('|')
    .map(item => item.trim())
    .filter(Boolean);
  return dedupeList(values);
}

export function readPowerParamsFromDetails(details: Record<string, string> | undefined): PowerSystemParamsV2 | undefined {
  if (!details || Object.keys(details).length === 0) return undefined;
  const rawVersion = details[`${PREFIX}version`]?.trim();
  if (!rawVersion) return undefined;

  const normalized = normalizePowerParams({
    version: rawVersion,
    systemType: details[`${PREFIX}systemType`],
    tierNames: parseList(details[`${PREFIX}tierNames`]),
    maxTier: details[`${PREFIX}maxTier`] ? Number(details[`${PREFIX}maxTier`]) : undefined,
    resourceName: details[`${PREFIX}resourceName`],
    recoveryPerChapter: details[`${PREFIX}recoveryPerChapter`],
    defaultCost: details[`${PREFIX}defaultCost`],
    cooldownRule: details[`${PREFIX}cooldownRule`],
    riskRule: details[`${PREFIX}riskRule`],
    breakthroughRule: details[`${PREFIX}breakthroughRule`],
    forbiddenActions: parseList(details[`${PREFIX}forbiddenActions`]),
    keyVerbs: parseList(details[`${PREFIX}keyVerbs`]),
  });

  return normalized;
}

