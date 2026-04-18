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
      <div class="ai-agent-panel__composer-stack">
        <div v-if="isAgentMode && hasRuntimeStateStack" class="ai-agent-panel__runtime-stack">
          <AiPlanModeBanner
            v-if="showPlanModeBanner"
            :plan-mode="planModeState"
          />
          <AiResumeBanner
            v-if="showResumeBanner"
            :resume-state="resumeState"
          />
          <AiCompactingBanner
            v-if="showCompactingBanner"
            :compaction="compactionState"
          />
          <AiActiveTasksBar
            v-if="showActiveTasksBar"
            :tasks="backgroundTaskItems"
          />
        </div>

        <AiAskUserBanner
          v-if="isAgentMode && blockingState === 'ask-user'"
          :request="activeAskUserRequest"
          :context-items="blockingContextItems"
          :submitting="respondingAskUserRequestId === activeAskUserRequest?.requestId"
          @submit="submitAskUserResponse"
        />
        <AiExitPlanBanner
          v-else-if="isAgentMode && blockingState === 'exit-plan'"
          :request="activeExitPlanRequest"
          :context-items="blockingContextItems"
          :submitting="respondingExitPlanRequestId === activeExitPlanRequest?.requestId"
          @submit="submitExitPlanResponse"
        />
        <AiPermissionBanner
          v-else-if="isAgentMode && blockingState === 'permission' && activePermissionRequest"
          :request="activePermissionRequest"
          :context-items="blockingContextItems"
          :submitting="respondingPermissionRequestId === activePermissionRequest?.requestId"
          @deny="denyPermissionRequest"
          @allow-once="allowPermissionRequest"
          @allow-always="alwaysAllowPermissionRequest"
        />

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
              <div class="ai-agent-panel__execution-policy">
                <button
                  type="button"
                  class="ai-agent-panel__policy-button ai-agent-panel__policy-button--plan"
                  :class="{
                    'is-active': isPlanModeEnabled,
                    'is-disabled': isExecutionPolicyLocked,
                  }"
                  :disabled="isExecutionPolicyLocked"
                  :title="planModeButtonTitle"
                  :aria-label="planModeButtonTitle"
                  @click="togglePlanMode(!isPlanModeEnabled)"
                >
                  <IconChecklist :size="15" :stroke-width="1.9" />
                  <span
                    class="ai-agent-panel__policy-indicator"
                    :class="{ 'is-plan-active': isPlanModeEnabled }"
                    aria-hidden="true"
                  ></span>
                  <span class="ai-agent-panel__policy-label" :class="{ 'is-zh': isZh }" aria-hidden="true">
                    {{ planModeCompactLabel }}
                  </span>
                </button>

                <button
                  type="button"
                  class="ai-agent-panel__policy-button ai-agent-panel__policy-button--permission"
                  :class="{
                    'is-active': isFullAccessMode,
                    'is-disabled': isExecutionPolicyLocked,
                  }"
                  :disabled="isExecutionPolicyLocked"
                  :title="permissionModeButtonTitle"
                  :aria-label="permissionModeButtonTitle"
                  @click="cyclePermissionMode"
                >
                  <IconShieldHalf
                    v-if="!isFullAccessMode"
                    :size="15"
                    :stroke-width="1.85"
                  />
                  <IconShieldBolt
                    v-else
                    :size="15"
                    :stroke-width="1.85"
                  />
                  <span
                    class="ai-agent-panel__policy-indicator"
                    :class="{ 'is-full-access': isFullAccessMode }"
                    aria-hidden="true"
                  ></span>
                  <span class="ai-agent-panel__policy-label" :class="{ 'is-zh': isZh }" aria-hidden="true">
                    {{ permissionModeCompactLabel }}
                  </span>
                </button>
              </div>

              <UiSelect
                v-if="modelMenuOptions.length > 0"
                :model-value="currentModelValue"
                :disabled="isComposerLockedByBlockingState"
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
                class="ai-agent-panel__tool-button"
                :disabled="isComposerLockedByBlockingState"
                @click="attachFiles"
                :title="isComposerLockedByBlockingState ? blockedComposerMessage : t('Attach files')"
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
                  'is-blocked': isComposerLockedByBlockingState,
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
import {
  IconPaperclip,
  IconArrowUp,
  IconChecklist,
  IconPlayerStop,
  IconShieldBolt,
  IconShieldHalf,
} from '@tabler/icons-vue'
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
import AiPermissionBanner from './AiPermissionBanner.vue'
import AiResumeBanner from './AiResumeBanner.vue'
import AiSessionRail from './AiSessionRail.vue'
import SurfaceContextMenu from '../shared/SurfaceContextMenu.vue'

