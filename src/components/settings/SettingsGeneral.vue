<!-- START OF FILE src/components/settings/SettingsGeneral.vue -->
<template>
  <div class="general-page settings-page">
    <h3 class="settings-section-title">{{ t('General') }}</h3>

    <section class="settings-group">
      <h4 class="settings-group-title">{{ t('Appearance') }}</h4>
      <div class="theme-grid">
        <button
          v-for="theme in themes"
          :key="theme.id"
          type="button"
          class="theme-card"
          :class="{ 'is-active': workspace.theme === theme.id }"
          @click="workspace.setTheme(theme.id)"
        >
          <div class="theme-preview-box" :style="{ background: theme.colors.bgPrimary }">
            <div
              class="theme-preview-sidebar"
              :style="{ background: theme.colors.bgSecondary }"
            ></div>
            <div class="theme-preview-editor">
              <div
                class="theme-preview-line"
                :style="{ background: theme.colors.fgMuted, width: '60%' }"
              ></div>
              <div
                class="theme-preview-line"
                :style="{ background: theme.colors.accent, width: '46%' }"
              ></div>
              <div
                class="theme-preview-line"
                :style="{ background: theme.colors.fgMuted, width: '72%' }"
              ></div>
            </div>
            <div class="theme-check-badge" v-if="workspace.theme === theme.id">
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="3"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </div>
          </div>

          <div class="theme-info">
            <div class="theme-name">{{ t(theme.label) }}</div>
            <div class="theme-desc">{{ t(theme.description) }}</div>
          </div>
        </button>
      </div>
    </section>

    <section class="settings-group">
      <h4 class="settings-group-title">{{ t('General') }}</h4>
      <div class="settings-group-body">
        <div class="settings-row">
          <div class="settings-row-copy">
            <div class="settings-row-title">{{ t('Language') }}</div>
            <div class="settings-row-hint">
              {{ t('Choose the display language for the app interface.') }}
            </div>
          </div>
          <div class="settings-row-control">
            <UiSelect
              shell-class="font-select"
              :model-value="workspace.preferredLocale"
              :options="languageOptions"
              :placeholder="t('Select')"
              @update:model-value="workspace.setPreferredLocale"
            />
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-row-copy">
            <div class="settings-row-title">{{ t('Reopen last workspace on launch') }}</div>
            <div class="settings-row-hint">
              {{ t('Restore the last opened workspace automatically when the app starts.') }}
            </div>
          </div>
          <div class="settings-row-control compact">
            <UiSwitch
              :model-value="workspace.reopenLastWorkspaceOnLaunch"
              :aria-label="t('Reopen last workspace on launch')"
              @update:model-value="workspace.setReopenLastWorkspaceOnLaunch($event)"
            />
          </div>
        </div>
      </div>
    </section>

    <section class="settings-group">
      <h4 class="settings-group-title">{{ t('Fonts') }}</h4>
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
      <h4 class="settings-group-title">{{ t('PDF Viewer') }}</h4>
      <div class="settings-group-body">
        <div class="settings-row">
          <div class="settings-row-copy">
            <div class="settings-row-title">{{ t('Match app theme') }}</div>
          </div>
          <div class="settings-row-control compact">
            <UiSwitch
              :model-value="workspace.pdfPageBackgroundFollowsTheme"
              :aria-label="t('Match app theme')"
              @update:model-value="workspace.setPdfPageBackgroundFollowsTheme($event)"
            />
          </div>
        </div>
        <div class="settings-row">
          <div
            class="settings-row-copy"
            :class="{ 'is-disabled-copy': workspace.pdfPageBackgroundFollowsTheme }"
          >
            <div class="settings-row-title">{{ t('Eye-care page color') }}</div>
          </div>
          <div class="settings-row-control">
            <div class="pdf-page-color-control">
              <UiColorInput
                :model-value="workspace.pdfCustomPageBackground"
                :disabled="workspace.pdfPageBackgroundFollowsTheme"
                :aria-label="t('Eye-care page color')"
                @update:model-value="workspace.setPdfCustomPageBackground($event)"
              />
              <UiInput
                :model-value="pdfCustomPageBackgroundDraft"
                :disabled="workspace.pdfPageBackgroundFollowsTheme"
                monospace
                placeholder="#1E1E1E"
                autocapitalize="off"
                autocomplete="off"
                spellcheck="false"
                :aria-label="t('Eye-care page color')"
                @update:model-value="handlePdfCustomPageBackgroundDraftInput"
                @blur="commitPdfCustomPageBackgroundDraft"
                @keydown="handlePdfColorDraftKeydown($event, commitPdfCustomPageBackgroundDraft)"
              />
              <div class="pdf-page-color-preview" :style="pdfCustomPagePreviewStyle">Aa</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useWorkspaceStore } from '../../stores/workspace'
import { useI18n } from '../../i18n'
import { WORKSPACE_THEME_OPTIONS } from '../../shared/workspaceThemeOptions.js'
import {
  EDITOR_FONT_SIZE_PRESETS,
  FALLBACK_SYSTEM_FONT_FAMILIES,
  WORKSPACE_FONT_PRESETS,
  decodeWorkspaceSystemFontFamily,
  loadWorkspaceSystemFontFamilies,
  normalizeWorkspacePdfCustomPageBackground,
  resolvePdfCustomPageForeground,
} from '../../services/workspacePreferences'
import UiColorInput from '../shared/ui/UiColorInput.vue'
import UiInput from '../shared/ui/UiInput.vue'
import UiSelect from '../shared/ui/UiSelect.vue'
import UiSwitch from '../shared/ui/UiSwitch.vue'

