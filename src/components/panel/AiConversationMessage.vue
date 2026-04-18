<template>
  <article class="ai-conversation-message" :class="`is-${message.role}`">
    <div class="ai-conversation-message__meta">
      <span class="ai-conversation-message__role">
        {{ message.role === 'assistant' ? t('Assistant') : t('You') }}
      </span>
      <span v-if="formattedTime" class="ai-conversation-message__meta-separator">·</span>
      <span v-if="formattedTime" class="ai-conversation-message__time">{{ formattedTime }}</span>
    </div>

    <div v-if="showContextMetadata" class="ai-conversation-message__context">
      <span
        v-for="chip in contextChips"
        :key="`${chip.kind}:${chip.value}`"
        class="ai-conversation-message__pill ai-conversation-message__pill--context"
      >
        <span class="ai-conversation-message__pill-label">{{ chip.label }}</span>
        <span class="ai-conversation-message__pill-value">{{ chip.value }}</span>
      </span>
    </div>

    <div
      class="ai-conversation-message__body"
      :class="
        message.role === 'assistant'
          ? 'ai-conversation-message__body--assistant'
          : 'ai-conversation-message__body--user'
      "
    >
      <div
        class="ai-conversation-message__surface"
        :class="
          message.role === 'assistant'
            ? 'ai-conversation-message__surface--assistant'
            : 'ai-conversation-message__surface--user'
        "
      >
        <template v-if="message.role === 'user'">
          <div class="ai-conversation-message__user-text">
            {{ messageText }}
          </div>
        </template>

        <template v-else>
          <AiTaskProgressCard :tasks="taskProgressTasks" />

          <template
            v-for="(part, index) in displayParts"
            :key="`${message.id}:${index}:${part.type}`"
          >
            <template v-if="part.type === 'status'"></template>

            <details
              v-else-if="part.type === 'support'"
              class="ai-conversation-message__support"
              :open="part.isStreaming === true"
            >
              <summary>{{ part.label || t('Support note') }}</summary>
              <div class="ai-conversation-message__support-body">{{ part.text }}</div>
            </details>

            <AiToolLine v-else-if="part.type === 'tool'" :part="part" />

            <div
              v-else-if="part.type === 'text'"
              class="ai-conversation-message__response"
              :class="{
                'ai-conversation-message__response--placeholder': part.isPlaceholder === true,
              }"
            >
              {{ resolveDisplayedText(index, part.text) }}
            </div>

            <div v-else-if="part.type === 'note'" class="ai-conversation-message__note">
              <div class="ai-conversation-message__note-label">{{ part.label }}</div>
              <div class="ai-conversation-message__note-text">{{ part.text }}</div>
            </div>

            <div v-else-if="part.type === 'error'" class="ai-conversation-message__error">
              {{ part.text }}
            </div>

            <AiArtifactInlineCard
              v-else-if="part.type === 'artifact'"
              :artifact="resolveArtifact(part.artifactId)"
              :can-apply="artifactCanApply(part.artifactId)"
              :action-label="artifactActionLabel(part.artifactId)"
              @apply="$emit('apply-artifact', $event)"
            />
          </template>
        </template>
      </div>
    </div>
  </article>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n, formatDate } from '../../i18n'
import AiArtifactInlineCard from './AiArtifactInlineCard.vue'
import AiTaskProgressCard from './AiTaskProgressCard.vue'
import AiToolLine from './AiToolLine.vue'

const props = defineProps({
  message: { type: Object, required: true },
  artifactsById: { type: Object, default: () => ({}) },
  enabledToolIds: { type: Array, default: () => [] },
  animateLatest: { type: Boolean, default: false },
})

defineEmits(['apply-artifact'])

const { t } = useI18n()
const displayedTextMap = ref({})
const revealTimers = new Map()

function trimText(value = '') {
  return String(value || '').trim()
}

