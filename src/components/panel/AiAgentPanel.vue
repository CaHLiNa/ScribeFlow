<template>
  <section class="ai-agent-panel">
    <header class="ai-agent-panel__header">
      <div class="ai-agent-panel__session-control">
        <AiSessionRail
          :sessions="sessionItems"
          :current-session-id="aiStore.currentSessionId"
          @create="createSession"
          @switch="switchSessionTab"
          @rename="renameSession"
          @delete="deleteSession"
        />
      </div>
    </header>

    <div
      ref="threadRef"
      class="ai-agent-panel__thread scrollbar-hidden"
      data-surface-context-guard="true"
      @contextmenu="openThreadContextMenu"
    >
      <div class="ai-agent-panel__messages">
        <div v-if="messages.length === 0" class="ai-agent-panel__empty">
          <div class="ai-agent-panel__empty-title">
            {{ emptyStateTitle }}
          </div>
          <div class="ai-agent-panel__empty-note">
            {{ emptyStateNote }}
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

    <footer class="ai-agent-panel__composer">
      <div class="ai-agent-panel__composer-card">
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

        <div v-if="isAgentMode && activePermissionRequest" class="ai-agent-panel__approval">
          <div class="ai-agent-panel__approval-copy">
            <div class="ai-agent-panel__approval-title">
              {{ activePermissionRequest.title || t('Permission request') }}
            </div>
            <div
              v-if="activePermissionRequest.description || activePermissionRequest.decisionReason"
              class="ai-agent-panel__approval-meta"
            >
              {{ activePermissionRequest.description || activePermissionRequest.decisionReason }}
            </div>
            <div
              v-if="activePermissionRequest.inputPreview"
              class="ai-agent-panel__approval-preview"
            >
              {{ activePermissionRequest.inputPreview }}
            </div>
          </div>

          <div class="ai-agent-panel__approval-actions">
            <UiButton
              variant="ghost"
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

        <AiAttachmentList :attachments="attachments" @remove="removeAttachment" />

        <div class="ai-agent-panel__composer-well">
          <div class="ai-agent-panel__composer-input">
            <UiTextarea
              ref="composerTextareaRef"
              :model-value="aiStore.promptDraft"
              variant="ghost"
              :rows="4"
              class="ai-agent-panel__textarea"
              shell-class="ai-agent-panel__textarea-shell"
              :placeholder="composerPlaceholder"
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

          <div class="ai-agent-panel__composer-actions">
            <div class="ai-agent-panel__composer-tools">
              <UiSelect
                v-if="modelMenuOptions.length > 0"
                :model-value="currentModelValue"
                size="sm"
                class="ai-agent-panel__model-chip"
                shell-class="ai-agent-panel__model-chip-shell"
                :options="modelMenuOptions"
                :placeholder="loadingModelLabel"
                :aria-label="t('Current model')"
                @update:model-value="switchModel"
              />
              <div
                v-else
                class="ai-agent-panel__model-fallback"
                :class="{ 'is-muted': !currentModelLabel }"
              >
                {{ currentModelLabel || loadingModelLabel }}
              </div>
              <UiButton
                variant="ghost"
                size="sm"
                icon-only
                @click="attachFiles"
                :title="t('Attach files')"
              >
                <IconPaperclip :size="16" :stroke-width="1.5" />
              </UiButton>
            </div>

            <div class="ai-agent-panel__composer-primary">
              <button
                type="button"
                class="ai-agent-panel__send-button"
                :class="{
                  'is-disabled': !aiStore.isRunning && isSendBlocked,
                  'ai-agent-panel__stop-button': aiStore.isRunning,
                }"
                :disabled="!aiStore.isRunning && isSendBlocked"
                :title="aiStore.isRunning ? stopButtonTitle : sendButtonTitle"
                :aria-label="aiStore.isRunning ? stopButtonTitle : sendButtonTitle"
                @click.prevent.stop="handlePrimaryActionClick"
              >
                <IconPlayerStop v-if="aiStore.isRunning" :size="14" :stroke-width="2.2" />
                <IconArrowUp v-else :size="14" :stroke-width="2.5" />
              </button>
            </div>
          </div>
        </div>
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
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { useI18n } from '../../i18n'
import { useAiStore } from '../../stores/ai'
import { useFilesStore } from '../../stores/files'
import { useToastStore } from '../../stores/toast'
import { useWorkspaceStore } from '../../stores/workspace'
import {
  applyAiComposerSuggestion,
  detectAiComposerToken,
  getAiComposerSuggestions,
} from '../../domains/ai/aiMentionRuntime.js'
import { IconPaperclip, IconArrowUp, IconPlayerStop } from '@tabler/icons-vue'
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
import AiPlanModeBanner from './AiPlanModeBanner.vue'
import AiResumeBanner from './AiResumeBanner.vue'
import AiSessionRail from './AiSessionRail.vue'
import SurfaceContextMenu from '../shared/SurfaceContextMenu.vue'

