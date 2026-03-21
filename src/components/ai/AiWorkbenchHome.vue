<template>
  <div
    class="ai-workbench-home h-full min-h-0 w-full flex flex-col"
    :class="homeClasses"
  >
    <div class="ai-workbench-home-scroll flex-1 min-h-0 overflow-y-auto">
      <div class="ai-workbench-home-shell">
        <section class="ai-workbench-hero-panel">
          <div class="ai-workbench-hero-kicker">{{ t('AI workflow workspace') }}</div>
          <h1 class="ai-workbench-hero-title">{{ t('Start a workflow, not just a chat') }}</h1>
          <p class="ai-workbench-hero-description">
            {{ t('Launch project-aware workflows from the current file or workspace, or fall back to General chat for open-ended help.') }}
          </p>
          <div class="ai-workbench-hero-meta">
            <span class="ai-workbench-meta-pill">{{ workspaceName }}</span>
            <span v-if="contextName" class="ai-workbench-meta-pill ai-workbench-meta-pill-context">{{ contextName }}</span>
          </div>
        </section>

        <section class="ai-workbench-collaboration-stage">
          <div class="ai-workbench-collaboration-main">
            <div class="ai-workbench-section-header">
              <div class="ai-workbench-section-title">{{ t('Workflow starts from current project') }}</div>
            </div>
            <div class="ai-workbench-collaboration-title">
              {{ t('Choose a workflow run, then continue in the session below.') }}
            </div>
            <div class="ai-workbench-collaboration-copy">
              {{ t('Review, search, or diagnose from the current file and project context.') }}
            </div>

            <div v-if="primaryStarterTasks.length" class="ai-workbench-starter-grid">
              <button
                v-for="item in primaryStarterTasks"
                :key="item.task.taskId || item.label"
                class="ai-workbench-starter-card"
                @click="runTask(item)"
              >
                <div class="ai-workbench-starter-label">{{ item.label }}</div>
                <div v-if="item.description || item.task?.description" class="ai-workbench-starter-description">
                  {{ item.description || item.task?.description }}
                </div>
                <div v-if="item.meta || item.task?.meta" class="ai-workbench-starter-meta">{{ item.meta || item.task?.meta }}</div>
              </button>
            </div>
          </div>

          <aside class="ai-workbench-collaboration-side">
            <div class="ai-workbench-context-card">
              <div class="ai-workbench-section-title">{{ t('Current context') }}</div>
              <div class="ai-workbench-context-title">{{ contextName || workspaceName }}</div>
              <div class="ai-workbench-context-copy">
                {{ contextName ? workspaceName : t('Project workspace') }}
              </div>
            </div>

            <div v-if="secondaryStarterTasks.length" class="ai-workbench-side-section">
              <div class="ai-workbench-section-title">{{ t('More workflow starts') }}</div>
              <div class="ai-workbench-side-list">
                <button
                  v-for="item in secondaryStarterTasks"
                  :key="item.task.taskId || item.label"
                  class="ai-workbench-side-item"
                  @click="runTask(item)"
                >
                  <span class="ai-workbench-side-item-label">{{ item.label }}</span>
                  <span v-if="item.description || item.task?.description" class="ai-workbench-side-item-description">
                    {{ item.description || item.task?.description }}
                  </span>
                  <span v-if="item.meta || item.task?.meta" class="ai-workbench-side-item-meta">{{ item.meta || item.task?.meta }}</span>
                </button>
              </div>
            </div>
          </aside>
        </section>

        <section v-if="workflowSections.length" class="ai-workbench-section ai-workbench-section-workflows">
          <div class="ai-workbench-section-header">
            <div class="ai-workbench-section-title">{{ t('Supporting workflows') }}</div>
          </div>
          <div class="ai-workbench-workflow-grid">
            <div
              v-for="section in workflowSections"
              :key="section.id"
              class="ai-workbench-workflow-card"
            >
              <div class="ai-workbench-workflow-title">{{ section.title }}</div>
              <div class="ai-workbench-workflow-list">
                <button
                  v-for="item in section.items"
                  :key="item.task.taskId || item.label"
                  class="ai-workbench-workflow-item"
                  @click="runTask(item)"
                >
                  <span class="ai-workbench-workflow-item-label">{{ item.label }}</span>
                  <span v-if="item.meta || item.task?.meta" class="ai-workbench-workflow-item-meta">{{ item.meta || item.task?.meta }}</span>
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>

    <div class="ai-workbench-home-input-shell">
      <ChatInput
        ref="chatInputRef"
        :isStreaming="false"
        :modelId="selectedModelId"
        :estimatedTokens="null"
        :compact="compact"
        :toolItems="chatInputToolItems"
        @send="sendChat"
        @update-model="selectModel"
        @launch-task="handleLaunchTask"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useWorkspaceStore } from '../../stores/workspace'
