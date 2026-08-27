import fs from 'node:fs/promises';
import path from 'node:path';
import {
  AgentSkillCatalogSchema,
  AgentSkillEffectStoreSchema,
  AgentSkillPolicyStoreSchema,
  createDefaultAgentSkillCatalog,
  createDefaultAgentSkillEffectStore,
  createDefaultAgentSkillPolicyStore,
  type AgentSkillCatalog,
  type AgentSkillEffectStore,
  type AgentSkillPolicyStore,
} from './types.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('agent-skills:store');

type PersistedState = {
  catalog: AgentSkillCatalog;
  policy: AgentSkillPolicyStore;
};

async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const content = `${JSON.stringify(value, null, 2)}\n`;
  await fs.writeFile(tempPath, content, 'utf-8');
  await fs.rename(tempPath, filePath);
}

export class AgentSkillStore {
  private readonly rootDir: string;
  private readonly catalogFile: string;
  private readonly policyFile: string;
  private readonly effectsFile: string;
  private readonly versionsDir: string;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
    this.catalogFile = path.join(rootDir, 'catalog.json');
    this.policyFile = path.join(rootDir, 'policy.json');
    this.effectsFile = path.join(rootDir, 'effects.json');
    this.versionsDir = path.join(rootDir, 'versions');
  }

  async load(): Promise<PersistedState> {
    await ensureDir(this.rootDir);

    const [catalog, policy] = await Promise.all([
      this.readCatalog(),
      this.readPolicy(),
    ]);

    return { catalog, policy };
  }

  async saveCatalog(catalog: AgentSkillCatalog): Promise<void> {
    await ensureDir(this.rootDir);
    await writeJsonAtomic(this.catalogFile, catalog);
  }

  async savePolicy(policy: AgentSkillPolicyStore): Promise<void> {
    await ensureDir(this.rootDir);
    await writeJsonAtomic(this.policyFile, policy);
  }

  async loadEffects(): Promise<AgentSkillEffectStore> {
    await ensureDir(this.rootDir);
    const exists = await fileExists(this.effectsFile);
    if (!exists) {
      const defaults = createDefaultAgentSkillEffectStore();
      await this.saveEffects(defaults);
      return defaults;
    }

    const parsed = await readJsonFile<unknown>(this.effectsFile);
    const checked = AgentSkillEffectStoreSchema.safeParse(parsed);
    if (!checked.success) {
      log.warn('effects.json 校验失败，已回退为空统计', {
        issues: checked.error.issues.map(i => i.message),
      });
      const defaults = createDefaultAgentSkillEffectStore();
      await this.saveEffects(defaults);
      return defaults;
    }

    return checked.data;
  }

  async saveEffects(effects: AgentSkillEffectStore): Promise<void> {
    await ensureDir(this.rootDir);
    await writeJsonAtomic(this.effectsFile, effects);
  }

  private async readCatalog(): Promise<AgentSkillCatalog> {
    const exists = await fileExists(this.catalogFile);
    if (!exists) {
      const defaults = createDefaultAgentSkillCatalog();
      await this.saveCatalog(defaults);
      return defaults;
    }

    const parsed = await readJsonFile<unknown>(this.catalogFile);
    const checked = AgentSkillCatalogSchema.safeParse(parsed);
    if (!checked.success) {
      log.warn('catalog.json 校验失败，已回退为空目录', {
        issues: checked.error.issues.map(i => i.message),
      });
      const defaults = createDefaultAgentSkillCatalog();
      await this.saveCatalog(defaults);
      return defaults;
    }

    return checked.data as AgentSkillCatalog;
  }

  private async readPolicy(): Promise<AgentSkillPolicyStore> {
    const exists = await fileExists(this.policyFile);
    if (!exists) {
      const defaults = createDefaultAgentSkillPolicyStore();
      await this.savePolicy(defaults);
      return defaults;
    }

    const parsed = await readJsonFile<unknown>(this.policyFile);
    const checked = AgentSkillPolicyStoreSchema.safeParse(parsed);
    if (!checked.success) {
      log.warn('policy.json 校验失败，已回退为默认策略', {
        issues: checked.error.issues.map(i => i.message),
      });
      const defaults = createDefaultAgentSkillPolicyStore();
      await this.savePolicy(defaults);
      return defaults;
    }

    return checked.data;
  }

  async saveVersion(version: import('./types.js').AgentSkillVersion): Promise<void> {
    const skillDir = path.join(this.versionsDir, version.skillId);
    await ensureDir(skillDir);
    const versionFile = path.join(skillDir, `${version.versionId}.json`);
    await writeJsonAtomic(versionFile, version);
  }

  async loadVersions(skillId: string): Promise<import('./types.js').AgentSkillVersion[]> {
    const skillDir = path.join(this.versionsDir, skillId);
    const exists = await fileExists(skillDir);
    if (!exists) {
      return [];
    }

    try {
      const files = await fs.readdir(skillDir);
      const versions: import('./types.js').AgentSkillVersion[] = [];

      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        const filePath = path.join(skillDir, file);
        const parsed = await readJsonFile<unknown>(filePath);
        if (parsed) {
          versions.push(parsed as import('./types.js').AgentSkillVersion);
        }
      }

      return versions;
    } catch (err) {
      log.warn('读取版本历史失败', { skillId, error: err instanceof Error ? err.message : String(err) });
      return [];
    }
  }

  async loadVersion(versionId: string): Promise<import('./types.js').AgentSkillVersion | null> {
    try {
      const versionsDirContent = await fs.readdir(this.versionsDir);

      for (const skillId of versionsDirContent) {
        const skillDir = path.join(this.versionsDir, skillId);
        const stat = await fs.stat(skillDir);
        if (!stat.isDirectory()) continue;

        const versionFile = path.join(skillDir, `${versionId}.json`);
        const exists = await fileExists(versionFile);
        if (exists) {
          const parsed = await readJsonFile<unknown>(versionFile);
          return parsed as import('./types.js').AgentSkillVersion;
        }
      }

      return null;
    } catch (err) {
      log.warn('读取版本失败', { versionId, error: err instanceof Error ? err.message : String(err) });
      return null;
    }
  }
}