const { t } = useI18n()
const aiStore = useAiStore()
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

aiStore.resetTransientRuntimeState()

const threadRef = ref(null)
const threadBottomRef = ref(null)
const composerTextareaRef = ref(null)
const enabledTools = ref([])
const activeInvocationIndex = ref(0)
const respondingPermissionRequestId = ref('')
const respondingAskUserRequestId = ref('')
const respondingExitPlanRequestId = ref('')

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
const modelOptions = computed(() =>
  Array.isArray(aiStore.unifiedModelPoolOptions) ? aiStore.unifiedModelPoolOptions : []
)
const currentModelValue = computed(() =>
  `${String(aiStore.providerState.currentProviderId || '').trim()}::${String(aiStore.providerState.model || '').trim()}`
)
const modelMenuOptions = computed(() => {
  const options = Array.isArray(modelOptions.value) ? [...modelOptions.value] : []
  const currentModel = String(aiStore.providerState.model || '').trim()
  const currentProviderId = String(aiStore.providerState.currentProviderId || '').trim()
  if (!currentModel || !currentProviderId) return options
  const selectedValue = currentModelValue.value
  const hasCurrent = options.some((option) => option?.value === selectedValue)
  if (hasCurrent) return options
  return [
    {
      value: selectedValue,
      label: `${currentModel} · ${aiStore.providerState.currentProviderLabel || currentProviderId}`,
      triggerLabel: currentModel,
      providerId: currentProviderId,
      providerLabel: aiStore.providerState.currentProviderLabel || currentProviderId,
      model: currentModel,
      modelLabel: currentModel,
    },
    ...options,
  ]
})
const currentModelLabel = computed(() => {
  const currentModel = String(aiStore.providerState.model || '').trim()
  if (!currentModel) return ''
  const matchedOption = modelMenuOptions.value.find((option) => option?.value === currentModelValue.value)
  return String(matchedOption?.triggerLabel || matchedOption?.modelLabel || currentModel).trim()
})
const loadingModelLabel = computed(() =>
  aiStore.unifiedModelPoolLoading ? t('Loading models...') : t('No model selected')
)

const artifactsById = computed(() =>
  Object.fromEntries(artifacts.value.map((artifact) => [artifact.id, artifact]))
)

const transcriptText = computed(() =>
  messages.value
    .map(
      (message) =>
        `${message.role === 'assistant' ? t('Assistant') : t('You')}\n${String(message.content || '').trim()}`
    )
    .filter(Boolean)
    .join('\n\n')
    .trim()
)

const isAgentMode = computed(() => true)
const canSend = computed(
  () => String(aiStore.promptDraft || '').trim().length > 0 || attachments.value.length > 0
)
const isProviderReady = computed(() => aiStore.providerState.ready === true)
const providerNotReadyMessage = computed(() =>
  aiStore.providerState.requiresApiKey === false
    ? t('Agent runtime is not ready. Configure the provider and model before sending.')
    : t('Agent runtime is not ready. Configure the provider, model, and API key before sending.')
)
const isSendBlocked = computed(() => !isProviderReady.value || !canSend.value)
const sendButtonTitle = computed(() => {
  if (!isProviderReady.value) return providerNotReadyMessage.value
  if (!canSend.value) return t('Type a message or attach a file to send.')
  if (aiStore.isRunning) return t('Queue message')
  return t('Submit')
})
const stopButtonTitle = computed(() => t('Stop response'))
const composerPlaceholder = computed(() =>
  isAgentMode.value
    ? t('Describe the task, or type $skill.')
    : t('Ask anything about this project.')
)
const emptyStateTitle = computed(() =>
  isAgentMode.value ? t('What needs to happen in this workspace?') : t('What do you want to build?')
)
const emptyStateNote = computed(() =>
  isAgentMode.value
    ? t('The agent already has this workspace, file context, and tool access.')
    : t('Operate on the current workspace or type / for commands.')
)

