<template>
  <div class="editor-page editor-page-compact">
    <h3 class="settings-section-title">{{ t('Editor') }}</h3>

    <div class="editor-toggles">
      <!-- Writing Font -->
      <div class="env-lang-card">
        <div class="env-lang-header">
          <span class="env-lang-dot good"></span>
          <span class="env-lang-name">{{ t('Writing font') }}</span>
          <span class="env-lang-version">{{ currentFontLabel }}</span>
        </div>
        <div class="wrap-column-row editor-card-offset">
          <label class="ghost-model-label">{{ t('Prose font:') }}</label>
          <div class="wrap-preset-group settings-segmented">
            <UiButton
              v-for="font in proseFonts"
              :key="font.value"
              class="wrap-preset-btn settings-segmented-btn font-preset-btn"
              variant="ghost"
              size="sm"
              :active="workspace.proseFont === font.value"
              :style="{ fontFamily: font.family, fontSize: font.fontSize }"
              @click="workspace.setProseFont(font.value)"
            >
              {{ t(font.labelKey) }}
            </UiButton>
          </div>
        </div>
      </div>

      <!-- Soft Wrap -->
      <div class="env-lang-card">
        <div class="env-lang-header">
          <span class="env-lang-dot" :class="workspace.autoSave ? 'good' : 'warn'"></span>
          <span class="env-lang-name">{{ t('Auto Save') }}</span>
          <span class="env-lang-version">{{
            workspace.autoSave ? t('Enabled') : t('Disabled')
          }}</span>
          <div class="ui-flex-spacer"></div>
          <UiSwitch
            :model-value="workspace.autoSave"
            :aria-label="t('Toggle auto save')"
            @update:model-value="workspace.toggleAutoSave()"
          />
        </div>
      </div>

      <!-- Soft Wrap -->
      <div class="env-lang-card">
        <div class="env-lang-header">
          <span class="env-lang-dot" :class="workspace.softWrap ? 'good' : 'none'"></span>
          <span class="env-lang-name">{{ t('Soft Wrap') }}</span>
          <span v-if="workspace.softWrap" class="env-lang-version">{{ t('Enabled') }}</span>
          <span v-else class="env-lang-missing">{{ t('Disabled') }}</span>
          <div class="ui-flex-spacer"></div>
          <UiSwitch
            :model-value="workspace.softWrap"
            :aria-label="t('Toggle soft wrap')"
            @update:model-value="workspace.toggleSoftWrap()"
          />
        </div>
        <div v-if="workspace.softWrap" class="wrap-column-row editor-card-offset">
          <label class="ghost-model-label">{{ t('Line width:') }}</label>
          <div class="wrap-preset-group settings-segmented">
            <UiButton
              v-for="p in WRAP_PRESETS"
              :key="p.value"
              class="wrap-preset-btn settings-segmented-btn"
              variant="ghost"
              size="sm"
              :active="workspace.wrapColumn === p.value"
              @click="workspace.setWrapColumn(p.value)"
            >
              {{ t(p.labelKey) }}
            </UiButton>
          </div>
        </div>
      </div>

      <!-- Spell Check -->
      <div class="env-lang-card">
        <div class="env-lang-header">
          <span class="env-lang-dot" :class="workspace.spellcheck ? 'good' : 'none'"></span>
          <span class="env-lang-name">{{ t('Spell Check') }}</span>
          <span v-if="workspace.spellcheck" class="env-lang-version">{{ t('Enabled') }}</span>
          <span v-else class="env-lang-missing">{{ t('Disabled') }}</span>
          <div class="ui-flex-spacer"></div>
          <UiSwitch
            :model-value="workspace.spellcheck"
            :aria-label="t('Toggle spell check')"
            @update:model-value="workspace.toggleSpellcheck()"
          />
        </div>
      </div>

      <div class="env-lang-card">
        <div class="env-lang-header">
          <span class="env-lang-dot" :class="typstStore.autoCompile ? 'good' : 'warn'"></span>
          <span class="env-lang-name">{{ t('Typst compile on save') }}</span>
          <span class="env-lang-version">{{
            typstStore.autoCompile ? t('Enabled') : t('Disabled')
          }}</span>
          <div class="ui-flex-spacer"></div>
          <UiSwitch
            :model-value="typstStore.autoCompile"
            :aria-label="t('Toggle Typst compile on save')"
            @update:model-value="typstStore.setAutoCompile(!typstStore.autoCompile)"
          />
        </div>
      </div>

      <div class="env-lang-card">
        <div class="env-lang-header">
          <span class="env-lang-dot" :class="typstStore.formatOnSave ? 'good' : 'warn'"></span>
          <span class="env-lang-name">{{ t('Typst format on save') }}</span>
          <span class="env-lang-version">{{
            typstStore.formatOnSave ? t('Enabled') : t('Disabled')
          }}</span>
          <div class="ui-flex-spacer"></div>
          <UiSwitch
            :model-value="typstStore.formatOnSave"
            :aria-label="t('Toggle Typst format on save')"
            @update:model-value="typstStore.setFormatOnSave(!typstStore.formatOnSave)"
          />
        </div>
      </div>

      <div class="env-lang-card">
        <div class="env-lang-header">
          <span class="env-lang-dot" :class="latexStore.autoCompile ? 'good' : 'warn'"></span>
          <span class="env-lang-name">{{ t('LaTeX compile on save') }}</span>
          <span class="env-lang-version">{{
            latexStore.autoCompile ? t('Enabled') : t('Disabled')
          }}</span>
          <div class="ui-flex-spacer"></div>
          <UiSwitch
            :model-value="latexStore.autoCompile"
            :aria-label="t('Toggle LaTeX compile on save')"
            @update:model-value="latexStore.setAutoCompile(!latexStore.autoCompile)"
          />
        </div>
      </div>

      <div class="env-lang-card">
        <div class="env-lang-header">
          <span class="env-lang-dot" :class="latexStore.formatOnSave ? 'good' : 'warn'"></span>
          <span class="env-lang-name">{{ t('LaTeX format on save') }}</span>
          <span class="env-lang-version">{{
            latexStore.formatOnSave ? t('Enabled') : t('Disabled')
          }}</span>
          <div class="ui-flex-spacer"></div>
          <UiSwitch
            :model-value="latexStore.formatOnSave"
            :aria-label="t('Toggle LaTeX format on save')"
            @update:model-value="latexStore.setFormatOnSave(!latexStore.formatOnSave)"
          />
        </div>
      </div>

      <div class="env-lang-card">
        <div class="env-lang-header">
          <span class="env-lang-dot" :class="typstStore.inlayHints ? 'good' : 'warn'"></span>
          <span class="env-lang-name">{{ t('Typst inlay hints') }}</span>
          <span class="env-lang-version">{{
            typstStore.inlayHints ? t('Enabled') : t('Disabled')
          }}</span>
          <div class="ui-flex-spacer"></div>
          <UiSwitch
            :model-value="typstStore.inlayHints"
            :aria-label="t('Toggle Typst inlay hints')"
            @update:model-value="typstStore.setInlayHintsEnabled(!typstStore.inlayHints)"
          />
        </div>
      </div>

      <!-- Ghost Suggestions -->
      <div class="env-lang-card">
        <div class="env-lang-header">
          <span class="env-lang-dot" :class="workspace.ghostEnabled ? 'good' : 'none'"></span>
          <span class="env-lang-name">{{ t('Ghost Suggestions') }}</span>
          <span v-if="workspace.ghostEnabled" class="env-lang-version">{{ t('Enabled') }}</span>
          <span v-else class="env-lang-missing">{{ t('Disabled') }}</span>
          <div class="ui-flex-spacer"></div>
          <UiSwitch
            :model-value="workspace.ghostEnabled"
            :aria-label="t('Toggle ghost suggestions')"
            @update:model-value="workspace.setGhostEnabled(!workspace.ghostEnabled)"
          />
        </div>
        <div
          v-if="workspace.ghostEnabled && availableGhostModels.length > 1"
          class="ghost-model-picker editor-card-offset"
        >
          <label class="ghost-model-label">{{ t('Ghost model:') }}</label>
          <div class="ghost-dropdown-wrap">
            <UiButton
              ref="ghostBtnRef"
              class="ghost-dropdown-btn"
              variant="secondary"
              size="sm"
              @click.stop="ghostDropdownOpen = !ghostDropdownOpen"
            >
              {{ ghostModelLabel }}
              <template #trailing>
                <svg width="8" height="8" viewBox="0 0 10 10" fill="currentColor">
                  <path d="M1 3l4 4 4-4z" />
                </svg>
              </template>
            </UiButton>
            <Teleport to="body">
              <template v-if="ghostDropdownOpen">
                <div class="fixed inset-0 z-[10001]" @click="ghostDropdownOpen = false"></div>
                <div class="ghost-dropdown-menu" :style="ghostDropdownPos">
                  <UiButton
                    v-for="m in availableGhostModels"
                    :key="m.model"
                    class="ghost-dropdown-item settings-list-button"
                    variant="ghost"
                    size="sm"
                    block
                    content-mode="raw"
                    :active="isSelectedGhost(m.model)"
                    @click="selectGhostModel(m.model)"
                  >
                    <span v-if="isSelectedGhost(m.model)" class="ghost-dropdown-check"
                      >&#x2713;</span
                    >
                    <span v-else class="ghost-dropdown-check"></span>
                    {{ m.label }}
                  </UiButton>
                </div>
              </template>
            </Teleport>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useWorkspaceStore } from '../../stores/workspace'
