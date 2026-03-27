<template>
  <div class="md-preview-container" ref="containerEl">
    <!-- Knitting indicator for .Rmd/.qmd -->
    <div v-if="knitting" class="md-preview-knitting">
      <div class="md-preview-knitting-dots">
        <div class="chunk-spinner-dot"></div>
        <div class="chunk-spinner-dot"></div>
        <div class="chunk-spinner-dot"></div>
      </div>
      <span>Knitting{{ knittingProgress ? ` (${knittingProgress})` : '' }}...</span>
    </div>
    <div
      v-if="loadError"
      class="md-preview-error"
    >
      <div>{{ loadError.message }}</div>
      <div v-if="loadError.detail" class="md-preview-error-detail">{{ loadError.detail }}</div>
    </div>
    <div
      v-else
      class="md-preview-content"
      v-html="renderedHtml"
      @click="handleClick"
      @dblclick="handleDoubleClick"
    ></div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useFilesStore } from '../../stores/files'
import { useEditorStore } from '../../stores/editor'
import { useWorkspaceStore } from '../../stores/workspace'
import { useDocumentWorkflowStore } from '../../stores/documentWorkflow'
import { useReferencesStore } from '../../stores/references'
import { useLinksStore } from '../../stores/links'
import { renderPreview } from '../../utils/markdownPreview'
import { revealMarkdownSourceLocation } from '../../services/markdown/reveal.js'
import { resolveMarkdownPreviewInput } from '../../domains/document/documentWorkspacePreviewAdapters.js'
import {
  clearPendingMarkdownForwardSync,
  rememberPendingMarkdownForwardSync,
  takePendingMarkdownForwardSync,
} from '../../services/markdown/previewSync.js'
import { isRmdOrQmd } from '../../utils/fileTypes'

const props = defineProps({
  filePath: { type: String, required: true },
  paneId: { type: String, required: true },
  sourcePath: { type: String, default: '' },
})

const filesStore = useFilesStore()
const editorStore = useEditorStore()
const workspace = useWorkspaceStore()
const workflowStore = useDocumentWorkflowStore()
const referencesStore = useReferencesStore()
const linksStore = useLinksStore()
const containerEl = ref(null)

const resolvedSourcePath = computed(
  () => resolveMarkdownPreviewInput(props.filePath, {
    sourcePath: props.sourcePath,
    workflowStore,
  }).sourcePath
)
const loadError = computed(() => filesStore.getFileLoadError(resolvedSourcePath.value))
const isRmd = computed(() => isRmdOrQmd(resolvedSourcePath.value))

// Knitting state
const knitting = ref(false)
const knittingProgress = ref('')
let knittedMarkdown = null  // Cache of last knitted output

// Debounced render
let renderTimer = null
const renderedHtml = ref('')
let flashTimer = null

function getSourceAnchors() {
  return [...(containerEl.value?.querySelectorAll?.('.md-preview-source-anchor[data-source-start-offset]') || [])]
}

function readAnchorLocation(element) {
  if (!element) return null
  const startOffset = Number(element.dataset.sourceStartOffset ?? -1)
  const endOffset = Number(element.dataset.sourceEndOffset ?? -1)
  const startLine = Number(element.dataset.sourceStartLine ?? -1)
  if (!Number.isFinite(startOffset) || startOffset < 0) return null
  return {
    filePath: resolvedSourcePath.value,
    line: Number.isFinite(startLine) && startLine > 0 ? startLine : 1,
    offset: startOffset,
    startOffset,
    endOffset: Number.isFinite(endOffset) && endOffset >= startOffset ? endOffset : startOffset,
  }
}