const workspace = useWorkspaceStore()
const { t } = useI18n()
const themes = WORKSPACE_THEME_OPTIONS
const systemFontFamilies = ref([...FALLBACK_SYSTEM_FONT_FAMILIES])
const pdfCustomPageBackgroundDraft = ref(workspace.pdfCustomPageBackground)

const editorFontSizeOptions = EDITOR_FONT_SIZE_PRESETS.map((value) => ({
  value,
  label: `${value} px`,
}))

const languageOptions = computed(() => [
  { value: 'system', label: t('Follow system') },
  { value: 'zh-CN', label: '中文' },
  { value: 'en-US', label: 'English' },
])

const resolvedPdfPagePreviewBackground = computed(() =>
  workspace.pdfPageBackgroundFollowsTheme
    ? 'var(--shell-preview-surface)'
    : workspace.pdfCustomPageBackground
)

const resolvedPdfPagePreviewForeground = computed(() =>
  workspace.pdfPageBackgroundFollowsTheme
    ? 'var(--workspace-ink)'
    : resolvePdfCustomPageForeground(workspace.pdfCustomPageBackground)
)

const pdfCustomPagePreviewStyle = computed(() => ({
  background: resolvedPdfPagePreviewBackground.value,
  color: resolvedPdfPagePreviewForeground.value,
}))

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

watch(
  () => workspace.pdfCustomPageBackground,
  (value) => {
    pdfCustomPageBackgroundDraft.value = value
  }
)

function normalizeColorDraft(value, normalizer) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()

  if (/^#[0-9a-f]{6}$/.test(normalized)) {
    return normalizer(normalized)
  }

  if (/^#[0-9a-f]{3}$/.test(normalized)) {
    return normalizer(normalized)
  }

  return ''
}

function handlePdfCustomPageBackgroundDraftInput(value) {
  pdfCustomPageBackgroundDraft.value = value
  const normalized = normalizeColorDraft(value, normalizeWorkspacePdfCustomPageBackground)
  if (normalized) {
    workspace.setPdfCustomPageBackground(normalized)
  }
}

function commitPdfCustomPageBackgroundDraft() {
  const normalized = normalizeColorDraft(
    pdfCustomPageBackgroundDraft.value,
    normalizeWorkspacePdfCustomPageBackground
  )
  if (!normalized) {
    pdfCustomPageBackgroundDraft.value = workspace.pdfCustomPageBackground
    return
  }
  workspace.setPdfCustomPageBackground(normalized)
  pdfCustomPageBackgroundDraft.value = workspace.pdfCustomPageBackground
}

function handlePdfColorDraftKeydown(event, commitDraft) {
  if (event.key === 'Enter') {
    commitDraft()
    event.target?.blur?.()
    return
  }

  if (event.key === 'Escape') {
    event.target?.blur?.()
  }
}

onMounted(async () => {
  systemFontFamilies.value = await loadWorkspaceSystemFontFamilies()
})
</script>

<style scoped>
.theme-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
  margin-top: 4px;
}

.theme-card {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  background: transparent;
  border: none;
  padding: 0;
  text-align: left;
  cursor: pointer;
  outline: none;
}

.theme-preview-box {
  position: relative;
  display: flex;
  height: 80px;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--border) 60%, transparent);
  transition:
    transform 0.15s ease,
    box-shadow 0.15s ease;
}

.theme-card:hover .theme-preview-box {
  box-shadow:
    0 4px 12px rgba(0, 0, 0, 0.1),
    0 0 0 1px color-mix(in srgb, var(--border) 80%, transparent);
  transform: translateY(-2px);
}

.theme-card.is-active .theme-preview-box {
  box-shadow: 0 0 0 2px var(--accent);
}

.theme-preview-sidebar {
  width: 25%;
  border-right: 1px solid color-mix(in srgb, var(--border) 40%, transparent);
}

.theme-preview-editor {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 6px;
  padding: 12px;
}

.theme-preview-line {
  height: 3px;
  border-radius: 2px;
  opacity: 0.8;
}

.theme-check-badge {
  position: absolute;
  bottom: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  background: var(--accent);
  color: var(--bg-primary);
  border-radius: 50%;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.theme-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 4px 0;
}

.theme-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.theme-desc {
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.4;
}

.theme-card.is-active .theme-name {
  color: var(--text-primary);
  font-weight: 600;
}

.is-disabled-copy {
  opacity: 0.5;
}

:deep(.ui-color-input-shell) {
  width: 44px;
  min-width: 44px;
}

:deep(.ui-input-shell) {
  width: 112px;
}

.pdf-page-color-control {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  min-width: 0;
}

.pdf-page-color-preview {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  min-width: 40px;
  height: 28px;
  border-radius: 6px;
  border: 1px solid color-mix(in srgb, var(--border) 55%, transparent);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.01em;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
}

:deep(.ui-select-shell.font-select) {
  width: min(100%, 280px);
}
</style>
