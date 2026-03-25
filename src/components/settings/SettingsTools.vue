<template>
  <div>
    <h3 class="settings-section-title">{{ t('AI Tools') }}</h3>
    <p class="settings-hint settings-tools-intro">
      {{
        t(
          'Control which tools the AI can use in chat. Disabled tools are hidden from the AI entirely.'
        )
      }}
    </p>

    <!-- Disable all external button -->
    <UiButton
      class="external-toggle-btn"
      variant="secondary"
      size="sm"
      :class="{ 'all-disabled': allExternalDisabled }"
      @click="disableAllExternal"
    >
      <template #leading>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
        >
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      </template>
      {{ allExternalDisabled ? t('All external tools disabled') : t('Disable all external tools') }}
    </UiButton>

    <!-- Tool categories -->
    <div class="tool-categories">
      <div v-for="cat in toolCategories" :key="cat.id" class="tool-category">
        <!-- Category header -->
        <div class="tool-category-header" @click="toggleCategoryExpand(cat.id)">
          <div class="tool-category-left">
            <svg
              :class="{ rotated: expandedCategories[cat.id] }"
              width="10"
              height="10"
              viewBox="0 0 10 10"
              fill="currentColor"
            >
              <path d="M3 1l4 4-4 4z" />
            </svg>
            <span class="tool-category-name">{{ t(cat.label) }}</span>
            <span class="tool-category-count"
              >{{ categoryEnabledCount(cat) }}/{{ categoryToolCount(cat) }}</span
            >
          </div>
          <div class="tool-category-right">
            <span v-if="categoryAllLocal(cat)" class="tool-privacy-summary local">{{
              t('All local')
            }}</span>
            <span v-else-if="categoryHasExternal(cat)" class="tool-privacy-summary external">{{
              t('External')
            }}</span>
          </div>
        </div>

        <!-- Category body -->
        <div v-if="expandedCategories[cat.id]" class="tool-category-body">
          <!-- Flat tools (no subgroups) -->
          <template v-if="cat.tools">
            <div v-for="tool in cat.tools" :key="tool.name" class="tool-row">
              <UiSwitch
                :model-value="!isToolDisabled(tool.name)"
                :aria-label="t('Toggle tool {name}', { name: tool.name })"
                @update:model-value="toggleTool(tool.name)"
              />
              <span class="tool-name">{{ tool.name }}</span>
              <span class="tool-desc">{{ t(tool.description) }}</span>
              <span v-if="tool.external" class="privacy-badge">{{ t(tool.external) }}</span>
            </div>
          </template>

          <!-- Subgroups -->
          <template v-if="cat.subgroups">
            <div v-for="sg in cat.subgroups" :key="sg.label" class="tool-subgroup">
              <div class="tool-subgroup-label">{{ t(sg.label) }}</div>
              <div v-for="tool in sg.tools" :key="tool.name" class="tool-row">
                <UiSwitch
                  :model-value="!isToolDisabled(tool.name)"
                  :aria-label="t('Toggle tool {name}', { name: tool.name })"
                  @update:model-value="toggleTool(tool.name)"
                />
                <span class="tool-name">{{ tool.name }}</span>
                <span class="tool-desc">{{ t(tool.description) }}</span>
                <span v-if="tool.external" class="privacy-badge">{{ t(tool.external) }}</span>
                <span v-if="tool.name === 'run_command'" class="privacy-badge shell-warning">{{
                  t('workspace only')
                }}</span>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- Search API Keys -->
    <div class="tools-key-section">
      <h3 class="settings-section-title settings-tools-subtitle">{{ t('Search API Keys') }}</h3>
      <div class="keys-list">
        <div class="key-field">
          <label class="key-label">
            <span class="key-provider">{{ t('OpenAlex API Key') }}</span>
            <span class="key-env">OPENALEX_API_KEY</span>
          </label>
          <div class="key-input-row">
            <UiInput
              v-model="editOpenAlexKey"
              :type="openalexKeyVisible ? 'text' : 'password'"
              monospace
              placeholder="openalex-..."
              spellcheck="false"
              autocomplete="off"
            />
            <UiButton
              class="key-toggle"
              variant="secondary"
              size="icon-md"
              icon-only
              :title="openalexKeyVisible ? t('Hide') : t('Show')"
              @click="openalexKeyVisible = !openalexKeyVisible"
            >
              <svg
                v-if="!openalexKeyVisible"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
              >
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              <svg
                v-else
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
              >
                <path
                  d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"
                />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            </UiButton>
          </div>
        </div>
        <div class="key-field settings-tools-key-field">
          <label class="key-label">
            <span class="key-provider">{{ t('Exa API Key') }}</span>
            <span class="key-env">EXA_API_KEY</span>
          </label>
          <div class="key-input-row">
            <UiInput
              v-model="editSearchKey"
              :type="exaKeyVisible ? 'text' : 'password'"
              monospace
              placeholder="exa-..."
              spellcheck="false"
              autocomplete="off"
            />
            <UiButton
              class="key-toggle"
              variant="secondary"
              size="icon-md"
              icon-only
              :title="exaKeyVisible ? t('Hide') : t('Show')"
              @click="exaKeyVisible = !exaKeyVisible"
            >
              <svg
                v-if="!exaKeyVisible"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
              >
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              <svg
                v-else
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
              >
                <path
                  d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"
                />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            </UiButton>
          </div>
        </div>
      </div>
      <p class="settings-hint settings-tools-hint">
        {{ t('Academic search uses') }}
        <span class="settings-link" @click="openExternal('https://openalex.org/settings/api')"
          >OpenAlex</span
        >
        {{ t('(free key: ~1000 searches/day). Web search uses') }}
        <span class="settings-link" @click="openExternal('https://dashboard.exa.ai')">Exa</span>.
      </p>
      <div class="keys-actions">
        <UiButton :variant="toolKeySaved ? 'secondary' : 'primary'" @click="saveToolKeys">
          {{ toolKeySaved ? t('Saved') : t('Save Keys') }}
        </UiButton>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import { useWorkspaceStore } from '../../stores/workspace'
