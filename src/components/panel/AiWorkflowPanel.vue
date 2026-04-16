<template>
  <section class="ai-workflow-panel">
    <AiModeSwitcher
      :current-mode="currentMode"
      :disabled="aiStore.isRunning"
      @change="switchMode"
    />

    <AiSessionRail
      :sessions="sessionItems"
      :current-session-id="aiStore.currentSessionId"
      @create="createSession"
      @switch="switchSessionTab"
      @rename="renameSession"
      @delete="deleteSession"
    />

    <div
      ref="threadRef"
      class="ai-workflow-panel__thread scrollbar-hidden"
      data-surface-context-guard="true"
      @contextmenu="openThreadContextMenu"
    >
      <div class="ai-workflow-panel__messages">
        <div
          v-if="messages.length === 0"
          class="ai-workflow-panel__empty"
        >
          <div class="ai-workflow-panel__empty-title">
            {{ t('What do you want to build?') }}
          </div>
          <div class="ai-workflow-panel__empty-note">
            {{ t('Operate on the current workspace or type / for commands.') }}
          </div>
        </div>

        <AiConversationMessage
          v-for="(message, index) in messages"
          :key="message.id"
          :message="message"
          :artifacts-by-id="artifactsById"
          :enabled-tool-ids="aiStore.enabledToolIds"
          :animate-latest="message.role === 'assistant' && index === messages.length - 1"
          @apply-artifact="aiStore.applyArtifact($event)"
        />
      </div>
      <div ref="threadBottomRef"></div>
    </div>

    <footer class="ai-workflow-panel__composer">
      <div class="ai-workflow-panel__composer-card">
        <AiPlanModeBanner v-if="isAgentMode" :plan-mode="planModeState" />
        <AiResumeBanner v-if="isAgentMode" :resume-state="resumeState" />
        <AiCompactingBanner v-if="isAgentMode" :compaction="compactionState" />
        <AiAskUserBanner
          v-if="isAgentMode"
          :request="activeAskUserRequest"
          :submitting="respondingAskUserRequestId === activeAskUserRequest?.requestId"
          @submit="submitAskUserResponse"
        />
        <AiExitPlanBanner
          v-if="isAgentMode"
          :request="activeExitPlanRequest"
          :submitting="respondingExitPlanRequestId === activeExitPlanRequest?.requestId"
          @submit="submitExitPlanResponse"
        />
        <AiActiveTasksBar v-if="isAgentMode" :tasks="activeBackgroundTasks" />

        <div
          v-if="isAgentMode && activePermissionRequest"
          class="ai-workflow-panel__approval"
        >
          <div class="ai-workflow-panel__approval-copy">
            <div class="ai-workflow-panel__approval-title">
              {{ activePermissionRequest.title || t('Permission request') }}
            </div>
            <div
              v-if="activePermissionRequest.description || activePermissionRequest.decisionReason"
              class="ai-workflow-panel__approval-meta"
            >
              {{ activePermissionRequest.description || activePermissionRequest.decisionReason }}
            </div>
            <div
              v-if="activePermissionRequest.inputPreview"
              class="ai-workflow-panel__approval-preview"
            >
              {{ activePermissionRequest.inputPreview }}
            </div>
          </div>

          <div class="ai-workflow-panel__approval-actions">
            <UiButton
              variant="secondary"
              size="sm"
              :disabled="respondingPermissionRequestId === activePermissionRequest.requestId"
              @click="denyPermissionRequest(activePermissionRequest)"
            >
              {{ t('Deny') }}
            </UiButton>
            <UiButton
              variant="secondary"
              size="sm"
              :disabled="respondingPermissionRequestId === activePermissionRequest.requestId"
              @click="allowPermissionRequest(activePermissionRequest)"
            >
              {{ t('Allow once') }}
            </UiButton>
            <UiButton
              variant="primary"
              size="sm"
              :disabled="respondingPermissionRequestId === activePermissionRequest.requestId"
              @click="alwaysAllowPermissionRequest(activePermissionRequest)"
            >
              {{ t('Always allow') }}
            </UiButton>
          </div>
        </div>

        <AiAttachmentList
          :attachments="attachments"
          @remove="removeAttachment"
        />

        <div class="ai-workflow-panel__composer-input">
          <UiTextarea
            ref="composerTextareaRef"
            :model-value="aiStore.promptDraft"
            variant="ghost"
            :rows="4"
            class="ai-workflow-panel__textarea"
            shell-class="ai-workflow-panel__textarea-shell"
            :placeholder="t('Ask anything about this project.')"
            @keydown="handlePromptKeydown"
            @update:model-value="aiStore.setPromptDraft($event)"
          />

          <AiInvocationDropdown
            :visible="composerSuggestions.length > 0"
            :suggestions="composerSuggestions"
            :active-index="activeInvocationIndex"
            @select="applyInvocationSuggestion"
          />
        </div>

        <div class="ai-workflow-panel__composer-actions">
          <UiButton
            variant="secondary"
            size="sm"
            icon-only
            @click="attachFiles"
            :title="t('Attach files')"
          >
            <IconPaperclip :size="16" :stroke-width="1.5" />
          </UiButton>

          <UiSelect
            :model-value="aiStore.providerState.currentProviderId"
            size="sm"
            class="ai-workflow-panel__provider-select"
            shell-class="ai-workflow-panel__provider-shell"
            :options="providerOptions"
            @update:model-value="switchProvider"
          />

          <div class="ai-workflow-panel__runtime-label">
            {{ runtimeStateLabel }}
          </div>

          <div style="flex: 1"></div>

          <UiButton
            v-if="messages.length > 0"
            variant="secondary"
            size="sm"
            icon-only
            @click="aiStore.clearSession()"
            :title="t('Clear session')"
          >
            <IconTrash :size="16" :stroke-width="1.5" />
          </UiButton>

          <UiButton
            variant="primary"
            size="sm"
            icon-only
            :disabled="aiStore.isRunning || !canSend"
            @click="runSkill"
            :title="aiStore.isRunning ? t('Running...') : t('Submit')"
          >
            <IconPlayerStop v-if="aiStore.isRunning" :size="16" :stroke-width="1.5" />
            <IconArrowUp v-else :size="16" :stroke-width="1.5" />
          </UiButton>
        </div>
      </div>

      <div v-if="aiStore.lastError" class="ai-workflow-panel__error">
        {{ aiStore.lastError }}
      </div>
    </footer>

    <SurfaceContextMenu
      :visible="menuVisible"
      :x="menuX"
      :y="menuY"
      :groups="menuGroups"
      @close="closeSurfaceContextMenu"
      @select="handleSurfaceContextMenuSelect"
    />
  </section>
