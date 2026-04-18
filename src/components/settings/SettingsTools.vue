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

    <section class="settings-group">
      <h4 class="settings-group-title">{{ t('Runtime tools') }}</h4>
      <div class="settings-group-body">
        <div class="settings-row is-stack">
          <div class="settings-row-copy">
            <div class="settings-row-title">{{ t('Runtime tool catalog') }}</div>
            <div class="settings-row-hint">
              {{ t('These tools are currently available to the agent. Built-in tools stay local. MCP tools come from connected external servers.') }}
            </div>
          </div>

          <div class="settings-row-control settings-ai-runtime-groups">
            <div
              v-for="group in runtimeToolGroups"
              :key="group.key"
              class="settings-ai-runtime-group"
            >
              <div class="settings-ai-runtime-group-header">
                <div class="settings-ai-runtime-group-title">{{ t(group.label) }}</div>
                <div class="settings-ai-runtime-group-meta">{{ t('{count} available', { count: group.items.length }) }}</div>
              </div>

              <div class="settings-ai-runtime-tool-list">
                <div
                  v-for="tool in group.items"
                  :key="tool.id"
                  class="settings-ai-runtime-tool"
                  :class="{ 'is-external': tool.external }"
                >
                  <div class="settings-ai-runtime-tool-copy">
                    <div class="settings-ai-runtime-tool-topline">
                      <span class="settings-ai-runtime-tool-label">{{ t(tool.labelKey || tool.label) }}</span>
                      <span
                        v-if="tool.external"
                        class="settings-ai-runtime-tool-badge"
                      >
                        {{ t('External') }}
                      </span>
                    </div>
                    <div class="settings-ai-runtime-tool-description">
                      {{ t(tool.descriptionKey || tool.description) }}
                    </div>
                    <div class="settings-ai-runtime-tool-meta">
                      <span>{{ t('Invoke with #{name}', { name: tool.invocationName || tool.id }) }}</span>
                      <span v-if="tool.sourceLabel && tool.sourceKind === 'mcp'">
                        {{ t('Provided by {name}', { name: tool.sourceLabel }) }}
                      </span>
                      <span v-else-if="tool.sourceKind === 'built-in'">
                        {{ t('Built into Altals') }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div
              v-if="runtimeToolGroups.length === 0"
              class="settings-row-hint"
            >
              {{ t('No runtime tools are currently available.') }}
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
import { invoke } from '@tauri-apps/api/core'
import { useI18n } from '../../i18n'
import { useToastStore } from '../../stores/toast'
import { useAiStore } from '../../stores/ai'
import { useWorkspaceStore } from '../../stores/workspace'
import UiSwitch from '../shared/ui/UiSwitch.vue'

const { t } = useI18n()
const toastStore = useToastStore()
const aiStore = useAiStore()
const workspace = useWorkspaceStore()

const toolDefinitions = ref([])
const runtimeTools = ref([])
const loadedConfig = ref(null)
const enabledTools = ref([])
const pageFeedback = ref('')
const pageFeedbackType = ref('success')

const enabledToolIds = computed(() => new Set(enabledTools.value))
const runtimeToolGroups = computed(() => {
  const groups = new Map()
  for (const tool of Array.isArray(runtimeTools.value) ? runtimeTools.value : []) {
    const key = String(tool?.groupKey || 'tools').trim() || 'tools'
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label: String(tool?.groupLabel || 'Tools').trim() || 'Tools',
        items: [],
      })
    }
    groups.get(key).items.push(tool)
  }
  return [...groups.values()]
})
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
    const config = await invoke('ai_config_load')
    const catalog = await invoke('ai_tool_catalog_resolve', {
      params: {
        enabledTools: config?.enabledTools || [],
        runtimeIntent: 'agent',
        workspacePath: workspace.path || '',
      },
    })
    loadedConfig.value = config
    toolDefinitions.value = Array.isArray(catalog?.configurableTools)
      ? catalog.configurableTools
      : []
    runtimeTools.value = Array.isArray(catalog?.runtimeTools)
      ? catalog.runtimeTools
      : []
    enabledTools.value = Array.isArray(catalog?.normalizedEnabledToolIds)
      ? catalog.normalizedEnabledToolIds
      : []
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

  try {
    const catalog = await invoke('ai_tool_catalog_resolve', {
      params: {
        enabledTools: [...next],
        runtimeIntent: 'agent',
        workspacePath: workspace.path || '',
      },
    })
    const nextEnabledTools = Array.isArray(catalog?.normalizedEnabledToolIds)
      ? catalog.normalizedEnabledToolIds
      : []
    runtimeTools.value = Array.isArray(catalog?.runtimeTools)
      ? catalog.runtimeTools
      : []
    enabledTools.value = nextEnabledTools

    const currentConfig = loadedConfig.value || (await invoke('ai_config_load'))
    const nextConfig = {
      ...currentConfig,
      enabledTools: nextEnabledTools,
    }

    await invoke('ai_config_save', { config: nextConfig })
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

.settings-ai-runtime-groups {
  display: flex;
  flex-direction: column;
  gap: 18px;
  width: 100%;
}

.settings-ai-runtime-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.settings-ai-runtime-group-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.settings-ai-runtime-group-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.settings-ai-runtime-group-meta {
  font-size: 12px;
  color: var(--text-tertiary);
}

.settings-ai-runtime-tool-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
  width: 100%;
}

.settings-ai-runtime-tool {
  display: flex;
  min-width: 0;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--border-color) 16%, transparent);
  background: color-mix(in srgb, var(--panel-muted) 6%, transparent);
}

.settings-ai-runtime-tool.is-external {
  border-color: color-mix(in srgb, var(--warning) 16%, var(--border-color) 84%);
  background: color-mix(in srgb, var(--warning) 4%, transparent);
}

.settings-ai-runtime-tool-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
}

.settings-ai-runtime-tool-topline {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.settings-ai-runtime-tool-label {
  min-width: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.settings-ai-runtime-tool-badge {
  flex: 0 0 auto;
  padding: 2px 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--warning) 10%, transparent);
  color: color-mix(in srgb, var(--warning) 82%, var(--text-primary) 18%);
  font-size: 11px;
  font-weight: 600;
}

.settings-ai-runtime-tool-description {
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-secondary);
}

.settings-ai-runtime-tool-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  font-size: 11px;
  line-height: 1.45;
  color: var(--text-tertiary);
}
</style>