const { t, isZh } = useI18n()
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

void aiStore.resetTransientRuntimeState()

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
const currentPermissionMode = computed(() => aiStore.currentPermissionMode)
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
const isComposerLockedByBlockingState = computed(() => hasBlockingState.value && !aiStore.isRunning)
const permissionModeFallbackBySession = ref({})
const isPlanModeEnabled = computed(() => currentPermissionMode.value === 'plan')
const resolvedPermissionMode = computed(() =>
  currentPermissionMode.value === 'plan'
    ? permissionModeFallbackBySession.value[aiStore.currentSessionId] || 'accept-edits'
    : currentPermissionMode.value
)
const isFullAccessMode = computed(() => resolvedPermissionMode.value === 'bypass-permissions')
const isExecutionPolicyLocked = computed(() => aiStore.isRunning || hasBlockingState.value)
const planModeCompactLabel = computed(() => t('PLAN'))
const permissionModeCompactLabel = computed(() => (isFullAccessMode.value ? t('FULL') : t('ASK')))
const executionPolicyControlTitle = computed(() => {
  if (aiStore.isRunning) return t('Execution mode cannot change while a task is running.')
  if (hasBlockingState.value) {
    return t('Resolve the current blocking state before changing execution mode.')
  }
  return ''
})
const planModeButtonTitle = computed(() => {
  if (executionPolicyControlTitle.value) return executionPolicyControlTitle.value
  if (isPlanModeEnabled.value) return t('Plan mode is on. Click to return to normal execution.')
  return t('Plan mode is off. Click to plan before acting.')
})
const permissionModeButtonTitle = computed(() => {
  if (executionPolicyControlTitle.value) return executionPolicyControlTitle.value
  if (isPlanModeEnabled.value && isFullAccessMode.value) {
    return t('Full access will be used after plan mode exits. Click to switch back to ask before edits.')
  }
  if (isPlanModeEnabled.value) {
    return t('Ask before edits will be used after plan mode exits. Click to switch to full access.')
  }
  if (isFullAccessMode.value) {
    return t('Full access is on. Click to switch to ask before edits.')
  }
  return t('Ask before edits is on. Click to switch to full access.')
})
const blockedComposerMessage = computed(() =>
  t('Resolve the current blocking state before sending a new task.')
)
const providerNotReadyMessage = computed(() =>
  aiStore.providerState.requiresApiKey === false
    ? t('Agent runtime is not ready. Configure the provider and model before sending.')
    : t('Agent runtime is not ready. Configure the provider, model, and API key before sending.')
)
const isSendBlocked = computed(
  () => isComposerLockedByBlockingState.value || !isProviderReady.value || !canSend.value
)
const sendButtonTitle = computed(() => {
  if (isComposerLockedByBlockingState.value) return blockedComposerMessage.value
  if (!isProviderReady.value) return providerNotReadyMessage.value
  if (!canSend.value) return t('Type a message or attach a file to send.')
  if (aiStore.isRunning) return t('Queue message')
  return t('Run task')
})
const stopButtonTitle = computed(() => t('Stop response'))
const composerPlaceholder = computed(() =>
  isAgentMode.value
    ? t('Describe the next task, or type $skill.')
    : t('Ask anything about this project.')
)
const emptyStateTitle = computed(() =>
  isAgentMode.value ? t('Describe the next task.') : t('What do you want to build?')
)
const emptyStateNote = computed(() =>
  isAgentMode.value
    ? t('This workspace, files, and tools are already available.')
    : t('Operate on the current workspace or type / for commands.')
)
const blockingState = computed(() => {
  if (activePermissionRequest.value) return 'permission'
  if (activeAskUserRequest.value) return 'ask-user'
  if (activeExitPlanRequest.value) return 'exit-plan'
  return ''
})
const hasBlockingState = computed(() => blockingState.value !== '')
const showPlanModeBanner = computed(
  () => planModeState.value?.active === true && blockingState.value !== 'exit-plan' && !hasBlockingState.value
)
const showResumeBanner = computed(
  () => resumeState.value?.active === true && !hasBlockingState.value
)
const showCompactingBanner = computed(
  () => compactionState.value?.active === true && !hasBlockingState.value && !resumeState.value?.active
)
const backgroundTaskItems = computed(() =>
  activeBackgroundTasks.value.slice(0, 3).map((task) => ({
    ...task,
    detail: summarizeStatusDetail(task.detail || task.lastToolName || '', 72),
  }))
)
const showActiveTasksBar = computed(() => backgroundTaskItems.value.length > 0 && !hasBlockingState.value)
const hasRuntimeStateStack = computed(
  () =>
    showPlanModeBanner.value ||
    showResumeBanner.value ||
    showCompactingBanner.value ||
    showActiveTasksBar.value
)
const blockingContextItems = computed(() => {
  if (!hasBlockingState.value) return []

  const items = []
  if (planModeState.value?.active === true && blockingState.value !== 'exit-plan') {
    items.push({
      key: 'plan',
      tone: 'accent',
      label: t('Plan mode'),
      detail: summarizeStatusDetail(planModeState.value.summary || planModeState.value.note, 48),
    })
  }
  if (resumeState.value?.active === true) {
    items.push({
      key: 'resume',
      tone: 'info',
      label: t('Waiting to resume'),
      detail: summarizeStatusDetail(resumeState.value.message, 48),
    })
  }
  if (compactionState.value?.active === true) {
    items.push({
      key: 'compacting',
      tone: 'warning',
      label: t('Compacting'),
      detail: t('Preparing earlier context'),
    })
  }
  if (activeBackgroundTasks.value.length > 0) {
    items.push({
      key: 'tasks',
      tone: 'warning',
      label: t('Running tasks'),
      detail: t('{count} active', { count: activeBackgroundTasks.value.length }),
    })
  }
  return items
})