import { useEditorStore } from '../../stores/editor'
import { useChatStore } from '../../stores/chat'
import { useI18n } from '../../i18n'
import { getAiLauncherItems, getChatInputToolItems, getQuickAiItems } from '../../services/ai/taskCatalog'
import { launchAiTask, launchWorkflowTask, startAiConversation } from '../../services/ai/launch'
import ChatInput from '../chat/ChatInput.vue'

const props = defineProps({
  compact: { type: Boolean, default: false },
  paneWidth: { type: Number, default: 0 },
})

const workspace = useWorkspaceStore()
const editorStore = useEditorStore()
const chatStore = useChatStore()
const { t } = useI18n()

const chatInputRef = ref(null)
const selectedModelId = ref(workspace.selectedModelId || null)

const currentContextPath = computed(() => editorStore.preferredContextPath || '')
const recentFiles = computed(() => editorStore.recentFiles || [])

const contextName = computed(() => {
  const path = currentContextPath.value
  return path ? (String(path).split('/').pop() || '') : ''
})

const workspaceName = computed(() => {
  const path = workspace.path || ''
  return path ? (String(path).split('/').pop() || path) : t('Current workspace')
})

const isCompactCards = computed(() => props.paneWidth > 0 && props.paneWidth < 760)
const homeClasses = computed(() => ({
  'is-compact-cards': isCompactCards.value,
}))

const launcherItems = computed(() => (
  getAiLauncherItems({
    currentPath: currentContextPath.value,
    recentFiles: recentFiles.value,
    t,
  })
))

const quickItems = computed(() => (
  getQuickAiItems({
    currentPath: currentContextPath.value,
    recentFiles: recentFiles.value,
    t,
  })
))

const chatInputToolItems = computed(() => (
  getChatInputToolItems({
    currentPath: currentContextPath.value,
    t,
  })
))