function findBestAnchor(detail = {}) {
  const anchors = getSourceAnchors()
  if (anchors.length === 0) return null

  const targetOffset = Number(detail.offset ?? -1)
  const targetLine = Number(detail.line ?? -1)

  if (Number.isFinite(targetOffset) && targetOffset >= 0) {
    const containing = anchors
      .map(element => ({
        element,
        start: Number(element.dataset.sourceStartOffset ?? -1),
        end: Number(element.dataset.sourceEndOffset ?? -1),
      }))
      .filter(({ start, end }) => start >= 0 && end >= start)
      .filter(({ start, end }) => targetOffset >= start && targetOffset <= end)
      .sort((left, right) => ((left.end - left.start) - (right.end - right.start)))

    if (containing[0]?.element) return containing[0].element

    const nearestBefore = anchors
      .map(element => ({
        element,
        start: Number(element.dataset.sourceStartOffset ?? -1),
      }))
      .filter(({ start }) => start >= 0 && start <= targetOffset)
      .sort((left, right) => right.start - left.start)

    if (nearestBefore[0]?.element) return nearestBefore[0].element
  }

  if (Number.isFinite(targetLine) && targetLine > 0) {
    const containing = anchors
      .map(element => ({
        element,
        start: Number(element.dataset.sourceStartLine ?? -1),
        end: Number(element.dataset.sourceEndLine ?? -1),
      }))
      .filter(({ start, end }) => start > 0 && end >= start)
      .filter(({ start, end }) => targetLine >= start && targetLine <= end)
      .sort((left, right) => ((left.end - left.start) - (right.end - right.start)))

    if (containing[0]?.element) return containing[0].element
  }

  return anchors[0] || null
}

function flashAnchor(element) {
  if (!element) return
  if (flashTimer) {
    window.clearTimeout(flashTimer)
    flashTimer = null
  }
  containerEl.value?.querySelectorAll?.('.md-preview-source-anchor-active')?.forEach((node) => {
    node.classList.remove('md-preview-source-anchor-active')
  })
  element.classList.add('md-preview-source-anchor-active')
  flashTimer = window.setTimeout(() => {
    element.classList.remove('md-preview-source-anchor-active')
    flashTimer = null
  }, 1200)
}

function scrollToSourceLocation(detail = {}) {
  const anchor = findBestAnchor(detail)
  if (!anchor) return false
  flashAnchor(anchor)
  anchor.scrollIntoView({
    block: 'center',
    inline: 'nearest',
    behavior: 'smooth',
  })
  return true
}

function flushPendingForwardSync() {
  const detail = takePendingMarkdownForwardSync(resolvedSourcePath.value)
  if (!detail) return
  if (!scrollToSourceLocation(detail)) {
    rememberPendingMarkdownForwardSync(detail)
  }
}

async function doRender() {
  if (loadError.value) {
    renderedHtml.value = ''
    return
  }
  let md = filesStore.fileContents[resolvedSourcePath.value]
  if (md === undefined) return
  workflowStore.setMarkdownPreviewState(resolvedSourcePath.value, {
    status: 'rendering',
    problems: [],
  })

  // For .Rmd/.qmd: use knitted markdown if available, otherwise preprocess (strip {r} headers)
  if (isRmd.value) {
    if (knittedMarkdown) {
      md = knittedMarkdown
    } else {
      const { preprocessRmd } = await import('../../services/rmdKnit')
      md = preprocessRmd(md)
    }
  }

  try {
    const result = renderPreview(md, referencesStore, referencesStore.citationStyle)
    renderedHtml.value = result instanceof Promise ? await result : result
    await nextTick()
    flushPendingForwardSync()
    workflowStore.setMarkdownPreviewState(resolvedSourcePath.value, {
      status: 'ready',
      problems: [],
    })
  } catch (error) {
    renderedHtml.value = ''
    workflowStore.setMarkdownPreviewState(resolvedSourcePath.value, {
      status: 'error',
      problems: [{
        id: `markdown-preview:${resolvedSourcePath.value}`,
        sourcePath: resolvedSourcePath.value,
        line: null,
        column: null,
        severity: 'error',
        message: error?.message || String(error),
        origin: 'preview',
        actionable: true,
        raw: error?.stack || String(error),
      }],
    })
  }
}

/**
 * Knit the .Rmd: execute all chunks and embed outputs in the preview.
 */
async function doKnit() {
  if (loadError.value) return
  const md = filesStore.fileContents[resolvedSourcePath.value]
  if (!md) return

  knitting.value = true
  knittingProgress.value = ''
  try {
    const { knitRmd } = await import('../../services/rmdKnit')
    knittedMarkdown = await knitRmd(md, workspace.path, {
      onProgress: (idx, total) => { knittingProgress.value = `${idx + 1}/${total}` },
    })
    await doRender()
  } catch (e) {
    console.error('Knit failed:', e)
    workflowStore.setMarkdownPreviewState(resolvedSourcePath.value, {
      status: 'error',
      problems: [{
        id: `markdown-knit:${resolvedSourcePath.value}`,
        sourcePath: resolvedSourcePath.value,
        line: null,
        column: null,
        severity: 'error',
        message: e?.message || String(e),
        origin: 'preview',
        actionable: true,
        raw: e?.stack || String(e),
      }],
    })
  } finally {
    knitting.value = false
    knittingProgress.value = ''
  }
}

