<template>
  <div class="settings-page">
    <h3 class="settings-section-title">{{ t('Research defaults') }}</h3>

    <section class="settings-group">
      <h4 class="settings-group-title">{{ t('Research defaults') }}</h4>

      <div class="settings-ai-research-panel">
        <div class="settings-ai-research-intro">
          <div class="settings-ai-research-intro-title">
            {{ t('Workspace-first AI defaults') }}
          </div>
          <div class="settings-ai-research-intro-copy">
            {{
              t(
                'Set the evidence strictness and completion threshold before tuning the Codex runtime.'
              )
            }}
          </div>
        </div>

        <div class="settings-ai-research-summary">
          <div class="settings-ai-research-summary-label">{{ t('Current workspace') }}</div>
          <div class="settings-ai-research-summary-value">
            {{ currentWorkspacePath || t('No workspace open') }}
          </div>
        </div>

        <div class="settings-ai-research-grid">
          <div class="settings-row settings-ai-runtime-row">
            <div class="settings-row-copy">
              <div class="settings-row-title">{{ t('Evidence strategy') }}</div>
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

          <div class="settings-row settings-ai-runtime-row">
            <div class="settings-row-copy">
              <div class="settings-row-title">{{ t('Task completion threshold') }}</div>
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
      </div>
    </section>

    <h3 class="settings-section-title">{{ t('Codex runtime') }}</h3>

    <section class="settings-group">
      <h4 class="settings-group-title">{{ t('Codex runtime') }}</h4>

      <div class="settings-ai-runtime-panel">
        <div class="settings-ai-runtime-intro">
          <div class="settings-ai-research-intro-title">
            {{ t('System Codex CLI is the execution authority') }}
          </div>
          <div class="settings-ai-research-intro-copy">
            {{
              t(
                'ScribeFlow now launches the system Codex CLI and only manages launcher defaults, workspace context, and research integration.'
              )
            }}
          </div>
        </div>

        <div class="settings-ai-runtime-summary">
          <div class="settings-ai-runtime-status">
            <span class="settings-ai-runtime-status__label">{{ t('Runtime status') }}</span>
            <span
              class="settings-ai-runtime-status__badge"
              :class="{ 'is-ready': runtimeState.installed }"
            >
              {{ runtimeState.installed ? t('Configured') : t('Codex CLI missing') }}
            </span>
          </div>
          <div class="settings-ai-runtime-summary-copy">
            {{ runtimeSummary }}
          </div>
        </div>

        <div class="settings-ai-runtime-grid">
          <div class="settings-row settings-ai-runtime-row">
            <div class="settings-row-copy">
              <div class="settings-row-title">{{ t('Codex command') }}</div>
              <div class="settings-row-hint">
                {{ t('Use a command name from PATH or an absolute executable path.') }}
              </div>
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

          <div class="settings-row settings-ai-runtime-row">
            <div class="settings-row-copy">
              <div class="settings-row-title">{{ t('Model') }}</div>
              <div class="settings-row-hint">
                {{ t('Leave blank to use the model configured in Codex CLI itself.') }}
              </div>
            </div>
            <div class="settings-row-control">
              <UiInput
                :model-value="codexCli.model"
                size="sm"
                class="settings-ai-input"
                :placeholder="t('e.g. gpt-5')"
                @update:model-value="updateCodexCliField('model', $event)"
              />
            </div>
          </div>

          <div class="settings-row settings-ai-runtime-row">
            <div class="settings-row-copy">
              <div class="settings-row-title">{{ t('Profile') }}</div>
              <div class="settings-row-hint">
                {{ t('Optional Codex config profile from ~/.codex/config.toml.') }}
              </div>
            </div>
            <div class="settings-row-control">
              <UiInput
                :model-value="codexCli.profile"
                size="sm"
                class="settings-ai-input"
                :placeholder="t('e.g. balanced')"
                @update:model-value="updateCodexCliField('profile', $event)"
              />
            </div>
          </div>

          <div class="settings-row settings-ai-runtime-row">
            <div class="settings-row-copy">
              <div class="settings-row-title">{{ t('Sandbox mode') }}</div>
              <div class="settings-row-hint">
                {{ t('Controls how much filesystem access the launched Codex CLI receives.') }}
              </div>
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

          <div class="settings-row settings-ai-runtime-row">
            <div class="settings-row-copy">
              <div class="settings-row-title">{{ t('Enable web search') }}</div>
              <div class="settings-row-hint">
                {{ t('Expose Codex live web search when the runtime is launched.') }}
              </div>
            </div>
            <div class="settings-row-control compact">
              <UiSwitch
                :model-value="codexCli.webSearch"
                @update:model-value="updateCodexCliBoolean('webSearch', $event)"
              />
            </div>
          </div>

          <div class="settings-row settings-ai-runtime-row">
            <div class="settings-row-copy">
              <div class="settings-row-title">{{ t('ASCII workspace alias') }}</div>
              <div class="settings-row-hint">
                {{ t('Create a safe ASCII alias before launching Codex CLI so non-ASCII workspace paths do not break the runtime.') }}
              </div>
            </div>
            <div class="settings-row-control compact">
              <UiSwitch
                :model-value="codexCli.useAsciiWorkspaceAlias"
                @update:model-value="updateCodexCliBoolean('useAsciiWorkspaceAlias', $event)"
              />
            </div>
          </div>
        </div>

        <div class="settings-ai-runtime-actions">
          <UiButton variant="secondary" size="sm" :disabled="saving" @click="refreshRuntimeState">
            {{ runtimeStateLoading ? t('Refreshing...') : t('Refresh runtime') }}
          </UiButton>
          <UiButton variant="secondary" size="sm" :disabled="saving" @click="handleSave">
            {{ saving ? t('Saving...') : t('Save runtime settings') }}
          </UiButton>
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
import { useWorkspaceStore } from '../../stores/workspace'
import { useReferencesStore } from '../../stores/references'
import UiButton from '../shared/ui/UiButton.vue'
import UiInput from '../shared/ui/UiInput.vue'
import UiSelect from '../shared/ui/UiSelect.vue'
import UiSwitch from '../shared/ui/UiSwitch.vue'

