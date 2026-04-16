<template>
  <div class="settings-page">
    <h3 class="settings-section-title">{{ t('Skills & Tools') }}</h3>

    <section class="settings-group">
      <h4 class="settings-group-title">{{ t('Global Configuration') }}</h4>
      <div class="settings-group-body">
        <div class="settings-row">
          <div class="settings-row-copy">
            <div class="settings-row-title">{{ t('Management scope') }}</div>
          </div>
          <div class="settings-row-control">
            <UiSelect v-model="managementScope" size="sm" :options="scopeOptions" />
          </div>
        </div>

        <div class="settings-row is-stack">
          <div class="settings-row-copy">
            <div class="settings-row-title">{{ t('Tool registry') }}</div>
          </div>
          <div class="settings-row-control settings-tool-registry-list">
            <div v-for="tool in toolDefinitions" :key="tool.id" class="settings-tool-item">
              <UiSwitch
                :model-value="enabledToolIds.has(tool.id)"
                @update:model-value="toggleTool(tool.id, $event)"
              />
              <div class="settings-tool-copy" :title="t(tool.descriptionKey || tool.description)">
                <span class="settings-tool-label">{{ t(tool.labelKey || tool.label) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="settings-group">
      <div
        class="settings-skills-header-row"
        style="display: flex; align-items: center; justify-content: space-between"
      >
        <h4 class="settings-group-title" style="margin-bottom: 0; padding-top: 0">
          {{ t('Skill Library') }}
        </h4>
        <div class="settings-skills-actions">
          <UiInput
            v-model="searchQuery"
            size="sm"
            class="settings-skills-search"
            :placeholder="t('Search...')"
          />
          <UiButton variant="ghost" size="sm" @click="createModalVisible = true">
            <template #leading>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </template>
            {{ t('Create') }}
          </UiButton>
          <UiButton variant="ghost" size="sm" @click="importSkillFile">
            <template #leading>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </template>
            {{ t('File') }}
          </UiButton>
          <UiButton variant="ghost" size="sm" @click="importSkillDirectory">
            <template #leading>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path
                  d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
                />
                <line x1="12" y1="11" x2="12" y2="17" />
                <line x1="9" y1="14" x2="15" y2="14" />
              </svg>
            </template>
            {{ t('Folder') }}
          </UiButton>
          <div class="settings-skills-actions-divider"></div>
          <UiButton
            variant="ghost"
            size="sm"
            :disabled="aiStore.isRefreshingAltalsSkills"
            @click="refreshSkills"
          >
            <template #leading>
              <svg
                :class="{ 'ai-icon-spin': aiStore.isRefreshingAltalsSkills }"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
              </svg>
            </template>
            {{ t('Refresh') }}
          </UiButton>
        </div>
      </div>

      <div v-if="pageError" class="settings-inline-message settings-inline-message-error">
        {{ pageError }}
      </div>
      <div v-else-if="pageSuccess" class="settings-inline-message">{{ pageSuccess }}</div>
      <div
        v-if="aiStore.lastSkillCatalogError"
        class="settings-inline-message settings-inline-message-error"
      >
        {{ aiStore.lastSkillCatalogError }}
      </div>

      <div v-if="skillGroups.length === 0" class="settings-empty-state">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
        <p>{{ t('No filesystem skills found.') }}</p>
      </div>
      <div v-else class="settings-skills-group-list">
        <section v-for="group in skillGroups" :key="group.id" class="settings-skills-group">
          <div class="settings-skills-group__header">
            <h5 class="settings-skills-group__title">
              {{ group.label }}
              <span class="settings-skills-group__count">{{ group.skills.length }}</span>
            </h5>
          </div>

          <div class="settings-skills-grid">
            <article v-for="skill in group.skills" :key="skill.id" class="settings-skills-card">
              <div class="settings-skills-card__body">
                <h5 class="settings-skills-card__title" :title="skill.name">{{ skill.name }}</h5>
                <p class="settings-skills-card__description" :title="skill.description">
                  {{ skill.description || t('No description.') }}
                </p>
              </div>

              <div class="settings-skills-card__actions">
                <UiButton
                  variant="ghost"
                  size="sm"
                  icon-only
                  :title="t('Open skill file')"
                  @click="openSkillFile(skill)"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                </UiButton>
                <UiButton
                  variant="ghost"
                  size="sm"
                  icon-only
                  :title="t('Reveal directory')"
                  @click="revealSkillDirectory(skill)"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path
                      d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
                    />
                  </svg>
                </UiButton>
                <UiButton
                  v-if="canEditSkill(skill)"
                  variant="ghost"
                  size="sm"
                  icon-only
                  :title="t('Edit skill')"
                  @click="beginEditSkill(skill)"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </UiButton>
                <UiButton
                  v-if="canDuplicateSkill(skill)"
                  variant="ghost"
                  size="sm"
                  icon-only
                  :title="t('Duplicate')"
                  @click="duplicateSkill(skill)"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                </UiButton>
                <UiButton
                  v-if="canDeleteSkill(skill)"
                  variant="ghost"
                  size="sm"
                  icon-only
                  :title="t('Delete')"
                  @click="deleteSkill(skill)"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <polyline points="3 6 5 6 21 6" />
                    <path
                      d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                    />
                    <line x1="10" y1="11" x2="10" y2="17" />
                    <line x1="14" y1="11" x2="14" y2="17" />
                  </svg>
                </UiButton>
              </div>
            </article>
          </div>
        </section>
      </div>
    </section>

    <SkillCreateModal
      :visible="createModalVisible"
      :title="t('Create skill')"
      :submit-label="t('Create skill')"
      :scope="managementScope"
      :name="createSkillForm.name"
      :description="createSkillForm.description"
      :content="createSkillForm.content"
      @close="createModalVisible = false"
      @submit="submitCreateSkill"
      @update:scope="managementScope = $event"
      @update:name="createSkillForm.name = $event"
      @update:description="createSkillForm.description = $event"
      @update:content="createSkillForm.content = $event"
    />

    <SkillCreateModal
      :visible="editModalVisible"
      :title="t('Edit skill')"
      :submit-label="t('Save changes')"
      :scope="editSkillForm.scope"
      disable-scope
      :name="editSkillForm.name"
      :description="editSkillForm.description"
      :content="editSkillForm.content"
      @close="editModalVisible = false"
      @submit="submitEditSkill"
      @update:name="editSkillForm.name = $event"
      @update:description="editSkillForm.description = $event"
      @update:content="editSkillForm.content = $event"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ask, open } from '@tauri-apps/plugin-dialog'
import { useI18n } from '../../i18n'
import { useAiStore } from '../../stores/ai'
import { useEditorStore } from '../../stores/editor'
import { useWorkspaceStore } from '../../stores/workspace'
import { revealPathInFileManager } from '../../services/fileTreeSystem.js'
import { AI_TOOL_DEFINITIONS } from '../../services/ai/toolRegistry.js'
import {
  createManagedSkill,
  deleteManagedSkill,
  duplicateWritableSkill,
  exportSkillDirectory,
  importManagedSkill,
  isManagedSkill,
  isWritableSkill,
  resolveManagedSkillRoots,
  resolveWritableSkillRoots,
  updateManagedSkill,
  updateWritableSkill,
} from '../../services/ai/skillManagement.js'
import { loadAiConfig, saveAiConfig } from '../../services/ai/settings.js'
import SkillCreateModal from './SkillCreateModal.vue'
import UiButton from '../shared/ui/UiButton.vue'
import UiInput from '../shared/ui/UiInput.vue'
import UiSelect from '../shared/ui/UiSelect.vue'
import UiSwitch from '../shared/ui/UiSwitch.vue'

const { t } = useI18n()
const aiStore = useAiStore()
const editorStore = useEditorStore()
const workspace = useWorkspaceStore()

const altalsSkills = computed(() => aiStore.altalsSkills)
const toolDefinitions = AI_TOOL_DEFINITIONS
const managementScope = ref('workspace')
const searchQuery = ref('')
const enabledToolIds = ref(new Set())
const managedRoots = ref({ workspace: '', user: '' })
const writableRoots = ref([])
const createModalVisible = ref(false)
const editModalVisible = ref(false)
const pageError = ref('')
const pageSuccess = ref('')

const createSkillForm = reactive({
  name: '',
  description: '',
  content: '',
})

const editSkillForm = reactive({
  originalSkill: null,
  scope: 'workspace',
  name: '',
  description: '',
  content: '',
})

const scopeOptions = computed(() => [
  { value: 'workspace', label: t('Workspace scope') },
  { value: 'user', label: t('User scope') },
])

const skillGroups = computed(() => {
  const workspaceManaged = []
  const userManaged = []
  const query = String(searchQuery.value || '')
    .trim()
    .toLowerCase()

  for (const skill of altalsSkills.value) {
    const haystack = [
      skill.name,
      skill.description,
      skill.sourceRootPath,
      ...(skill.supportingFiles || []),
    ]
      .join(' ')
      .toLowerCase()

    if (query && !haystack.includes(query)) {
      continue
    }

    if (canDeleteSkill(skill)) {
      if (skill.scope === 'user') userManaged.push(skill)
      else workspaceManaged.push(skill)
      continue
    }
  }

  return [
    { id: 'workspace-managed', label: t('Workspace managed skills'), skills: workspaceManaged },
    { id: 'user-managed', label: t('User managed skills'), skills: userManaged },
  ].filter((group) => group.skills.length > 0)
})

function resetMessages() {
  pageError.value = ''
  pageSuccess.value = ''
}

async function loadPageState() {
  const [config, roots, nextWritableRoots] = await Promise.all([
    loadAiConfig(),
    resolveManagedSkillRoots({
      workspacePath: workspace.path || '',
      globalConfigDir: workspace.globalConfigDir || '',
    }),
    resolveWritableSkillRoots({
      workspacePath: workspace.path || '',
      globalConfigDir: workspace.globalConfigDir || '',
    }),
  ])
  enabledToolIds.value = new Set(config.enabledTools || [])
  managedRoots.value = roots
  writableRoots.value = nextWritableRoots
}

async function refreshSkills() {
  resetMessages()
  await aiStore.refreshAltalsSkills()
  const [nextManagedRoots, nextWritableRoots] = await Promise.all([
    resolveManagedSkillRoots({
      workspacePath: workspace.path || '',
      globalConfigDir: workspace.globalConfigDir || '',
    }),
    resolveWritableSkillRoots({
      workspacePath: workspace.path || '',
      globalConfigDir: workspace.globalConfigDir || '',
    }),
  ])
  managedRoots.value = nextManagedRoots
  writableRoots.value = nextWritableRoots
}

async function persistToolState() {
  const config = await loadAiConfig()
  await saveAiConfig({
    ...config,
    enabledTools: [...enabledToolIds.value],
  })
  await aiStore.refreshProviderState()
}

async function toggleTool(toolId = '', nextValue = false) {
  resetMessages()
  const next = new Set(enabledToolIds.value)
  if (nextValue) next.add(toolId)
  else next.delete(toolId)
  enabledToolIds.value = next

  try {
    await persistToolState()
    pageSuccess.value = t('Tool registry updated.')
  } catch (error) {
    pageError.value = error instanceof Error ? error.message : t('Failed to update tool registry.')
  }
}

async function submitCreateSkill() {
  resetMessages()
  try {
    await createManagedSkill({
      workspacePath: workspace.path || '',
      globalConfigDir: workspace.globalConfigDir || '',
      scope: managementScope.value,
      name: createSkillForm.name,
      description: createSkillForm.description,
      body: createSkillForm.content,
    })
    createModalVisible.value = false
    createSkillForm.name = ''
    createSkillForm.description = ''
    createSkillForm.content = ''
    pageSuccess.value = t('Skill created.')
    await refreshSkills()
  } catch (error) {
    pageError.value = error instanceof Error ? error.message : t('Failed to create skill.')
  }
}

async function importSkillByMode(directory = false) {
  resetMessages()
  const selected = await open({
    multiple: false,
    directory,
    title: directory ? t('Import skill folder') : t('Import SKILL.md'),
    filters: directory ? undefined : [{ name: 'Markdown', extensions: ['md'] }],
  })

  if (!selected || Array.isArray(selected)) return

  try {
    await importManagedSkill({
      workspacePath: workspace.path || '',
      globalConfigDir: workspace.globalConfigDir || '',
      scope: managementScope.value,
      sourcePath: String(selected),
    })
    pageSuccess.value = t('Skill imported.')
    await refreshSkills()
  } catch (error) {
    pageError.value = error instanceof Error ? error.message : t('Failed to import skill.')
  }
}

async function importSkillFile() {
  await importSkillByMode(false)
}

async function importSkillDirectory() {
  await importSkillByMode(true)
}

function canDeleteSkill(skill = {}) {
  return isManagedSkill(skill, managedRoots.value)
}

function canEditSkill(skill = {}) {
  return isWritableSkill(skill, writableRoots.value)
}

function canDuplicateSkill(skill = {}) {
  return isWritableSkill(skill, writableRoots.value)
}

function beginEditSkill(skill = {}) {
  resetMessages()
  editSkillForm.originalSkill = skill
  editSkillForm.scope = skill.scope || 'workspace'
  editSkillForm.name = skill.name || ''
  editSkillForm.description = skill.frontmatter?.description || ''
  editSkillForm.content = skill.body || ''
  editModalVisible.value = true
}

async function deleteSkill(skill = {}) {
  resetMessages()
  const confirmed = await ask(t('Delete this managed skill?'), {
    title: t('Delete'),
    kind: 'warning',
  })
  if (!confirmed) return

  try {
    await deleteManagedSkill({
      workspacePath: workspace.path || '',
      globalConfigDir: workspace.globalConfigDir || '',
      skill,
    })
    pageSuccess.value = t('Skill deleted.')
    await refreshSkills()
  } catch (error) {
    pageError.value = error instanceof Error ? error.message : t('Failed to delete skill.')
  }
}

async function submitEditSkill() {
  resetMessages()
  try {
    const updater = canDeleteSkill(editSkillForm.originalSkill)
      ? updateManagedSkill
      : updateWritableSkill

    await updater({
      workspacePath: workspace.path || '',
      globalConfigDir: workspace.globalConfigDir || '',
      skill: editSkillForm.originalSkill,
      nextName: editSkillForm.name,
      nextDescription: editSkillForm.description,
      nextBody: editSkillForm.content,
    })
    editModalVisible.value = false
    editSkillForm.originalSkill = null
    editSkillForm.name = ''
    editSkillForm.description = ''
    editSkillForm.content = ''
    pageSuccess.value = t('Skill updated.')
    await refreshSkills()
  } catch (error) {
    pageError.value = error instanceof Error ? error.message : t('Failed to update skill.')
  }
}

async function duplicateSkill(skill = {}) {
  resetMessages()
  try {
    await duplicateWritableSkill({
      workspacePath: workspace.path || '',
      globalConfigDir: workspace.globalConfigDir || '',
      skill,
    })
    pageSuccess.value = t('Skill duplicated.')
    await refreshSkills()
  } catch (error) {
    pageError.value = error instanceof Error ? error.message : t('Failed to duplicate skill.')
  }
}

async function exportSkill(skill = {}) {
  resetMessages()
  const selected = await open({
    multiple: false,
    directory: true,
    title: t('Export skill'),
  })
  if (!selected || Array.isArray(selected)) return

  try {
    await exportSkillDirectory({
      skill,
      destinationDirectory: String(selected),
    })
    pageSuccess.value = t('Skill exported.')
  } catch (error) {
    pageError.value = error instanceof Error ? error.message : t('Failed to export skill.')
  }
}

async function openSkillFile(skill = {}) {
  if (!skill?.skillFilePath) return
  workspace.closeSettings()
  editorStore.openFile(skill.skillFilePath)
}

async function revealSkillDirectory(skill = {}) {
  if (!skill?.directoryPath) return
  await revealPathInFileManager({ path: skill.directoryPath })
}

onMounted(async () => {
  await loadPageState()
  await aiStore.refreshAltalsSkills()
})
</script>

<style scoped>
.settings-row.is-stack {
  flex-direction: column;
  align-items: stretch;
  gap: 16px;
}

/* Tool Registry specific */
.settings-tool-registry-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px 24px;
  width: 100%;
}
.settings-tool-item {
  display: flex;
  align-items: center;
  gap: 12px;
}
.settings-tool-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}
.settings-tool-label {
  font-size: 13px;
  color: var(--text-primary);
}
.settings-tool-key {
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 11px;
  color: var(--text-tertiary);
}
.settings-tool-hint {
  font-size: 11px;
  line-height: 1.4;
  color: var(--text-secondary);
}

