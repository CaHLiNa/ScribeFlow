<template>
  <div class="rich-input-root" @click="focusEditor">
    <!-- ContentEditable editor -->
    <div
      ref="editorRef"
      class="rich-editor"
      :class="{ 'rich-editor-disabled': disabled }"
      :contenteditable="disabled ? 'false' : 'true'"
      :data-placeholder="placeholder"
      spellcheck="false"
      autocorrect="off"
      autocomplete="off"
      autocapitalize="off"
      data-gramm="false"
      @input="onInput"
      @keydown="onKeydown"
      @paste="onPaste"
      @focus="emit('focus')"
      @blur="emit('blur')"
    ></div>

    <!-- File ref popover (Teleported to avoid overflow clipping) -->
    <Teleport to="body">
      <div v-if="showPopover" class="fixed z-[100]" :style="popoverPos" @mousedown.prevent>
        <FileRefPopover
          ref="popoverRef"
          :filter="popoverFilter"
          :models="props.models"
          @select="onFileSelect"
          @select-model="handleModelSelect"
          @close="closePopover"
        />
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, nextTick } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { getViewerType } from '../../utils/fileTypes'
import FileRefPopover from './FileRefPopover.vue'

const props = defineProps({
  placeholder: { type: String, default: 'Message... (@ to attach files)' },
  disabled: { type: Boolean, default: false },
  models: { type: Array, default: () => [] }, // { id, name }[] for @-model switching
  onModelSelect: { type: Function, default: null }, // callback(modelId) — avoids emit chain
})

const emit = defineEmits(['submit', 'input', 'focus', 'blur'])

const editorRef = ref(null)
const popoverRef = ref(null)

// @ popover state
const showPopover = ref(false)
const popoverFilter = ref('')
const popoverPos = ref({})

// Saved Range start for the @ trigger (so we know where to insert the pill)
// { node: TextNode, offset: number } — the index of the '@' trigger character
let atTriggerAnchor = null

// Context pill data (stored separately since it's structured data, not file content)
// We track context pill references as {el, context} so extractPayload can retrieve them
const contextPills = ref([])

// ─── Public API ──────────────────────────────────────────────────────────────

function focus() {
  nextTick(() => editorRef.value?.focus())
}

function clear() {
  if (editorRef.value) editorRef.value.innerHTML = ''
  contextPills.value = []
  emit('input')
}

function isEmpty() {
  const el = editorRef.value
  if (!el) return true
  // Empty if no text nodes with content and no pills
  return el.textContent.trim() === '' && el.querySelectorAll('.rich-pill').length === 0
}

/**
 * Extract { text, fileRefs, context } for sending.
 * Walks the DOM to gather text + pill data without mutating the inline pill markup.
 */
function extractPayload() {
  const el = editorRef.value
  if (!el) return { text: '', fileRefs: [], context: null }

  const fileRefs = []
  let context = null
  const textParts = []

  function walk(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      textParts.push(node.textContent)
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const type = node.dataset?.type
      if (type === 'mention') {
        const path = node.dataset.path
        const name = node.dataset.name
        const content = node._loadedContent || ''
        fileRefs.push({ path, content })
        textParts.push(`@${name}`)
      } else if (type === 'context') {
        // Context pill — retrieve stored context object
        context = node._contextData || null
      } else if (node.tagName === 'BR') {
        textParts.push('\n')
      } else {
        for (const child of node.childNodes) walk(child)
      }
    }
  }

  for (const child of el.childNodes) walk(child)

  // Strip trailing BR that browsers add
  let text = textParts.join('')
  // Trim only trailing whitespace/newlines
  text = text.replace(/[\n\r]+$/, '').trim()

  return { text, fileRefs, context }
}

/**
 * Programmatically trigger @ mention (called by parent's @ button).
 */
function triggerAtMention() {
  const el = editorRef.value
  if (!el || props.disabled) return
  el.focus()

  nextTick(() => {
    const sel = window.getSelection()
    if (!sel) return

    // Ensure we have a range in the editor
    if (!sel.rangeCount) {
      const r = document.createRange()
      r.selectNodeContents(el)
      r.collapse(false)
      sel.removeAllRanges()
      sel.addRange(r)
    }

    const range = sel.getRangeAt(0)

    // Determine if we need a leading space
    let prefix = ''
    if (range.startContainer.nodeType === Node.TEXT_NODE) {
      const text = range.startContainer.textContent
      const offset = range.startOffset
      const charBefore = offset > 0 ? text[offset - 1] : null
      if (charBefore && !/\s/.test(charBefore)) prefix = ' '
    } else if (range.startOffset > 0) {
      // Cursor after a pill or other element — add space
      prefix = ' '
    }

    const textToInsert = prefix + '@'
    const textNode = document.createTextNode(textToInsert)
    range.deleteContents()
    range.insertNode(textNode)

    // Move cursor to end of inserted text
    const newRange = document.createRange()
    newRange.setStartAfter(textNode)
    newRange.collapse(true)
    sel.removeAllRanges()
    sel.addRange(newRange)

    // Record the '@' position and open popover
    atTriggerAnchor = { node: textNode, offset: textNode.length - 1 }
    popoverFilter.value = ''
    openPopover()

    emit('input')
  })
}

