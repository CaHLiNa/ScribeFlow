import { useToastStore } from '../stores/toast'

const WEB_DEV_RUNTIME_NOTICE =
  '当前是纯 Vite dev 预览，不能调用系统文件选择器或 Rust runtime。请用 `npm run tauri dev` 打开桌面开发模式。'

export function showWebDevRuntimeNotice() {
  const toastStore = useToastStore()
  toastStore.showOnce('web-dev-runtime-notice', WEB_DEV_RUNTIME_NOTICE, {
    type: 'info',
    duration: 5000,
  })
}