function toInvocationSlug(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^[/$]+/, '')
    .replace(/[^a-z0-9\u4e00-\u9fff]+/gu, '-')
    .replace(/^-+|-+$/g, '')
}

const skillSuggestions = computed(() =>
  altalsSkills.value.map((skill) => ({
    id: skill.id,
    kind: 'filesystem-skill',
    prefix: '$',
    groupKey: 'skills',
    groupLabel: t('Skills'),
    label: skill.name || skill.slug || skill.directoryName || skill.id,
    description: skill.description || t('Filesystem skill with no description.'),
    insertText: `$${toInvocationSlug(skill.slug || skill.name || skill.directoryName || skill.id)} `,
  }))
)
const composerToken = computed(() => detectAiComposerToken(aiStore.promptDraft))

const composerSuggestions = computed(() => {
  const suggestions = getAiComposerSuggestions({
    prompt: aiStore.promptDraft,
    workspacePath: workspace.path || '',
    files: isAgentMode.value ? filesStore.flatFiles : [],
    tools: isAgentMode.value
      ? enabledTools.value.map((tool) => ({
          id: tool.id,
          label: t(tool.labelKey || tool.label || tool.id),
          description: t(tool.descriptionKey || tool.description || ''),
        }))
      : [],
    slashSuggestions: [],
    skillSuggestions: skillSuggestions.value,
  })

  return suggestions.map((suggestion) => ({
    ...suggestion,
    groupLabel: t(suggestion.groupLabel || ''),
  }))
})

async function runSkill() {
  if (aiStore.isRunning) return
  const rawTextareaValue = String(
    composerTextareaRef.value?.textareaEl?.value ?? composerTextareaRef.value?.value ?? ''
  )
  if (!String(aiStore.promptDraft || '').trim() && rawTextareaValue.trim()) {
    aiStore.setPromptDraft(rawTextareaValue)
  }
  if (
    !String(aiStore.promptDraft || '').trim() &&
    !rawTextareaValue.trim() &&
    attachments.value.length === 0
  ) {
    composerTextareaRef.value?.focus?.()
    toastStore.show(t('Type a message or attach a file to send.'), { type: 'warning' })
    return
  }
  if (!isProviderReady.value) {
    await aiStore.refreshProviderState().catch(() => {})
    toastStore.show(providerNotReadyMessage.value, { type: 'warning' })
    workspace.openSettings('agent')
    return
  }
  await aiStore.runActiveSkill()
}

function handleSendClick() {
  if (isSendBlocked.value) return
  if (aiStore.isRunning) {
    const queued = aiStore.queueCurrentSubmission()
    if (queued) {
      toastStore.show(t('Message queued for the current session.'))
    }
    return
  }
  void runSkill()
}

function handleStopClick() {
  if (!aiStore.isRunning) return
  void aiStore.stopCurrentRun()
}

function handlePrimaryActionClick() {
  if (aiStore.isRunning) {
    handleStopClick()
    return
  }
  handleSendClick()
}

