<template>
  <div
    ref="containerEl"
    class="md-preview-container"
    data-surface-context-guard="true"
    @contextmenu.prevent="handleContextMenu"
  >
    <div v-if="loadError" class="md-preview-error">
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
  <SurfaceContextMenu
    :visible="menuVisible"
    :x="menuX"
    :y="menuY"
    :groups="menuGroups"
    @close="closeSurfaceContextMenu"
    @select="handleSurfaceContextMenuSelect"
  />
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useFilesStore } from '../../stores/files'
import { useEditorStore } from '../../stores/editor'
import { useDocumentWorkflowStore } from '../../stores/documentWorkflow'
import { useLinksStore } from '../../stores/links'
import { useI18n } from '../../i18n'
import { renderPreview } from '../../utils/markdownPreview'
import { openExternalHttpUrl, resolveExternalHttpAnchor } from '../../services/externalLinks.js'
import { revealMarkdownSourceLocation } from '../../services/markdown/reveal.js'
import { resolveMarkdownPreviewInput } from '../../domains/document/documentWorkspacePreviewAdapters.js'
import SurfaceContextMenu from '../shared/SurfaceContextMenu.vue'
import { useSurfaceContextMenu } from '../../composables/useSurfaceContextMenu.js'
import {
  clearPendingMarkdownForwardSync,
  rememberPendingMarkdownForwardSync,
  takePendingMarkdownForwardSync,
} from '../../services/markdown/previewSync.js'

const props = defineProps({
  filePath: { type: String, required: true },
  paneId: { type: String, required: true },
  sourcePath: { type: String, default: '' },
})

const filesStore = useFilesStore()
const editorStore = useEditorStore()
const workflowStore = useDocumentWorkflowStore()
const linksStore = useLinksStore()
const { t } = useI18n()
const containerEl = ref(null)
const {
  menuVisible,
  menuX,
  menuY,
  menuGroups,
  closeSurfaceContextMenu,
  openSurfaceContextMenu,
  handleSurfaceContextMenuSelect,
} = useSurfaceContextMenu()

const resolvedSourcePath = computed(
  () =>
    resolveMarkdownPreviewInput(props.filePath, {
      sourcePath: props.sourcePath,
      workflowStore,
    }).sourcePath
)
const loadError = computed(() => filesStore.getFileLoadError(resolvedSourcePath.value))

// Debounced render
let renderTimer = null
const renderedHtml = ref('')
let flashTimer = null

function getSourceAnchors() {
  return [
    ...(containerEl.value?.querySelectorAll?.(
      '.md-preview-source-anchor[data-source-start-offset]'
    ) || []),
  ]
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
      .map((element) => ({
        element,
        start: Number(element.dataset.sourceStartOffset ?? -1),
        end: Number(element.dataset.sourceEndOffset ?? -1),
      }))
      .filter(({ start, end }) => start >= 0 && end >= start)
      .filter(({ start, end }) => targetOffset >= start && targetOffset <= end)
      .sort((left, right) => left.end - left.start - (right.end - right.start))

    if (containing[0]?.element) return containing[0].element

    const nearestBefore = anchors
      .map((element) => ({
        element,
        start: Number(element.dataset.sourceStartOffset ?? -1),
      }))
      .filter(({ start }) => start >= 0 && start <= targetOffset)
      .sort((left, right) => right.start - left.start)

    if (nearestBefore[0]?.element) return nearestBefore[0].element
  }

  if (Number.isFinite(targetLine) && targetLine > 0) {
    const containing = anchors
      .map((element) => ({
        element,
        start: Number(element.dataset.sourceStartLine ?? -1),
        end: Number(element.dataset.sourceEndLine ?? -1),
      }))
      .filter(({ start, end }) => start > 0 && end >= start)
      .filter(({ start, end }) => targetLine >= start && targetLine <= end)
      .sort((left, right) => left.end - left.start - (right.end - right.start))

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

function resolvePreviewTarget(target) {
  if (target instanceof Element) return target
  if (target?.nodeType === 3) return target.parentElement || null
  return null
}

function getPreferredSourcePaneId() {
  return (
    editorStore.findPaneWithTab(resolvedSourcePath.value)?.id ||
    (workflowStore.session.previewSourcePath === resolvedSourcePath.value
      ? workflowStore.session.sourcePaneId
      : null) ||
    null
  )
}

async function revealSourceLocation(location = null) {
  if (!location) return
  await revealMarkdownSourceLocation(editorStore, location, {
    center: true,
    paneId: getPreferredSourcePaneId(),
  })
}

function selectAllPreviewContent() {
  const contentRoot = containerEl.value?.querySelector('.md-preview-content') || containerEl.value
  if (!contentRoot) return
  const selection = window.getSelection?.()
  if (!selection) return
  const range = document.createRange()
  range.selectNodeContents(contentRoot)
  selection.removeAllRanges()
  selection.addRange(range)
}

function getSelectedPreviewText() {
  const selection = window.getSelection?.()
  if (!selection || selection.rangeCount === 0) return ''
  if (selection.anchorNode && containerEl.value && !containerEl.value.contains(selection.anchorNode)) {
    return ''
  }
  return String(selection.toString() || '').trim()
}

async function copySelectedPreviewText() {
  const text = getSelectedPreviewText()
  if (!text) return
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  document.execCommand('copy')
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

  try {
    const result = renderPreview(md)
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
      problems: [
        {
          id: `markdown-preview:${resolvedSourcePath.value}`,
          sourcePath: resolvedSourcePath.value,
          line: null,
          column: null,
          severity: 'error',
          message: error?.message || String(error),
          origin: 'preview',
          actionable: true,
          raw: error?.stack || String(error),
        },
      ],
    })
  }
}