/**
 * Insert an inline context pill (text selection from editor).
 * Inserted at the current cursor position (or start if editor is empty).
 */
function insertContextPill(context) {
  const el = editorRef.value
  if (!el || props.disabled) return

  // Remove any existing context pill first (only one at a time)
  const existing = el.querySelector('[data-type="context"]')
  if (existing) existing.remove()

  el.focus()

  const pill = buildContextPillEl(context)
  // Store the context data on the element so extractPayload can retrieve it
  pill._contextData = context

  const sel = window.getSelection()
  if (!sel || !sel.rangeCount) {
    // No selection — prepend to editor
    el.insertBefore(pill, el.firstChild)
    // Add a space after
    const space = document.createTextNode(' ')
    pill.after(space)
  } else {
    const range = sel.getRangeAt(0)
    range.deleteContents()
    range.insertNode(pill)
    const space = document.createTextNode(' ')
    pill.after(space)
    const newRange = document.createRange()
    newRange.setStart(space, space.length) // cursor INSIDE text node so pill detection works
    newRange.collapse(true)
    sel.removeAllRanges()
    sel.addRange(newRange)
  }

  emit('input')
}

/**
 * Insert plain text at the current cursor (or append if no cursor).
 * Used by parent to pre-fill suggestion text.
 */
function setText(text) {
  const el = editorRef.value
  if (!el) return
  el.focus()
  // Clear existing content and set plain text
  el.innerHTML = ''
  const textNode = document.createTextNode(text)
  el.appendChild(textNode)
  // Move cursor to end
  const range = document.createRange()
  range.setStartAfter(textNode)
  range.collapse(true)
  const sel = window.getSelection()
  sel?.removeAllRanges()
  sel?.addRange(range)
  emit('input')
}

/**
 * Insert one or more file mention pills at the current cursor.
 * If the editor is not focused, append them at the end instead.
 */
async function insertFileMentions(files = []) {
  const el = editorRef.value
  if (!el || props.disabled) return 0

  const existingPaths = new Set(
    [...el.querySelectorAll('[data-type="mention"]')]
      .map((node) => node.dataset.path)
      .filter(Boolean)
  )
  const uniqueFiles = files.filter((file) => {
    const path = file?.path
    if (!path || existingPaths.has(path)) return false
    existingPaths.add(path)
    return true
  })
  if (!uniqueFiles.length) return 0

  el.focus()

  const sel = window.getSelection()
  let range = null
  if (sel?.rangeCount) {
    const currentRange = sel.getRangeAt(0)
    const container = currentRange.startContainer
    if (container === el || el.contains(container)) {
      range = currentRange.cloneRange()
    }
  }
  if (!range) {
    range = document.createRange()
    range.selectNodeContents(el)
    range.collapse(false)
  }

  range.deleteContents()

  const inserted = []
  for (const file of uniqueFiles) {
    const pill = buildMentionPillEl(file)
    range.insertNode(pill)
    const spaceNode = document.createTextNode('\u00a0')
    pill.after(spaceNode)
    range.setStart(spaceNode, spaceNode.length)
    range.collapse(true)
    inserted.push({ pill, file })
  }

  sel?.removeAllRanges()
  sel?.addRange(range)

  emit('input')
  await Promise.all(inserted.map(({ pill, file }) => loadPillContent(pill, file)))
  emit('input')
  return inserted.length
}

/**
 * Return a sanitized snapshot of the editor HTML for rendering in sent messages.
 * Strips contenteditable and loading-state attributes so pills render cleanly.
 */
function getSerializedHtml() {
  const el = editorRef.value
  if (!el) return ''
  const clone = el.cloneNode(true)
  for (const node of clone.querySelectorAll('[contenteditable]')) {
    node.removeAttribute('contenteditable')
  }
  for (const node of clone.querySelectorAll('[data-loading]')) {
    node.removeAttribute('data-loading')
  }
  return clone.innerHTML
}

