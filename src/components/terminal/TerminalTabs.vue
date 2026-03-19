<template>
  <div class="terminal-tabs flex min-w-0 items-center border-b">
    <div ref="tabsContainerRef" class="terminal-tabs-scroll relative flex min-w-0 flex-1 items-stretch overflow-x-auto scrollbar-hidden">
      <div
        v-for="(instance, index) in instances"
        :key="instance.id"
        :ref="(element) => setTabRef(instance.id, element)"
        class="terminal-tab group"
        :class="{
          'is-active': instance.id === activeInstanceId,
          'is-dragging': dragIndex === index,
          'is-tool': isToolInstance(instance),
        }"
        :title="instance.cwd || instance.label"
        role="button"
        tabindex="0"
        @mousedown="onMouseDown(index, $event)"
        @mouseenter="onMouseEnter(index)"
        @click="emit('activate', instance.id)"
        @keydown.enter.prevent="emit('activate', instance.id)"
        @keydown.space.prevent="emit('activate', instance.id)"
        @contextmenu.prevent="emit('tab-contextmenu', { event: $event, instanceId: instance.id })"
        @dblclick="startRename(instance)"
      >
        <span class="terminal-tab-accent" />
        <span class="terminal-tab-badge" :class="badgeClass(instance)">
          {{ badgeText(instance) }}
        </span>

        <div class="terminal-tab-copy min-w-0 flex-1">
          <template v-if="renameInstanceId === instance.id">
            <input
              ref="renameInputRef"
              v-model="renameValue"
              class="terminal-tab-input"
              @keydown.enter.prevent="finishRename"
              @keydown.escape.prevent="cancelRename"
              @blur="finishRename"
              @click.stop
            />
          </template>
          <template v-else>
            <span class="terminal-tab-label truncate">{{ instance.label }}</span>
          </template>
        </div>

        <span class="terminal-tab-status" :class="statusClass(instance)" />

        <button class="terminal-tab-close" type="button" @click.stop="emit('close', instance.id)">
          <IconX :size="12" :stroke-width="1.8" />
        </button>
      </div>

      <button class="terminal-inline-action" type="button" :title="t('New terminal')" @click="emit('new')">
        <IconPlus :size="13" :stroke-width="1.8" />
      </button>

      <div v-if="dropIndicatorLeft !== null" class="terminal-tab-drop" :style="{ left: `${dropIndicatorLeft}px` }" />
    </div>

    <div class="terminal-actions flex shrink-0 items-center">
      <button class="terminal-action-btn" type="button" :title="t('New terminal')" @click="emit('new')">
        <IconPlus :size="14" :stroke-width="1.8" />
      </button>
      <button class="terminal-action-btn" type="button" :disabled="!activeInstanceId" :title="t('Split terminal')" @click="emit('split')">
        <IconColumns :size="14" :stroke-width="1.8" />
      </button>
      <button class="terminal-action-btn" type="button" :disabled="!activeInstanceId" :title="t('Find')" @click="emit('find')">
        <IconSearch :size="14" :stroke-width="1.8" />
      </button>
      <button class="terminal-action-btn" type="button" :disabled="!activeInstanceId" :title="t('Clear')" @click="emit('clear')">
        <IconClearAll :size="14" :stroke-width="1.8" />
      </button>
      <button class="terminal-action-btn is-danger" type="button" :disabled="!activeInstanceId" :title="t('Kill terminal')" @click="emit('kill')">
        <IconTrash :size="14" :stroke-width="1.8" />
      </button>
      <button class="terminal-action-btn" type="button" :title="t('Close terminal panel')" @click="emit('panel-close')">
        <IconChevronDown :size="14" :stroke-width="1.8" />
      </button>
    </div>

    <Teleport to="body">
      <div v-if="ghostVisible" class="terminal-tab-ghost" :style="{ left: `${ghostX}px`, top: `${ghostY}px` }">
        {{ ghostLabel }}
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { nextTick, ref } from 'vue'
import {
  IconChevronDown,
  IconClearAll,
  IconColumns,
  IconPlus,
  IconSearch,
  IconTrash,
  IconX,
} from '@tabler/icons-vue'
import { useI18n } from '../../i18n'

const props = defineProps({
  instances: {
    type: Array,
    default: () => [],
  },
  activeInstanceId: {
    type: Number,
    default: null,
  },
})

const emit = defineEmits([
  'activate',
  'close',
  'rename',
  'new',
  'split',
  'find',
  'clear',
  'kill',
  'panel-close',
  'reorder',
  'tab-contextmenu',
])

const { t } = useI18n()
const tabsContainerRef = ref(null)
const renameInputRef = ref(null)
const renameInstanceId = ref(null)
const renameValue = ref('')
const tabElements = new Map()
const dragIndex = ref(-1)
const dragOverIndex = ref(-1)
const dropIndicatorLeft = ref(null)
const ghostVisible = ref(false)
const ghostX = ref(0)
const ghostY = ref(0)
const ghostLabel = ref('')
let mouseDownStart = null
let dragging = false

