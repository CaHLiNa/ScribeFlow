<template>
  <div class="settings-page">
    <h3 class="settings-section-title">{{ t('Zotero') }}</h3>

    <section class="settings-group">
      <h4 class="settings-group-title">{{ t('Account') }}</h4>
      <div class="settings-group-body">
        <div v-if="connected" class="settings-row">
          <div class="settings-row-copy">
            <div class="settings-row-title">{{ config.username || t('Connected') }}</div>
            <div class="settings-row-hint">{{ t('User ID: {id}', { id: config.userId }) }}</div>
          </div>
          <div class="settings-row-control compact">
            <button type="button" class="settings-action-btn settings-action-btn-danger" @click="handleDisconnect">
              {{ t('Disconnect') }}
            </button>
          </div>
        </div>

        <template v-else>
          <div class="settings-row">
            <div class="settings-row-copy">
              <div class="settings-row-title">{{ t('User ID') }}</div>
              <div class="settings-row-hint">{{ t('Create an API key at zotero.org/settings/keys.') }}</div>
            </div>
            <div class="settings-row-control">
              <input v-model="userId" class="settings-input" placeholder="12345678" />
            </div>
          </div>

          <div class="settings-row">
            <div class="settings-row-copy">
              <div class="settings-row-title">{{ t('API Key') }}</div>
              <div class="settings-row-hint">{{ t('Enable read and write access.') }}</div>
            </div>
            <div class="settings-row-control">
              <input v-model="apiKey" class="settings-input" type="password" placeholder="xxxxxxxxxxxxxxxx" />
            </div>
          </div>

          <div class="settings-row">
            <div class="settings-row-copy">
              <div class="settings-row-title">{{ t('Connect') }}</div>
              <div class="settings-row-hint">{{ t('Store credentials locally in the app keychain.') }}</div>
            </div>
            <div class="settings-row-control compact">
              <button
                type="button"
                class="settings-action-btn"
                :disabled="loading || !userId.trim() || !apiKey.trim()"
                @click="handleConnect"
              >
                {{ loading ? t('Connecting...') : t('Connect to Zotero') }}
              </button>
            </div>
          </div>
        </template>

        <div v-if="error" class="settings-inline-message settings-inline-message-error">{{ error }}</div>
      </div>
    </section>

    <section v-if="connected" class="settings-group">
      <h4 class="settings-group-title">{{ t('Citations') }}</h4>
      <div class="settings-group-body">
        <div class="settings-row">
          <div class="settings-row-copy">
            <div class="settings-row-title">{{ t('Citation style') }}</div>
            <div class="settings-row-hint">{{ t('Used by formatted citations and bibliography export.') }}</div>
          </div>
          <div class="settings-row-control">
            <select v-model="citationStyle" class="settings-select" @change="handleCitationStyleChange">
              <option
                v-for="style in referencesStore.availableCitationStyles"
                :key="style.id"
                :value="style.id"
              >
                {{ style.name }}
              </option>
            </select>
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
            <div class="settings-row-hint">{{ t('Pull Zotero changes when a workspace is opened.') }}</div>
          </div>
          <div class="settings-row-control compact">
            <UiSwitch :model-value="autoSync" @update:model-value="toggleAutoSync" />
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-row-copy">
            <div class="settings-row-title">{{ t('Libraries to sync') }}</div>
            <div class="settings-row-hint">{{ t('User library is always included. Group libraries are optional.') }}</div>
          </div>
          <div class="settings-row-control">
            <div class="settings-checklist">
              <label v-for="group in groups" :key="group.id" class="settings-checklist-item">
                <input
                  type="checkbox"
                  :checked="selectedGroupIds.has(group.id)"
                  @change="toggleGroup(group.id)"
                />
                <span>{{ group.name }}</span>
              </label>
              <div v-if="groups.length === 0" class="settings-inline-message">{{ t('No group libraries.') }}</div>
            </div>
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-row-copy">
            <div class="settings-row-title">{{ t('Push new references to') }}</div>
            <div class="settings-row-hint">{{ t('References imported in Altals can also be created in Zotero.') }}</div>
          </div>
          <div class="settings-row-control">
            <select v-model="pushTargetValue" class="settings-select" @change="saveConfigState">
              <option value="">{{ t("Don't push to Zotero") }}</option>
              <option :value="`user/${config.userId}`">{{ t('My Library') }}</option>
              <option
                v-for="option in collectionOptions"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-row-copy">
            <div class="settings-row-title">{{ t('Sync now') }}</div>
            <div class="settings-row-hint">
              {{ syncStatusText }}
              <template v-if="syncSummary">{{ ` · ${syncSummary}` }}</template>
            </div>
          </div>
          <div class="settings-row-control compact">
            <button type="button" class="settings-action-btn" :disabled="loading" @click="handleSyncNow">
              {{ loading ? t('Syncing...') : t('Sync Now') }}
            </button>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useI18n } from '../../i18n'
import { useReferencesStore } from '../../stores/references'
import { useWorkspaceStore } from '../../stores/workspace'
import UiSwitch from '../shared/ui/UiSwitch.vue'
import {
  disconnectZotero,
  fetchCollections,
  fetchUserGroups,
  loadZoteroApiKey,
  loadZoteroConfig,
  saveZoteroConfig,
  storeZoteroApiKey,
  syncNow,
  validateApiKey,
  zoteroSyncState,
} from '../../services/references/zoteroSync.js'

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
const citationStyle = ref('apa')

const syncStatusText = computed(() => {
  if (zoteroSyncState.status === 'syncing') return t('Sync in progress')
  if (zoteroSyncState.status === 'synced') return t('Last sync succeeded')
  if (zoteroSyncState.status === 'error') return zoteroSyncState.error || t('Sync failed')
  return t('Ready')
})

