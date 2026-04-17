<template>
  <div class="settings-page">
    <h3 class="settings-section-title">{{ t('Built-in tools') }}</h3>

    <section class="settings-group">
      <h4 class="settings-group-title">{{ t('Tool registry') }}</h4>
      <div class="settings-group-body">
        <div class="settings-row is-stack">
          <div class="settings-row-copy">
            <div class="settings-row-title">{{ t('Tool registry') }}</div>
            <div class="settings-row-hint">
              {{ t('Core workspace tools are built in for every agent run. Only risky tools stay configurable here.') }}
            </div>
          </div>

          <div class="settings-row-control settings-ai-tool-list">
            <div v-for="tool in toolDefinitions" :key="tool.id" class="settings-ai-tool-item">
              <UiSwitch
                :model-value="enabledToolIds.has(tool.id)"
                @update:model-value="toggleTool(tool.id, $event)"
              />
              <div
                class="settings-ai-tool-copy"
                :title="t(tool.descriptionKey || tool.description)"
              >
                <span class="settings-ai-tool-label">{{ t(tool.labelKey || tool.label) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <div v-if="pageFeedback" class="settings-inline-message" :class="feedbackClass">
      {{ pageFeedback }}
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useI18n } from '../../i18n'
import { useToastStore } from '../../stores/toast'
import { useAiStore } from '../../stores/ai'
import UiSwitch from '../shared/ui/UiSwitch.vue'
import { loadAiConfig, saveAiConfig } from '../../services/ai/settings.js'
import {
  AI_TOOL_DEFINITIONS,
  getConfigurableAiTools,
  normalizeEnabledAiToolIds,
} from '../../services/ai/toolRegistry.js'

const { t } = useI18n()
const toastStore = useToastStore()
const aiStore = useAiStore()

const toolDefinitions = getConfigurableAiTools(AI_TOOL_DEFINITIONS)
const loadedConfig = ref(null)
const enabledTools = ref([])
const pageFeedback = ref('')
const pageFeedbackType = ref('success')

const enabledToolIds = computed(() => new Set(enabledTools.value))
const feedbackClass = computed(() => ({
  'settings-inline-message-error': pageFeedbackType.value === 'error',
}))

function normalizeErrorMessage(error, fallback = '') {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error.trim()) return error
  if (error && typeof error === 'object') {
    for (const key of ['message', 'error', 'reason', 'details']) {
      const value = String(error[key] || '').trim()
      if (value) return value
    }
  }
  return fallback
}

async function loadState() {
  try {
    const config = await loadAiConfig()
    loadedConfig.value = config
    enabledTools.value = normalizeEnabledAiToolIds(config?.enabledTools)
    pageFeedback.value = ''
  } catch (error) {
    const message = normalizeErrorMessage(error, t('Failed to load AI settings.'))
    pageFeedbackType.value = 'error'
    pageFeedback.value = message
    toastStore.show(message, { type: 'error' })
  }
}

async function toggleTool(toolId = '', nextValue = false) {
  const next = new Set(enabledTools.value)
  if (nextValue) next.add(toolId)
  else next.delete(toolId)

  const nextEnabledTools = [...next]
  enabledTools.value = nextEnabledTools

  try {
    const currentConfig = loadedConfig.value || (await loadAiConfig())
    const nextConfig = {
      ...currentConfig,
      enabledTools: nextEnabledTools,
    }

    await saveAiConfig(nextConfig)
    loadedConfig.value = nextConfig
    await aiStore.refreshProviderState()

    pageFeedbackType.value = 'success'
    pageFeedback.value = t('Tool registry updated.')
    toastStore.show(t('Tool registry updated.'))
  } catch (error) {
    const message = normalizeErrorMessage(error, t('Failed to update tool registry.'))
    pageFeedbackType.value = 'error'
    pageFeedback.value = message
    toastStore.show(message, { type: 'error' })
    await loadState()
  }
}

onMounted(() => {
  void loadState()
})
</script>

<style scoped>
.settings-row.is-stack {
  flex-direction: column;
  align-items: stretch;
  gap: 16px;
}

.settings-ai-tool-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px 24px;
  width: 100%;
}

.settings-ai-tool-item {
  display: flex;
  align-items: center;
  gap: 12px;
}

.settings-ai-tool-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.settings-ai-tool-label {
  font-size: 13px;
  color: var(--text-primary);
}
</style>
