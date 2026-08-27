export function readIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw || raw.trim() === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function readBoolEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (!raw || raw.trim() === '') return fallback;
  const normalized = raw.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

export function readFloatEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw || raw.trim() === '') return fallback;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function readWorldGateModeEnv(): 'off' | 'warn' | 'strict' {
  const raw = (process.env.WORLD_GATE_MODE ?? 'warn').trim().toLowerCase();
  if (raw === 'off' || raw === 'warn' || raw === 'strict') return raw;
  return 'warn';
}

export function readOutlineGateModeEnv(): 'off' | 'warn' | 'strict' {
  const raw = (process.env.OUTLINE_GATE_MODE ?? 'warn').trim().toLowerCase();
  if (raw === 'off' || raw === 'warn' || raw === 'strict') return raw;
  return 'warn';
}

export function readQualityGateModeEnv(): 'off' | 'warn' | 'strict' {
  const raw = (process.env.QUALITY_GATE_MODE ?? 'warn').trim().toLowerCase();
  if (raw === 'off' || raw === 'warn' || raw === 'strict') return raw;
  return 'warn';
}

export function readContinuityGateModeEnv(): 'off' | 'warn' | 'strict' {
  const raw = (process.env.CONTINUITY_GATE_MODE ?? 'warn').trim().toLowerCase();
  if (raw === 'off' || raw === 'warn' || raw === 'strict') return raw;
  return 'warn';
}

export function readPowerRuleGateModeEnv(): 'off' | 'warn' | 'strict' {
  const raw = (process.env.POWER_RULE_GATE_MODE ?? 'warn').trim().toLowerCase();
  if (raw === 'off' || raw === 'warn' || raw === 'strict') return raw;
  return 'warn';
}

export function parseAgentModelOverrides(
  raw: string,
): Record<string, { provider: string; apiKey: string; model: string; baseUrl: string }> {
  if (!raw || raw.trim() === '') return {};
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    return parsed;
  } catch {
    console.warn('[config] Failed to parse AGENT_MODEL_OVERRIDES JSON, ignored');
    return {};
  }
}