function extractAiMessageText(message = null) {
  if (!message) return ''
  if (Array.isArray(message.parts) && message.parts.length > 0) {
    return message.parts
      .filter(
        (part) =>
          part.type === 'text' ||
          part.type === 'support' ||
          part.type === 'note' ||
          part.type === 'error'
      )
      .map((part) => trimText(part.text))
      .filter(Boolean)
      .join('\n\n')
      .trim()
  }
  return trimText(message.content)
}

const displayParts = computed(() => {
  if (Array.isArray(props.message.parts) && props.message.parts.length > 0) {
    return props.message.parts
  }
  const extractedText = extractAiMessageText(props.message)
  if (props.message.role === 'assistant' && !extractedText) {
    return [{ type: 'text', text: t('Working...'), isPlaceholder: true }]
  }
  return [{ type: 'text', text: extractedText }]
})

function getAiArtifactCapability(artifact = null) {
  const type = String(artifact?.type || '').trim()
  const toolId = String(artifact?.capabilityToolId || '').trim()
  const labelKey = String(artifact?.capabilityLabelKey || '').trim()
  if (!type || !toolId) return null
  return {
    artifactType: type,
    toolId,
    labelKey,
  }
}

function canApplyAiArtifact(artifact = null, enabledToolIds = []) {
  const capability = getAiArtifactCapability(artifact)
  return !!capability && Array.isArray(enabledToolIds) && enabledToolIds.includes(capability.toolId)
}

const messageText = computed(() => extractAiMessageText(props.message))
const skillId = computed(() => String(props.message?.metadata?.skillId || '').trim())
const contextChips = computed(() =>
  (Array.isArray(props.message?.metadata?.contextChips)
    ? props.message.metadata.contextChips
    : []
  ).filter((chip) => chip && chip.value)
)
const showContextMetadata = computed(
  () => props.message?.role === 'assistant' && contextChips.value.length > 0
)
const taskProgressTasks = computed(() => {
  return displayParts.value
    .filter((part) => part?.type === 'tool')
    .filter((part) => {
      const toolName = String(part?.payload?.toolName || part.label || '').trim()
      return ['taskcreate', 'taskupdate', 'todowrite'].includes(toolName.toLowerCase())
    })
    .map((part) => ({
      id: part.toolId,
      label: part.detail || part.context || part.label,
      status: part.status,
    }))
})
const formattedTime = computed(() =>
  props.message.createdAt
    ? formatDate(props.message.createdAt, { hour: '2-digit', minute: '2-digit' })
    : ''
)

const textPartSignature = computed(() =>
  displayParts.value
    .map((part, index) => (part.type === 'text' ? `${index}:${part.text}` : ''))
    .join('|')
)

function resolveArtifact(artifactId = '') {
  return props.artifactsById[String(artifactId || '').trim()] || null
}

function artifactCanApply(artifactId = '') {
  const artifact = resolveArtifact(artifactId)
  return canApplyAiArtifact(artifact, props.enabledToolIds)
}

function artifactActionLabel(artifactId = '') {
  const artifact = resolveArtifact(artifactId)
  const capability = getAiArtifactCapability(artifact)
  return capability ? t(capability.labelKey) : ''
}

function clearRevealTimer(index) {
  const timer = revealTimers.get(index)
  if (timer) {
    clearTimeout(timer)
    revealTimers.delete(index)
  }
}

function updateDisplayedText(index, text) {
  displayedTextMap.value = {
    ...displayedTextMap.value,
    [index]: text,
  }
}

function animateText(index, fullText = '') {
  clearRevealTimer(index)

  if (!props.animateLatest || !fullText) {
    updateDisplayedText(index, fullText)
    return
  }

  const existing = String(displayedTextMap.value[index] || '')
  const tokens = fullText.match(/\S+\s*|\s+/g) || [fullText]
  const step = Math.max(1, Math.ceil(tokens.length / 24))
  let cursor =
    existing && fullText.startsWith(existing)
      ? Math.max(step, Math.ceil((existing.length / Math.max(fullText.length, 1)) * tokens.length))
      : 0

  const tick = () => {
    cursor = Math.min(tokens.length, cursor + step)
    updateDisplayedText(index, tokens.slice(0, cursor).join(''))

    if (cursor < tokens.length) {
      const timer = setTimeout(tick, 24)
      revealTimers.set(index, timer)
      return
    }

    clearRevealTimer(index)
  }

  tick()
}

