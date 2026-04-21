<!-- START OF FILE src/components/settings/SettingsZotero.vue -->
<template>
  <div class="settings-page">
    <template v-if="browserPreview">
      <section class="settings-group">
        <h4 class="settings-group-title">{{ t('Account') }}</h4>
        <div class="settings-group-body">
          <div class="settings-row">
            <div class="settings-row-copy">
              <div class="settings-row-title">ScribeFlow Preview Library</div>
              <div class="settings-row-hint">
                {{
                  t(
                    'Browser preview mode shows the Zotero settings layout with mock data. Real account, sync, and keychain flows remain desktop-only.'
                  )
                }}
              </div>
            </div>
            <div class="settings-row-control compact">
              <UiButton variant="secondary" size="sm" disabled>
                {{ t('Preview only') }}
              </UiButton>
            </div>
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
                :model-value="'apa'"
                :options="previewCitationStyleOptions"
                size="sm"
                disabled
              />
            </div>
          </div>

          <div class="settings-row">
            <div class="settings-row-copy">
              <div class="settings-row-title">{{ t('Markdown citation format') }}</div>
              <div class="settings-row-hint">
                {{ t('Choose how new citations are inserted into Markdown documents.') }}
              </div>
            </div>
            <div class="settings-row-control">
              <UiSelect
                :model-value="workspace.markdownCitationFormat"
                :options="markdownCitationFormatOptions"
                size="sm"
                @update:model-value="workspace.setMarkdownCitationFormat"
              />
            </div>
          </div>

          <div class="settings-row">
            <div class="settings-row-copy">
              <div class="settings-row-title">{{ t('LaTeX citation command') }}</div>
              <div class="settings-row-hint">
                {{ t('Used by the Insert Citation action and new LaTeX citation insertions.') }}
              </div>
            </div>
            <div class="settings-row-control">
              <UiSelect
                :model-value="workspace.latexCitationCommand"
                :options="latexCitationCommandOptions"
                size="sm"
                @update:model-value="workspace.setLatexCitationCommand"
              />
            </div>
          </div>

          <div class="settings-row">
            <div class="settings-row-copy">
              <div class="settings-row-title">{{ t('Add spaces around inserted citations') }}</div>
              <div class="settings-row-hint">
                {{ t('Automatically pad inserted citations so they do not stick to surrounding text.') }}
              </div>
            </div>
            <div class="settings-row-control compact">
              <UiSwitch
                :model-value="workspace.citationInsertAddsSpace"
                @update:model-value="workspace.setCitationInsertAddsSpace($event)"
              />
            </div>
          </div>
        </div>
      </section>

      <section class="settings-group">
        <h4 class="settings-group-title">{{ t('Sync') }}</h4>
        <div class="settings-group-body">
          <div class="settings-row">
            <div class="settings-row-copy">
              <div class="settings-row-title">{{ t('Auto-sync on workspace open') }}</div>
            </div>
            <div class="settings-row-control compact">
              <UiSwitch :model-value="true" disabled />
            </div>
          </div>

          <div class="settings-row">
            <div class="settings-row-copy">
              <div class="settings-row-title">{{ t('Libraries to sync') }}</div>
            </div>
            <div class="settings-row-control">
              <div class="settings-checklist">
                <UiCheckbox :model-value="true" disabled>My Library</UiCheckbox>
                <UiCheckbox :model-value="true" disabled>Reading Group</UiCheckbox>
              </div>
            </div>
          </div>
        </div>
      </section>
    </template>

    <template v-else>
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
              <div class="settings-row-hint">
                {{
                  connected
                    ? t('Controls local citation rendering and bibliography export for the current workspace.')
                    : t('Works locally even before connecting Zotero.')
                }}
              </div>
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
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useI18n } from '../../i18n'
import { useReferencesStore } from '../../stores/references'
import { useWorkspaceStore } from '../../stores/workspace'
import { isBrowserPreviewRuntime } from '../../app/browserPreview/routes.js'
import UiSwitch from '../shared/ui/UiSwitch.vue'
import UiSelect from '../shared/ui/UiSelect.vue'
import UiInput from '../shared/ui/UiInput.vue'
import UiButton from '../shared/ui/UiButton.vue'
import UiCheckbox from '../shared/ui/UiCheckbox.vue'
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
} from '../../services/references/zoteroSync.js'

