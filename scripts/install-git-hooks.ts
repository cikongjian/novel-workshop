export async function runInstallGitHooksCli(): Promise<void> {
  try {
    await import('./copy-build-assets');
  } catch {
  }
}