async function switchModel(model = '') {
  await aiStore.setCurrentModel(model)
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

async function attachFiles() {
  const selected = await open({
    multiple: true,
    directory: false,
    title: t('Attach files'),
  })
  const selectedPaths = !selected ? [] : Array.isArray(selected) ? selected : [selected]
  if (!selectedPaths.length) return

  for (const path of selectedPaths) {
    await aiStore.addAttachmentFromPath(path)
  }
}

function removeAttachment(attachmentId = '') {
  aiStore.removeAttachment(attachmentId)
}

async function createSession() {
  await aiStore.createSession()
  activeInvocationIndex.value = 0
  nextTick(() => {
    composerTextareaRef.value?.focus?.()
  })
}

async function switchSessionTab(sessionId = '') {
  if (!(await aiStore.switchSession(sessionId))) return
  activeInvocationIndex.value = 0
  scrollToBottom('auto')
}

async function renameSession(payload = {}) {
  await aiStore.renameSession(payload.sessionId, payload.title)
}

async function deleteSession(sessionId = '') {
  if (!(await aiStore.deleteSession(sessionId))) return
  activeInvocationIndex.value = 0
  scrollToBottom('auto')
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
    activeInvocationIndex.value =
      (activeInvocationIndex.value + 1) % composerSuggestions.value.length
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

async function refreshEnabledTools() {
  const response = await invoke('ai_tool_catalog_resolve', {
    params: {
      enabledTools: aiStore.enabledToolIds,
      runtimeIntent: 'agent',
    },
  })
  enabledTools.value = Array.isArray(response?.runtimeTools) ? response.runtimeTools : []
}

async function refreshProviderRuntime() {
  await aiStore.refreshProviderState()
  await aiStore.refreshUnifiedModelPool({ force: true }).catch(() => [])
}

async function hydrateWorkspaceSessions() {
  await aiStore.restoreWorkspaceSessions(workspace.path || '')
  void aiStore.ensureCodexRuntimeBridge()
}

onMounted(() => {
  void hydrateWorkspaceSessions()
  void refreshEnabledTools()
  void refreshProviderRuntime()
  void aiStore.refreshAltalsSkills()
  scrollToBottom('auto')
})

onActivated(() => {
  void hydrateWorkspaceSessions()
  void refreshEnabledTools()
  void refreshProviderRuntime()
  void aiStore.refreshAltalsSkills()
  scrollToBottom('auto')
})

watch(
  () => [workspace.path, workspace.globalConfigDir],
  () => {
    void hydrateWorkspaceSessions()
    void refreshEnabledTools()
    void aiStore.refreshAltalsSkills()
    void filesStore.ensureFlatFilesReady({ force: true }).catch(() => {})
  }
)

watch(
  () => aiStore.enabledToolIds,
  () => {
    void refreshEnabledTools()
  },
  { deep: true }
)

watch(
  messages,
  () => {
    scrollToBottom(messages.value.length > 0 ? 'smooth' : 'auto')
  },
  { deep: true }
)

watch(
  () => aiStore.currentSessionId,
  () => {
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
.ai-agent-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  container-type: inline-size;
  color: var(--text-primary);
  background: transparent;
}

.ai-agent-panel__thread {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 10px 14px 16px;
}

.ai-agent-panel__messages {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.ai-agent-panel__composer {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 6px 10px 10px;
  background: transparent;
}

.ai-agent-panel__header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px 6px;
  background: transparent;
  z-index: 10;
}

.ai-agent-panel__subnav {
  display: flex;
  align-items: center;
  padding: 8px 14px 4px;
}

.ai-agent-panel__composer-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  position: relative;
  z-index: 10;
}

.ai-agent-panel__session-control {
  display: flex;
  align-items: center;
  flex: 1 1 auto;
  min-width: 0;
}

.ai-agent-panel__composer-well {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px 8px 7px;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--border-color) 20%, transparent);
  background: color-mix(in srgb, var(--panel-surface) 72%, transparent);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, white 12%, transparent),
    0 6px 18px color-mix(in srgb, black 8%, transparent);
}

.ai-agent-panel__approval {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--warning) 28%, var(--border-color) 72%);
  background: color-mix(in srgb, var(--warning) 8%, transparent);
}

.ai-agent-panel__approval-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.ai-agent-panel__approval-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.4;
}

.ai-agent-panel__approval-meta,
.ai-agent-panel__approval-preview {
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-secondary);
  white-space: pre-wrap;
  word-break: break-word;
}

.ai-agent-panel__approval-preview {
  color: var(--text-tertiary);
}

.ai-agent-panel__approval-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
}

.ai-agent-panel__composer-input {
  position: relative;
}

.ai-agent-panel__model-chip {
  flex: 0 1 auto;
  min-width: 0;
  max-width: 176px;
}

.ai-agent-panel__model-fallback {
  display: flex;
  align-items: center;
  min-width: 0;
  max-width: 176px;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--border-color) 26%, transparent);
  background: color-mix(in srgb, var(--surface-base) 66%, transparent);
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ai-agent-panel__model-fallback.is-muted {
  color: var(--text-tertiary);
}

.ai-agent-panel__composer-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 28px;
  padding-top: 2px;
}