const { t } = useI18n()
const workspace = useWorkspaceStore()
const referencesStore = useReferencesStore()
const browserPreview = isBrowserPreviewRuntime()

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
const previewCitationStyleOptions = computed(() => [
  { value: 'apa', label: 'APA 7th' },
  { value: 'ieee', label: 'IEEE' },
  { value: 'chicago-author-date', label: 'Chicago Author-Date' },
])

const citationStyle = computed(() => referencesStore.citationStyle || 'apa')
const markdownCitationFormatOptions = computed(() => [
  { value: 'bracketed', label: '[@key]' },
  { value: 'bare', label: '@key' },
])
const latexCitationCommandOptions = computed(() => [
  { value: 'cite', label: '\\cite{}' },
  { value: 'citep', label: '\\citep{}' },
  { value: 'citet', label: '\\citet{}' },
  { value: 'parencite', label: '\\parencite{}' },
  { value: 'textcite', label: '\\textcite{}' },
  { value: 'autocite', label: '\\autocite{}' },
])

// 防御性 computed：确保不会由于 referencesStore 尚未初始化而崩溃
const citationStyleOptions = computed(() => {
  const styles = referencesStore.availableCitationStyles || []
  return styles.map((style) => ({
    value: style.id,
    label: style.name,
  }))
})

// 防御性 computed：确保 config 不为空对象时也能安全访问 userId
const pushTargetOptions = computed(() => {
  const safeUserId = config.value?.userId || ''
  return [
    { value: '', label: t("Don't push to Zotero") },
    { value: `user/${safeUserId}`, label: t('My Library') },
    ...(collectionOptions.value || []),
  ]
})

function buildCollectionTree(collections = []) {
  if (!Array.isArray(collections)) return []
  const byParent = new Map()
  for (const collection of collections) {
    const parent = collection.parentCollection || ''
    if (!byParent.has(parent)) byParent.set(parent, [])
    byParent.get(parent).push(collection)
  }

  const walk = (parent = '', depth = 0) =>
    (byParent.get(parent) || [])
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
      .flatMap((collection) => [{ ...collection, depth }, ...walk(collection.key, depth + 1)])

  return walk()
}

async function refreshRemoteLibraries(targetConfig = config.value) {
  if (!targetConfig?.userId) return
  const key = await loadZoteroApiKey()
  if (!key) return

  try {
    const loadedGroups = await fetchUserGroups(key, targetConfig.userId)
    groups.value = Array.isArray(loadedGroups) ? loadedGroups : []
    selectedGroupIds.value = new Set(
      Array.isArray(targetConfig._groups)
        ? targetConfig._groups.map((group) => String(group.id))
        : []
    )

    const options = []
    const userCollectionsRaw = await fetchCollections(key, 'user', targetConfig.userId)
    const userCollections = buildCollectionTree(userCollectionsRaw || [])

    for (const collection of userCollections) {
      options.push({
        value: `user/${targetConfig.userId}/${collection.key}`,
        label: `${t('My Library')} → ${'  '.repeat(collection.depth)}${collection.name}`,
      })
    }

    for (const group of groups.value) {
      const groupCollectionsRaw = await fetchCollections(key, 'group', group.id)
      const groupCollections = buildCollectionTree(groupCollectionsRaw || [])
      options.push({ value: `group/${group.id}`, label: group.name })
      for (const collection of groupCollections) {
        options.push({
          value: `group/${group.id}/${collection.key}`,
          label: `${group.name} → ${'  '.repeat(collection.depth)}${collection.name}`,
        })
      }
    }
    collectionOptions.value = options
  } catch (e) {
    console.error('Failed to refresh Zotero remote libraries:', e)
  }
}

async function saveConfigState() {
  const nextConfig = {
    ...config.value,
    autoSync: autoSync.value,
    _groups: (groups.value || []).filter((group) => selectedGroupIds.value.has(group.id)),
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
  syncSummary.value = ''
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
  if (browserPreview) {
    return
  }
  try {
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
  } catch (e) {
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

:deep(.ui-select-shell) {
  width: min(100%, 280px);
}
</style>