watch(
  () => filesStore.fileContents[resolvedSourcePath.value],
  () => {
    clearTimeout(renderTimer)
    renderTimer = setTimeout(doRender, 300)
  }
)

watch(loadError, (nextError) => {
  if (nextError) {
    renderedHtml.value = ''
  }
})

onMounted(async () => {
  let content = filesStore.fileContents[resolvedSourcePath.value]
  if (content === undefined) {
    content = await filesStore.readFile(resolvedSourcePath.value)
  }
  if (content === null && loadError.value) return

  doRender()
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
}

async function handleDoubleClick(e) {
  const target = e.target instanceof Element ? e.target : e.target?.parentElement
  if (!target) return
  if (target.closest('.md-preview-wikilink, a[href]')) return

  const anchor = target.closest('.md-preview-source-anchor[data-source-start-offset]')
  const location = readAnchorLocation(anchor)
  if (!location) return

  e.preventDefault()
  e.stopPropagation()

  await revealSourceLocation(location)
}

function handleContextMenu(event) {
  const target = resolvePreviewTarget(event.target)
  const externalLink = resolveExternalHttpAnchor(target, document.baseURI)
  const sourceAnchor = target?.closest?.('.md-preview-source-anchor[data-source-start-offset]') || null
  const sourceLocation = readAnchorLocation(sourceAnchor)
  const selectedText = getSelectedPreviewText()

  openSurfaceContextMenu({
    x: event.clientX,
    y: event.clientY,
    groups: [
      {
        key: 'markdown-preview-actions',
        items: [
          {
            key: 'copy',
            label: t('Copy'),
            disabled: !selectedText,
            action: () => {
              void copySelectedPreviewText()
            },
          },
          {
            key: 'select-all',
            label: t('Select All'),
            action: () => {
              selectAllPreviewContent()
            },
          },
          ...(externalLink
            ? [{
              key: 'open-link',
              label: t('Open Link'),
              action: () => {
                void openExternalHttpUrl(externalLink.url)
              },
            }]
            : []),
          ...(sourceLocation
            ? [{
              key: 'reveal-source',
              label: t('Reveal Source'),
              action: () => {
                void revealSourceLocation(sourceLocation)
              },
            }]
            : []),
        ],
      },
    ],
  })
}
</script>

<style scoped>
.md-preview-container {
  height: 100%;
  overflow-y: auto;
  padding: 24px 22px 40px;
  background: inherit;
  color: var(--workspace-ink);
  -webkit-mask-image: linear-gradient(
    to bottom,
    transparent 0,
    black 18px,
    black calc(100% - 18px),
    transparent 100%
  );
  mask-image: linear-gradient(
    to bottom,
    transparent 0,
    black 18px,
    black calc(100% - 18px),
    transparent 100%
  );
  -webkit-mask-size: 100% 100%;
  mask-size: 100% 100%;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
}

.md-preview-content {
  max-width: 860px;
  margin: 0 auto;
  line-height: 1.74;
  font-family: var(--font-markdown);
  font-size: calc(var(--editor-font-size, 14px) + 0.5px);
  color: var(--workspace-ink);
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
  border: 1px solid color-mix(in srgb, var(--shell-border) 84%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--workspace-paper) 92%, transparent);
  color: var(--text-secondary);
}

.md-preview-error-detail {
  margin-top: 8px;
  font-size: 12px;
}

