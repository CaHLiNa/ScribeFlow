<template>
  <div class="settings-page extensions-page" :class="{ 'is-options-view': selectedExtension }">
    <h3 class="settings-section-title">{{ t('Extensions') }}</h3>

    <section v-if="showHostRuntimeNotice" class="settings-group">
      <div class="settings-group-title">{{ t('Extension Runtime') }}</div>
      <div class="settings-group-body">
        <ExtensionHostStatusSurface
          :title="hostRuntimeTitle"
          :badge="hostRuntimeBadge"
          :description="hostRuntimeDescription"
          :tone-class="hostRuntimeCardToneClass"
          :recovery-action="hostRecoveryAction"
          @recover="void triggerHostRecoveryAction()"
        >
          <template #actions-before>
            <UiButton
              v-if="showHostRuntimeRestartAction"
              variant="ghost"
              size="sm"
              :disabled="hostRuntimeRestartBusy"
              @click="void restartHostRuntime()"
            >
              {{ hostRuntimeRestartBusy ? t('Restarting...') : t('Restart Runtime') }}
            </UiButton>
          </template>
        </ExtensionHostStatusSurface>
      </div>
    </section>

    <SettingsExtensionList
      v-if="!selectedExtension"
      :extensions="extensions"
      :enabled-extension-ids="extensionsStore.enabledExtensionIds"
      :loading="extensionListLoading"
      :error-message="extensionsStore.lastError || extensionsStore.taskError"
      @refresh="refreshExtensionRegistry"
      @open-install-folder="openExtensionInstallFolder"
      @open-options="openExtensionOptions"
      @toggle-enabled="setExtensionEnabled"
    />

    <SettingsExtensionOptions
      v-else
      :extension="selectedExtension"
      :setting-groups="selectedSettingGroups"
      :action-groups="selectedActionGroups"
      :action-message="actionMessage"
      :is-action-busy="isActionBusy"
      :action-button-label="actionButtonLabel"
      :setting-value="settingValue"
      :setting-draft-value="settingDraftValue"
      :has-persisted-secure-setting="hasPersistedSecureSetting"
      @back="closeExtensionOptions"
      @run-action="(action) => void runExtensionSettingsAction(action)"
      @update-now="updateSettingNow"
      @update-draft="updateSettingDraft"
      @flush-draft="flushSettingDraft"
    />

  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useI18n } from '../../i18n'
import { useExtensionsStore } from '../../stores/extensions'
import { useWorkspaceStore } from '../../stores/workspace'
import { useToastStore } from '../../stores/toast'
import { revealPathInFileManager } from '../../services/fileTreeSystem'
import UiButton from '../shared/ui/UiButton.vue'
import ExtensionHostStatusSurface from '../extensions/ExtensionHostStatusSurface.vue'
import SettingsExtensionList from './SettingsExtensionList.vue'
import SettingsExtensionOptions from './SettingsExtensionOptions.vue'
import { useExtensionHostStatusPresentation } from '../../composables/useExtensionHostStatusPresentation'
import { buildExtensionHostStatusSurface } from '../../domains/extensions/extensionHostStatusSurface'
import {
  buildExtensionSettingGroups,
  buildExtensionSettingsActionGroups,
} from '../../domains/extensions/extensionSettingsGroups'
import {
  extensionSettingDraftKey,
  extensionSettingDraftValue,
  hasPersistedSecureExtensionSetting,
  parseExtensionSettingDraftKey,
} from '../../domains/extensions/extensionSettingDrafts'

const { t } = useI18n()
const extensionsStore = useExtensionsStore()
const workspaceStore = useWorkspaceStore()
const toastStore = useToastStore()
const extensions = computed(() => extensionsStore.registry)
const extensionListLoading = computed(() =>
  extensionsStore.loadingRegistry || extensionsStore.loadingTasks
)
const hostRuntimeRestartBusyKey = ref('')
const selectedExtensionId = ref('')
const settingDrafts = reactive({})
const savedSecureSettingDrafts = reactive({})
const settingSaveTimers = new Map()
const SETTING_SAVE_DELAY_MS = 360
const selectedExtension = computed(() =>
  extensions.value.find((extension) => extension.id === selectedExtensionId.value) || null
)
const selectedExtensionActionBusy = reactive({})
const selectedExtensionActionMessages = reactive({})
const selectedSettingGroups = computed(() =>
  selectedExtension.value ? buildExtensionSettingGroups(selectedExtension.value) : []
)

function hostStatus() {
  return extensionsStore.hostStatus
}

function settingValue(extension = {}, key = '') {
  return extensionsStore.configForExtension(extension)?.[key]
}

function settingDraftValue(extension = {}, key = '') {
  return extensionSettingDraftValue({
    extension,
    key,
    settingDrafts,
    savedSecureSettingDrafts,
    persistedValue: settingValue(extension, key),
  })
}