watch(
  () => filesStore.fileContents[resolvedSourcePath.value],
  () => {
    // On edits, clear knitted cache (stale) and re-render preprocessed
    knittedMarkdown = null
    clearTimeout(renderTimer)
    renderTimer = setTimeout(doRender, 300)
  }
)

watch(loadError, (nextError) => {
  if (nextError) {
    renderedHtml.value = ''
  }
})

// Re-render when citation style changes
watch(() => referencesStore.citationStyle, doRender)

onMounted(async () => {
  // Ensure content is loaded
   let content = filesStore.fileContents[resolvedSourcePath.value]
   if (content === undefined) {
     content = await filesStore.readFile(resolvedSourcePath.value)
   }
  if (content === null && loadError.value) return

  if (isRmd.value) {
    // For .Rmd: auto-knit on open (execute chunks, show outputs)
    await doKnit()
  } else {
    doRender()
  }

  window.addEventListener('markdown-forward-sync-location', handleForwardSyncRequest)
})

onUnmounted(() => {
  window.removeEventListener('markdown-forward-sync-location', handleForwardSyncRequest)
  if (flashTimer) {
    window.clearTimeout(flashTimer)
    flashTimer = null
  }
})

function handleForwardSyncRequest(event) {
  const detail = event.detail || {}
   if (detail.sourcePath !== resolvedSourcePath.value) return
  void nextTick(() => {
    if (scrollToSourceLocation(detail)) {
      clearPendingMarkdownForwardSync(detail)
    } else {
      rememberPendingMarkdownForwardSync(detail)
    }
  })
}

function handleClick(e) {
  // Wiki link navigation
  const wikiLink = e.target.closest('.md-preview-wikilink')
  if (wikiLink) {
    const target = wikiLink.dataset.target
    if (target) {
       const resolved = linksStore.resolveLink(target, resolvedSourcePath.value)
      if (resolved) {
        editorStore.openFile(resolved.path)
      }
    }
    e.preventDefault()
    return
  }

  // Citation click → open reference detail
  const citation = e.target.closest('.md-preview-citation')
  if (citation) {
    const keys = citation.dataset.keys?.split(',')
    if (keys?.[0]) {
      referencesStore.focusReferenceInLibrary(keys[0], { mode: 'browse' })
    }
    e.preventDefault()
    return
  }
}

async function handleDoubleClick(e) {
  const target = e.target instanceof Element ? e.target : e.target?.parentElement
  if (!target) return
  if (target.closest('.md-preview-wikilink, .md-preview-citation, a[href]')) return

  const anchor = target.closest('.md-preview-source-anchor[data-source-start-offset]')
  const location = readAnchorLocation(anchor)
  if (!location) return

  e.preventDefault()
  e.stopPropagation()

  const preferredSourcePaneId = (
     editorStore.findPaneWithTab(resolvedSourcePath.value)?.id
     || (workflowStore.session.previewSourcePath === resolvedSourcePath.value ? workflowStore.session.sourcePaneId : null)
    || null
  )

  await revealMarkdownSourceLocation(editorStore, location, {
    center: true,
    paneId: preferredSourcePaneId,
  })
}
</script>

<style scoped>
.md-preview-container {
  height: 100%;
  overflow-y: auto;
  padding: 28px 24px 48px;
  background: var(--bg-primary);
  color: var(--fg-primary);
}

.md-preview-content {
  max-width: 860px;
  margin: 0 auto;
  line-height: 1.82;
  font-family: 'Geist', var(--font-sans);
  font-size: calc(var(--editor-font-size, 14px) + 0.5px);
  color: var(--fg-primary);
}

:deep(.md-preview-source-anchor-active) {
  animation: md-preview-source-flash 1.2s ease;
}

@keyframes md-preview-source-flash {
  0% {
    background: color-mix(in srgb, var(--accent) 22%, transparent);
  }
  100% {
    background: transparent;
  }
}