/* Skills Library specific */
.settings-skills-header-row {
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 4px;
}

.settings-skills-actions {
  display: flex;
  align-items: center;
  gap: 16px;
}

.settings-skills-search {
  width: 180px;
  margin-right: 4px;
}

.settings-skills-actions-divider {
  width: 1px;
  height: 14px;
  background: var(--border-color);
  opacity: 0.3;
}

.settings-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  gap: 12px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--surface-base) 60%, transparent);
  border: 1px dashed color-mix(in srgb, var(--border-color) 50%, transparent);
  color: var(--text-muted);
  font-size: 13px;
}

.settings-skills-group-list {
  display: flex;
  flex-direction: column;
  gap: 28px;
}

.settings-skills-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.settings-skills-group__header {
  display: flex;
  align-items: center;
  padding: 0 4px;
}

.settings-skills-group__title {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 8px;
}

.settings-skills-group__count {
  padding: 2px 8px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--text-muted) 15%, transparent);
  color: var(--text-primary);
  font-size: 10px;
  font-weight: 600;
}

.settings-skills-grid {
  display: flex;
  flex-direction: column;
  gap: 0;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--border-color) 40%, transparent);
  background: var(--surface-base);
  overflow: hidden;
}

.settings-skills-card {
  position: relative;
  display: flex;
  flex-direction: row;
  align-items: center;
  border: none;
  border-bottom: 1px solid color-mix(in srgb, var(--border-color) 30%, transparent);
  border-radius: 0;
  background: transparent;
  transition: background-color 0.1s ease;
  padding: 8px 12px;
  gap: 16px;
}
.settings-skills-card:last-child {
  border-bottom: none;
}
.settings-skills-card:hover {
  background: color-mix(in srgb, var(--panel-muted) 30%, transparent);
  border-color: color-mix(in srgb, var(--border-color) 30%, transparent);
}

