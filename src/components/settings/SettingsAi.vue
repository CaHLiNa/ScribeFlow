<template>
  <div class="settings-agent-subpage">
    <h3 class="settings-section-title">{{ t('Research defaults') }}</h3>

    <section class="settings-group">
      <h4 class="settings-group-title">{{ t('Research defaults') }}</h4>
      <div class="settings-group-body">
        <div class="settings-row">
          <div class="settings-row-copy">
            <div class="settings-row-title">{{ t('Verification depth') }}</div>
            <div class="settings-row-hint">
              {{ t('Controls how much extra checking and evidence gathering the AI should do before answering.') }}
            </div>
          </div>
          <div class="settings-row-control">
            <UiSelect
              :model-value="researchDefaults.evidenceStrategy"
              size="sm"
              class="settings-ai-input"
              :options="evidenceStrategyOptions"
              @update:model-value="updateResearchDefault('evidenceStrategy', $event)"
            />
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-row-copy">
            <div class="settings-row-title">{{ t('Completion standard') }}</div>
            <div class="settings-row-hint">
              {{ t('Controls how complete the AI should make the task before it can stop.') }}
            </div>
          </div>
          <div class="settings-row-control">
            <UiSelect
              :model-value="researchDefaults.taskCompletionThreshold"
              size="sm"
              class="settings-ai-input"
              :options="completionThresholdOptions"
              @update:model-value="updateResearchDefault('taskCompletionThreshold', $event)"
            />
          </div>
        </div>
      </div>
    </section>

    <h3 class="settings-section-title">Codex</h3>

    <section class="settings-group">
      <h4 class="settings-group-title">Codex</h4>
      <div class="settings-group-body">
        <div class="settings-row">
          <div class="settings-row-copy">
            <div class="settings-row-title">{{ t('Runtime status') }}</div>
            <div class="settings-row-hint">{{ runtimeSummary }}</div>
          </div>
          <div class="settings-row-control compact">
            <span
              class="settings-ai-runtime-status__badge"
              :class="{ 'is-ready': runtimeState.installed }"
            >
              {{ runtimeState.installed ? t('Configured') : t('Codex CLI missing') }}
            </span>
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-row-copy">
            <div class="settings-row-title">{{ t('Codex command') }}</div>
          </div>
          <div class="settings-row-control">
            <UiInput
              :model-value="codexCli.commandPath"
              size="sm"
              class="settings-ai-input"
              placeholder="codex"
              @update:model-value="updateCodexCliField('commandPath', $event)"
            />
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-row-copy">
            <div class="settings-row-title">{{ t('Model') }}</div>
          </div>
          <div class="settings-row-control">
            <UiInput
              :model-value="codexCli.model"
              size="sm"
              class="settings-ai-input"
              :placeholder="t('Use Codex defaults')"
              @update:model-value="updateCodexCliField('model', $event)"
            />
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-row-copy">
            <div class="settings-row-title">{{ t('Profile') }}</div>
          </div>
          <div class="settings-row-control">
            <UiInput
              :model-value="codexCli.profile"
              size="sm"
              class="settings-ai-input"
              :placeholder="t('Optional')"
              @update:model-value="updateCodexCliField('profile', $event)"
            />
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-row-copy">
            <div class="settings-row-title">{{ t('Sandbox mode') }}</div>
          </div>
          <div class="settings-row-control">
            <UiSelect
              :model-value="codexCli.sandboxMode"
              size="sm"
              class="settings-ai-input"
              :options="sandboxModeOptions"
              @update:model-value="updateCodexCliField('sandboxMode', $event)"
            />
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-row-copy">
            <div class="settings-row-title">{{ t('Enable web search') }}</div>
          </div>
          <div class="settings-row-control compact">
            <UiSwitch
              :model-value="codexCli.webSearch"
              @update:model-value="updateCodexCliBoolean('webSearch', $event)"
            />
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-row-copy">
            <div class="settings-row-title">{{ t('ASCII workspace alias') }}</div>
          </div>
          <div class="settings-row-control compact">
            <UiSwitch
              :model-value="codexCli.useAsciiWorkspaceAlias"
              @update:model-value="updateCodexCliBoolean('useAsciiWorkspaceAlias', $event)"
            />
          </div>
        </div>

        <div class="settings-row settings-ai-actions-row">
          <div class="settings-row-control settings-ai-runtime-actions">
            <UiButton variant="secondary" size="sm" :disabled="saving" @click="refreshRuntimeState">
              {{ runtimeStateLoading ? t('Refreshing...') : t('Refresh runtime') }}
            </UiButton>
            <UiButton variant="secondary" size="sm" :disabled="saving" @click="handleSave">
              {{ saving ? t('Saving...') : t('Save runtime settings') }}
            </UiButton>
          </div>
        </div>

        <div v-if="inlineMessage" class="settings-inline-message">{{ inlineMessage }}</div>
        <div v-if="runtimeState.error" class="settings-inline-message settings-inline-message-error">
          {{ runtimeState.error }}
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useToastStore } from '../../stores/toast'
import { useI18n } from '../../i18n'
import { useAiStore } from '../../stores/ai'
import { useReferencesStore } from '../../stores/references'
import UiButton from '../shared/ui/UiButton.vue'
import UiInput from '../shared/ui/UiInput.vue'
import UiSelect from '../shared/ui/UiSelect.vue'
import UiSwitch from '../shared/ui/UiSwitch.vue'

