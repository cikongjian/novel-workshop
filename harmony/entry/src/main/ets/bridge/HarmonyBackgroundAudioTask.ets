import { common, wantAgent } from '@kit.AbilityKit';
import { backgroundTaskManager } from '@kit.BackgroundTasksKit';

// 必须与 AppScope/app.json5 的 bundleName 保持一致
const HARMONY_BUNDLE_NAME: string = 'com.novelworkshop.reader';
const HARMONY_ABILITY_NAME: string = 'EntryAbility';

export class HarmonyBackgroundAudioTask {
  private context: common.UIAbilityContext;
  private running: boolean = false;

  constructor(context: common.UIAbilityContext) {
    this.context = context;
  }

  async start(): Promise<void> {
    if (this.running) {
      return;
    }
    try {
      const agent = await wantAgent.getWantAgent({
        wants: [
          {
            bundleName: HARMONY_BUNDLE_NAME,
            abilityName: HARMONY_ABILITY_NAME
          }
        ],
        operationType: wantAgent.OperationType.START_ABILITY,
        requestCode: 1001,
        wantAgentFlags: [wantAgent.WantAgentFlags.UPDATE_PRESENT_FLAG]
      });
      await backgroundTaskManager.startBackgroundRunning(
        this.context,
        backgroundTaskManager.BackgroundMode.AUDIO_PLAYBACK,
        agent
      );
      this.running = true;
    } catch (err) {
      console.error('start harmony background audio task failed: ' + JSON.stringify(err));
    }
  }

  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }
    try {
      await backgroundTaskManager.stopBackgroundRunning(this.context);
    } catch (err) {
      console.error('stop harmony background audio task failed: ' + JSON.stringify(err));
    } finally {
      this.running = false;
    }
  }
}