.md-preview-error {
  max-width: 860px;
  margin: 24px auto 0;
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-secondary);
  color: var(--fg-muted);
}

.md-preview-error-detail {
  margin-top: 8px;
  font-size: 12px;
}

.md-preview-knitting {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 16px;
  margin-bottom: 12px;
  max-width: 860px;
  margin-left: auto;
  margin-right: auto;
  font-size: var(--ui-font-label);
  color: var(--fg-muted);
  background: var(--bg-secondary);
  border-radius: 6px;
  border: 1px solid var(--border);
}
.md-preview-knitting-dots {
  display: flex;
  gap: 3px;
}

@media (max-width: 900px) {
  .md-preview-container {
    padding: 20px 18px 36px;
  }
}
</style>

<style>
/* Prose styles for markdown preview — must be global to reach v-html content */
.md-preview-content > :first-child {
  margin-top: 0 !important;
}

.md-preview-content > :last-child {
  margin-bottom: 0 !important;
}

.md-preview-content h1,
.md-preview-content h2,
.md-preview-content h3,
.md-preview-content h4,
.md-preview-content h5,
.md-preview-content h6 {
  color: var(--hl-heading, var(--fg-primary));
  font-family: var(--font-sans, system-ui, sans-serif);
  margin: 1.8em 0 0.55em;
  line-height: 1.22;
  letter-spacing: -0.02em;
}
.md-preview-content h1 { font-size: 2.18em; border-bottom: 1px solid color-mix(in srgb, var(--border) 75%, transparent); padding-bottom: 0.38em; }
.md-preview-content h2 { font-size: 1.7em; border-bottom: 1px solid color-mix(in srgb, var(--border) 65%, transparent); padding-bottom: 0.28em; }
.md-preview-content h3 { font-size: 1.34em; }
.md-preview-content h4 { font-size: 1.14em; }
.md-preview-content h5,
.md-preview-content h6 {
  color: var(--fg-secondary);
}

.md-preview-content p {
  margin: 0.92em 0;
}

.md-preview-content a {
  color: var(--accent);
  text-decoration: underline;
  text-underline-offset: 2px;
}
.md-preview-content a:hover {
  opacity: 0.8;
}

.md-preview-content strong {
  font-weight: 700;
  color: var(--fg-primary);
}

.md-preview-content em {
  font-style: italic;
}

.md-preview-content del {
  text-decoration: line-through;
  opacity: 0.6;
}

.md-preview-content code {
  font-family: var(--font-mono, 'SF Mono', 'Fira Code', monospace);
  font-size: 0.9em;
  padding: 0.18em 0.42em;
  border-radius: 6px;
  background: color-mix(in srgb, var(--bg-secondary) 82%, transparent);
  color: var(--hl-string, #e9967a);
  border: 1px solid color-mix(in srgb, var(--border) 65%, transparent);
}

.md-preview-content pre {
  margin: 1.15em 0;
  padding: 14px 16px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--bg-secondary) 90%, transparent);
  overflow-x: auto;
  border: 1px solid var(--border);
  box-shadow: inset 0 1px 0 color-mix(in srgb, white 4%, transparent);
}
.md-preview-content pre code {
  padding: 0;
  background: none;
  font-size: 0.85em;
  color: var(--fg-primary);
  border: none;
}

.md-preview-content blockquote {
  margin: 1.1em 0;
  padding: 0.7em 1em 0.7em 1.1em;
  border-left: 3px solid var(--accent);
  background: color-mix(in srgb, var(--bg-secondary) 84%, transparent);
  border-radius: 0 10px 10px 0;
  color: var(--fg-secondary, var(--fg-muted));
}
.md-preview-content blockquote p {
  margin: 0.4em 0;
}

.md-preview-content ul,
.md-preview-content ol {
  padding-left: 1.65em;
  margin: 0.92em 0;
  list-style-position: outside;
}
.md-preview-content ul {
  list-style-type: disc;
}
.md-preview-content ol {
  list-style-type: decimal;
}
.md-preview-content li {
  margin: 0.34em 0;
  display: list-item;
}
.md-preview-content li > p {
  margin: 0.4em 0;
}
.md-preview-content li > ul {
  margin: 0.28em 0;
  list-style-type: circle;
}
.md-preview-content li > ol {
  margin: 0.28em 0;
  list-style-type: lower-alpha;
}

