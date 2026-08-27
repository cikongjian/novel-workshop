import type { AgentOutput, AgentRole, AgentContext } from '../agents/types.js';
import { parseEditorOutput } from './editor-output-parser.js';

export interface DraftGenerationResult {
  chapterDraftText: string;
  polishedText: string;
  finalEditedContent: string;
  writerOutput: AgentOutput;
  editorOutput: AgentOutput;
  /**
   * Editor 在 EDITOR_NOTES 中给出的「建议标题」。
   * 比独立 title-generator 更贴近最终正文，但长度/合规性由 editor 自行把控。
   * 若 editor 未填写或解析失败，则为空字符串。
   */
  suggestedTitle: string;
}

export interface DraftGenerationOptions {
  runAgent: (role: AgentRole, ctx: AgentContext) => Promise<AgentOutput>;
  writerContext: AgentContext;
  editorContext: AgentContext;
  onOutput?: (role: AgentRole, output: AgentOutput, traceContent: string) => void;
}

export async function generateDraft(
  options: DraftGenerationOptions,
): Promise<DraftGenerationResult> {
  const { runAgent, writerContext, editorContext, onOutput } = options;

  const writerOutput = await runAgent('writer', writerContext);
  const chapterDraftText = writerOutput.content;
  onOutput?.('writer', writerOutput, chapterDraftText);

  const fullEditorContext: AgentContext = {
    ...editorContext,
    inputText: writerOutput.content,
  };
  const editorOutput = await runAgent('editor', fullEditorContext);
  const parsed = parseEditorOutput(editorOutput.content);
  const polishedText = parsed.polishedText;
  const finalEditedContent = editorOutput.content;
  const suggestedTitle = parsed.suggestedTitle;
  onOutput?.('editor', editorOutput, polishedText);

  return {
    chapterDraftText,
    polishedText,
    finalEditedContent,
    writerOutput,
    editorOutput,
    suggestedTitle,
  };
}
