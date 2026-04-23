<template>
  <div class="editor-page settings-page">
    <h3 class="settings-section-title">{{ t('Writing') }}</h3>

    <section class="settings-group">
      <h4 class="settings-group-title">{{ t('Editor') }}</h4>
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

        <div class="settings-row">
          <div class="settings-row-copy">
            <div class="settings-row-title">{{ t('Show line numbers') }}</div>
          </div>
          <div class="settings-row-control compact">
            <UiSwitch
              :model-value="workspace.editorLineNumbers"
              @update:model-value="workspace.setEditorLineNumbers($event)"
            />
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-row-copy">
            <div class="settings-row-title">{{ t('Highlight current line') }}</div>
          </div>
          <div class="settings-row-control compact">
            <UiSwitch
              :model-value="workspace.editorHighlightActiveLine"
              @update:model-value="workspace.setEditorHighlightActiveLine($event)"
            />
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-row-copy">
            <div class="settings-row-title">{{ t('Text measure') }}</div>
          </div>
          <div class="settings-row-control">
            <UiSelect
              :model-value="workspace.wrapColumn"
              :options="textMeasureOptions"
              @update:model-value="workspace.setWrapColumn"
            />
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-row-copy">
            <div class="settings-row-title">{{ t('Spellcheck') }}</div>
          </div>
          <div class="settings-row-control compact">
            <UiSwitch
              :model-value="workspace.editorSpellcheck"
              @update:model-value="workspace.setEditorSpellcheck($event)"
            />
          </div>
        </div>
      </div>
    </section>

    <section class="settings-group">
      <h4 class="settings-group-title">{{ t('Markdown') }}</h4>
      <div class="settings-group-body">
        <div class="settings-row">
          <div class="settings-row-copy">
            <div class="settings-row-title">{{ t('Markdown font') }}</div>
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
            <div class="settings-row-title">{{ t('Sync Markdown preview') }}</div>
          </div>
          <div class="settings-row-control compact">
            <UiSwitch
              :model-value="workspace.markdownPreviewSync"
              @update:model-value="workspace.setMarkdownPreviewSync($event)"
            />
          </div>
        </div>
      </div>
    </section>

    <section class="settings-group">
      <h4 class="settings-group-title">{{ t('LaTeX') }}</h4>
      <div class="settings-group-body">
        <div class="settings-row">
          <div class="settings-row-copy">
            <div class="settings-row-title">{{ t('LaTeX editor font') }}</div>
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

      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useWorkspaceStore } from '../../stores/workspace'
import { useI18n } from '../../i18n'
import {
  EDITOR_FONT_SIZE_PRESETS,
  FALLBACK_SYSTEM_FONT_FAMILIES,
  WORKSPACE_FONT_PRESETS,
  decodeWorkspaceSystemFontFamily,
  loadWorkspaceSystemFontFamilies,
} from '../../services/workspacePreferences'
import UiSelect from '../shared/ui/UiSelect.vue'
import UiSwitch from '../shared/ui/UiSwitch.vue'

const workspace = useWorkspaceStore()
const { t } = useI18n()

const systemFontFamilies = ref([...FALLBACK_SYSTEM_FONT_FAMILIES])

const editorFontSizeOptions = EDITOR_FONT_SIZE_PRESETS.map((value) => ({
  value,
  label: `${value} px`,
}))

const textMeasureOptions = [
  { value: 0, label: t('Adaptive') },
  { value: 80, label: t('Compact · 80 ch') },
  { value: 100, label: t('Balanced · 100 ch') },
  { value: 120, label: t('Expansive · 120 ch') },
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

.settings-group-title {
  text-transform: none !important;
  letter-spacing: 0.02em;
}
</style>
