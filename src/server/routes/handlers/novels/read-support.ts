export function shouldUseNovelSummaryView(view: unknown): boolean {
  return typeof view === 'string' && view.trim().toLowerCase() === 'summary';
}

export function shouldUseNovelBindingView(view: unknown): boolean {
  return typeof view === 'string' && view.trim().toLowerCase() === 'binding';
}