const { t } = useI18n()
const aiStore = useAiStore()
const toastStore = useToastStore()
const workspaceStore = useWorkspaceStore()
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

const currentWorkspacePath = computed(() => String(workspaceStore.path || '').trim())
const evidenceStrategyOptions = computed(() => [
  { value: 'focused', label: t('Focused evidence') },
  { value: 'balanced', label: t('Balanced evidence') },
  { value: 'strict', label: t('Strict evidence') },
])
const completionThresholdOptions = computed(() => [
  { value: 'fast', label: t('Fast') },
  { value: 'balanced', label: t('Balanced') },
  { value: 'strict', label: t('Strict') },
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
    codexCli.value.model || (codexCli.value.profile ? `profile:${codexCli.value.profile}` : t('Using Codex defaults')),
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
        String(currentConfig?.researchDefaults?.defaultCitationStyle || referencesStore.citationStyle || 'apa').trim()
        || 'apa',
      evidenceStrategy: String(researchDefaults.value.evidenceStrategy || 'balanced').trim() || 'balanced',
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
      evidenceStrategy: String(config?.researchDefaults?.evidenceStrategy || 'balanced').trim() || 'balanced',
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
.settings-ai-research-panel,
.settings-ai-runtime-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--border) 52%, transparent);
  background: color-mix(in srgb, var(--surface-base) 82%, transparent);
}

.settings-ai-research-intro,
.settings-ai-runtime-intro {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.settings-ai-research-intro-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.settings-ai-research-intro-copy {
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-secondary);
}

.settings-ai-research-summary,
.settings-ai-runtime-summary {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--surface-hover) 28%, transparent);
}

.settings-ai-research-summary-label,
.settings-ai-runtime-status__label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-tertiary);
}

.settings-ai-research-summary-value,
.settings-ai-runtime-summary-copy {
  font-size: 13px;
  color: var(--text-primary);
  word-break: break-word;
}

.settings-ai-runtime-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

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

.settings-ai-research-grid,
.settings-ai-runtime-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 12px;
}

.settings-ai-runtime-row {
  padding: 12px 0;
}

.settings-ai-input {
  width: 320px;
  max-width: 100%;
}

.settings-ai-runtime-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

.settings-inline-message {
  font-size: 12px;
  line-height: 1.5;
  color: var(--success);
}

.settings-inline-message-error {
  color: var(--error);
}

@media (max-width: 720px) {
  .settings-ai-research-grid,
  .settings-ai-runtime-grid {
    grid-template-columns: 1fr;
  }
}
</style>
