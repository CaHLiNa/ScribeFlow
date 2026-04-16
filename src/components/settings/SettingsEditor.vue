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
  </div>
</template>

<script setup>
import { useWorkspaceStore } from '../../stores/workspace'
import { useLatexStore } from '../../stores/latex'
import { EDITOR_FONT_SIZE_PRESETS } from '../../services/workspacePreferences'
import { useI18n } from '../../i18n'
import UiSwitch from '../shared/ui/UiSwitch.vue'
import UiSelect from '../shared/ui/UiSelect.vue'

const workspace = useWorkspaceStore()
const latexStore = useLatexStore()
const { t } = useI18n()

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
</script>

<style scoped>
.is-disabled-row {
  opacity: 0.5;
  pointer-events: none;
}

:deep(.ui-select-shell) {
  width: min(100%, 140px); /* 字号选择框比较短，不需要太宽 */
}
</style>
