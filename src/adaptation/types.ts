import type {
  AdaptationMode,
  AdaptationPackage as AdaptationPackageRecord,
  AdaptationPackageStatus,
} from '../novel/types.js';

export type CreateAdaptationPackageInput = {
  novelId: string;
  chapterNumberStart: number;
  chapterNumberEnd: number;
  mode: AdaptationMode;
  payloadPath: string;
  qaReportPath?: string;
};

export type ListAdaptationPackagesOptions = {
  mode?: AdaptationMode;
  status?: AdaptationPackageStatus;
};

export type UpdateAdaptationPackageInput = {
  status: AdaptationPackageStatus;
  qaReportPath?: string;
};

export type AdaptationPackage = AdaptationPackageRecord;