</template>

<script setup>
import { computed, nextTick, onActivated, onMounted, ref, watch } from 'vue'
import { useI18n } from '../../i18n'
import { useAiStore } from '../../stores/ai'
import { useAiModesStore } from '../../stores/aiModes'
import { useFilesStore } from '../../stores/files'
import { useToastStore } from '../../stores/toast'
import { useWorkspaceStore } from '../../stores/workspace'
import {
  applyAiComposerSuggestion,
  detectAiComposerToken,
  getAiComposerSuggestions,
} from '../../domains/ai/aiMentionRuntime.js'
import { AI_PROVIDER_DEFINITIONS } from '../../services/ai/settings.js'
import { pickAiAttachmentPaths } from '../../services/ai/attachmentStore.js'
import { resolveEnabledAiTools } from '../../services/ai/toolRegistry.js'
import { IconPaperclip, IconArrowUp, IconPlayerStop, IconTrash } from '@tabler/icons-vue'
import { useSurfaceContextMenu } from '../../composables/useSurfaceContextMenu'
import UiButton from '../shared/ui/UiButton.vue'
import UiSelect from '../shared/ui/UiSelect.vue'
import UiTextarea from '../shared/ui/UiTextarea.vue'
import AiActiveTasksBar from './AiActiveTasksBar.vue'
import AiAskUserBanner from './AiAskUserBanner.vue'
import AiAttachmentList from './AiAttachmentList.vue'
import AiCompactingBanner from './AiCompactingBanner.vue'
import AiConversationMessage from './AiConversationMessage.vue'
import AiExitPlanBanner from './AiExitPlanBanner.vue'
import AiInvocationDropdown from './AiInvocationDropdown.vue'
import AiModeSwitcher from './AiModeSwitcher.vue'
import AiPlanModeBanner from './AiPlanModeBanner.vue'
import AiResumeBanner from './AiResumeBanner.vue'
import AiSessionRail from './AiSessionRail.vue'
import SurfaceContextMenu from '../shared/SurfaceContextMenu.vue'

