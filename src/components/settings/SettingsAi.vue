<template>
  <div class="settings-agent-subpage">
    <h3 class="settings-section-title">Codex ACP</h3>

    <section class="settings-group">
      <h4 class="settings-group-title">Codex ACP</h4>
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
})
const codexCli = ref(defaultCodexCliConfig())

const runtimeSummary = computed(() => {
  if (!runtimeState.value.installed) {
    return t('ScribeFlow could not launch the configured Codex CLI command for the ACP bridge.')
  }

  const bits = [runtimeState.value.version, codexCli.value.model || t('Using Codex defaults')].filter(Boolean)
  return bits.join(' · ')
})

function updateCodexCliField(field = '', value = '') {
  codexCli.value = {
    ...codexCli.value,
    [field]: String(value ?? '').trim(),
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
    runtimeBackend: 'codex-acp',
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