.md-preview-content hr {
  border: none;
  border-top: 1px solid var(--border);
  margin: 2em 0;
}

.md-preview-content table {
  border-collapse: collapse;
  width: 100%;
  margin: 1.15em 0;
  overflow: hidden;
  border-radius: 12px;
  border-style: hidden;
  box-shadow: 0 0 0 1px var(--border);
  background: color-mix(in srgb, var(--bg-secondary) 35%, transparent);
}
.md-preview-content th,
.md-preview-content td {
  border: 1px solid var(--border);
  padding: 9px 12px;
  text-align: left;
  vertical-align: top;
}
.md-preview-content th {
  background: color-mix(in srgb, var(--bg-secondary) 82%, transparent);
  font-weight: 600;
}

.md-preview-content img {
  max-width: 100%;
  border-radius: 12px;
  margin: 1.2em 0;
  border: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
}

/* Wiki links */
.md-preview-content .md-preview-wikilink {
  color: var(--accent);
  cursor: pointer;
  text-decoration: none;
  border-bottom: 1px dashed var(--accent);
}
.md-preview-content .md-preview-wikilink:hover {
  opacity: 0.8;
}

/* Citations */
.md-preview-content .md-preview-citation {
  color: color-mix(in srgb, var(--accent) 82%, var(--fg-primary));
  cursor: pointer;
  font-weight: 500;
}
.md-preview-content .md-preview-citation:hover {
  text-decoration: underline;
}

/* Footnotes */
.md-preview-content .footnotes {
  margin-top: 2.6em;
  padding-top: 1.1em;
  border-top: 1px solid var(--border);
  font-size: 0.92em;
  color: var(--fg-secondary);
}

.md-preview-content .footnote-ref,
.md-preview-content .footnote-backref {
  text-decoration: none;
  font-weight: 600;
}

.md-preview-content .footnotes ol {
  padding-left: 1.35em;
}

.md-preview-content .footnotes li {
  margin: 0.55em 0;
}

/* Highlight.js theme mapping — uses existing editor CSS vars */
.md-preview-content .hljs { color: var(--fg-primary); }
.md-preview-content .hljs-keyword { color: var(--hl-keyword, #c678dd); }
.md-preview-content .hljs-string { color: var(--hl-string, #e9967a); }
.md-preview-content .hljs-number { color: var(--hl-number, #d19a66); }
.md-preview-content .hljs-comment { color: var(--hl-comment, #5c6370); font-style: italic; }
.md-preview-content .hljs-function { color: var(--hl-function, #61afef); }
.md-preview-content .hljs-title { color: var(--hl-function, #61afef); }
.md-preview-content .hljs-title.function_ { color: var(--hl-function, #61afef); }
.md-preview-content .hljs-params { color: var(--hl-variable, #e06c75); }
.md-preview-content .hljs-type { color: var(--hl-type, #e5c07b); }
.md-preview-content .hljs-built_in { color: var(--hl-builtin, #56b6c2); }
.md-preview-content .hljs-literal { color: var(--hl-constant, #d19a66); }
.md-preview-content .hljs-attr { color: var(--hl-property, #d19a66); }
.md-preview-content .hljs-attribute { color: var(--hl-property, #d19a66); }
.md-preview-content .hljs-selector-tag { color: var(--hl-keyword, #c678dd); }
.md-preview-content .hljs-selector-class { color: var(--hl-type, #e5c07b); }
.md-preview-content .hljs-meta { color: var(--hl-meta, #abb2bf); }
.md-preview-content .hljs-variable { color: var(--hl-variable, #e06c75); }
.md-preview-content .hljs-name { color: var(--hl-tag, #e06c75); }
.md-preview-content .hljs-tag { color: var(--fg-muted); }
.md-preview-content .hljs-deletion { color: var(--error, #e06c75); }
.md-preview-content .hljs-addition { color: var(--success, #98c379); }

/* KaTeX styles */
.md-preview-content .katex-display {
  margin: 1.25em 0;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 0.2em 0;
}
.md-preview-content .katex {
  font-size: 1.1em;
}

/* Task list checkboxes */
.md-preview-content input[type="checkbox"] {
  margin-right: 6px;
  accent-color: var(--accent);
}
</style>
