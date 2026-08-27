import { now } from '../utils/text.js';
import type { NovelPaths } from './novel-paths.js';
import { readJson, writeJson } from './fs-helpers.js';
import type { NovelConstitution } from './constitution-types.js';
import {
  ConstitutionVersionHistory,
  type ConstitutionVersion,
  type ConstitutionVersionSource,
} from './types.js';

export async function getConstitutionVersions(
  paths: NovelPaths,
  novelId: string,
): Promise<ConstitutionVersionHistory> {
  const raw = await readJson(
    paths.constitutionVersionsPath(novelId),
    { novelId, versions: [], maxVersions: 20 },
  );
  return ConstitutionVersionHistory.parse(raw);
}

export async function archiveConstitutionVersion(
  paths: NovelPaths,
  novelId: string,
  constitution: NovelConstitution | undefined,
  source: ConstitutionVersionSource,
): Promise<void> {
  if (!constitution) return;

  const history = await getConstitutionVersions(paths, novelId);
  const versionEntry: ConstitutionVersion = {
    version: constitution.version,
    source,
    constitution,
    createdAt: now(),
  };

  history.versions = history.versions.filter(item => item.version !== constitution.version);
  history.versions.push(versionEntry);
  history.versions.sort((a, b) => a.version - b.version);

  while (history.versions.length > history.maxVersions) {
    history.versions.shift();
  }

  await writeJson(paths.constitutionVersionsPath(novelId), history);
}
