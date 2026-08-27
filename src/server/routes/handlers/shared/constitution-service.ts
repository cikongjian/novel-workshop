import { ConstitutionMasterAgent } from '../../../../agents/constitution-master.js';
import type { ModelClient } from '../../../../models/types.js';
import type { NovelManager } from '../../../../novel/novel-manager.js';
import type { NovelConstitution } from '../../../../novel/constitution-types.js';
import type { NovelMetadata, ConstitutionVersionSource } from '../../../../novel/types.js';

const constitutionMaster = new ConstitutionMasterAgent();

type GenerateAndPersistConstitutionParams = {
  novel: NovelMetadata;
  novelManager: NovelManager;
  modelClient: ModelClient;
  source: ConstitutionVersionSource;
  signal?: AbortSignal;
};

export async function generateAndPersistConstitution(
  params: GenerateAndPersistConstitutionParams,
): Promise<NovelConstitution> {
  const latestNovel = await params.novelManager.getNovel(params.novel.id);
  const existingVersion = latestNovel.constitution?.version ?? 0;
  const constitution = await constitutionMaster.generateConstitution(
    {
      novelId: latestNovel.id,
      genre: latestNovel.genre,
      novelTitle: latestNovel.title,
      novelSynopsis: latestNovel.synopsis,
      novelTags: latestNovel.tags,
      constitutionTags: latestNovel.constitutionTags,
    },
    params.modelClient,
    params.signal,
  );
  constitution.version = existingVersion + 1;
  constitution.updatedAt = new Date().toISOString();
  await params.novelManager.saveConstitution(latestNovel.id, constitution, params.source);
  return constitution;
}