defineExpose({
  focus,
  clear,
  isEmpty,
  extractPayload,
  triggerAtMention,
  insertContextPill,
  insertFileMentions,
  setText,
  getSerializedHtml,
})

// ─── Internal: Event handlers ────────────────────────────────────────────────

function focusEditor() {
  const el = editorRef.value
  if (!el || props.disabled) return
  // Only focus if the click wasn't on a pill (pills are non-editable)
  el.focus()
}

function onInput() {
  if (showPopover.value) {
    updatePopoverFilter()
  } else {
    detectAtTrigger()
  }
  emit('input')
}

function onKeydown(e) {
  // Route keys to popover when it's open
  if (showPopover.value) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      popoverRef.value?.selectNext()
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      popoverRef.value?.selectPrev()
      return
    }
    if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') {
      e.preventDefault()
      popoverRef.value?.confirmSelection()
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      closePopover()
      return
    }
    // Other keys fall through to update filter text
  }

  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    if (showPopover.value) {
      closePopover()
      return
    }
    emit('submit')
    return
  }

  if (e.key === 'Enter' && e.shiftKey) {
    e.preventDefault()
    insertNewline()
    return
  }

  if (e.key === 'Escape') {
    editorRef.value?.blur()
    return
  }

  // Backspace: if cursor is immediately after a pill (or in trailing whitespace after it), delete the pill
  if (e.key === 'Backspace') {
    const pill = getPillBeforeCursor()
    if (pill) {
      e.preventDefault()
      const sel = window.getSelection()
      const range = sel?.getRangeAt(0)
      // If cursor is in a trailing whitespace-only text node, remove it too
      const trailingNode =
        range?.startContainer.nodeType === Node.TEXT_NODE &&
        /^\s*$/.test(range.startContainer.textContent)
          ? range.startContainer
          : null
      // Reposition cursor to end of node before the pill
      const before = pill.previousSibling
      if (trailingNode) trailingNode.remove()
      pill.remove()
      if (before?.nodeType === Node.TEXT_NODE && sel) {
        const r = document.createRange()
        r.setStart(before, before.length)
        r.collapse(true)
        sel.removeAllRanges()
        sel.addRange(r)
      }
      emit('input')
    }
    return
  }

  // Delete (forward): if cursor is immediately before a pill, delete it
  if (e.key === 'Delete') {
    const pill = getPillAfterCursor()
    if (pill) {
      e.preventDefault()
      pill.remove()
      emit('input')
    }
  }
}

function onPaste(e) {
  e.preventDefault()
  const text = e.clipboardData.getData('text/plain')
  if (!text) return

  const sel = window.getSelection()
  if (!sel || !sel.rangeCount) return
  const range = sel.getRangeAt(0)
  range.deleteContents()

  const textNode = document.createTextNode(text)
  range.insertNode(textNode)
  const newRange = document.createRange()
  newRange.setStartAfter(textNode)
  newRange.collapse(true)
  sel.removeAllRanges()
  sel.addRange(newRange)

  emit('input')
}

// ─── Internal: Newline insertion ─────────────────────────────────────────────

function insertNewline() {
  const sel = window.getSelection()
  if (!sel || !sel.rangeCount) return
  const range = sel.getRangeAt(0)
  range.deleteContents()

  const br = document.createElement('br')
  range.insertNode(br)

  // WebKit quirk: a <br> at the very end of a contenteditable doesn't visually
  // create a new line — the cursor appears to stay on the same line until
  // something follows. Add a sentinel <br> in that case so the cursor lands
  // on an actual new line.
  let next = br.nextSibling
  while (next && next.nodeType === Node.TEXT_NODE && next.textContent === '') {
    next = next.nextSibling
  }

  const newRange = document.createRange()
  if (!next) {
    const sentinel = document.createElement('br')
    br.after(sentinel)
    newRange.setStartBefore(sentinel)
  } else {
    newRange.setStartAfter(br)
  }
  newRange.collapse(true)
  sel.removeAllRanges()
  sel.addRange(newRange)

  // Scroll cursor into view — programmatic range changes don't auto-scroll.
  nextTick(() => br.scrollIntoView({ block: 'nearest', behavior: 'instant' }))

  emit('input')
}

// ─── Internal: @ trigger detection ───────────────────────────────────────────