function setTabRef(id, element) {
  if (element) tabElements.set(id, element)
  else tabElements.delete(id)
}

function tabElementByIndex(index) {
  const instance = props.instances[index]
  return instance ? tabElements.get(instance.id) || null : null
}

function badgeFor(instance) {
  if (instance.key === 'tool-latex-terminal') return { text: 'TEX', tone: 'latex' }
  if (instance.key === 'tool-typst-terminal') return { text: 'TYP', tone: 'typst' }
  if (instance.key === 'shared-shell-terminal') return { text: 'SH', tone: 'shell' }
  if (instance.key === 'shared-build-terminal') return { text: 'LOG', tone: 'log' }
  if (instance.kind === 'repl') {
    if (instance.language === 'python') return { text: 'PY', tone: 'python' }
    if (instance.language === 'julia') return { text: 'JL', tone: 'julia' }
    if (instance.language === 'r') return { text: 'R', tone: 'r' }
  }
  if (instance.kind === 'log') return { text: 'LOG', tone: 'log' }
  return { text: 'TERM', tone: 'shell' }
}

function badgeText(instance) {
  return badgeFor(instance).text
}

function badgeClass(instance) {
  return `tone-${badgeFor(instance).tone}`
}

function isToolInstance(instance) {
  return instance.key === 'tool-latex-terminal'
    || instance.key === 'tool-typst-terminal'
    || instance.key === 'shared-build-terminal'
}

function statusClass(instance) {
  if (instance.status === 'busy') return 'is-busy'
  if (instance.status === 'error' || instance.status === 'exited' || (instance.lastExitCode ?? 0) > 0) return 'is-error'
  if (instance.status === 'success' || (instance.lastExitCode === 0 && instance.commandMarkers?.length)) return 'is-success'
  return 'is-idle'
}

function startRename(instance) {
  renameInstanceId.value = instance.id
  renameValue.value = instance.label
  nextTick(() => {
    const input = Array.isArray(renameInputRef.value) ? renameInputRef.value[0] : renameInputRef.value
    input?.focus?.()
    input?.select?.()
  })
}

function finishRename() {
  if (renameInstanceId.value !== null && renameValue.value.trim()) {
    emit('rename', { instanceId: renameInstanceId.value, label: renameValue.value.trim() })
  }
  renameInstanceId.value = null
}

function cancelRename() {
  renameInstanceId.value = null
}

function updateDropIndicator(mouseX) {
  if (!tabsContainerRef.value) return

  const containerRect = tabsContainerRef.value.getBoundingClientRect()
  let bestIndex = -1
  let bestDistance = Infinity

  for (let index = 0; index <= props.instances.length; index += 1) {
    let edgeX
    if (index === 0) {
      edgeX = tabElementByIndex(0)?.getBoundingClientRect().left
    } else {
      edgeX = tabElementByIndex(index - 1)?.getBoundingClientRect().right
    }
    if (typeof edgeX !== 'number') continue
    const distance = Math.abs(mouseX - edgeX)
    if (distance < bestDistance) {
      bestDistance = distance
      bestIndex = index
    }
  }

  if (bestIndex === -1 || bestIndex === dragIndex.value || bestIndex === dragIndex.value + 1) {
    dropIndicatorLeft.value = null
    dragOverIndex.value = -1
    return
  }

  const edgeX = bestIndex === 0
    ? tabElementByIndex(0)?.getBoundingClientRect().left
    : tabElementByIndex(bestIndex - 1)?.getBoundingClientRect().right
  dropIndicatorLeft.value = (edgeX || 0) - containerRect.left - 1
  dragOverIndex.value = bestIndex > dragIndex.value ? bestIndex - 1 : bestIndex
}

function onMouseDown(index, event) {
  if (renameInstanceId.value === props.instances[index]?.id) return
  mouseDownStart = { index, x: event.clientX, y: event.clientY }
  dragging = false

  function onMove(moveEvent) {
    if (!mouseDownStart) return
    if (!dragging && Math.abs(moveEvent.clientX - mouseDownStart.x) > 5) {
      dragging = true
      dragIndex.value = mouseDownStart.index
      ghostVisible.value = true
      ghostLabel.value = props.instances[mouseDownStart.index]?.label || ''
      document.body.classList.add('tab-dragging')
    }
    if (!dragging) return
    ghostX.value = moveEvent.clientX
    ghostY.value = moveEvent.clientY
    updateDropIndicator(moveEvent.clientX)
  }

  function onUp() {
    if (dragging && dragIndex.value !== -1 && dragOverIndex.value !== -1 && dragIndex.value !== dragOverIndex.value) {
      emit('reorder', { fromIndex: dragIndex.value, toIndex: dragOverIndex.value })
    }

    dragIndex.value = -1
    dragOverIndex.value = -1
    dropIndicatorLeft.value = null
    ghostVisible.value = false
    mouseDownStart = null
    dragging = false
    document.body.classList.remove('tab-dragging')
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
  }

  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

function onMouseEnter(index) {
  if (!dragging || dragIndex.value === index) return
  dragOverIndex.value = index
}
</script>

<style scoped>
.terminal-tabs {
  min-height: 34px;
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--bg-secondary) 98%, transparent),
      color-mix(in srgb, var(--bg-secondary) 92%, black 8%)
    );
  border-color: color-mix(in srgb, var(--border) 86%, transparent);
  box-shadow: inset 0 -1px 0 color-mix(in srgb, var(--border) 78%, transparent);
}

