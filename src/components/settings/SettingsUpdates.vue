<!-- START OF FILE src/components/settings/SettingsUpdates.vue -->
<template>
  <div class="updates-page settings-page">
    <h3 class="settings-section-title">{{ t('About') }}</h3>
    <div class="updates-hero">
      <!-- 彻底去掉多余的边框和阴影，还原干净图标 -->
      <div class="app-icon-container">
        <img src="/icon.png" :alt="t('ScribeFlow Logo')" class="app-icon" draggable="false" />
      </div>

      <div class="app-info">
        <h1 class="app-title">ScribeFlow</h1>
        <div class="app-version">{{ t('Version') }} {{ appVersion }}</div>
      </div>

      <div class="app-description">
        {{ t('ScribeFlow is a local-first workspace for academic writing and research.') }}
      </div>

      <div class="app-status" :class="{ 'is-empty': !statusMessage }" aria-live="polite">
        <span class="app-description-muted">{{ statusMessage || '\u00A0' }}</span>
      </div>

      <div class="app-actions">
        <UiButton
          variant="secondary"
          size="md"
          :loading="updateStatus === 'checking' || updateStatus === 'downloading'"
          @click="handleUpdateAction"
        >
          {{ actionLabel }}
        </UiButton>
        <UiButton
          v-if="downloadedInstallerPath"
          variant="ghost"
          size="md"
          @click="handleRevealDownload"
        >
          {{ t('Open Download Location') }}
        </UiButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, onMounted } from 'vue'
import {
  checkForAppUpdates,
  downloadAppUpdateAsset,
  getAppVersion,
  onAppUpdateDownloadProgress,
  openReleasesPage,
  revealDownloadedUpdate,
} from '../../services/appUpdater'
import { useI18n } from '../../i18n'
import UiButton from '../shared/ui/UiButton.vue'

const appVersion = ref('...')
const latestVersion = ref('')
const releaseUrl = ref('')
const installerAsset = ref(null)
const updateStatus = ref('idle')
const lastCheckedVersion = ref('')
const downloadedInstallerPath = ref('')
const downloadedInstallerFolder = ref('')
const downloadProgress = ref(0)
const downloadProgressText = ref('')
let unlistenDownloadProgress = null
const { t } = useI18n()

const statusMessage = computed(() => {
  if (updateStatus.value === 'checking') {
    return t('Checking GitHub for the latest release...')
  }
  if (updateStatus.value === 'update-available') {
    if (!installerAsset.value) {
      return t('A newer version {version} is available, but no installer was found for this device.', {
        version: latestVersion.value,
      })
    }
    return t('A newer version {version} is available. Download the installer to this computer.', {
      version: latestVersion.value,
    })
  }
  if (updateStatus.value === 'downloading') {
    return downloadProgressText.value || t('Downloading update installer...')
  }
  if (updateStatus.value === 'downloaded') {
    return t('Update installer downloaded to {path}', {
      path: downloadedInstallerFolder.value || downloadedInstallerPath.value,
    })
  }
  if (updateStatus.value === 'up-to-date') {
    return t('Checked just now. You are already on the latest version {version}.', {
      version: lastCheckedVersion.value || latestVersion.value || appVersion.value,
    })
  }
  if (updateStatus.value === 'failed') {
    return t('Unable to check for updates right now. Please try again.')
  }
  return ''
})

const actionLabel = computed(() => {
  if (updateStatus.value === 'checking') return t('Checking...')
  if (updateStatus.value === 'downloading') return t('Downloading...')
  if (updateStatus.value === 'downloaded') return t('Download Again')
  if (updateStatus.value === 'update-available') {
    return installerAsset.value ? t('Download Update') : t('Open Releases')
  }
  if (updateStatus.value === 'up-to-date') return t('Check Again')
  if (updateStatus.value === 'failed') return t('Retry Update Check')
  return t('Check for Updates')
})

function formatBytes(value = 0) {
  const bytes = Number(value || 0)
  if (!Number.isFinite(bytes) || bytes <= 0) return ''
  if (bytes < 1_048_576) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1_048_576).toFixed(1)} MB`
}

async function ensureDownloadProgressListener() {
  if (unlistenDownloadProgress) return
  unlistenDownloadProgress = await onAppUpdateDownloadProgress((payload) => {
    downloadProgress.value = Number(payload?.percent || 0)
    const downloaded = formatBytes(payload?.downloadedBytes)
    const total = formatBytes(payload?.totalBytes)
    if (downloaded && total) {
      downloadProgressText.value = t('Downloading update installer... {percent}% ({downloaded} of {total})', {
        percent: downloadProgress.value,
        downloaded,
        total,
      })
    } else if (downloadProgress.value > 0) {
      downloadProgressText.value = t('Downloading update installer... {percent}%', {
        percent: downloadProgress.value,
      })
    }
  })
}

async function downloadUpdateInstaller() {
  if (!installerAsset.value) {
    await openReleasesPage(releaseUrl.value)
    return
  }

  updateStatus.value = 'downloading'
  downloadProgress.value = 0
  downloadProgressText.value = ''
  await ensureDownloadProgressListener()
  try {
    const result = await downloadAppUpdateAsset(installerAsset.value)
    downloadedInstallerPath.value = result.path || ''
    downloadedInstallerFolder.value = result.folderPath || ''
    updateStatus.value = 'downloaded'
  } catch {
    updateStatus.value = 'failed'
  }
}

async function handleUpdateAction() {
  if (updateStatus.value === 'checking' || updateStatus.value === 'downloading') return
  if (updateStatus.value === 'update-available' || updateStatus.value === 'downloaded') {
    await downloadUpdateInstaller()
    return
  }

  updateStatus.value = 'checking'
  try {
    const result = await checkForAppUpdates(appVersion.value)
    latestVersion.value = result.latestVersion
    releaseUrl.value = result.releaseUrl
    installerAsset.value = result.installerAsset || null
    lastCheckedVersion.value = result.latestVersion
    updateStatus.value = result.hasUpdate ? 'update-available' : 'up-to-date'
  } catch {
    updateStatus.value = 'failed'
  }
}

async function handleRevealDownload() {
  if (!downloadedInstallerPath.value) return
  await revealDownloadedUpdate(downloadedInstallerPath.value)
}

onMounted(async () => {
  appVersion.value = await getAppVersion()
})

onBeforeUnmount(() => {
  if (unlistenDownloadProgress) {
    unlistenDownloadProgress()
    unlistenDownloadProgress = null
  }
})
</script>

<style scoped>
.updates-page {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding-bottom: 15vh; /* 视觉居中略偏上 */
}

.updates-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  width: min(100%, 400px);
}

.app-icon-container {
  width: 112px;
  height: 112px;
  margin-bottom: 24px;
  /* 移除丑陋边框，仅保留对非 PNG 图标的圆角保护 */
  border-radius: 26px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  background: transparent;
}

.app-icon {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.app-info {
  margin-bottom: 24px;
}

.app-title {
  font-size: 32px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 4px;
  letter-spacing: -0.02em;
}

.app-version {
  font-size: 13px;
  color: var(--text-muted);
  font-family: var(--font-mono);
}

.app-description {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-primary);
  margin-bottom: 8px;
  padding: 0 16px;
}

.app-status {
  min-height: calc(1.6em * 2);
  margin-bottom: 24px;
  padding: 0 16px;
}

.app-status.is-empty {
  visibility: hidden;
}

.app-description-muted {
  display: block;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.6;
}

.app-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: center;
}

.app-actions :deep(.ui-button) {
  min-width: 220px;
  min-height: 36px !important;
  border-radius: 8px !important;
}
</style>