const { t } = useI18n()
const aiStore = useAiStore()
const toastStore = useToastStore()
const referencesStore = useReferencesStore()

async function loadAiConfig() {
  return invoke('ai_config_load')
}

async function saveAiConfig(config = null) {
  return invoke('ai_config_save', { config: config || {} })
}

async function resolveCodexCliState(config = {}) {
  return invoke('codex_cli_state_resolve', {
    params: {
      config,
    },
  })
}

function normalizeErrorMessage(error, fallback = '') {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error.trim()) return error
  return fallback
}

function defaultCodexCliConfig() {
  return {
    commandPath: 'codex',
    model: '',
    profile: '',
    sandboxMode: 'workspace-write',
    webSearch: false,
    useAsciiWorkspaceAlias: true,
  }
}

const loadedConfig = ref(null)
const saving = ref(false)
const runtimeStateLoading = ref(false)
const inlineMessage = ref('')
const runtimeState = ref({
  installed: false,
  ready: false,
  commandPath: 'codex',
  version: '',
  error: '',
  model: '',
  profile: '',
  sandboxMode: 'workspace-write',
  webSearch: false,
  useAsciiWorkspaceAlias: true,
})
const codexCli = ref(defaultCodexCliConfig())
const researchDefaults = ref({
  evidenceStrategy: 'balanced',
  taskCompletionThreshold: 'strict',
})

const evidenceStrategyOptions = computed(() => [
  { value: 'focused', label: t('Light verification') },
  { value: 'balanced', label: t('Standard verification') },
  { value: 'strict', label: t('Strict verification') },
])
const completionThresholdOptions = computed(() => [
  { value: 'fast', label: t('Good enough') },
  { value: 'balanced', label: t('Mostly complete') },
  { value: 'strict', label: t('Fully checked') },
])
const sandboxModeOptions = computed(() => [
  { value: 'read-only', label: t('Read-only') },
  { value: 'workspace-write', label: t('Workspace write') },
  { value: 'danger-full-access', label: t('Danger full access') },
])

const runtimeSummary = computed(() => {
  if (!runtimeState.value.installed) {
    return t('ScribeFlow could not launch the configured Codex CLI command.')
  }

  const bits = [
    runtimeState.value.version,
    codexCli.value.model
      || (codexCli.value.profile ? `profile:${codexCli.value.profile}` : t('Using Codex defaults')),
    codexCli.value.sandboxMode,
    codexCli.value.webSearch ? t('Web search on') : t('Web search off'),
  ].filter(Boolean)
  return bits.join(' · ')
})