function syncDisplayedText() {
  for (const [index] of revealTimers) {
    if (!displayParts.value[index] || displayParts.value[index].type !== 'text') {
      clearRevealTimer(index)
    }
  }

  for (const [index, part] of displayParts.value.entries()) {
    if (part.type !== 'text') continue
    const fullText = String(part.text || '')
    if (!props.animateLatest) {
      clearRevealTimer(index)
      updateDisplayedText(index, fullText)
      continue
    }

    if (displayedTextMap.value[index] === fullText) continue
    animateText(index, fullText)
  }
}

function resolveDisplayedText(index, fallbackText = '') {
  return displayedTextMap.value[index] ?? fallbackText
}

watch(
  () => [textPartSignature.value, props.animateLatest],
  () => {
    syncDisplayedText()
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  for (const [index] of revealTimers) {
    clearRevealTimer(index)
  }
})
</script>

<style scoped>
.ai-conversation-message {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ai-conversation-message__meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--text-secondary);
}

.ai-conversation-message__role {
  font-weight: 600;
  color: var(--text-tertiary);
}

.ai-conversation-message__meta-separator,
.ai-conversation-message__time {
  color: var(--text-tertiary);
}

.ai-conversation-message__context {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.ai-conversation-message__body {
  display: flex;
}

.ai-conversation-message__body--user {
  justify-content: flex-end;
}

.ai-conversation-message__body--assistant {
  justify-content: stretch;
}

.ai-conversation-message__surface {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.ai-conversation-message__surface--assistant {
  width: 100%;
  padding: 2px 0;
  background: transparent;
  border: none;
}

.ai-conversation-message__surface--user {
  max-width: 92%;
  padding: 2px 0;
  background: transparent;
  border: none;
}

.ai-conversation-message__user-text,
.ai-conversation-message__response,
.ai-conversation-message__support-body,
.ai-conversation-message__note-text,
.ai-conversation-message__error {
  font-size: 13px;
  line-height: 1.58;
  white-space: pre-wrap;
  word-break: break-word;
}

.ai-conversation-message__user-text,
.ai-conversation-message__response {
  color: var(--text-primary);
}

.ai-conversation-message__user-text {
  color: color-mix(in srgb, var(--text-primary) 88%, var(--text-secondary) 12%);
}

.ai-conversation-message__support {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 2px 0 2px 10px;
  background: transparent;
  border-left: 1px solid color-mix(in srgb, var(--border-color) 42%, transparent);
}

.ai-conversation-message__support summary {
  cursor: pointer;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-tertiary);
  list-style: none;
}

.ai-conversation-message__support summary::-webkit-details-marker {
  display: none;
}

.ai-conversation-message__pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  padding: 3px 7px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--border-color) 32%, transparent);
  background: color-mix(in srgb, var(--panel-muted) 8%, transparent);
  font-size: 10px;
  line-height: 1.4;
  color: var(--text-secondary);
}

.ai-conversation-message__pill--accent {
  border-color: color-mix(in srgb, var(--accent) 28%, var(--border-color) 72%);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  color: var(--text-primary);
}

.ai-conversation-message__pill--context {
  align-items: baseline;
  flex-wrap: wrap;
}

.ai-conversation-message__pill-label {
  color: var(--text-tertiary);
}

.ai-conversation-message__pill-value {
  color: var(--text-secondary);
}

.ai-conversation-message__note {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 8px 10px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--panel-muted) 26%, transparent);
}

.ai-conversation-message__note-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-secondary);
}

.ai-conversation-message__error {
  padding: 8px 10px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--error) 8%, transparent);
  color: var(--error);
}

.ai-conversation-message__response--placeholder {
  color: var(--text-tertiary);
  font-style: italic;
}
</style>