function hasPersistedSecureSetting(extension = {}, key = '') {
  return hasPersistedSecureExtensionSetting({
    extension,
    key,
    persistedValue: settingValue(extension, key),
  })
}

async function persistSettingDraft(extensionId = '', key = '') {
  const normalizedExtensionId = String(extensionId || '').trim().toLowerCase()
  const normalizedKey = String(key || '').trim()
  const draftKey = extensionSettingDraftKey(normalizedExtensionId, normalizedKey)
  if (!normalizedExtensionId || !normalizedKey) return
  if (settingSaveTimers.has(draftKey)) {
    clearTimeout(settingSaveTimers.get(draftKey))
    settingSaveTimers.delete(draftKey)
  }
  if (!Object.prototype.hasOwnProperty.call(settingDrafts, draftKey)) return
  const value = settingDrafts[draftKey]
  try {
    const extension = extensions.value.find((entry) => entry.id === normalizedExtensionId)
    const setting = extension?.settingsSchema?.[normalizedKey]
    await extensionsStore.setExtensionConfigValue(normalizedExtensionId, normalizedKey, value)
    if (setting?.secureStorage === true) {
      savedSecureSettingDrafts[draftKey] = value
      delete settingDrafts[draftKey]
      return
    }
    const savedValue = extension ? settingValue(extension, normalizedKey) : value
    if (String(savedValue ?? '') === String(value ?? '')) {
      delete settingDrafts[draftKey]
      return
    }
    throw new Error(t('Extension setting was not saved'))
  } catch (error) {
    toastStore.show(error?.message || String(error || t('Failed to save extension setting')), {
      type: 'error',
      duration: 4200,
    })
  }
}

function updateSettingDraft(extensionId = '', key = '', value = '') {
  const normalizedExtensionId = String(extensionId || '').trim().toLowerCase()
  const normalizedKey = String(key || '').trim()
  const draftKey = extensionSettingDraftKey(normalizedExtensionId, normalizedKey)
  if (!normalizedExtensionId || !normalizedKey) return
  delete savedSecureSettingDrafts[draftKey]
  settingDrafts[draftKey] = value
  if (settingSaveTimers.has(draftKey)) {
    clearTimeout(settingSaveTimers.get(draftKey))
  }
  settingSaveTimers.set(draftKey, setTimeout(() => {
    void persistSettingDraft(normalizedExtensionId, normalizedKey)
  }, SETTING_SAVE_DELAY_MS))
}

function flushSettingDraft(extensionId = '', key = '') {
  void persistSettingDraft(extensionId, key)
}

function updateSettingNow(extensionId = '', key = '', value = '') {
  const normalizedExtensionId = String(extensionId || '').trim().toLowerCase()
  const normalizedKey = String(key || '').trim()
  if (!normalizedExtensionId || !normalizedKey) return
  extensionsStore.setExtensionConfigValue(normalizedExtensionId, normalizedKey, value).catch((error) => {
    toastStore.show(error?.message || String(error || t('Failed to save extension setting')), {
      type: 'error',
      duration: 4200,
    })
  })
}

function openExtensionOptions(extensionId = '') {
  const normalized = String(extensionId || '').trim()
  if (!normalized) return
  selectedExtensionId.value = normalized
}

function closeExtensionOptions() {
  selectedExtensionId.value = ''
}

function setExtensionEnabled(extensionId = '', value = false) {
  return extensionsStore.setExtensionEnabled(extensionId, value)
}

const selectedActionGroups = computed(() => {
  const extension = selectedExtension.value
  return extension ? buildExtensionSettingsActionGroups(extension) : []
})

function actionBusyKey(actionId = '') {
  const extensionId = String(selectedExtension.value?.id || '').trim().toLowerCase()
  return `${extensionId}:${String(actionId || '').trim()}`
}

function isActionBusy(actionId = '') {
  return Boolean(selectedExtensionActionBusy[actionBusyKey(actionId)])
}

function actionMessage(actionId = '') {
  const key = actionBusyKey(actionId)
  return selectedExtensionActionMessages[key] || ''
}

function actionButtonLabel(actionId = '', fallback = '') {
  if (isActionBusy(actionId)) return t('Running...')
  return t(fallback || '')
}