function uniqueByTask(items = []) {
  const seen = new Set()
  return items.filter((item) => {
    const key = item?.task?.taskId || item?.label
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const starterTasks = computed(() => {
  const preferredTaskIds = [
    'review.current-draft',
    'research.paper-search',
    'citation.current-draft',
    'citation.prefill',
    'code.prefill',
    'chat.general',
    'writer.continue',
    'code.explain-current',
    'pdf.summarise',
  ]

  const combined = uniqueByTask([...quickItems.value, ...launcherItems.value])
  const ordered = []

  for (const taskId of preferredTaskIds) {
    const found = combined.find((item) => item?.task?.taskId === taskId)
    if (found) ordered.push(found)
  }

  for (const item of combined) {
    if (ordered.length >= 6) break
    if (ordered.some((entry) => (entry.task?.taskId || entry.label) === (item.task?.taskId || item.label))) continue
    ordered.push(item)
  }

  return ordered.slice(0, 6)
})

const primaryStarterTasks = computed(() => starterTasks.value.slice(0, 4))
const secondaryStarterTasks = computed(() => starterTasks.value.slice(4, 6))

function classifyWorkflow(item) {
  const taskId = String(item?.task?.taskId || '')
  if (taskId.startsWith('writer.') || taskId.startsWith('review.')) return 'writing'
  if (taskId.startsWith('research.')) return 'research'
  if (taskId.startsWith('citation.')) return 'references'
  if (taskId.startsWith('code.') || taskId.startsWith('workspace.') || taskId.startsWith('compile.')) return 'code'
  return 'general'
}

const workflowSections = computed(() => {
  const buckets = [
    { id: 'writing', title: t('Writing'), items: [] },
    { id: 'research', title: t('Research'), items: [] },
    { id: 'references', title: t('References'), items: [] },
    { id: 'code', title: t('Code'), items: [] },
  ]

  const starterKeys = new Set(starterTasks.value.map((item) => item?.task?.taskId || item?.label))
  for (const item of uniqueByTask(launcherItems.value)) {
    const taskKey = item?.task?.taskId || item?.label
    if (!taskKey || starterKeys.has(taskKey)) continue
    if (item.groupHeader === t('Current context')) continue
    const bucket = buckets.find((entry) => entry.id === classifyWorkflow(item))
    if (!bucket || bucket.items.length >= 4) continue
    bucket.items.push(item)
  }

  return buckets.filter((bucket) => bucket.items.length > 0)
})

async function runTask(item) {
  if (!item?.task) return
  const task = {
    ...item.task,
    label: item.label || item.task.label,
  }
  if (task.action === 'workflow') {
    await launchWorkflowTask({
      editorStore,
      chatStore,
      surface: 'workbench',
      modelId: selectedModelId.value,
      task,
    })
    return
  }
  await launchAiTask({
    editorStore,
    chatStore,
    surface: 'workbench',
    modelId: selectedModelId.value,
    task,
  })
}

async function handleLaunchTask(item) {
  if (!item?.task) return
  await runTask(item)
}

async function sendChat({ text, fileRefs, context }) {
  if (!text && !fileRefs?.length) return
  await startAiConversation({
    editorStore,
    chatStore,
    surface: 'workbench',
    modelId: selectedModelId.value,
    text,
    fileRefs,
    context,
  })
}

function selectModel(modelId) {
  selectedModelId.value = modelId
  workspace.setSelectedModelId(modelId)
}

function focus() {
  chatInputRef.value?.focus?.()
}

defineExpose({ focus })
</script>

<style scoped>
.ai-workbench-home {
  flex: 1 1 auto;
  align-self: stretch;
  width: 100%;
  min-width: 0;
  --ai-workbench-kicker-size: var(--surface-font-kicker);
  --ai-workbench-meta-size: var(--surface-font-meta);
  --ai-workbench-body-size: var(--surface-font-body);
  --ai-workbench-title-size: var(--surface-font-title);
  --ai-workbench-card-title-size: var(--surface-font-card);
  --ai-workbench-context-title-size: var(--surface-font-card);
  --ai-workbench-hero-size: var(--surface-font-hero);
  --ai-workbench-hero-size-compact: var(--surface-font-hero-compact);
}

.ai-workbench-home-scroll {
  width: 100%;
  overflow-x: hidden;
}

.ai-workbench-home-shell {
  display: flex;
  flex-direction: column;
  gap: 22px;
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 26px 22px 28px;
  box-sizing: border-box;
}

.ai-workbench-hero-panel {
  padding: 2px 0 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.ai-workbench-hero-kicker {
  font-size: var(--ai-workbench-kicker-size);
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fg-muted);
}

.ai-workbench-hero-title {
  margin: 8px 0 0;
  font-size: var(--ai-workbench-hero-size);
  line-height: 1.15;
  font-weight: 600;
  color: var(--fg-primary);
}

.ai-workbench-hero-description {
  margin: 10px 0 0;
  max-width: 62ch;
  font-size: var(--ai-workbench-body-size);
  line-height: 1.6;
  color: var(--fg-secondary);
}

.ai-workbench-hero-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
  width: 100%;
  min-width: 0;
}

.ai-workbench-meta-pill {
  display: inline-flex;
  align-items: flex-start;
  width: fit-content;
  max-width: 100%;
  min-height: 24px;
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: 999px;
  font-size: var(--ai-workbench-body-size);
  line-height: 1.35;
  color: var(--fg-secondary);
  background: color-mix(in srgb, var(--bg-secondary) 82%, transparent);
  box-sizing: border-box;
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.ai-workbench-meta-pill-context {
  color: var(--fg-muted);
}

.ai-workbench-context-card {
  min-width: 0;
  padding: 14px 16px;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: color-mix(in srgb, var(--bg-secondary) 84%, transparent);
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
}

.ai-workbench-context-title {
  font-size: var(--ai-workbench-context-title-size);
  line-height: 1.35;
  font-weight: 600;
  color: var(--fg-primary);
  word-break: break-word;
}

.ai-workbench-context-copy {
  font-size: var(--ai-workbench-meta-size);
  line-height: 1.55;
  color: var(--fg-muted);
}

.ai-workbench-collaboration-stage {
  display: grid;
  grid-template-columns: minmax(0, 1.55fr) minmax(240px, 0.75fr);
  gap: 14px;
  align-items: stretch;
}

.ai-workbench-collaboration-main,
.ai-workbench-collaboration-side {
  min-width: 0;
}

.ai-workbench-collaboration-main {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
  border: 1px solid color-mix(in srgb, var(--accent) 20%, var(--border));
  border-radius: 16px;
  background: color-mix(in srgb, var(--accent) 5%, var(--bg-secondary));
}

.ai-workbench-collaboration-title {
  font-size: var(--ai-workbench-context-title-size);
  line-height: 1.22;
  font-weight: 600;
  color: var(--fg-primary);
}

.ai-workbench-collaboration-copy {
  max-width: 54ch;
  font-size: var(--ai-workbench-body-size);
  line-height: 1.55;
  color: var(--fg-secondary);
}

.ai-workbench-collaboration-side {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ai-workbench-side-section,
.ai-workbench-workflow-card {
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: color-mix(in srgb, var(--bg-primary) 92%, var(--bg-secondary));
}

.ai-workbench-side-list,
.ai-workbench-workflow-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 10px;
}

.ai-workbench-side-item,
.ai-workbench-workflow-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
  width: 100%;
  padding: 7px 0;
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
  border-radius: 8px;
  transition: background-color 0.12s ease, color 0.12s ease;
}

.ai-workbench-side-item:hover,
.ai-workbench-workflow-item:hover {
  background: color-mix(in srgb, var(--bg-primary) 76%, var(--bg-hover));
}

.ai-workbench-section + .ai-workbench-section {
  margin-top: 0;
}

.ai-workbench-section-header {
  margin-bottom: 10px;
}

.ai-workbench-section-title {
  font-size: var(--ai-workbench-kicker-size);
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fg-muted);
}

.ai-workbench-starter-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 10px;
}

