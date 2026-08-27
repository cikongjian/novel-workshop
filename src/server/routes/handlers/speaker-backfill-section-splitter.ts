export function splitSpeakerSections(content: string): string[] {
  const SECTION_DIVIDER_RE = /\n\s*\*\s*\*\s*\*\s*\n/;
  const rawSections = content.split(SECTION_DIVIDER_RE);
  const MAX_SECTION_CHARS = 2000;
  const sections: string[] = [];
  for (const rawSection of rawSections) {
    if (rawSection.length <= MAX_SECTION_CHARS) {
      sections.push(rawSection);
    } else {
      const paragraphs = rawSection.split(/\n\n+/);
      let currentBlock = '';
      for (const paragraph of paragraphs) {
        if (currentBlock.length + paragraph.length > MAX_SECTION_CHARS && currentBlock.length > 0) {
          sections.push(currentBlock);
          currentBlock = paragraph;
        } else {
          currentBlock += (currentBlock ? '\n\n' : '') + paragraph;
        }
      }
      if (currentBlock) {
        sections.push(currentBlock);
      }
    }
  }
  return sections;
}
