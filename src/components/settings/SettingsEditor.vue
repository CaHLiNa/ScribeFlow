<!-- START OF FILE src/components/settings/SettingsEditor.vue -->
<template>
  <div class="editor-page settings-page">
    <h3 class="settings-section-title">{{ t('Writing') }}</h3>

    <section class="settings-group">
      <h4 class="settings-group-title">{{ t('Appearance') }}</h4>
      <div class="settings-group-body">
        <div class="settings-row">
          <div class="settings-row-copy">
            <div class="settings-row-title">{{ t('UI font') }}</div>
            <div class="settings-row-hint">
              {{ t('Affects sidebar, tabs, settings, and general app chrome.') }}
            </div>
          </div>
          <div class="settings-row-control">
            <UiSelect
              shell-class="font-select"
              :model-value="workspace.uiFont"
              :options="fontSelectOptions(workspace.uiFont)"
              :placeholder="t('Select')"
              @update:model-value="workspace.setUiFont"
            />
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-row-copy">
            <div class="settings-row-title">{{ t('Markdown font') }}</div>
            <div class="settings-row-hint">
              {{ t('Affects Markdown editor prose and Markdown preview.') }}
            </div>
          </div>
          <div class="settings-row-control">
            <UiSelect
              shell-class="font-select"
              :model-value="workspace.markdownFont"
              :options="fontSelectOptions(workspace.markdownFont)"
              :placeholder="t('Select')"
              @update:model-value="workspace.setMarkdownFont"
            />
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-row-copy">
            <div class="settings-row-title">{{ t('LaTeX editor font') }}</div>
            <div class="settings-row-hint">
              {{
                t(
                  'Affects the .tex source editor only. Compiled PDF output still follows your document template.'
                )
              }}
            </div>
          </div>
          <div class="settings-row-control">
            <UiSelect
              shell-class="font-select"
              :model-value="workspace.latexFont"
              :options="fontSelectOptions(workspace.latexFont)"
              :placeholder="t('Select')"
              @update:model-value="workspace.setLatexFont"
            />
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
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useWorkspaceStore } from '../../stores/workspace'
import { useLatexStore } from '../../stores/latex'
import {
  EDITOR_FONT_SIZE_PRESETS,
  FALLBACK_SYSTEM_FONT_FAMILIES,
  WORKSPACE_FONT_PRESETS,
  decodeWorkspaceSystemFontFamily,
  loadWorkspaceSystemFontFamilies,
} from '../../services/workspacePreferences'
import { useI18n } from '../../i18n'
import UiSwitch from '../shared/ui/UiSwitch.vue'
import UiSelect from '../shared/ui/UiSelect.vue'

const workspace = useWorkspaceStore()
const latexStore = useLatexStore()
const { t } = useI18n()
const systemFontFamilies = ref([...FALLBACK_SYSTEM_FONT_FAMILIES])

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

const presetOptions = computed(() =>
  WORKSPACE_FONT_PRESETS.filter((font) => font.value !== 'system').map((font) => ({
    value: font.value,
    label:
      font.value === 'inter'
        ? t('Sans (Inter)')
        : font.value === 'stix'
          ? t('Serif (STIX Two Text)')
          : t('Mono (JetBrains Mono)'),
  }))
)

function fontSelectOptions(currentValue = '') {
  const currentFamily = decodeWorkspaceSystemFontFamily(currentValue)
  const fontFamilies = [...systemFontFamilies.value]

  if (currentFamily && !fontFamilies.includes(currentFamily)) {
    fontFamilies.unshift(currentFamily)
  }

  return [
    ...presetOptions.value,
    ...fontFamilies.map((family) => ({
      value: `system:${family}`,
      label: family,
      triggerLabel: family,
    })),
  ]
}

onMounted(async () => {
  systemFontFamilies.value = await loadWorkspaceSystemFontFamilies()
})
</script>

<style scoped>
.is-disabled-row {
  opacity: 0.5;
  pointer-events: none;
}

:deep(.ui-select-shell) {
  width: min(100%, 140px);
}

:deep(.ui-select-shell.font-select) {
  width: min(100%, 280px);
}
</style>