const { t } = useI18n()
const aiStore = useAiStore()
const aiModesStore = useAiModesStore()
const filesStore = useFilesStore()
const toastStore = useToastStore()
const workspace = useWorkspaceStore()
const {
  menuVisible,
  menuX,
  menuY,
  menuGroups,
  closeSurfaceContextMenu,
  openSurfaceContextMenu,
  handleSurfaceContextMenuSelect,
} = useSurfaceContextMenu()

const threadRef = ref(null)
const threadBottomRef = ref(null)
const composerTextareaRef = ref(null)
const activeInvocationIndex = ref(0)
const respondingPermissionRequestId = ref('')
const respondingAskUserRequestId = ref('')
const respondingExitPlanRequestId = ref('')

const builtInActions = computed(() => aiStore.builtInActions)
const altalsSkills = computed(() => aiStore.altalsSkills)
const messages = computed(() => aiStore.messages)
const artifacts = computed(() => aiStore.artifacts)
const attachments = computed(() => aiStore.attachments)
const activePermissionRequest = computed(() => aiStore.activePermissionRequest)
const activeAskUserRequest = computed(() => aiStore.activeAskUserRequest)
const activeExitPlanRequest = computed(() => aiStore.activeExitPlanRequest)
const activeBackgroundTasks = computed(() => aiStore.activeBackgroundTasks)
const planModeState = computed(() => aiStore.planModeState)
const compactionState = computed(() => aiStore.compactionState)
const resumeState = computed(() => aiStore.resumeState)
const sessionItems = computed(() => aiStore.sessionList)
const providerOptions = AI_PROVIDER_DEFINITIONS.map((provider) => ({
  value: provider.id,
  label: provider.label,
}))
const enabledTools = computed(() => resolveEnabledAiTools(aiStore.enabledToolIds))

const artifactsById = computed(() =>
  Object.fromEntries(artifacts.value.map((artifact) => [artifact.id, artifact]))
)

const transcriptText = computed(() =>
  messages.value
    .map((message) => `${message.role === 'assistant' ? t('Assistant') : t('You')}\n${String(message.content || '').trim()}`)
    .filter(Boolean)
    .join('\n\n')
    .trim()
)

const currentProviderLabel = computed(() => aiStore.providerState.currentProviderLabel || 'AI')
const currentMode = computed(() => aiStore.currentSessionMode || aiModesStore.currentMode)
const isChatMode = computed(() => currentMode.value === 'chat')
const isAgentMode = computed(() => currentMode.value === 'agent')
const runtimeStateLabel = computed(() => {
  if (isChatMode.value) {
    return `${currentProviderLabel.value} · ${t('Chat')}`
  }

  const permissionMode = String(aiStore.currentPermissionMode || '').trim()
  const permissionLabel = permissionMode === 'plan'
    ? t('Plan-only mode')
    : (permissionMode === 'bypass-permissions'
      ? t('Auto-run tools')
      : t('Per-tool approval'))

  return `${currentProviderLabel.value} · ${permissionLabel}`
})
const canSend = computed(() =>
  String(aiStore.promptDraft || '').trim().length > 0 || attachments.value.length > 0
)
const slashSuggestions = computed(() =>
  builtInActions.value.map((action) => ({
    id: action.id,
    kind: 'built-in-action',
    prefix: '/',
    groupKey: 'shell-actions',
    groupLabel: t('Shell actions'),
    label: t(action.titleKey || action.id),
    description: t(action.descriptionKey || action.description || ''),
    insertText: `/${action.id}`,
  }))
)

const skillSuggestions = computed(() =>
  altalsSkills.value.map((skill) => ({
    id: skill.id,
    kind: 'filesystem-skill',
    prefix: '$',
    groupKey: 'skills',
    groupLabel: t('Skills'),
    label: skill.name || skill.slug || skill.directoryName || skill.id,
    description: skill.description || t('Filesystem skill with no description.'),
    insertText: `$${toInvocationSlug(skill.slug || skill.name || skill.directoryName || skill.id)}`,
  }))
)

const composerToken = computed(() => detectAiComposerToken(aiStore.promptDraft))