import {
  TOOL_CATEGORIES,
  EXTERNAL_TOOLS,
  getCategoryTools,
  categoryToolCount,
  categoryHasExternal,
  categoryAllLocal,
} from '../../services/ai/toolRegistry'
import { useI18n } from '../../i18n'
import UiButton from '../shared/ui/UiButton.vue'
import UiInput from '../shared/ui/UiInput.vue'
import UiSwitch from '../shared/ui/UiSwitch.vue'

const workspace = useWorkspaceStore()
const { t } = useI18n()

const toolKeySaved = ref(false)
const exaKeyVisible = ref(false)
const openalexKeyVisible = ref(false)
const editSearchKey = ref(workspace.apiKeys?.EXA_API_KEY || '')
const editOpenAlexKey = ref(workspace.apiKeys?.OPENALEX_API_KEY || '')

const toolCategories = TOOL_CATEGORIES

const expandedCategories = reactive(
  Object.fromEntries(
    TOOL_CATEGORIES.map((cat) => {
      const stored = localStorage.getItem(`tools-expanded-${cat.id}`)
      return [cat.id, stored !== null ? stored === 'true' : !cat.defaultCollapsed]
    })
  )
)

function toggleCategoryExpand(catId) {
  expandedCategories[catId] = !expandedCategories[catId]
  localStorage.setItem(`tools-expanded-${catId}`, String(expandedCategories[catId]))
}

function isToolDisabled(name) {
  return workspace.disabledTools?.includes(name)
}

function toggleTool(name) {
  workspace.toggleTool(name)
}

function categoryEnabledCount(cat) {
  const tools = getCategoryTools(cat)
  return tools.filter((t) => !isToolDisabled(t.name)).length
}

const allExternalDisabled = computed(() => {
  return EXTERNAL_TOOLS.every((name) => workspace.disabledTools?.includes(name))
})

function disableAllExternal() {
  if (allExternalDisabled.value) {
    for (const name of EXTERNAL_TOOLS) {
      const idx = workspace.disabledTools.indexOf(name)
      if (idx >= 0) workspace.disabledTools.splice(idx, 1)
    }
  } else {
    for (const name of EXTERNAL_TOOLS) {
      if (!workspace.disabledTools.includes(name)) {
        workspace.disabledTools.push(name)
      }
    }
  }
  workspace.saveToolPermissions()
}

async function openExternal(url) {
  const { open } = await import('@tauri-apps/plugin-shell')
  open(url).catch(() => {})
}

