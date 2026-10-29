import { Menu, Tray } from 'electron';
import { computeBadge } from './badge';
import { createTrayImage } from './image';

/**
 * 托盘控制器：封装 Electron Tray，负责红点与 tooltip 的更新。
 * 仅依赖 Tray 实例（不持有窗口引用），点击行为由 main.ts 通过菜单回调注入。
 */
export class TrayController {
  private readonly tray: Tray;

  constructor(private readonly onOpen: () => void) {
    this.tray = new Tray(createTrayImage('default'));
    this.tray.setToolTip('Sift');
    this.rebuildMenu();
  }

  private rebuildMenu(): void {
    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: '打开 Sift', click: () => this.onOpen() },
        { type: 'separator' },
        { label: '退出', role: 'quit' },
      ]),
    );
  }

  update(count: number, aiConfigured: boolean): void {
    const badge = computeBadge({ count, aiConfigured });
    this.tray.setToolTip(badge.tooltip);
    this.tray.setImage(createTrayImage(badge.visible ? 'badge' : 'default'));
    // macOS 菜单栏可在图标旁显示数字，其余平台用红色图标表达「有未读」。
    if (process.platform === 'darwin') {
      this.tray.setTitle(badge.visible ? badge.label : '');
    }
  }

  destroy(): void {
    this.tray.destroy();
  }
}