const composerSuggestions = computed(() => {
  const suggestions = getAiComposerSuggestions({
    prompt: aiStore.promptDraft,
    workspacePath: workspace.path || '',
    files: isAgentMode.value ? filesStore.flatFiles : [],
    tools: isAgentMode.value ? enabledTools.value.map((tool) => ({
      id: tool.id,
      label: t(tool.labelKey || tool.label || tool.id),
      description: t(tool.descriptionKey || tool.description || ''),
    })) : [],
    slashSuggestions: slashSuggestions.value,
    skillSuggestions: skillSuggestions.value,
  })

  return suggestions.map((suggestion) => ({
    ...suggestion,
    groupLabel: t(suggestion.groupLabel || ''),
  }))
})

async function runSkill() {
  await aiStore.runActiveSkill()
}

async function switchProvider(providerId = '') {
  await aiStore.setCurrentProvider(providerId)
}

async function respondPermissionRequest(request = null, behavior = 'deny', persist = false) {
  if (!request?.requestId) return
  respondingPermissionRequestId.value = request.requestId
  try {
    await aiStore.respondToPermissionRequest({
      requestId: request.requestId,
      behavior,
      persist,
    })
  } finally {
    respondingPermissionRequestId.value = ''
  }
}

async function denyPermissionRequest(request = null) {
  await respondPermissionRequest(request, 'deny', false)
}

async function allowPermissionRequest(request = null) {
  await respondPermissionRequest(request, 'allow', false)
}

async function alwaysAllowPermissionRequest(request = null) {
  await respondPermissionRequest(request, 'allow', true)
}

async function submitAskUserResponse(payload = {}) {
  const requestId = String(payload?.requestId || '').trim()
  if (!requestId) return
  respondingAskUserRequestId.value = requestId
  try {
    await aiStore.respondToAskUserRequest({
      requestId,
      answers: payload?.answers || {},
    })
  } finally {
    respondingAskUserRequestId.value = ''
  }
}

async function submitExitPlanResponse(payload = {}) {
  const requestId = String(payload?.requestId || '').trim()
  if (!requestId) return
  respondingExitPlanRequestId.value = requestId
  try {
    await aiStore.respondToExitPlanRequest({
      requestId,
      action: payload?.action || 'deny',
      feedback: payload?.feedback || '',
    })
  } finally {
    respondingExitPlanRequestId.value = ''
  }
}

function switchMode(mode = 'agent') {
  aiModesStore.setMode(mode)
  aiStore.setSessionMode(aiModesStore.currentMode, aiStore.currentSessionId)
  activeInvocationIndex.value = 0
  scrollToBottom('auto')
}

async function attachFiles() {
  const selectedPaths = await pickAiAttachmentPaths()
  if (!selectedPaths.length) return

  for (const path of selectedPaths) {
    await aiStore.addAttachmentFromPath(path)
  }
}

function removeAttachment(attachmentId = '') {
  aiStore.removeAttachment(attachmentId)
}

function createSession() {
  aiStore.createSession({ mode: aiModesStore.currentMode })
  activeInvocationIndex.value = 0
  nextTick(() => {
    composerTextareaRef.value?.focus?.()
  })
}

function switchSessionTab(sessionId = '') {
  if (!aiStore.switchSession(sessionId)) return
  aiModesStore.setMode(aiStore.currentSessionMode)
  activeInvocationIndex.value = 0
  scrollToBottom('auto')
}

function renameSession(payload = {}) {
  aiStore.renameSession(payload.sessionId, payload.title)
}

function deleteSession(sessionId = '') {
  if (!aiStore.deleteSession(sessionId)) return
  aiModesStore.setMode(aiStore.currentSessionMode)
  activeInvocationIndex.value = 0
  scrollToBottom('auto')
}

function toInvocationSlug(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^[/$]+/, '')
    .replace(/[^a-z0-9\u4e00-\u9fff]+/gu, '-')
    .replace(/^-+|-+$/g, '')
}

function launchEntry(entry = null) {
  const insertText = String(entry?.insertText || '').trim()
  if (!insertText) return

  const currentDraft = String(aiStore.promptDraft || '').trim()
  aiStore.setPromptDraft(currentDraft ? `${insertText} ${currentDraft}` : `${insertText} `)

  nextTick(() => {
    composerTextareaRef.value?.focus?.()
  })
}

function applyInvocationSuggestion(suggestion = null) {
  aiStore.setPromptDraft(applyAiComposerSuggestion(aiStore.promptDraft, suggestion))
  activeInvocationIndex.value = 0
}

async function copyTextToClipboard(text = '') {
  const normalized = String(text || '').trim()
  if (!normalized) return
  await navigator.clipboard.writeText(normalized)
  toastStore.show(t('Copied to clipboard'), { type: 'success' })
}

