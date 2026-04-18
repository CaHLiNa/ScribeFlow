<!-- START OF FILE src/components/settings/SettingsEditor.vue -->
<template>
  <div class="editor-page settings-page">
    <h3 class="settings-section-title">{{ t('Writing') }}</h3>

    <!-- Appearance -->
    <section class="settings-group">
      <h4 class="settings-group-title">{{ t('Appearance') }}</h4>
      <div class="settings-group-body">
        <div class="settings-row">
          <div class="settings-row-copy">
            <div class="settings-row-title">{{ t('Writing font') }}</div>
          </div>
          <div class="settings-row-control">
            <div class="settings-segmented">
              <button
                v-for="font in proseFonts"
                :key="font.value"
                type="button"
                class="settings-segmented-btn"
                :class="{ 'is-active': workspace.proseFont === font.value }"
                @click="workspace.setProseFont(font.value)"
              >
                {{ t(font.labelKey) }}
              </button>
            </div>
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-row-copy">
            <div class="settings-row-title">{{ t('Editor text size') }}</div>
          </div>
          <div class="settings-row-control">
            <UiSelect
              :model-value="workspace.editorFontSize"
              :options="editorFontSizeOptions"
              @update:model-value="workspace.setEditorFontSize"
            />
          </div>
        </div>
      </div>
    </section>

    <!-- Writing -->
    <section class="settings-group">
      <h4 class="settings-group-title">{{ t('Writing') }}</h4>
      <div class="settings-group-body">
        <div class="settings-row">
          <div class="settings-row-copy">
            <div class="settings-row-title">{{ t('Auto Save') }}</div>
          </div>
          <div class="settings-row-control compact">
            <UiSwitch
              :model-value="workspace.autoSave"
              @update:model-value="workspace.toggleAutoSave()"
            />
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-row-copy">
            <div class="settings-row-title">{{ t('Soft Wrap') }}</div>
          </div>
          <div class="settings-row-control compact">
            <UiSwitch
              :model-value="workspace.softWrap"
              @update:model-value="workspace.toggleSoftWrap()"
            />
          </div>
        </div>

        <div class="settings-row" :class="{ 'is-disabled-row': !workspace.softWrap }">
          <div class="settings-row-copy">
            <div class="settings-row-title">{{ t('Preferred line width') }}</div>
          </div>
          <div class="settings-row-control">
            <div class="settings-segmented">
              <button
                v-for="preset in WRAP_PRESETS"
                :key="preset.value"
                type="button"
                class="settings-segmented-btn"
                :class="{ 'is-active': workspace.wrapColumn === preset.value }"
                :disabled="!workspace.softWrap"
                @click="workspace.setWrapColumn(preset.value)"
              >
                {{ t(preset.labelKey) }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- LaTeX -->
    <section class="settings-group">
      <h4 class="settings-group-title">LaTeX</h4>
      <div class="settings-group-body">
        <div class="settings-row">
          <div class="settings-row-copy">
            <div class="settings-row-title">{{ t('Compile on save') }}</div>
          </div>
          <div class="settings-row-control compact">
            <UiSwitch
              :model-value="latexStore.autoCompile"
              @update:model-value="latexStore.setAutoCompile(!latexStore.autoCompile)"
            />
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-row-copy">
            <div class="settings-row-title">{{ t('Format on save') }}</div>
          </div>
          <div class="settings-row-control compact">
            <UiSwitch
              :model-value="latexStore.formatOnSave"
              @update:model-value="latexStore.setFormatOnSave(!latexStore.formatOnSave)"
            />
          </div>
        </div>
      </div>
    </section>

    <section v-if="showExperimentalEditorSection" class="settings-group">
      <h4 class="settings-group-title">{{ t('Experimental') }}</h4>
      <div class="settings-group-body">
        <div class="settings-row">
          <div class="settings-row-copy">
            <div class="settings-row-title">{{ t('Editor runtime') }}</div>
            <div class="settings-row-description">
              {{
                t(
                  'Web keeps the current editor. Native experimental replaces the in-workbench text surface with the experimental Rust-native runtime placeholder.'
                )
              }}
            </div>
          </div>
          <div class="settings-row-control">
            <div class="settings-segmented">
              <button
                v-for="option in runtimeModeOptions"
                :key="option.value"
                type="button"
                class="settings-segmented-btn"
                :class="{ 'is-active': editorRuntimeStore.mode === option.value }"
                @click="editorRuntimeStore.setMode(option.value)"
              >
                {{ t(option.label) }}
              </button>
            </div>
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-row-copy">
            <div class="settings-row-title">{{ t('Native editor shadow mode') }}</div>
            <div class="settings-row-description">
              {{
                t(
                  'Mirror the active text document into the experimental Rust-native editor helper for smoke testing.'
                )
              }}
            </div>
          </div>
          <div class="settings-row-control compact">
            <UiSwitch
              :model-value="editorRuntimeStore.shadowMode"
              @update:model-value="editorRuntimeStore.setShadowMode($event)"
            />
          </div>
        </div>

        <div class="settings-debug-card">
          <div class="settings-debug-grid">
            <div class="settings-debug-item">
              <div class="settings-debug-label">{{ t('Helper status') }}</div>
              <div
                class="settings-debug-value"
                :class="{ 'is-active': editorRuntimeStore.nativeRuntimeConnected }"
              >
                {{ runtimeStatusLabel }}
              </div>
            </div>

            <div class="settings-debug-item">
              <div class="settings-debug-label">{{ t('Session') }}</div>
              <div class="settings-debug-mono">
                {{ editorRuntimeStore.lastNativeSessionId || t('Not started') }}
              </div>
            </div>

            <div class="settings-debug-item">
              <div class="settings-debug-label">{{ t('Native events') }}</div>
              <div class="settings-debug-mono">{{ editorRuntimeStore.nativeRuntimeEventCount }}</div>
            </div>

            <div class="settings-debug-item">
              <div class="settings-debug-label">{{ t('Shadow mode') }}</div>
              <div class="settings-debug-value" :class="{ 'is-active': editorRuntimeStore.shadowMode }">
                {{ editorRuntimeStore.shadowMode ? t('Enabled') : t('Disabled') }}
              </div>
            </div>
          </div>

          <div class="settings-debug-section">
            <div class="settings-debug-label">{{ t('Latest native event') }}</div>
            <div v-if="latestNativeEvent" class="settings-debug-event">
              <div class="settings-debug-event-head">
                <span class="settings-debug-pill">{{ latestNativeEvent.kind || t('Unknown') }}</span>
                <span class="settings-debug-muted">{{ latestNativeEvent.ts }}</span>
              </div>
              <div class="settings-debug-event-body">
                {{ formatNativeEvent(latestNativeEvent) }}
              </div>
            </div>
            <div v-else class="settings-debug-empty">
              {{ t('No native editor events yet.') }}
            </div>
          </div>

          <div class="settings-debug-section">
            <div class="settings-debug-label">{{ t('Recent native events') }}</div>
            <div v-if="recentNativeEvents.length" class="settings-debug-list">
              <div
                v-for="event in recentNativeEvents"
                :key="`${event.ts}:${event.kind}:${event.path || ''}`"
                class="settings-debug-list-item"
              >
                <span class="settings-debug-pill">{{ event.kind || t('Unknown') }}</span>
                <span class="settings-debug-list-copy">{{ formatNativeEvent(event) }}</span>
              </div>
            </div>
            <div v-else class="settings-debug-empty">
              {{ t('Open a text file with shadow mode enabled to populate this list.') }}
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useWorkspaceStore } from '../../stores/workspace'
import { useLatexStore } from '../../stores/latex'
import { useEditorRuntimeStore, EDITOR_RUNTIME_MODES } from '../../stores/editorRuntime'
import { EDITOR_FONT_SIZE_PRESETS } from '../../services/workspacePreferences'
import { useI18n } from '../../i18n'
import UiSwitch from '../shared/ui/UiSwitch.vue'
import UiSelect from '../shared/ui/UiSelect.vue'