@media (max-width: 900px) {
  .md-preview-container {
    padding: 20px 16px 32px;
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
  color: var(--hl-heading, var(--workspace-ink));
  font-family: var(--font-markdown, var(--font-sans, system-ui, sans-serif));
  margin: 1.8em 0 0.55em;
  line-height: 1.2;
  letter-spacing: 0.01em;
}
.md-preview-content h1 {
  font-size: 2.05em;
  border-bottom: 1px solid color-mix(in srgb, var(--shell-border) 74%, transparent);
  padding-bottom: 0.36em;
}
.md-preview-content h2 {
  font-size: 1.56em;
  border-bottom: 1px solid color-mix(in srgb, var(--shell-border) 68%, transparent);
  padding-bottom: 0.26em;
}
.md-preview-content h3 {
  font-size: 1.28em;
}
.md-preview-content h4 {
  font-size: 1.1em;
}
.md-preview-content h5,
.md-preview-content h6 {
  color: var(--text-secondary);
}

.md-preview-content p {
  margin: 0.92em 0;
}

.md-preview-content a {
  color: var(--accent);
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
}
.md-preview-content a:hover {
  opacity: 0.8;
}

.md-preview-content strong {
  font-weight: 700;
  color: var(--workspace-ink);
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
  border-radius: 4px;
  background: color-mix(in srgb, var(--workspace-paper-muted) 84%, transparent);
  color: var(--hl-code, var(--accent));
  border: 1px solid color-mix(in srgb, var(--shell-border) 72%, transparent);
}

.md-preview-content pre {
  margin: 1.15em 0;
  padding: 14px 16px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--workspace-paper) 92%, transparent);
  overflow-x: auto;
  border: 1px solid color-mix(in srgb, var(--shell-border) 80%, transparent);
}
.md-preview-content pre code {
  padding: 0;
  background: none;
  font-size: 0.85em;
  color: var(--workspace-ink);
  border: none;
}

.md-preview-content blockquote {
  margin: 1.1em 0;
  padding: 0.7em 1em 0.7em 1.1em;
  border-left: 3px solid color-mix(in srgb, var(--accent) 82%, transparent);
  background: color-mix(in srgb, var(--workspace-paper) 90%, transparent);
  border-radius: 0 8px 8px 0;
  color: var(--text-secondary);
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
  border-top: 1px solid color-mix(in srgb, var(--shell-border) 82%, transparent);
  margin: 2em 0;
}

.md-preview-content table {
  border-collapse: collapse;
  width: 100%;
  margin: 1.15em 0;
  overflow: hidden;
  border-radius: 10px;
  border-style: hidden;
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--shell-border) 78%, transparent);
  background: color-mix(in srgb, var(--workspace-paper) 94%, transparent);
}
.md-preview-content th,
.md-preview-content td {
  border: 1px solid color-mix(in srgb, var(--shell-border) 72%, transparent);
  padding: 11px 14px;
  text-align: left;
  vertical-align: top;
}
.md-preview-content th {
  background: color-mix(in srgb, var(--workspace-paper-muted) 88%, transparent);
  font-weight: 600;
}

.md-preview-content img {
  max-width: 100%;
  border-radius: 10px;
  margin: 1.2em 0;
  border: 1px solid color-mix(in srgb, var(--shell-border) 74%, transparent);
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

/* Footnotes */
.md-preview-content .footnotes {
  margin-top: 2.6em;
  padding-top: 1.1em;
  border-top: 1px solid color-mix(in srgb, var(--shell-border) 72%, transparent);
  font-size: 0.92em;
  color: var(--text-secondary);
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
.md-preview-content .hljs {
  color: var(--workspace-ink);
}
.md-preview-content .hljs-keyword {
  color: var(--hl-keyword, #c678dd);
}
.md-preview-content .hljs-string {
  color: var(--hl-string, #e9967a);
}
.md-preview-content .hljs-number {
  color: var(--hl-number, #d19a66);
}
.md-preview-content .hljs-comment {
  color: var(--hl-comment, #5c6370);
  font-style: italic;
}
.md-preview-content .hljs-function {
  color: var(--hl-function, #61afef);
}
.md-preview-content .hljs-title {
  color: var(--hl-function, #61afef);
}
.md-preview-content .hljs-title.function_ {
  color: var(--hl-function, #61afef);
}
.md-preview-content .hljs-params {
  color: var(--hl-variable, #e06c75);
}
.md-preview-content .hljs-type {
  color: var(--hl-type, #e5c07b);
}
.md-preview-content .hljs-built_in {
  color: var(--hl-builtin, #56b6c2);
}
.md-preview-content .hljs-literal {
  color: var(--hl-constant, #d19a66);
}
.md-preview-content .hljs-attr {
  color: var(--hl-property, #d19a66);
}
.md-preview-content .hljs-attribute {
  color: var(--hl-property, #d19a66);
}
.md-preview-content .hljs-selector-tag {
  color: var(--hl-keyword, #c678dd);
}
.md-preview-content .hljs-selector-class {
  color: var(--hl-type, #e5c07b);
}
.md-preview-content .hljs-meta {
  color: var(--hl-meta, #abb2bf);
}
.md-preview-content .hljs-variable {
  color: var(--hl-variable, #e06c75);
}
.md-preview-content .hljs-name {
  color: var(--hl-tag, #e06c75);
}
.md-preview-content .hljs-tag {
  color: var(--fg-muted);
}
.md-preview-content .hljs-deletion {
  color: var(--error, #e06c75);
}
.md-preview-content .hljs-addition {
  color: var(--success, #98c379);
}

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
.md-preview-content input[type='checkbox'] {
  margin-right: 6px;
  accent-color: var(--accent);
}
</style>