.terminal-tab,
.terminal-inline-action {
  position: relative;
  flex-shrink: 0;
  border-right: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
}

.terminal-tab {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 118px;
  max-width: 240px;
  height: 34px;
  padding: 0 10px 0 12px;
  color: var(--fg-muted);
  cursor: pointer;
  transition: background 140ms ease, color 140ms ease, opacity 140ms ease;
  outline: none;
}

.terminal-tab:hover,
.terminal-inline-action:hover {
  background: color-mix(in srgb, var(--bg-hover) 72%, transparent);
}

.terminal-tab.is-active {
  background: color-mix(in srgb, var(--bg-primary) 96%, black 4%);
  color: var(--fg-primary);
}

.terminal-tab.is-active .terminal-tab-label,
.terminal-tab.is-tool .terminal-tab-label {
  font-weight: 600;
}

.terminal-tab.is-active,
.terminal-tab:focus-visible {
  box-shadow: inset 0 2px 0 var(--accent);
}

.terminal-tab.is-dragging {
  opacity: 0.32;
}

.terminal-tab-accent {
  display: none;
}

.terminal-tab-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 16px;
  padding: 0 5px;
  border-radius: 4px;
  border: 1px solid color-mix(in srgb, var(--border) 78%, transparent);
  background: color-mix(in srgb, var(--bg-tertiary, var(--bg-secondary)) 82%, transparent);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  line-height: 1;
  color: var(--fg-muted);
}

.terminal-tab-badge.tone-shell {
  color: color-mix(in srgb, var(--fg-primary) 74%, var(--accent));
}

.terminal-tab-badge.tone-log {
  color: color-mix(in srgb, var(--warning) 84%, var(--fg-primary));
}

.terminal-tab-badge.tone-python,
.terminal-tab-badge.tone-julia,
.terminal-tab-badge.tone-r,
.terminal-tab-badge.tone-latex,
.terminal-tab-badge.tone-typst {
  border-color: color-mix(in srgb, var(--accent) 34%, var(--border));
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  color: var(--accent);
}

.terminal-tab-copy {
  min-width: 0;
}

.terminal-tab-label {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--ui-font-caption);
}

.terminal-tab-input {
  width: 100%;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: inherit;
  font-size: inherit;
  font-weight: 600;
}

.terminal-tab-status {
  margin-left: auto;
  width: 7px;
  height: 7px;
  border-radius: 999px;
  flex-shrink: 0;
  background: color-mix(in srgb, var(--fg-muted) 42%, transparent);
  transition: transform 140ms ease, background 140ms ease, box-shadow 140ms ease;
}

.terminal-tab-status.is-busy {
  background: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent);
}

.terminal-tab-status.is-success {
  background: var(--success);
}

.terminal-tab-status.is-error {
  background: var(--error);
}

.terminal-tab-close,
.terminal-inline-action,
.terminal-action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--fg-muted);
}

.terminal-tab-close {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  opacity: 0;
  transition: opacity 120ms ease, background 120ms ease, color 120ms ease;
}

.terminal-tab.is-active .terminal-tab-close,
.terminal-tab:hover .terminal-tab-close {
  opacity: 1;
}

.terminal-tab-close:hover,
.terminal-inline-action:hover,
.terminal-action-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--bg-hover) 85%, transparent);
  color: var(--fg-primary);
}

.terminal-inline-action {
  width: 34px;
  height: 34px;
}

.terminal-actions {
  gap: 2px;
  padding: 0 6px;
  border-left: 1px solid color-mix(in srgb, var(--border) 76%, transparent);
}

.terminal-action-btn {
  width: 28px;
  height: 28px;
  border-radius: 5px;
  transition: background 120ms ease, color 120ms ease, opacity 120ms ease;
}

.terminal-action-btn.is-danger:hover:not(:disabled) {
  color: var(--error);
}

.terminal-action-btn:disabled {
  opacity: 0.42;
}

.terminal-tab-drop {
  position: absolute;
  top: 5px;
  bottom: 5px;
  width: 2px;
  background: var(--accent);
  border-radius: 999px;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 20%, transparent);
}

.terminal-tab-ghost {
  position: fixed;
  z-index: 130;
  transform: translate(14px, 14px);
  pointer-events: none;
  border: 1px solid color-mix(in srgb, var(--border) 90%, transparent);
  background: color-mix(in srgb, var(--bg-secondary) 98%, transparent);
  color: var(--fg-primary);
  border-radius: 4px;
  padding: 7px 10px;
  box-shadow: 0 14px 34px rgba(0, 0, 0, 0.3);
  font-size: var(--ui-font-caption);
}
</style>
