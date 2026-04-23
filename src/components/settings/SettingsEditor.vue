<!-- START OF FILE src/components/settings/SettingsEditor.vue -->
<template>
  <div class="editor-page settings-page">
    <h3 class="settings-section-title">{{ t('Writing') }}</h3>

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
import { useWorkspaceStore } from '../../stores/workspace'
import { useLatexStore } from '../../stores/latex'
import { useI18n } from '../../i18n'
import UiSwitch from '../shared/ui/UiSwitch.vue'

const workspace = useWorkspaceStore()
const latexStore = useLatexStore()
const { t } = useI18n()

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
</style>
