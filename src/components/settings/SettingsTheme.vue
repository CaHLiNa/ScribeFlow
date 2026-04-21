<!-- START OF FILE src/components/settings/SettingsTheme.vue -->
<template>
  <div class="theme-page settings-page">
    <h3 class="settings-section-title">{{ t('Appearance') }}</h3>

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
import { computed, ref, watch } from 'vue'

import { useWorkspaceStore } from '../../stores/workspace'
import { useI18n } from '../../i18n'
import {
  normalizeWorkspacePdfCustomPageBackground,
  resolvePdfCustomPageForeground,
} from '../../services/workspacePreferences.js'
import UiColorInput from '../shared/ui/UiColorInput.vue'
import UiInput from '../shared/ui/UiInput.vue'
import UiSwitch from '../shared/ui/UiSwitch.vue'

const workspace = useWorkspaceStore()
const { t } = useI18n()
const pdfCustomPageBackgroundDraft = ref(workspace.pdfCustomPageBackground)
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
</script>

<style scoped>
.is-disabled-copy {
  opacity: 0.5;
}

.pdf-page-color-control {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  min-width: 0;
}

.pdf-page-color-control :deep(.ui-color-input-shell) {
  width: 44px;
  min-width: 44px;
}

.pdf-page-color-control :deep(.ui-input-shell) {
  width: 112px;
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
</style>