.ai-agent-panel__composer-tools {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ai-agent-panel__composer-primary {
  display: flex;
  align-items: center;
  gap: 4px;
}

.ai-agent-panel__send-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  border-radius: 10px;
  background: var(--text-primary);
  color: var(--surface-base);
  box-shadow: 0 2px 8px color-mix(in srgb, black 12%, transparent);
  cursor: pointer;
  transition: transform 0.1s ease, filter 0.1s ease, opacity 0.1s ease;
}

.ai-agent-panel__send-button:hover:not(:disabled) {
  filter: brightness(1.15);
  transform: translateY(-0.5px);
}

.ai-agent-panel__stop-button {
  background: var(--error);
  color: white;
}

.ai-agent-panel__stop-button:hover:not(:disabled) {
  filter: brightness(1.1);
}

.ai-agent-panel__send-button:active:not(:disabled) {
  transform: translateY(0.5px);
}

.ai-agent-panel__send-button:focus-visible {
  outline: none;
  box-shadow:
    0 0 0 3px color-mix(in srgb, var(--accent) 28%, transparent),
    0 0 0 1px var(--accent);
}

.ai-agent-panel__send-button.is-disabled,
.ai-agent-panel__send-button:disabled {
  opacity: 0.5;
  cursor: default;
}

.ai-agent-panel__textarea {
  padding: 4px 6px !important;
  min-height: 24px;
  max-height: 400px;
}

.ai-agent-panel__provider-select {
  min-width: 88px;
  max-width: 104px;
}

.ai-agent-panel__error {
  font-size: 12px;
  line-height: 1.5;
  color: var(--error);
}

.ai-agent-panel__empty {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 8px 18px;
  align-items: flex-start;
  text-align: left;
  max-width: 240px;
}

.ai-agent-panel__empty-title {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.4;
  color: var(--text-primary);
}

.ai-agent-panel__empty-note {
  font-size: 12px;
  line-height: 1.55;
  color: var(--text-secondary);
}

.ai-agent-panel__composer :deep(.ai-agent-panel__textarea-shell) {
  border: none !important;
  border-radius: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
}

.ai-agent-panel__composer :deep(.ai-agent-panel__textarea-shell.ui-textarea-shell--ghost:hover),
.ai-agent-panel__composer :deep(.ai-agent-panel__textarea-shell.ui-textarea-shell--ghost:focus-within) {
  background: transparent !important;
  border-color: transparent !important;
  box-shadow: none !important;
}

.ai-agent-panel__composer :deep(.ai-agent-panel__textarea-shell .ui-textarea-control) {
  min-height: 92px;
  padding: 2px 0 6px !important;
  resize: none;
  font-size: 13px;
  line-height: 1.62;
  color: var(--text-primary);
}

.ai-agent-panel__composer :deep(.ai-agent-panel__model-chip-shell) {
  width: auto;
  max-width: 100%;
}

.ai-agent-panel__composer :deep(.ai-agent-panel__model-chip-shell .ui-select-trigger) {
  height: 28px;
  width: auto;
  max-width: 100%;
  padding: 0 24px 0 10px;
  border-color: color-mix(in srgb, var(--border-color) 22%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--surface-base) 66%, transparent);
  box-shadow: none;
  color: var(--text-secondary);
}

.ai-agent-panel__composer :deep(.ai-agent-panel__model-chip-shell .ui-select-trigger:hover),
.ai-agent-panel__composer :deep(.ai-agent-panel__model-chip-shell .ui-select-trigger:focus-visible) {
  border-color: color-mix(in srgb, var(--accent) 22%, var(--border-color) 78%);
  background: color-mix(in srgb, var(--surface-hover) 18%, transparent);
  color: var(--text-primary);
}

.ai-agent-panel__composer :deep(.ai-agent-panel__model-chip-shell .ui-select-value) {
  font-size: 12px;
  font-weight: 600;
}

.ai-agent-panel__composer :deep(.ai-agent-panel__model-chip-shell .ui-select-caret) {
  right: 7px;
  opacity: 0.7;
}

@container (max-width: 380px) {
  .ai-agent-panel__header {
    padding-bottom: 4px;
  }
}

@container (max-width: 320px) {
  .ai-agent-panel__thread {
    padding-inline: 12px;
  }

  .ai-agent-panel__composer {
    padding-inline: 8px;
  }

  .ai-agent-panel__model-chip,
  .ai-agent-panel__model-fallback {
    max-width: 132px;
  }

  .ai-agent-panel__empty {
    max-width: none;
  }
}
</style>