async function runExtensionSettingsAction(action = {}) {
  const extensionId = String(selectedExtension.value?.id || '').trim().toLowerCase()
  const commandId = String(action.commandId || '').trim()
  const busyKey = actionBusyKey(action.id)
  if (!extensionId || !commandId || selectedExtensionActionBusy[busyKey]) return
  selectedExtensionActionBusy[busyKey] = true
  try {
    const task = await extensionsStore.executeCommand({
      extensionId,
      commandId,
    }, {
      kind: 'workspace',
      referenceId: '',
      path: workspaceStore.path || '',
    })
    const isFailed = String(task?.state || '').trim().toLowerCase() === 'failed'
    if (isFailed) {
      throw new Error(String(task?.error || t('Action failed')))
    }
    selectedExtensionActionMessages[busyKey] = String(task?.progress?.label || task?.state || '')
    toastStore.show(selectedExtensionActionMessages[busyKey] || t('Action completed'), {
      type: 'success',
      duration: 3200,
    })
  } catch (error) {
    selectedExtensionActionMessages[busyKey] = error?.message || String(error || t('Action failed'))
    toastStore.show(selectedExtensionActionMessages[busyKey], {
      type: 'error',
      duration: 4600,
    })
  } finally {
    selectedExtensionActionBusy[busyKey] = false
  }
}

const hostRuntimeSlots = computed(() =>
  Array.isArray(hostStatus().activeRuntimeSlots) ? hostStatus().activeRuntimeSlots : []
)
const showHostRuntimeRestartAction = computed(() => hostRuntimeSlots.value.length > 0)
const hostRuntimeRestartBusy = computed(() => Boolean(hostRuntimeRestartBusyKey.value))
const hostStatusSurface = computed(() =>
  buildExtensionHostStatusSurface({
    pendingPromptOwner: hostStatus().pendingPromptOwner,
    slotCount: hostRuntimeSlots.value.length,
  }, {
    hostRuntimeSlots: hostRuntimeSlots.value,
  })
)
const {
  presentation: hostStatusPresentation,
  recoveryAction: hostRecoveryAction,
  triggerRecoveryAction: triggerHostRecoveryAction,
} = useExtensionHostStatusPresentation(() => hostStatusSurface.value)
const hostRuntimeBadge = computed(() => hostStatusPresentation.value.badge)
const hostRuntimeTitle = computed(() => hostStatusPresentation.value.title)
const hostRuntimeDescription = computed(() => hostStatusPresentation.value.description)
const hostRuntimeCardToneClass = computed(() => hostStatusPresentation.value.toneClass)
const showHostRuntimeNotice = computed(() =>
  hostRecoveryAction.value.available ||
    hostRuntimeCardToneClass.value === 'is-warning' ||
    hostRuntimeCardToneClass.value === 'is-info'
)

async function restartHostRuntimeSlot(slot = {}) {
  const extensionId = String(slot?.extensionId || '').trim()
  const workspaceRoot = String(slot?.workspaceRoot || '').trim()
  const busyKey = `${extensionId}@${workspaceRoot}`
  if (!extensionId || !workspaceRoot || hostRuntimeRestartBusyKey.value) return
  hostRuntimeRestartBusyKey.value = busyKey
  try {
    await extensionsStore.restartExtensionRuntime(extensionId, workspaceRoot)
    toastStore.show(t('Restarted the selected extension runtime'), {
      type: 'success',
      duration: 2600,
    })
  } catch (error) {
    toastStore.show(error?.message || String(error || t('Failed to restart extension runtime')), {
      type: 'error',
      duration: 4200,
    })
  } finally {
    if (hostRuntimeRestartBusyKey.value === busyKey) {
      hostRuntimeRestartBusyKey.value = ''
    }
  }
}

async function restartHostRuntime() {
  for (const slot of hostRuntimeSlots.value) {
    if (hostRuntimeRestartBusyKey.value) break
    await restartHostRuntimeSlot(slot)
  }
}

async function refreshExtensionRegistry() {
  try {
    await extensionsStore.refreshRegistryAndTasks()
  } catch (error) {
    toastStore.show(error?.message || String(error || t('Failed to refresh extensions')), {
      type: 'error',
      duration: 4200,
    })
  }
}

async function openExtensionInstallFolder() {
  try {
    const globalConfigDir = await workspaceStore.ensureGlobalConfigDir()
    if (!globalConfigDir) throw new Error(t('Extension install folder is unavailable'))
    await revealPathInFileManager({ path: `${globalConfigDir}/extensions` })
  } catch (error) {
    toastStore.show(error?.message || String(error || t('Failed to open extension install folder')), {
      type: 'error',
      duration: 3600,
    })
  }
}

onMounted(async () => {
  await refreshExtensionRegistry()
})

onBeforeUnmount(() => {
  for (const draftKey of Object.keys(settingDrafts)) {
    const { extensionId, key } = parseExtensionSettingDraftKey(draftKey)
    void persistSettingDraft(extensionId, key)
  }
  for (const timer of settingSaveTimers.values()) {
    clearTimeout(timer)
  }
  settingSaveTimers.clear()
})
</script>

<style scoped>
.extensions-page {
  gap: 32px;
}

.extensions-page.is-options-view {
  gap: 14px;
}
</style>
