<!-- START OF FILE src/components/settings/SettingsZotero.vue -->
<template>
  <div class="settings-page">
    <h3 class="settings-section-title">{{ t('References') }}</h3>

      <section class="settings-group">
        <h4 class="settings-group-title">{{ t('Account') }}</h4>
        <div class="settings-group-body">
          <div v-if="connected" class="settings-row">
            <div class="settings-row-copy">
              <div class="settings-row-title">{{ config.username || t('Connected') }}</div>
            </div>
            <div class="settings-row-control compact">
              <UiButton variant="danger" size="sm" @click="handleDisconnect">
                {{ t('Disconnect') }}
              </UiButton>
            </div>
          </div>

          <template v-else>
            <div class="settings-row">
              <div class="settings-row-copy">
                <div class="settings-row-title">{{ t('User ID') }}</div>
              </div>
              <div class="settings-row-control">
                <UiInput v-model="userId" size="sm" placeholder="12345678" />
              </div>
            </div>

            <div class="settings-row">
              <div class="settings-row-copy">
                <div class="settings-row-title">{{ t('API Key') }}</div>
              </div>
              <div class="settings-row-control">
                <UiInput
                  v-model="apiKey"
                  size="sm"
                  type="password"
                  placeholder="xxxxxxxxxxxxxxxx"
                />
              </div>
            </div>

            <div class="settings-row">
              <div class="settings-row-copy">
                <div class="settings-row-title">{{ t('Connect') }}</div>
              </div>
              <div class="settings-row-control compact">
                <UiButton
                  variant="secondary"
                  size="sm"
                  :disabled="loading || !userId.trim() || !apiKey.trim()"
                  @click="handleConnect"
                >
                  {{ loading ? t('Connecting...') : t('Connect to Zotero') }}
                </UiButton>
              </div>
            </div>
          </template>

          <div v-if="error" class="settings-inline-message settings-inline-message-error">
            {{ error }}
          </div>
        </div>
      </section>

      <section class="settings-group">
        <h4 class="settings-group-title">{{ t('Citations') }}</h4>
        <div class="settings-group-body">
          <div class="settings-row">
            <div class="settings-row-copy">
              <div class="settings-row-title">{{ t('Citation style') }}</div>
            </div>
            <div class="settings-row-control">
              <UiSelect
                :model-value="citationStyle"
                :options="citationStyleOptions"
                size="sm"
                @update:model-value="handleCitationStyleChange"
              />
            </div>
          </div>
        </div>
      </section>

      <section v-if="connected" class="settings-group">
        <h4 class="settings-group-title">{{ t('Sync') }}</h4>
        <div class="settings-group-body">
          <div class="settings-row">
            <div class="settings-row-copy">
              <div class="settings-row-title">{{ t('Auto-sync on workspace open') }}</div>
            </div>
            <div class="settings-row-control compact">
              <UiSwitch :model-value="autoSync" @update:model-value="toggleAutoSync" />
            </div>
          </div>

          <div class="settings-row">
            <div class="settings-row-copy">
              <div class="settings-row-title">{{ t('Libraries to sync') }}</div>
            </div>
            <div class="settings-row-control">
              <div class="settings-checklist">
                <UiCheckbox
                  v-for="group in groups || []"
                  :key="group.id"
                  :model-value="selectedGroupIds.has(group.id)"
                  @update:model-value="toggleGroup(group.id)"
                >
                  {{ group.name }}
                </UiCheckbox>
                <div v-if="!groups || groups.length === 0" class="settings-inline-message">
                  {{ t('No group libraries.') }}
                </div>
              </div>
            </div>
          </div>

          <div class="settings-row">
            <div class="settings-row-copy">
              <div class="settings-row-title">{{ t('Push new references to') }}</div>
            </div>
            <div class="settings-row-control">
              <UiSelect
                :model-value="pushTargetValue"
                :options="pushTargetOptions"
                size="sm"
                @update:model-value="handlePushTargetChange"
              />
            </div>
          </div>

          <div class="settings-row">
            <div class="settings-row-copy">
              <div class="settings-row-title">{{ t('Sync Now') }}</div>
            </div>
            <div class="settings-row-control compact">
              <UiButton variant="secondary" size="sm" :disabled="loading" @click="handleSyncNow">
                {{ loading ? t('Syncing...') : t('Sync Now') }}
              </UiButton>
            </div>
          </div>

          <div v-if="syncSummary" class="settings-inline-message">
            {{ syncSummary }}
          </div>
        </div>
      </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from '../../i18n'
import { useReferencesStore } from '../../stores/references'
import { useWorkspaceStore } from '../../stores/workspace'
import {
  buildZoteroCollectionOptions,
  buildZoteroPushTarget,
  buildZoteroPushTargetOptions,
  buildZoteroPushTargetValue,
  buildZoteroSelectedGroupIds,
  buildZoteroSelectedGroups,
} from '../../domains/references/zoteroSettingsPresentation.ts'
import UiSwitch from '../shared/ui/UiSwitch.vue'
import UiSelect from '../shared/ui/UiSelect.vue'
import UiInput from '../shared/ui/UiInput.vue'
import UiButton from '../shared/ui/UiButton.vue'
import UiCheckbox from '../shared/ui/UiCheckbox.vue'

