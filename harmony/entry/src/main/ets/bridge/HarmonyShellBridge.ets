export class HarmonyShellBridge {
  private retryAction: () => void;
  private openExternalAction: (url?: string) => void;

  constructor(retryAction: () => void, openExternalAction: (url?: string) => void) {
    this.retryAction = retryAction;
    this.openExternalAction = openExternalAction;
  }

  retry(): void {
    this.retryAction();
  }

  openExternal(url?: string): void {
    this.openExternalAction(url);
  }
}