function buildCollectionTree(collections = []) {
  const byParent = new Map()
  for (const collection of collections) {
    const parent = collection.parentCollection || ''
    if (!byParent.has(parent)) byParent.set(parent, [])
    byParent.get(parent).push(collection)
  }

  const walk = (parent = '', depth = 0) =>
    (byParent.get(parent) || [])
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
      .flatMap((collection) => [
        { ...collection, depth },
        ...walk(collection.key, depth + 1),
      ])

  return walk()
}

async function refreshRemoteLibraries(targetConfig = config.value) {
  if (!targetConfig?.userId) return
  const key = await loadZoteroApiKey()
  if (!key) return

  const loadedGroups = await fetchUserGroups(key, targetConfig.userId)
  groups.value = loadedGroups
  selectedGroupIds.value = new Set(
    Array.isArray(targetConfig._groups) ? targetConfig._groups.map((group) => String(group.id)) : []
  )

  const options = []
  const userCollections = buildCollectionTree(await fetchCollections(key, 'user', targetConfig.userId))
  for (const collection of userCollections) {
    options.push({
      value: `user/${targetConfig.userId}/${collection.key}`,
      label: `${t('My Library')} → ${'  '.repeat(collection.depth)}${collection.name}`,
    })
  }

  for (const group of loadedGroups) {
    const groupCollections = buildCollectionTree(await fetchCollections(key, 'group', group.id))
    options.push({ value: `group/${group.id}`, label: group.name })
    for (const collection of groupCollections) {
      options.push({
        value: `group/${group.id}/${collection.key}`,
        label: `${group.name} → ${'  '.repeat(collection.depth)}${collection.name}`,
      })
    }
  }
  collectionOptions.value = options
}

async function saveConfigState() {
  const nextConfig = {
    ...config.value,
    autoSync: autoSync.value,
    _groups: groups.value.filter((group) => selectedGroupIds.value.has(group.id)),
    pushTarget: (() => {
      const value = String(pushTargetValue.value || '').trim()
      if (!value) return null
      const [libraryType, libraryId, collectionKey] = value.split('/')
      return {
        libraryType,
        libraryId,
        collectionKey: collectionKey || '',
      }
    })(),
  }
  config.value = nextConfig
  await saveZoteroConfig(nextConfig)
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

async function handleCitationStyleChange() {
  referencesStore.setCitationStyle(citationStyle.value)
  await referencesStore.persistLibrarySnapshot(workspace.globalConfigDir)
}

async function handleConnect() {
  loading.value = true
  error.value = ''
  syncSummary.value = ''
  try {
    const identity = await validateApiKey(apiKey.value.trim())
    await storeZoteroApiKey(apiKey.value.trim())
    config.value = {
      userId: String(identity.userID),
      username: identity.username || '',
      autoSync: true,
      _groups: [],
      pushTarget: null,
    }
    await saveZoteroConfig(config.value)
    connected.value = true
    autoSync.value = true
    pushTargetValue.value = ''
    await refreshRemoteLibraries(config.value)
    userId.value = String(identity.userID)
  } catch (cause) {
    error.value = cause?.message || t('Failed to connect to Zotero')
  } finally {
    loading.value = false
  }
}

async function handleDisconnect() {
  loading.value = true
  error.value = ''
  try {
    await disconnectZotero()
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
    const result = await syncNow(workspace.globalConfigDir, referencesStore)
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
  const [savedConfig, savedApiKey] = await Promise.all([loadZoteroConfig(), loadZoteroApiKey()])
  config.value = savedConfig || {}
  connected.value = Boolean(savedConfig?.userId && savedApiKey)
  if (savedConfig?.userId && !savedApiKey) {
    error.value = t(
      'Existing Zotero account info was found, but the API key was not persisted by the previous version. Reconnect once to finish migration.'
    )
  }
  userId.value = String(savedConfig?.userId || '')
  autoSync.value = savedConfig?.autoSync !== false
  citationStyle.value = referencesStore.citationStyle
  pushTargetValue.value = (() => {
    const target = savedConfig?.pushTarget
    if (!target?.libraryType || !target?.libraryId) return ''
    return target.collectionKey
      ? `${target.libraryType}/${target.libraryId}/${target.collectionKey}`
      : `${target.libraryType}/${target.libraryId}`
  })()
  if (connected.value) {
    await refreshRemoteLibraries(savedConfig)
  }
})
</script>

<style scoped>
.settings-input,
.settings-select {
  width: min(100%, 260px);
  min-height: 34px;
  padding: 0 12px;
  border-radius: 11px;
  border: 1px solid var(--settings-control-border, color-mix(in srgb, var(--border-subtle) 42%, transparent));
  background: var(--settings-control-surface, color-mix(in srgb, var(--surface-hover) 82%, var(--surface-muted)));
  color: var(--text-primary);
}

.settings-action-btn {
  min-height: 34px;
  padding: 0 14px;
  border-radius: 11px;
  border: 1px solid var(--settings-control-border, color-mix(in srgb, var(--border-subtle) 42%, transparent));
  background: var(--settings-control-surface, color-mix(in srgb, var(--surface-hover) 82%, var(--surface-muted)));
  color: var(--text-primary);
}

.settings-action-btn-danger {
  color: var(--danger);
}

.settings-inline-message {
  padding: 0 4px;
  font-size: 12px;
  color: var(--text-muted);
}

.settings-inline-message-error {
  color: var(--danger);
}

.settings-checklist {
  width: min(100%, 280px);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.settings-checklist-item {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 13px;
  color: var(--text-primary);
}
</style>