const workspace = useWorkspaceStore()
const latexStore = useLatexStore()
const editorRuntimeStore = useEditorRuntimeStore()
const { t } = useI18n()
const showExperimentalEditorSection = computed(
  () => typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__
)
const runtimeStatusLabel = computed(() => {
  if (editorRuntimeStore.nativeRuntimeConnected) return t('Connected')
  if (editorRuntimeStore.shadowMode) return t('Starting or idle')
  return t('Off')
})
const latestNativeEvent = computed(() => editorRuntimeStore.lastNativeRuntimeEvent || null)
const recentNativeEvents = computed(() =>
  [...editorRuntimeStore.recentNativeRuntimeEvents].slice(-5).reverse()
)

const proseFonts = [
  { value: 'inter', labelKey: 'Sans' },
  { value: 'stix', labelKey: 'Serif' },
  { value: 'mono', labelKey: 'Mono' },
]

const editorFontSizeOptions = EDITOR_FONT_SIZE_PRESETS.map((value) => ({
  value,
  label: `${value} px`,
}))

const WRAP_PRESETS = [
  { value: 0, labelKey: 'Auto' },
  { value: 80, labelKey: '80 ch' },
  { value: 100, labelKey: '100 ch' },
  { value: 120, labelKey: '120 ch' },
]
const runtimeModeOptions = [
  { value: EDITOR_RUNTIME_MODES.WEB, label: 'Web' },
  { value: EDITOR_RUNTIME_MODES.NATIVE_EXPERIMENTAL, label: 'Native experimental' },
]

