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
            <div class="settings-segmented">
              <button
                v-for="font in fontKinds"
                :key="`ui-${font.value}`"
                type="button"
                class="settings-segmented-btn"
                :class="{ 'is-active': selectedUiFontKind === font.value }"
                @click="selectUiFontKind(font.value)"
              >
                {{ t(font.labelKey) }}
              </button>
            </div>
          </div>
        </div>

        <div v-if="selectedUiFontKind === 'system'" class="settings-row">
          <div class="settings-row-copy">
            <div class="settings-row-title">{{ t('System family') }}</div>
          </div>
          <div class="settings-row-control">
            <UiSelect
              shell-class="system-font-select"
              :model-value="selectedUiSystemFontFamily"
              :options="buildSystemFontOptions(selectedUiSystemFontFamily)"
              :placeholder="t('Select')"
              @update:model-value="selectUiSystemFontFamily"
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
            <div class="settings-segmented">
              <button
                v-for="font in fontKinds"
                :key="`markdown-${font.value}`"
                type="button"
                class="settings-segmented-btn"
                :class="{ 'is-active': selectedMarkdownFontKind === font.value }"
                @click="selectMarkdownFontKind(font.value)"
              >
                {{ t(font.labelKey) }}
              </button>
            </div>
          </div>
        </div>

        <div v-if="selectedMarkdownFontKind === 'system'" class="settings-row">
          <div class="settings-row-copy">
            <div class="settings-row-title">{{ t('System family') }}</div>
          </div>
          <div class="settings-row-control">
            <UiSelect
              shell-class="system-font-select"
              :model-value="selectedMarkdownSystemFontFamily"
              :options="buildSystemFontOptions(selectedMarkdownSystemFontFamily)"
              :placeholder="t('Select')"
              @update:model-value="selectMarkdownSystemFontFamily"
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
            <div class="settings-segmented">
              <button
                v-for="font in fontKinds"
                :key="`latex-${font.value}`"
                type="button"
                class="settings-segmented-btn"
                :class="{ 'is-active': selectedLatexFontKind === font.value }"
                @click="selectLatexFontKind(font.value)"
              >
                {{ t(font.labelKey) }}
              </button>
            </div>
          </div>
        </div>

        <div v-if="selectedLatexFontKind === 'system'" class="settings-row">
          <div class="settings-row-copy">
            <div class="settings-row-title">{{ t('System family') }}</div>
          </div>
          <div class="settings-row-control">
            <UiSelect
              shell-class="system-font-select"
              :model-value="selectedLatexSystemFontFamily"
              :options="buildSystemFontOptions(selectedLatexSystemFontFamily)"
              :placeholder="t('Select')"
              @update:model-value="selectLatexSystemFontFamily"
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
  encodeWorkspaceSystemFontFamily,
  getWorkspaceFontKind,
  loadWorkspaceSystemFontFamilies,
} from '../../services/workspacePreferences'
import { useI18n } from '../../i18n'
import UiSwitch from '../shared/ui/UiSwitch.vue'
import UiSelect from '../shared/ui/UiSelect.vue'

const workspace = useWorkspaceStore()
const latexStore = useLatexStore()
const { t } = useI18n()
const fontKinds = WORKSPACE_FONT_PRESETS
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

const selectedUiFontKind = computed(() => getWorkspaceFontKind(workspace.uiFont, 'inter'))
const selectedUiSystemFontFamily = computed(() => decodeWorkspaceSystemFontFamily(workspace.uiFont))
const selectedMarkdownFontKind = computed(() =>
  getWorkspaceFontKind(workspace.markdownFont, 'inter')
)
const selectedMarkdownSystemFontFamily = computed(() =>
  decodeWorkspaceSystemFontFamily(workspace.markdownFont)
)
const selectedLatexFontKind = computed(() => getWorkspaceFontKind(workspace.latexFont, 'mono'))
const selectedLatexSystemFontFamily = computed(() =>
  decodeWorkspaceSystemFontFamily(workspace.latexFont)
)

function buildSystemFontOptions(currentFamily = '') {
  const families = [...systemFontFamilies.value]

  if (currentFamily && !families.includes(currentFamily)) {
    families.unshift(currentFamily)
  }

  return families.map((family) => ({
    value: family,
    label: family,
  }))
}

function pickDefaultSystemFontFamily(currentFamily = '') {
  return (
    currentFamily ||
    systemFontFamilies.value.find((family) => family === 'PingFang SC') ||
    systemFontFamilies.value[0] ||
    FALLBACK_SYSTEM_FONT_FAMILIES[0]
  )
}

async function selectFontKind(kind, currentSystemFamily, setter) {
  if (kind === 'system') {
    await setter(encodeWorkspaceSystemFontFamily(pickDefaultSystemFontFamily(currentSystemFamily)))
    return
  }

  await setter(kind)
}

async function selectUiFontKind(kind) {
  await selectFontKind(kind, selectedUiSystemFontFamily.value, workspace.setUiFont)
}

async function selectUiSystemFontFamily(family) {
  await workspace.setUiFont(encodeWorkspaceSystemFontFamily(family))
}

async function selectMarkdownFontKind(kind) {
  await selectFontKind(kind, selectedMarkdownSystemFontFamily.value, workspace.setMarkdownFont)
}

async function selectMarkdownSystemFontFamily(family) {
  await workspace.setMarkdownFont(encodeWorkspaceSystemFontFamily(family))
}

async function selectLatexFontKind(kind) {
  await selectFontKind(kind, selectedLatexSystemFontFamily.value, workspace.setLatexFont)
}

async function selectLatexSystemFontFamily(family) {
  await workspace.setLatexFont(encodeWorkspaceSystemFontFamily(family))
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

:deep(.ui-select-shell.system-font-select) {
  width: min(100%, 280px);
}
</style>