.settings-skills-card__body {
  padding: 0;
  flex: 1;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 16px;
  min-width: 0;
}

.settings-skills-card__title {
  margin: 0;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 0 0 200px;
}

.settings-skills-card__description {
  margin: 0;
  font-size: 12px;
  color: color-mix(in srgb, var(--text-secondary) 80%, transparent);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}

.settings-skills-card__actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.1s ease;
}
.settings-skills-card:hover .settings-skills-card__actions {
  opacity: 1;
}
.settings-skills-card__actions .ui-button {
  color: var(--text-secondary);
  height: 24px;
  width: 24px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
}
.settings-skills-card__actions .ui-button:hover {
  color: var(--text-primary);
  background: color-mix(in srgb, var(--text-primary) 10%, transparent);
}

.ai-icon-spin {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  100% {
    transform: rotate(360deg);
  }
}

.settings-inline-message {
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 13px;
  background: color-mix(in srgb, var(--success) 10%, transparent);
  color: var(--success);
  border: 1px solid color-mix(in srgb, var(--success) 20%, transparent);
}
.settings-inline-message-error {
  background: color-mix(in srgb, var(--error) 10%, transparent);
  color: var(--error);
  border-color: color-mix(in srgb, var(--error) 20%, transparent);
}

@media (max-width: 640px) {
  .settings-skills-header-row {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