function formatNativeEvent(event = {}) {
  const kind = String(event.kind || '').trim()
  const path = String(event.path || '').trim()
  const reason = String(event.reason || '').trim()
  const message = String(event.message || '').trim()
  const textLength = Number(event.textLength ?? -1)

  if (kind === 'documentOpened') {
    return path
      ? t('Opened {path} ({count} chars)', {
          path,
          count: Number.isFinite(textLength) && textLength >= 0 ? textLength : 0,
        })
      : t('Document opened')
  }

  if (kind === 'contentChanged') {
    return path
      ? t('Updated {path} via {reason} ({count} chars)', {
          path,
          reason: reason || t('unknown'),
          count: Number.isFinite(textLength) && textLength >= 0 ? textLength : 0,
        })
      : t('Document content changed')
  }

  if (kind === 'ready') {
    return t('Helper signaled ready')
  }

  if (kind === 'pong') {
    return t('Helper responded to health check')
  }

  if (kind === 'stopped') {
    return t('Helper stopped cleanly')
  }

  if (kind === 'error') {
    return message || t('Helper reported an error')
  }

  if (message) return message
  if (path) return path
  return t('No extra details')
}
</script>

<style scoped>
.is-disabled-row {
  opacity: 0.5;
  pointer-events: none;
}

.settings-row-description {
  margin-top: 2px;
  color: var(--text-muted);
  font-size: var(--ui-font-label, 12px);
  line-height: 1.4;
}

.settings-debug-card {
  margin-top: 10px;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--border) 84%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--surface-elevated, var(--surface-secondary)) 78%, transparent);
}

.settings-debug-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 12px;
}

.settings-debug-item {
  min-width: 0;
}

.settings-debug-label {
  color: var(--text-muted);
  font-size: var(--ui-font-label, 12px);
  line-height: 1.3;
  margin-bottom: 3px;
}

.settings-debug-value {
  color: var(--text-secondary);
  font-size: var(--ui-font-size, 13px);
  font-weight: 600;
}

.settings-debug-value.is-active {
  color: var(--accent);
}

.settings-debug-mono {
  font-family: var(--font-mono);
  font-size: var(--ui-font-code, 12px);
  color: var(--text-primary);
  word-break: break-word;
}

.settings-debug-section {
  margin-top: 12px;
}

.settings-debug-event,
.settings-debug-list {
  margin-top: 6px;
}

.settings-debug-event-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 4px;
}

.settings-debug-pill {
  display: inline-flex;
  align-items: center;
  min-height: 20px;
  padding: 0 7px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  color: var(--accent);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.settings-debug-muted {
  color: var(--text-muted);
  font-size: var(--ui-font-label, 12px);
}

.settings-debug-event-body,
.settings-debug-list-copy,
.settings-debug-empty {
  color: var(--text-secondary);
  font-size: var(--ui-font-size, 13px);
  line-height: 1.45;
}

.settings-debug-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.settings-debug-list-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

:deep(.ui-select-shell) {
  width: min(100%, 140px); /* 字号选择框比较短，不需要太宽 */
}
</style>