function detectAtTrigger() {
  const sel = window.getSelection()
  if (!sel || !sel.isCollapsed || !sel.rangeCount) return

  const range = sel.getRangeAt(0)
  const node = range.startContainer
  const offset = range.startOffset

  if (node.nodeType !== Node.TEXT_NODE) return

  const text = node.textContent
  // The character just typed is at offset - 1
  if (offset < 1 || text[offset - 1] !== '@') return

  // Must be preceded by start-of-node or whitespace
  const charBefore = offset >= 2 ? text[offset - 2] : null
  if (charBefore !== null && !/\s/.test(charBefore)) return

  // Record the position of '@' (index offset - 1 in this text node)
  atTriggerAnchor = { node, offset: offset - 1 }
  popoverFilter.value = ''
  openPopover()
}

function updatePopoverFilter() {
  if (!atTriggerAnchor) {
    closePopover()
    return
  }

  const sel = window.getSelection()
  if (!sel || !sel.isCollapsed || !sel.rangeCount) {
    closePopover()
    return
  }

  const range = sel.getRangeAt(0)
  const { node: triggerNode, offset: triggerOffset } = atTriggerAnchor

  // If cursor moved to a different node, close popover
  if (range.startContainer !== triggerNode) {
    closePopover()
    return
  }

  const filterText = triggerNode.textContent.substring(triggerOffset + 1, range.startOffset)

  // Close if whitespace is in the filter
  if (filterText.includes(' ') || filterText.includes('\n')) {
    closePopover()
    return
  }

  popoverFilter.value = filterText
}

// ─── Internal: @ popover ─────────────────────────────────────────────────────

function openPopover() {
  // Position above the editor (like file popover in ChatInput)
  const el = editorRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  popoverPos.value = {
    bottom: window.innerHeight - rect.top + 4 + 'px',
    left: rect.left + 'px',
    width: rect.width + 'px',
  }
  showPopover.value = true
}

function closePopover() {
  showPopover.value = false
  atTriggerAnchor = null
  popoverFilter.value = ''
}

async function onFileSelect(file) {
  if (!atTriggerAnchor) {
    closePopover()
    return
  }

  const { node: triggerNode, offset: triggerOffset } = atTriggerAnchor

  // Get current cursor position
  const sel = window.getSelection()
  if (!sel || !sel.rangeCount) {
    closePopover()
    return
  }
  const curRange = sel.getRangeAt(0)

  // Build range from @ to current cursor and delete it
  const deleteRange = document.createRange()
  deleteRange.setStart(triggerNode, triggerOffset)
  // End is wherever the cursor is (might be same text node at a later offset)
  if (curRange.startContainer === triggerNode) {
    deleteRange.setEnd(triggerNode, curRange.startOffset)
  } else {
    deleteRange.setEnd(curRange.startContainer, curRange.startOffset)
  }
  deleteRange.deleteContents()

  // Build and insert the pill
  const pill = buildMentionPillEl(file)
  deleteRange.insertNode(pill)

  // Move cursor to just after the pill, then add a space so the user can keep typing
  const newRange = document.createRange()
  newRange.setStartAfter(pill)
  newRange.collapse(true)
  sel.removeAllRanges()
  sel.addRange(newRange)

  // Insert a trailing space so the next character doesn't merge into the pill
  const spaceNode = document.createTextNode('\u00a0') // non-breaking space for clean separation
  newRange.insertNode(spaceNode)
  const afterSpace = document.createRange()
  afterSpace.setStart(spaceNode, spaceNode.length) // cursor INSIDE text node so pill detection works
  afterSpace.collapse(true)
  sel.removeAllRanges()
  sel.addRange(afterSpace)

  closePopover()
  emit('input')

  // Load file content asynchronously
  await loadPillContent(pill, file)
  emit('input')
}

function handleModelSelect(modelId) {
  if (atTriggerAnchor) {
    const { node: triggerNode, offset: triggerOffset } = atTriggerAnchor
    const sel = window.getSelection()
    if (sel && sel.rangeCount) {
      const curRange = sel.getRangeAt(0)
      const deleteRange = document.createRange()
      deleteRange.setStart(triggerNode, triggerOffset)
      if (curRange.startContainer === triggerNode) {
        deleteRange.setEnd(triggerNode, curRange.startOffset)
      } else {
        deleteRange.setEnd(curRange.startContainer, curRange.startOffset)
      }
      deleteRange.deleteContents()
    }
  }
  closePopover()
  emit('input')
  props.onModelSelect?.(modelId)
}

// ─── Internal: Pill building ──────────────────────────────────────────────────