async function saveToolKeys() {
  try {
    const existing = await workspace.loadGlobalKeys()
    const merged = { ...existing }
    if (editOpenAlexKey.value) merged.OPENALEX_API_KEY = editOpenAlexKey.value
    else delete merged.OPENALEX_API_KEY
    if (editSearchKey.value) merged.EXA_API_KEY = editSearchKey.value
    else delete merged.EXA_API_KEY
    await workspace.saveGlobalKeys(merged)
    await workspace.loadSettings()
    toolKeySaved.value = true
    setTimeout(() => (toolKeySaved.value = false), 3000)
  } catch (e) {
    console.error('Failed to save tool keys:', e)
  }
}
</script>

<style scoped>
/* External toggle button */
.external-toggle-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-subtle);
  background: var(--surface-base);
  color: var(--text-secondary);
  font-size: var(--ui-font-caption);
  cursor: pointer;
  transition: all 0.15s;
  margin-bottom: 14px;
}

.external-toggle-btn:hover {
  border-color: var(--border-strong);
  color: var(--text-primary);
}

.external-toggle-btn.all-disabled {
  border-color: var(--success);
  color: var(--success);
  background: color-mix(in srgb, var(--success) 8%, transparent);
}

/* Tool categories */
.tool-categories {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.tool-category {
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.tool-category-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 10px;
  cursor: pointer;
  user-select: none;
  background: var(--surface-base);
  transition: background 0.1s;
}

.tool-category-header:hover {
  background: var(--surface-hover);
}

.tool-category-left {
  display: flex;
  align-items: center;
  gap: 6px;
}

.tool-category-left svg {
  transition: transform 0.15s;
  color: var(--text-muted);
  flex-shrink: 0;
}

.tool-category-left svg.rotated {
  transform: rotate(90deg);
}

.tool-category-name {
  font-size: var(--ui-font-label);
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
}

.tool-category-count {
  font-size: var(--ui-font-micro);
  color: var(--text-muted);
  font-family: var(--font-mono);
}

.tool-category-right {
  display: flex;
  align-items: center;
}

.tool-privacy-summary {
  font-size: var(--ui-font-fine);
  padding: 1px 6px;
  border-radius: 8px;
  font-weight: 500;
}

.tool-privacy-summary.local {
  color: var(--text-muted);
  background: var(--surface-muted);
}

.tool-privacy-summary.external {
  color: var(--warning);
  background: color-mix(in srgb, var(--warning) 12%, transparent);
}

.tool-category-body {
  border-top: 1px solid var(--border-subtle);
  padding: 4px 0;
  background: color-mix(in srgb, var(--surface-base) 80%, transparent);
}

/* Tool subgroups */
.tool-subgroup {
  padding: 0;
}

.tool-subgroup-label {
  font-size: var(--ui-font-micro);
  font-weight: var(--font-weight-medium);
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.3px;
  padding: 6px 10px 2px 36px;
}

/* Tool row */
.tool-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 10px;
  transition: background 0.1s;
}

.tool-row:hover {
  background: var(--surface-hover);
}

.tool-name {
  font-size: var(--ui-font-caption);
  font-family: var(--font-mono);
  color: var(--text-primary);
  white-space: nowrap;
  min-width: 100px;
}

.tool-desc {
  font-size: var(--ui-font-caption);
  color: var(--text-muted);
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.privacy-badge {
  font-size: var(--ui-font-fine);
  padding: 1px 5px;
  border-radius: 8px;
  color: var(--warning);
  background: color-mix(in srgb, var(--warning) 12%, transparent);
  white-space: nowrap;
  flex-shrink: 0;
  font-weight: 500;
}

.shell-warning {
  color: var(--error);
  background: color-mix(in srgb, var(--error) 12%, transparent);
}

.tools-key-section {
  border-top: 1px solid var(--border-subtle);
  margin-top: 16px;
  padding-top: 4px;
}

.settings-tools-intro {
  margin-bottom: var(--space-3);
}

.settings-tools-subtitle {
  margin-top: 20px;
}

.settings-tools-key-field {
  margin-top: 10px;
}

.settings-tools-hint {
  margin-top: var(--space-2);
}

/* Tool status */
.tool-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--ui-font-caption);
  padding: 6px 10px;
  border-radius: 5px;
}

.tool-status-active {
  background: rgba(158, 206, 106, 0.08);
  color: var(--success);
}

.tool-status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--fg-muted);
  flex-shrink: 0;
}

.tool-status-dot.active {
  background: var(--success);
}
</style>