function updateResearchDefault(field = '', value = '') {
  researchDefaults.value = {
    ...researchDefaults.value,
    [field]: String(value ?? '').trim(),
  }
}

function updateCodexCliField(field = '', value = '') {
  codexCli.value = {
    ...codexCli.value,
    [field]: String(value ?? '').trim(),
  }
  inlineMessage.value = ''
}

function updateCodexCliBoolean(field = '', value = false) {
  codexCli.value = {
    ...codexCli.value,
    [field]: value === true,
  }
  inlineMessage.value = ''
}

async function refreshRuntimeState() {
  runtimeStateLoading.value = true
  inlineMessage.value = ''
  try {
    runtimeState.value = await resolveCodexCliState(codexCli.value)
  } catch (error) {
    runtimeState.value = {
      ...runtimeState.value,
      installed: false,
      ready: false,
      error: normalizeErrorMessage(error, t('Failed to load Codex runtime state.')),
    }
  } finally {
    runtimeStateLoading.value = false
  }
}

function buildConfig() {
  const currentConfig = loadedConfig.value || {}
  return {
    ...currentConfig,
    runtimeBackend: 'codex-cli',
    codexCli: {
      ...defaultCodexCliConfig(),
      ...codexCli.value,
    },
    researchDefaults: {
      defaultCitationStyle:
        String(
          currentConfig?.researchDefaults?.defaultCitationStyle
            || referencesStore.citationStyle
            || 'apa'
        ).trim() || 'apa',
      evidenceStrategy:
        String(researchDefaults.value.evidenceStrategy || 'balanced').trim() || 'balanced',
      taskCompletionThreshold:
        String(researchDefaults.value.taskCompletionThreshold || 'strict').trim() || 'strict',
    },
  }
}

async function loadState() {
  saving.value = true
  try {
    const config = await loadAiConfig()
    loadedConfig.value = config
    codexCli.value = {
      ...defaultCodexCliConfig(),
      ...(config?.codexCli || {}),
    }
    researchDefaults.value = {
      evidenceStrategy:
        String(config?.researchDefaults?.evidenceStrategy || 'balanced').trim() || 'balanced',
      taskCompletionThreshold:
        String(config?.researchDefaults?.taskCompletionThreshold || 'strict').trim() || 'strict',
    }
    await refreshRuntimeState()
    await aiStore.refreshProviderState()
  } catch (error) {
    toastStore.show(normalizeErrorMessage(error, t('Failed to load AI settings.')), {
      type: 'error',
    })
  } finally {
    saving.value = false
  }
}

async function handleSave() {
  saving.value = true
  inlineMessage.value = ''
  try {
    const nextConfig = buildConfig()
    const saved = await saveAiConfig(nextConfig)
    loadedConfig.value = saved
    await refreshRuntimeState()
    await aiStore.refreshProviderState()
    inlineMessage.value = t('Codex runtime settings saved.')
    toastStore.show(t('Codex runtime settings saved.'))
  } catch (error) {
    toastStore.show(normalizeErrorMessage(error, t('Failed to save AI settings.')), {
      type: 'error',
    })
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  void loadState()
})
</script>

<style scoped>
.settings-ai-runtime-status__badge {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
  background: color-mix(in srgb, var(--surface-hover) 20%, transparent);
  color: var(--text-secondary);
  font-size: 11px;
}

.settings-ai-runtime-status__badge.is-ready {
  border-color: color-mix(in srgb, var(--success) 45%, transparent);
  background: color-mix(in srgb, var(--success) 12%, transparent);
  color: var(--success);
}

.settings-ai-input {
  width: min(100%, 280px);
}

.settings-ai-runtime-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  width: 100%;
}

.settings-ai-actions-row {
  justify-content: flex-end;
}

.settings-inline-message {
  padding: 12px 16px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-muted);
}

.settings-inline-message-error {
  color: var(--error);
  padding-top: 0;
}
</style>
