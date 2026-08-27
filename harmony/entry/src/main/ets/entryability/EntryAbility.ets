import { AbilityConstant, UIAbility, Want } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';

export default class EntryAbility extends UIAbility {
  onCreate(_want: Want, _launchParam: AbilityConstant.LaunchParam): void {
    // 壳初始化：WebView 加载由 Index 页面自行管理
  }

  onDestroy(): void {
    // 壳销毁时不做额外清理，Index 页面会在 aboutToDisappear 中释放资源
  }

  onWindowStageCreate(windowStage: window.WindowStage): void {
    windowStage.loadContent('pages/Index', (_err) => {
      // pages/Index 即 WebView 主容器
    });
  }

  onWindowStageDestroy(): void {
    // 窗口销毁
  }
}