function buildMentionPillEl(file) {
  const name = file.name || file.path.split('/').pop()
  const displayName = name.length > 24 ? name.slice(0, 22) + '…' : name

  const pill = document.createElement('span')
  pill.className = 'rich-pill'
  pill.dataset.type = 'mention'
  pill.dataset.path = file.path
  pill.dataset.name = name
  pill.dataset.loading = 'true'
  pill.contentEditable = 'false'
  pill.title = file.path

  // File icon SVG
  pill.innerHTML = `
    <svg class="rich-pill-icon" width="10" height="10" viewBox="0 0 16 16" fill="none"
      stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M9 2H4a1 1 0 00-1 1v10a1 1 0 001 1h8a1 1 0 001-1V6L9 2z"/>
      <path d="M9 2v4h4"/>
    </svg>
    <span class="rich-pill-name">${escapeHtml(displayName)}</span>
  `.trim()

  pill._loadedContent = ''
  return pill
}

function buildContextPillEl(context) {
  const text = (context.text || '').replace(/\s+/g, ' ').trim()
  const display = text.length > 32 ? text.slice(0, 30) + '…' : text

  const pill = document.createElement('span')
  pill.className = 'rich-pill rich-pill-context'
  pill.dataset.type = 'context'
  pill.contentEditable = 'false'
  pill.title = text

  pill.innerHTML = `
    <svg width="10" height="10" viewBox="0 0 16 16" fill="none"
      stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M6 3l-4 5 4 5M10 3l4 5-4 5"/>
    </svg>
    <span>${escapeHtml(display)}</span>
  `.trim()

  return pill
}

// ─── Internal: File content loading ──────────────────────────────────────────

async function loadPillContent(pill, file) {
  try {
    if (typeof file?.content === 'string') {
      pill._loadedContent =
        file.content.length > 50000
          ? file.content.slice(0, 50000) + '\n... [truncated at 50KB]'
          : file.content
      pill.dataset.loading = 'false'
      return
    }
    let content
    const viewerType = getViewerType(file.path)
    if (viewerType === 'unsupported-binary') {
      content = `[Binary file not loaded: ${file.path.split('/').pop() || file.path}]`
    } else {
      content = await invoke('read_file', { path: file.path })
    }
    pill._loadedContent =
      content.length > 50000 ? content.slice(0, 50000) + '\n... [truncated at 50KB]' : content
    pill.dataset.loading = 'false'
  } catch (e) {
    pill._loadedContent = `[Error reading file: ${e}]`
    pill.dataset.loading = 'error'
  }
}

// ─── Internal: Pill-adjacent cursor helpers ───────────────────────────────────

/** Returns the pill element immediately before the cursor, or null. */
function getPillBeforeCursor() {
  const sel = window.getSelection()
  if (!sel || !sel.isCollapsed || !sel.rangeCount) return null
  const range = sel.getRangeAt(0)

  let candidate = null
  if (range.startOffset === 0) {
    // Cursor at start of a node — check the previous sibling
    candidate = range.startContainer.previousSibling
  } else if (range.startContainer === editorRef.value) {
    // Cursor directly in editor div — check child at startOffset - 1
    candidate = range.startContainer.childNodes[range.startOffset - 1]
  } else if (range.startContainer.nodeType === Node.TEXT_NODE) {
    if (range.startOffset === 0) {
      candidate = range.startContainer.previousSibling
    } else if (/^\s*$/.test(range.startContainer.textContent)) {
      // Cursor anywhere inside a whitespace-only text node (the trailing space after a pill)
      candidate = range.startContainer.previousSibling
    }
  }

  if (candidate && candidate.nodeType === Node.ELEMENT_NODE && candidate.dataset?.type) {
    return candidate
  }
  return null
}

/** Returns the pill element immediately after the cursor, or null. */
function getPillAfterCursor() {
  const sel = window.getSelection()
  if (!sel || !sel.isCollapsed || !sel.rangeCount) return null
  const range = sel.getRangeAt(0)

  let candidate = null
  if (range.startContainer === editorRef.value) {
    candidate = range.startContainer.childNodes[range.startOffset]
  } else if (range.startContainer.nodeType === Node.TEXT_NODE) {
    const text = range.startContainer.textContent
    if (range.startOffset === text.length) {
      candidate = range.startContainer.nextSibling
    }
  }

  if (candidate && candidate.nodeType === Node.ELEMENT_NODE && candidate.dataset?.type) {
    return candidate
  }
  return null
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
</script>

<style scoped>
.rich-input-root {
  width: 100%;
  cursor: text;
}

.rich-editor {
  max-height: 12rem;
  overflow-y: auto;
  outline: none;
}

.rich-editor-disabled {
  opacity: 0.5;
  pointer-events: none;
}
</style>