import { useTypstStore } from '../../stores/typst'
import { useLatexStore } from '../../stores/latex'
import { GHOST_MODELS } from '../../services/apiClient'
import { useI18n } from '../../i18n'
import UiButton from '../shared/ui/UiButton.vue'
import UiSwitch from '../shared/ui/UiSwitch.vue'

const workspace = useWorkspaceStore()
const typstStore = useTypstStore()
const latexStore = useLatexStore()
const { t } = useI18n()

const proseFonts = [
  {
    value: 'inter',
    labelKey: 'Sans',
    family: "'Inter', system-ui, sans-serif",
    fontSize: 'var(--ui-font-caption)',
  },
  {
    value: 'stix',
    labelKey: 'Serif',
    family: "'STIX Two Text', Georgia, serif",
    fontSize: 'var(--ui-font-body)',
  },
  {
    value: 'mono',
    labelKey: 'Mono',
    family: "'JetBrains Mono', monospace",
    fontSize: 'var(--ui-font-caption)',
  },
]

const currentFontLabel = computed(() =>
  t(proseFonts.find((f) => f.value === workspace.proseFont)?.labelKey ?? 'Sans')
)

const WRAP_PRESETS = [
  { labelKey: 'Narrow', value: 60 },
  { labelKey: 'Medium', value: 80 },
  { labelKey: 'Wide', value: 100 },
  { labelKey: 'Full width', value: 0 },
]