function selectThreadContents() {
  if (!threadRef.value) return
  const selection = window.getSelection?.()
  if (!selection) return
  const range = document.createRange()
  range.selectNodeContents(threadRef.value)
  selection.removeAllRanges()
  selection.addRange(range)
}

function openThreadContextMenu(event) {
  const selectionText = String(window.getSelection?.()?.toString?.() || '').trim()

  openSurfaceContextMenu({
    x: event.clientX,
    y: event.clientY,
    groups: [
      {
        key: 'clipboard',
        items: [
          {
            key: 'copy-selection',
            label: t('Copy selected text'),
            disabled: !selectionText,
            action: () => {
              void copyTextToClipboard(selectionText)
            },
          },
          {
            key: 'copy-transcript',
            label: t('Copy conversation'),
            disabled: !transcriptText.value,
            action: () => {
              void copyTextToClipboard(transcriptText.value)
            },
          },
          {
            key: 'select-all',
            label: t('Select all'),
            disabled: messages.value.length === 0,
            action: () => {
              selectThreadContents()
            },
          },
        ],
      },
    ],
  })
  event.preventDefault()
}

function handlePromptKeydown(event) {
  if (!composerSuggestions.value.length) return

  if (event.key === 'ArrowDown') {
    event.preventDefault()
    activeInvocationIndex.value = (activeInvocationIndex.value + 1) % composerSuggestions.value.length
    return
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault()
    activeInvocationIndex.value =
      (activeInvocationIndex.value - 1 + composerSuggestions.value.length) %
      composerSuggestions.value.length
    return
  }

  if (event.key === 'Enter' || event.key === 'Tab') {
    event.preventDefault()
    applyInvocationSuggestion(composerSuggestions.value[activeInvocationIndex.value])
    return
  }

  if (event.key === 'Escape') {
    activeInvocationIndex.value = 0
  }
}

function scrollToBottom(behavior = 'auto') {
  nextTick(() => {
    threadBottomRef.value?.scrollIntoView({ behavior })
  })
}

onMounted(() => {
  aiStore.restoreWorkspaceSessions(workspace.path || '')
  aiModesStore.setMode(aiStore.currentSessionMode)
  void aiStore.refreshProviderState()
  void aiStore.refreshAltalsSkills()
  scrollToBottom('auto')
})

onActivated(() => {
  aiStore.restoreWorkspaceSessions(workspace.path || '')
  aiModesStore.setMode(aiStore.currentSessionMode)
  void aiStore.refreshProviderState()
  void aiStore.refreshAltalsSkills()
  scrollToBottom('auto')
})

watch(
  () => [workspace.path, workspace.globalConfigDir],
  () => {
    aiStore.restoreWorkspaceSessions(workspace.path || '')
    aiModesStore.setMode(aiStore.currentSessionMode)
    void aiStore.refreshAltalsSkills()
    void filesStore.ensureFlatFilesReady({ force: true }).catch(() => {})
  }
)

watch(messages, () => {
  scrollToBottom(messages.value.length > 0 ? 'smooth' : 'auto')
}, { deep: true })

watch(
  () => aiStore.currentSessionId,
  () => {
    aiModesStore.setMode(aiStore.currentSessionMode)
    scrollToBottom('auto')
  }
)

watch(composerSuggestions, (next) => {
  if (!next.length || activeInvocationIndex.value >= next.length) {
    activeInvocationIndex.value = 0
  }
})

watch(
  composerToken,
  (token) => {
    if (isAgentMode.value && token?.prefix === '@' && workspace.path) {
      void filesStore.ensureFlatFilesReady({ force: false }).catch(() => {})
    }
  },
  { immediate: true }
)
</script>

<style scoped>
.ai-workflow-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  color: var(--text-primary);
  background: transparent;
}

.ai-workflow-panel__thread {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 10px 14px 16px;
}

.ai-workflow-panel__messages {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.ai-workflow-panel__composer {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 12px 14px;
  background: transparent;
}

.ai-workflow-panel__composer-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--border-color) 80%, transparent);
  background: var(--surface-base);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
}

.ai-workflow-panel__approval {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--warning) 28%, var(--border-color) 72%);
  background: color-mix(in srgb, var(--warning) 8%, transparent);
}

.ai-workflow-panel__approval-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.ai-workflow-panel__approval-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.4;
}