function toInvocationSlug(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^[/$]+/, '')
    .replace(/[^a-z0-9\u4e00-\u9fff]+/gu, '-')
    .replace(/^-+|-+$/g, '')
}

function summarizeStatusDetail(value = '', maxLength = 72) {
  const normalized = String(value || '').trim().replace(/\s+/g, ' ')
  if (!normalized) return ''
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`
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

async function setResolvedPermissionMode(mode = 'accept-edits') {
  const normalizedMode = mode === 'bypass-permissions' ? 'bypass-permissions' : 'accept-edits'
  permissionModeFallbackBySession.value = {
    ...permissionModeFallbackBySession.value,
    [aiStore.currentSessionId]: normalizedMode,
  }
  if (isPlanModeEnabled.value) return
  await aiStore.setSessionPermissionMode(normalizedMode)
}

async function cyclePermissionMode() {
  const nextMode = isFullAccessMode.value ? 'accept-edits' : 'bypass-permissions'
  await setResolvedPermissionMode(nextMode)
}

async function togglePlanMode(nextValue = false) {
  if (!nextValue) {
    const fallbackMode =
      permissionModeFallbackBySession.value[aiStore.currentSessionId] || 'accept-edits'
    await aiStore.setSessionPermissionMode(fallbackMode)
    return
  }
  await aiStore.setSessionPermissionMode('plan')
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
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    event.preventDefault()
    if (aiStore.isRunning) {
      handleStopClick()
    } else {
      handleSendClick()
    }
    return
  }

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

watch(
  () => [aiStore.currentSessionId, currentPermissionMode.value],
  ([sessionId, permissionMode]) => {
    if (!String(sessionId || '').trim() || permissionMode === 'plan') return
    permissionModeFallbackBySession.value = {
      ...permissionModeFallbackBySession.value,
      [sessionId]: permissionMode,
    }
  },
  { immediate: true }
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
  isolation: isolate;
}

.ai-agent-panel__thread {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 8px 12px 14px;
  background: transparent;
}

.ai-agent-panel__messages {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ai-agent-panel__composer {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 8px 10px;
  border-top: 1px solid color-mix(in srgb, var(--border-color) 12%, transparent);
  background: transparent;
  backdrop-filter: none;
}

.ai-agent-panel__header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 12px 8px;
  border-bottom: 1px solid color-mix(in srgb, var(--border-color) 10%, transparent);
  background: transparent;
  backdrop-filter: none;
  z-index: 10;
}

.ai-agent-panel__subnav {
  display: flex;
  align-items: center;
  padding: 8px 14px 4px;
}

.ai-agent-panel__composer-stack {
  display: flex;
  flex-direction: column;
  gap: 6px;
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
  gap: 8px;
  padding: 8px 10px 9px;
  border-radius: 16px;
  border: none;
  background: transparent;
  box-shadow: none;
  backdrop-filter: none;
}

.ai-agent-panel__runtime-stack {
  display: flex;
  flex-direction: column;
  gap: 6px;
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
  border: none;
  background: transparent;
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
  min-height: 34px;
  padding-top: 8px;
  border-top: 1px solid color-mix(in srgb, var(--border-color) 14%, transparent);
}

.ai-agent-panel__composer-tools {
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  gap: 6px;
  min-width: 0;
}

.ai-agent-panel__execution-policy {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: 0 0 auto;
  padding-right: 4px;
}

.ai-agent-panel__policy-button {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-width: 0;
  height: 28px;
  padding: 0 3px 0 2px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: color-mix(in srgb, var(--text-secondary) 82%, var(--text-tertiary) 18%);
  cursor: pointer;
  transition:
    color 0.12s ease,
    background-color 0.12s ease,
    opacity 0.12s ease,
    transform 0.12s ease;
}

.ai-agent-panel__policy-button:hover:not(:disabled) {
  color: var(--text-primary);
  background: color-mix(in srgb, var(--surface-hover) 4%, transparent);
  transform: translateY(-0.5px);
}

.ai-agent-panel__policy-button:focus-visible {
  outline: none;
  box-shadow:
    0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent),
    inset 0 -2px 0 color-mix(in srgb, var(--accent) 64%, transparent);
}

.ai-agent-panel__policy-button.is-disabled,
.ai-agent-panel__policy-button:disabled {
  opacity: 0.46;
  cursor: default;
  transform: none;
}

.ai-agent-panel__policy-button--plan.is-active {
  color: color-mix(in srgb, var(--accent) 82%, var(--text-primary) 18%);
}

.ai-agent-panel__policy-button--permission.is-active {
  color: color-mix(in srgb, var(--warning) 82%, var(--text-primary) 18%);
}

.ai-agent-panel__policy-indicator {
  position: absolute;
  left: 2px;
  right: 2px;
  bottom: -1px;
  height: 2px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--border-color) 58%, transparent);
  opacity: 0.9;
}

.ai-agent-panel__policy-indicator.is-full-access {
  background: color-mix(in srgb, var(--warning) 84%, transparent);
}

.ai-agent-panel__policy-indicator.is-plan-active {
  background: color-mix(in srgb, var(--accent) 84%, transparent);
}

.ai-agent-panel__policy-label {
  display: inline-flex;
  align-items: center;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: currentColor;
  pointer-events: none;
}

.ai-agent-panel__policy-label.is-zh {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0;
  text-transform: none;
}

.ai-agent-panel__composer-primary {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
}

.ai-agent-panel__send-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  padding: 0;
  border: 1px solid color-mix(in srgb, var(--border-color) 18%, transparent);
  border-radius: 11px;
  background: color-mix(in srgb, var(--surface-base) 8%, transparent);
  color: var(--text-primary);
  box-shadow: none;
  backdrop-filter: blur(10px) saturate(1.02);
  cursor: pointer;
  transition:
    transform 0.1s ease,
    opacity 0.1s ease,
    background-color 0.12s ease,
    border-color 0.12s ease,
    color 0.12s ease;
}

.ai-agent-panel__send-button:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--accent) 16%, var(--border-color) 84%);
  background: color-mix(in srgb, var(--surface-hover) 10%, transparent);
  color: var(--text-primary);
  transform: translateY(-0.5px);
}

.ai-agent-panel__stop-button {
  border-color: color-mix(in srgb, var(--error) 14%, var(--border-color) 86%);
  background: color-mix(in srgb, var(--error) 6%, transparent);
  color: color-mix(in srgb, var(--error) 76%, var(--text-primary) 24%);
}

.ai-agent-panel__stop-button:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--error) 22%, var(--border-color) 78%);
  background: color-mix(in srgb, var(--error) 9%, transparent);
  color: color-mix(in srgb, var(--error) 84%, var(--text-primary) 16%);
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

.ai-agent-panel__send-button.is-blocked {
  opacity: 0.42;
}

.ai-agent-panel__textarea {
  padding: 2px 4px !important;
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
  gap: 4px;
  padding: 12px 4px 18px;
  align-items: flex-start;
  text-align: left;
  max-width: 220px;
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
  min-height: 88px;
  padding: 2px 0 4px !important;
  resize: none;
  font-size: 13px;
  line-height: 1.58;
  color: var(--text-primary);
}

.ai-agent-panel__composer :deep(.ai-agent-panel__model-chip-shell) {
  width: auto;
  max-width: 100%;
}

.ai-agent-panel__composer :deep(.ai-agent-panel__model-chip-shell .ui-select-trigger) {
  height: 30px;
  width: auto;
  max-width: 132px;
  padding: 0 24px 0 11px;
  border-color: transparent;
  border-radius: 10px;
  background: transparent;
  box-shadow: none;
  color: var(--text-secondary);
}

.ai-agent-panel__composer :deep(.ai-agent-panel__model-chip-shell .ui-select-trigger:hover),
.ai-agent-panel__composer :deep(.ai-agent-panel__model-chip-shell .ui-select-trigger:focus-visible) {
  border-color: transparent;
  background: transparent;
  color: var(--text-primary);
}

.ai-agent-panel__composer :deep(.ai-agent-panel__model-chip-shell.is-disabled .ui-select-trigger) {
  opacity: 0.55;
}

.ai-agent-panel__composer :deep(.ai-agent-panel__model-chip-shell .ui-select-value) {
  font-size: 12px;
  font-weight: 600;
}

.ai-agent-panel__composer :deep(.ai-agent-panel__model-chip-shell .ui-select-caret) {
  right: 7px;
  opacity: 0.7;
}

.ai-agent-panel__tool-button {
  width: 30px;
  height: 30px;
  padding: 0;
  border-radius: 10px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  box-shadow: none;
}

.ai-agent-panel__tool-button:hover:not(:disabled) {
  background: transparent;
  color: var(--text-primary);
}

@container (max-width: 380px) {
  .ai-agent-panel__header {
    padding-bottom: 6px;
  }

  .ai-agent-panel__composer {
    padding-inline: 8px;
  }

  .ai-agent-panel__composer-well {
    padding-inline: 8px;
  }
}

@container (max-width: 320px) {
  .ai-agent-panel__thread {
    padding-inline: 10px;
  }

  .ai-agent-panel__model-chip,
  .ai-agent-panel__model-fallback {
    max-width: 112px;
  }

  .ai-agent-panel__empty {
    max-width: none;
  }

  .ai-agent-panel__composer-actions {
    gap: 8px;
  }
}
</style>
