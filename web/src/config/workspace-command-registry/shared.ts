export type WorkspaceCommandState = {
  id: string;
  title: string;
  disabled?: boolean;
};

export type ToolbarMoreAction = {
  id: string;
  label: string;
  disabled?: boolean;
  divided?: boolean;
};

export type OperationCenterQuickAction = {
  id: string;
  label: string;
  disabled?: boolean;
  keywords?: string[];
  shortcut?: string;
};

export type ToolbarMoreBuildContext = {
  commandStates: WorkspaceCommandState[];
  isFullscreen: boolean;
  previousChapterNumber: number | null;
  nextChapterNumber: number | null;
  hasCurrentChapterContent: boolean;
  isGenerating: boolean;
  chapterCount: number;
  ttsBatchRunning: boolean;
};

export type OperationCenterQuickBuildContext = {
  isGenerating: boolean;
  hasCurrentChapterContent: boolean;
};

export type OperationCenterGroupId = 'quick' | 'layout' | 'writing' | 'audio' | 'quality';