.ai-workflow-panel__approval-meta,
.ai-workflow-panel__approval-preview {
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-secondary);
  white-space: pre-wrap;
  word-break: break-word;
}

.ai-workflow-panel__approval-preview {
  color: var(--text-tertiary);
}

.ai-workflow-panel__approval-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
}

.ai-workflow-panel__composer-input {
  position: relative;
}

.ai-workflow-panel__composer-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ai-workflow-panel__runtime-label {
  font-size: 11px;
  color: var(--text-tertiary);
  white-space: nowrap;
}

.ai-workflow-panel__textarea {
  padding: 0 !important;
  min-height: 48px;
}

.ai-workflow-panel__provider-select {
  min-width: 88px;
  max-width: 104px;
}



.ai-workflow-panel__error {
  font-size: 12px;
  line-height: 1.5;
  color: var(--error);
}

.ai-workflow-panel__clear-link {
  appearance: none;
  border: none;
  background: transparent;
  padding: 0 2px;
  font: inherit;
  font-size: 11px;
  color: var(--text-tertiary);
  cursor: pointer;
}

.ai-workflow-panel__clear-link:hover {
  color: var(--text-secondary);
}

.ai-workflow-panel__empty {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 24px 12px;
  align-items: center;
  text-align: center;
}

.ai-workflow-panel__empty-kicker {
  font-size: 11px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-tertiary);
}

.ai-workflow-panel__empty-title {
  font-size: 13px;
  font-weight: 500;
  line-height: 1.4;
  color: var(--text-primary);
}

.ai-workflow-panel__empty-note {
  font-size: 12px;
  line-height: 1.55;
  color: var(--text-secondary);
}

.ai-workflow-panel__launcher-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ai-workflow-panel__launcher {
  appearance: none;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 11px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--border-color) 46%, transparent);
  background: color-mix(in srgb, var(--surface-base) 74%, transparent);
  text-align: left;
  cursor: pointer;
  transition:
    border-color 140ms ease,
    background-color 140ms ease,
    transform 140ms ease;
}

.ai-workflow-panel__launcher:hover {
  border-color: color-mix(in srgb, var(--accent) 28%, var(--border-color) 72%);
  background: color-mix(in srgb, var(--accent) 8%, var(--surface-base) 92%);
  transform: translateY(-1px);
}

.ai-workflow-panel__launcher-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.ai-workflow-panel__launcher-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}

.ai-workflow-panel__launcher-token {
  font-size: 11px;
  color: var(--text-tertiary);
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
}

.ai-workflow-panel__launcher-copy {
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-secondary);
}

.ai-workflow-panel__composer :deep(.ai-workflow-panel__textarea-shell) {
  border: none !important;
  border-radius: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
}

.ai-workflow-panel__composer :deep(.ai-workflow-panel__textarea-shell.ui-textarea-shell--ghost:hover),
.ai-workflow-panel__composer :deep(.ai-workflow-panel__textarea-shell.ui-textarea-shell--ghost:focus-within) {
  background: transparent !important;
  border-color: transparent !important;
  box-shadow: none !important;
}

.ai-workflow-panel__composer :deep(.ai-workflow-panel__textarea-shell .ui-textarea-control) {
  min-height: 80px;
  padding: 4px 0 5px !important;
  resize: none;
  font-size: 13px;
  line-height: 1.58;
}

.ai-workflow-panel__composer :deep(.ai-workflow-panel__provider-shell .ui-select-trigger) {
  height: 24px;
  padding: 0 22px 0 8px;
  border-color: transparent;
  border-radius: 999px;
  background: color-mix(in srgb, var(--surface-base) 58%, transparent);
  box-shadow: none;
  color: var(--text-tertiary);
}

.ai-workflow-panel__composer :deep(.ai-workflow-panel__provider-shell .ui-select-trigger:hover),
.ai-workflow-panel__composer :deep(.ai-workflow-panel__provider-shell .ui-select-trigger:focus-visible) {
  border-color: transparent;
  background: color-mix(in srgb, var(--surface-base) 72%, transparent);
  color: var(--text-secondary);
}

.ai-workflow-panel__composer :deep(.ai-workflow-panel__provider-shell .ui-select-value) {
  font-size: 11px;
}

.ai-workflow-panel__composer :deep(.ai-workflow-panel__provider-shell .ui-select-caret) {
  right: 6px;
  opacity: 0.7;
}
</style>