const { t } = useI18n()
const workspace = useWorkspaceStore()
const referencesStore = useReferencesStore()

const loading = ref(false)
const error = ref('')
const connected = ref(false)
const config = ref({})
const userId = ref('')
const apiKey = ref('')
const autoSync = ref(true)
const groups = ref([])
const selectedGroupIds = ref(new Set())
const pushTargetValue = ref('')
const collectionOptions = ref([])
const syncSummary = ref('')

const citationStyle = computed(() => referencesStore.citationStyle || 'apa')
const citationStyleOptions = computed(() => {
  const styles = referencesStore.availableCitationStyles || []
  return styles.map((style) => ({
    value: style.id,
    label: style.name,
  }))
})
const pushTargetOptions = computed(() =>
  buildZoteroPushTargetOptions(config.value, collectionOptions.value, t)
)

async function refreshRemoteLibraries(targetConfig = config.value) {
  if (!targetConfig?.userId) return

  try {
    const remoteLibraries = await referencesStore.loadZoteroRemoteLibraries(targetConfig)
    if (!remoteLibraries) return

    groups.value = remoteLibraries.groups
    selectedGroupIds.value = buildZoteroSelectedGroupIds(targetConfig)
    collectionOptions.value = buildZoteroCollectionOptions(remoteLibraries, targetConfig, t)
  } catch (e) {
    error.value = e?.message || t('Failed to refresh Zotero libraries')
    console.error('Failed to refresh Zotero remote libraries:', e)
  }
}

async function saveConfigState() {
  const nextConfig = {
    ...config.value,
    autoSync: autoSync.value,
    _groups: buildZoteroSelectedGroups(groups.value, selectedGroupIds.value),
    pushTarget: buildZoteroPushTarget(pushTargetValue.value),
  }
  config.value = nextConfig
  await referencesStore.saveZoteroSettingsConfig(nextConfig)
}

function toggleAutoSync() {
  autoSync.value = !autoSync.value
  void saveConfigState()
}

function toggleGroup(groupId = '') {
  const next = new Set(selectedGroupIds.value)
  if (next.has(groupId)) next.delete(groupId)
  else next.add(groupId)
  selectedGroupIds.value = next
  void saveConfigState()
}

function handlePushTargetChange(val) {
  pushTargetValue.value = val
  void saveConfigState()
}

async function handleCitationStyleChange(val) {
  if (citationStyle.value === val) return
  referencesStore.setCitationStyle(val)
  await referencesStore.persistLibrarySnapshot(workspace.globalConfigDir)
}

async function handleConnect() {
  loading.value = true
  error.value = ''
  syncSummary.value = ''
  try {
    config.value = await referencesStore.connectZotero(apiKey.value)
    connected.value = true
    autoSync.value = true
    pushTargetValue.value = ''
    await refreshRemoteLibraries(config.value)
    userId.value = String(config.value.userId || '')
  } catch (cause) {
    error.value = cause?.message || t('Failed to connect to Zotero')
  } finally {
    loading.value = false
  }
}

async function handleDisconnect() {
  loading.value = true
  error.value = ''
  syncSummary.value = ''
  try {
    await referencesStore.disconnectZotero()
    connected.value = false
    config.value = {}
    groups.value = []
    selectedGroupIds.value = new Set()
    collectionOptions.value = []
    pushTargetValue.value = ''
  } finally {
    loading.value = false
  }
}

async function handleSyncNow() {
  loading.value = true
  error.value = ''
  syncSummary.value = ''
  try {
    const result = await referencesStore.syncZoteroNow(workspace.globalConfigDir)
    syncSummary.value = t('Imported {imported}, linked {linked}, updated {updated}', {
      imported: result.imported,
      linked: result.linked,
      updated: result.updated,
    })
  } catch (cause) {
    error.value = cause?.message || t('Sync failed')
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  try {
    const settingsState = await referencesStore.loadZoteroSettingsState()
    const savedConfig = settingsState.config
    config.value = savedConfig || {}
    connected.value = Boolean(savedConfig?.userId && settingsState.hasApiKey)
    if (savedConfig?.userId && !settingsState.hasApiKey) {
      error.value = t(
        'Existing Zotero account info was found, but the API key was not persisted by the previous version. Reconnect once to finish migration.'
      )
    }
    userId.value = String(savedConfig?.userId || '')
    autoSync.value = savedConfig?.autoSync !== false
    pushTargetValue.value = buildZoteroPushTargetValue(savedConfig)
    if (connected.value) {
      await refreshRemoteLibraries(savedConfig)
    }
  } catch (e) {
    error.value = e?.message || t('Failed to load Zotero settings')
    console.error('Zotero Settings Mounted Error:', e)
  }
})
</script>

<style scoped>
.settings-inline-message {
  padding: 12px 16px;
  font-size: 13px;
  color: var(--text-muted);
}

.settings-inline-message-error {
  color: var(--error);
  padding: 12px 16px 0;
}

.settings-checklist {
  width: min(100%, 280px);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 覆盖 UiInput 在设置页内部的宽度限制 */
:deep(.ui-input-shell) {
  width: min(100%, 280px);
}

</style>
