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

.extensions-group-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.extensions-group-heading .settings-group-title {
  margin-bottom: 8px;
  flex: 1 1 auto;
}

.extensions-page-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: 8px 4px 8px 0;
  flex: 0 0 auto;
}

.extensions-page-icon-button {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease,
    opacity 0.15s ease;
}

.extensions-page-icon-button:hover:not(:disabled) {
  background: color-mix(in srgb, var(--sidebar-item-hover) 70%, transparent);
  color: var(--text-primary);
}

.extensions-page-icon-button:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--accent) 65%, transparent);
  outline-offset: 2px;
}

.extensions-page-icon-button:disabled {
  cursor: default;
  opacity: 0.45;
}

.extension-options-title {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  flex: 1 1 auto;
}

.extension-options-title .extension-card-icon-button {
  margin: 0 0 0 4px;
}

.extension-empty-row {
  padding: 16px;
  color: var(--text-muted);
  font-size: 12px;
}

.extension-host-runtime-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 18px;
  border: 1px solid color-mix(in srgb, var(--border) 34%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--surface-base) 86%, transparent);
}

.extension-host-runtime-card.is-active {
  border-color: color-mix(in srgb, var(--accent) 24%, var(--border));
}

.extension-host-runtime-card__meta {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 6px;
}

.extension-host-runtime-card__meta-item {
  display: grid;
  grid-template-columns: 128px minmax(0, 1fr);
  gap: 8px;
  font-size: 11px;
  line-height: 1.4;
}

.extension-host-runtime-slots {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.extension-host-runtime-slots__title {
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.03em;
}

.extension-host-runtime-slots__empty {
  color: var(--text-muted);
  font-size: 11px;
}

.extension-host-runtime-slot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--border) 26%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--surface-raised) 74%, transparent);
}

.extension-host-runtime-slot__copy {
  min-width: 0;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 2px;
}

.extension-host-runtime-slot__title {
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 600;
}

.extension-host-runtime-slot__workspace {
  color: var(--text-muted);
  font-size: 11px;
  overflow-wrap: anywhere;
}

.extension-card {
  display: flex;
  flex-direction: column;
  gap: 0;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 40%, transparent);
}

.extension-card:last-child {
  border-bottom: none;
}

.extension-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  padding: 16px 18px;
}

.extension-copy {
  min-width: 0;
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.extension-title-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.extension-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.extension-status,
.extension-scope,
.extension-chip {
  display: inline-flex;
  align-items: center;
  min-height: 20px;
  padding: 0 7px;
  border-radius: 6px;
  background: var(--surface-raised);
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1;
}

.extension-status.is-available {
  color: var(--success);
}

.extension-status.is-invalid,
.extension-status.is-blocked {
  color: var(--error);
}

.extension-status.is-missingRuntime {
  color: var(--warning, #a56a00);
}

.extension-status.is-disabled {
  color: var(--text-muted);
}

.extension-description,
.extension-message {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.4;
}

.extension-message.is-error {
  color: var(--error);
}

.extension-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.extension-meta-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 4px;
  margin-top: 2px;
}

.extension-meta-list {
  display: grid;
  grid-template-columns: 112px minmax(0, 1fr);
  gap: 8px;
  font-size: 11px;
  line-height: 1.35;
}

.extension-meta-item {
  display: grid;
  grid-template-columns: 86px minmax(0, 1fr);
  gap: 8px;
  font-size: 11px;
  line-height: 1.35;
}

.extension-meta-label {
  color: var(--text-muted);
}

.extension-meta-value {
  min-width: 0;
  color: var(--text-secondary);
  overflow-wrap: anywhere;
}

.extension-controls {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 12px;
  padding-top: 0;
}

.extension-card-icon-button {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease,
    opacity 0.15s ease;
}

.extension-card-icon-button:hover:not(:disabled) {
  background: color-mix(in srgb, var(--sidebar-item-hover) 70%, transparent);
  color: var(--text-primary);
}

.extension-card-icon-button:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--accent) 65%, transparent);
  outline-offset: 2px;
}

.extension-card-icon-button:disabled {
  cursor: default;
  opacity: 0.38;
}

.extension-setting-row {
  min-height: 52px;
}

.extension-setting-copy {
  gap: 2px;
}

.extension-setting-label-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.extension-setting-badge {
  display: inline-flex;
  align-items: center;
  min-height: 18px;
  padding: 0 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--success) 12%, var(--surface-raised));
  color: var(--text-secondary);
  font-size: 10px;
  line-height: 1;
  white-space: nowrap;
}

.extension-setting-control {
  width: min(100%, var(--settings-select-width, 280px));
}

.extension-setting-control.is-wide {
  width: min(100%, 360px);
}

.extension-action-row {
  min-height: 52px;
}

.extension-action-hint {
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.45;
}

.extension-action-control {
  justify-content: flex-end;
}

.extension-setting-textarea {
  width: 100%;
  min-height: 86px;
  resize: vertical;
  box-sizing: border-box;
  border: 1px solid color-mix(in srgb, var(--border-subtle) 88%, transparent);
  border-radius: 6px;
  padding: 8px 10px;
  background: color-mix(in srgb, var(--surface-base) 86%, transparent);
  color: var(--text-primary);
  font: 12px/1.45 var(--font-mono);
  outline: none;
}

.extension-setting-textarea:focus {
  border-color: color-mix(in srgb, var(--accent) 42%, var(--border));
  box-shadow:
    0 0 0 3px color-mix(in srgb, var(--accent) 30%, transparent),
    0 0 0 1px var(--accent);
}

@media (max-width: 720px) {
  .extension-header {
    flex-direction: column;
  }

  .extension-setting-row {
    align-items: stretch;
    flex-direction: column;
    gap: 6px;
  }

  .extension-setting-control {
    width: 100%;
    justify-content: stretch;
  }

  .extension-action-control {
    width: 100%;
  }

  .extension-action-control :deep(.ui-button) {
    width: 100%;
  }

  .extension-controls {
    width: 100%;
    justify-content: space-between;
  }
}
</style>
