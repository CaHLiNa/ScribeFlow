<template>
  <div class="editor-page settings-page">
    <h3 class="settings-section-title">{{ t('Editor') }}</h3>

    <section class="settings-group">
      <h4 class="settings-group-title">{{ t('Appearance') }}</h4>
      <div class="settings-group-body">
        <div class="settings-row">
          <div class="settings-row-copy">
            <div class="settings-row-title">{{ t('Writing font') }}</div>
            <div class="settings-row-hint">
              {{ t('Choose the default reading and drafting face for prose documents.') }}
            </div>
          </div>
          <div class="settings-row-control">
            <div
              class="settings-segmented editor-segmented"
              role="group"
              :aria-label="t('Writing font')"
            >
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
      </div>
    </section>

    <section class="settings-group">
      <h4 class="settings-group-title">{{ t('Writing') }}</h4>
      <div class="settings-group-body">
        <div class="settings-row">
          <div class="settings-row-copy">
            <div class="settings-row-title">{{ t('Auto Save') }}</div>
            <div class="settings-row-hint">
              {{ t('Save changes automatically while you work in the current project.') }}
            </div>
          </div>
          <div class="settings-row-control compact">
            <UiSwitch
              :model-value="workspace.autoSave"
              :aria-label="t('Toggle auto save')"
              @update:model-value="workspace.toggleAutoSave()"
            />
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-row-copy">
            <div class="settings-row-title">{{ t('Soft Wrap') }}</div>
            <div class="settings-row-hint">
              {{ t('Wrap long lines in the editor instead of scrolling horizontally.') }}
            </div>
          </div>
          <div class="settings-row-control compact">
            <UiSwitch
              :model-value="workspace.softWrap"
              :aria-label="t('Toggle soft wrap')"
              @update:model-value="workspace.toggleSoftWrap()"
            />
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-row-copy">
            <div class="settings-row-title">{{ t('Preferred line width') }}</div>
            <div class="settings-row-hint">
              {{ t('Used when soft wrap is enabled for long-form writing layouts.') }}
            </div>
          </div>
          <div class="settings-row-control">
            <div
              class="settings-segmented editor-segmented editor-segmented--compact"
              role="group"
              :aria-label="t('Preferred line width')"
              :aria-disabled="!workspace.softWrap ? 'true' : 'false'"
            >
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
            <div class="settings-row-title">{{ t('Spell Check') }}</div>
            <div class="settings-row-hint">
              {{ t('Underline spelling issues while drafting in supported editors.') }}
            </div>
          </div>
          <div class="settings-row-control compact">
            <UiSwitch
              :model-value="workspace.spellcheck"
              :aria-label="t('Toggle spell check')"
              @update:model-value="workspace.toggleSpellcheck()"
            />
          </div>
        </div>
      </div>
    </section>

    <section class="settings-group">
      <h4 class="settings-group-title">Typst</h4>
      <div class="settings-group-body">
        <div class="settings-row">
          <div class="settings-row-copy">
            <div class="settings-row-title">{{ t('Compile on save') }}</div>
            <div class="settings-row-hint">
              {{ t('Refresh Typst output after each save in projects that use Typst.') }}
            </div>
          </div>
          <div class="settings-row-control compact">
            <UiSwitch
              :model-value="typstStore.autoCompile"
              :aria-label="t('Toggle Typst compile on save')"
              @update:model-value="typstStore.setAutoCompile(!typstStore.autoCompile)"
            />
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-row-copy">
            <div class="settings-row-title">{{ t('Format on save') }}</div>
            <div class="settings-row-hint">
              {{ t('Apply Typst formatting automatically when the document is saved.') }}
            </div>
          </div>
          <div class="settings-row-control compact">
            <UiSwitch
              :model-value="typstStore.formatOnSave"
              :aria-label="t('Toggle Typst format on save')"
              @update:model-value="typstStore.setFormatOnSave(!typstStore.formatOnSave)"
            />
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-row-copy">
            <div class="settings-row-title">{{ t('Inlay hints') }}</div>
            <div class="settings-row-hint">
              {{ t('Show inline hints from the Typst language service while editing.') }}
            </div>
          </div>
          <div class="settings-row-control compact">
            <UiSwitch
              :model-value="typstStore.inlayHints"
              :aria-label="t('Toggle Typst inlay hints')"
              @update:model-value="typstStore.setInlayHintsEnabled(!typstStore.inlayHints)"
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
            <div class="settings-row-hint">
              {{ t('Build LaTeX output automatically after saving supported documents.') }}
            </div>
          </div>
          <div class="settings-row-control compact">
            <UiSwitch
              :model-value="latexStore.autoCompile"
              :aria-label="t('Toggle LaTeX compile on save')"
              @update:model-value="latexStore.setAutoCompile(!latexStore.autoCompile)"
            />
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-row-copy">
            <div class="settings-row-title">{{ t('Format on save') }}</div>
            <div class="settings-row-hint">
              {{ t('Apply configured LaTeX formatting automatically on save.') }}
            </div>
          </div>
          <div class="settings-row-control compact">
            <UiSwitch
              :model-value="latexStore.formatOnSave"
              :aria-label="t('Toggle LaTeX format on save')"
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
import { useTypstStore } from '../../stores/typst'
import { useLatexStore } from '../../stores/latex'
import { useI18n } from '../../i18n'
import UiSwitch from '../shared/ui/UiSwitch.vue'

const workspace = useWorkspaceStore()
const typstStore = useTypstStore()
const latexStore = useLatexStore()
const { t } = useI18n()

const proseFonts = [
  { value: 'inter', labelKey: 'Sans' },
  { value: 'stix', labelKey: 'Serif' },
  { value: 'mono', labelKey: 'Mono' },
]

const WRAP_PRESETS = [
  { value: 0, labelKey: 'Auto' },
  { value: 80, labelKey: '80 ch' },
  { value: 100, labelKey: '100 ch' },
  { value: 120, labelKey: '120 ch' },
]
</script>

<style scoped>
.editor-segmented {
  min-width: 178px;
}

.editor-segmented--compact {
  min-width: auto;
}

.editor-segmented .settings-segmented-btn {
  min-width: 0;
  padding-inline: 12px;
}

.editor-segmented[aria-disabled='true'] {
  opacity: 0.5;
  pointer-events: none;
}
</style>