.ai-workbench-starter-card {
  min-height: 88px;
  padding: 14px 14px 12px;
  border: 1px solid color-mix(in srgb, var(--accent) 18%, var(--border));
  border-radius: 14px;
  background: color-mix(in srgb, var(--bg-primary) 88%, var(--bg-secondary));
  text-align: left;
  cursor: pointer;
  transition: transform 0.14s ease, border-color 0.14s ease, background-color 0.14s ease;
}

.ai-workbench-starter-card:hover {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--accent) 42%, var(--border));
  background: color-mix(in srgb, var(--accent) 5%, var(--bg-secondary));
}

.ai-workbench-side-item-label,
.ai-workbench-starter-label {
  min-width: 0;
  font-size: var(--ai-workbench-card-title-size);
  font-weight: 600;
  color: var(--fg-primary);
  line-height: 1.35;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.ai-workbench-side-item-meta,
.ai-workbench-starter-meta {
  min-width: 0;
  margin-top: 8px;
  font-size: var(--ai-workbench-meta-size);
  line-height: 1.45;
  color: var(--fg-muted);
  overflow-wrap: anywhere;
  word-break: break-word;
}

.ai-workbench-side-item-description,
.ai-workbench-starter-description {
  min-width: 0;
  margin-top: 4px;
  font-size: var(--ai-workbench-meta-size);
  line-height: 1.45;
  color: var(--fg-secondary);
  overflow-wrap: anywhere;
  word-break: break-word;
}

.ai-workbench-workflow-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 10px;
}

.ai-workbench-section-starters {
  min-width: 0;
}

.ai-workbench-section-workflows {
  min-width: 0;
}

.ai-workbench-workflow-title {
  font-size: var(--ai-workbench-kicker-size);
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fg-muted);
}

.ai-workbench-workflow-item-label {
  min-width: 0;
  font-size: var(--ai-workbench-body-size);
  color: var(--fg-primary);
  line-height: 1.35;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.ai-workbench-workflow-item-meta {
  min-width: 0;
  font-size: var(--ai-workbench-meta-size);
  color: var(--fg-muted);
  overflow-wrap: anywhere;
  word-break: break-word;
}

.ai-workbench-home-input-shell {
  width: 100%;
  border-top: 1px solid var(--border);
  padding: 10px 14px 12px;
  background: color-mix(in srgb, var(--bg-secondary) 84%, transparent);
}

@container (max-width: 980px) {
  .ai-workbench-home-shell {
    padding: 20px 14px 24px;
  }

  .ai-workbench-hero-title {
    font-size: var(--ai-workbench-hero-size-compact);
  }

  .ai-workbench-collaboration-stage {
    grid-template-columns: 1fr;
  }
}

@container (max-width: 760px) {
  .ai-workbench-starter-grid,
  .ai-workbench-workflow-grid {
    grid-template-columns: 1fr;
  }

  .ai-workbench-home-input-shell {
    padding-left: 10px;
    padding-right: 10px;
  }
}

.ai-workbench-home.is-compact-cards .ai-workbench-starter-grid,
.ai-workbench-home.is-compact-cards .ai-workbench-collaboration-stage,
.ai-workbench-home.is-compact-cards .ai-workbench-workflow-grid {
  grid-template-columns: 1fr;
}
</style>