const GHOST_MODEL_LABELS = {
  'claude-haiku-4-5-20251001': 'Haiku 4.5',
  'gemini-3.1-flash-lite-preview': 'Flash Lite',
  'gpt-5-nano-2025-08-07': 'GPT-5 Nano',
}

// Ghost models the user has access to
const availableGhostModels = computed(() => {
  return GHOST_MODELS.filter((m) => {
    const keys = workspace.apiKeys || {}
    const hasKey = keys[m.keyEnv] && !keys[m.keyEnv].includes('your-')
    return !!hasKey
  }).map((m) => ({
    ...m,
    label: GHOST_MODEL_LABELS[m.model] || m.model,
  }))
})

const ghostModelLabel = computed(() => {
  const selectedId = workspace.ghostModelId
  if (selectedId && GHOST_MODEL_LABELS[selectedId]) return GHOST_MODEL_LABELS[selectedId]
  return availableGhostModels.value[0]?.label || 'Haiku 4.5'
})

// Ghost model dropdown
const ghostBtnRef = ref(null)
const ghostDropdownOpen = ref(false)

const ghostDropdownPos = computed(() => {
  if (!ghostBtnRef.value) return {}
  const rect =
    ghostBtnRef.value.getBoundingClientRect?.() || ghostBtnRef.value.el?.getBoundingClientRect?.()
  if (!rect) return {}
  return {
    top: rect.bottom + 4 + 'px',
    left: rect.left + 'px',
  }
})

const selectedGhostId = computed(
  () => workspace.ghostModelId || availableGhostModels.value[0]?.model
)

function isSelectedGhost(model) {
  return model === selectedGhostId.value
}

function selectGhostModel(model) {
  workspace.setGhostModelId(model)
  ghostDropdownOpen.value = false
}
</script>

<style scoped>
.editor-toggles {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.editor-card-offset {
  margin-top: var(--space-2);
  padding-left: 14px;
}

.ghost-model-picker {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ghost-model-label {
  font-size: var(--ui-font-caption);
  color: var(--text-muted);
}

.ghost-dropdown-wrap {
  position: relative;
}

.ghost-dropdown-btn {
  min-height: 28px;
}

.ghost-dropdown-menu {
  position: fixed;
  z-index: 10002;
  min-width: 140px;
  padding: 4px 0;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-subtle);
  background: var(--surface-raised);
  box-shadow: var(--shadow-sm);
}

.ghost-dropdown-item {
  justify-content: flex-start;
  padding: 4px 9px;
  font-size: var(--ui-font-caption);
  color: var(--text-secondary);
}

.ghost-dropdown-check {
  width: 16px;
  display: inline-block;
  color: var(--accent);
  font-size: var(--ui-font-caption);
}

.wrap-column-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.wrap-preset-group {
  gap: 2px;
}

.wrap-preset-btn {
  min-height: 24px;
  padding: 0 9px;
}

.font-preset-btn {
  width: 52px;
  justify-content: center;
  padding: 0;
}

.editor-page-compact .settings-section-title {
  margin-bottom: 10px;
}

.editor-page-compact :deep(.env-lang-card) {
  padding: 8px 10px;
  border-radius: 6px;
}

.editor-page-compact :deep(.env-lang-header) {
  gap: 6px;
  min-height: 20px;
}

.editor-page-compact :deep(.env-lang-name) {
  font-size: var(--ui-font-caption);
  font-weight: 600;
}

.editor-page-compact :deep(.env-lang-version),
.editor-page-compact :deep(.env-lang-missing) {
  font-size: var(--ui-font-micro);
}
</style>
