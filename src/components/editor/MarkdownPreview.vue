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
  return[
    ...(containerEl.value?.querySelectorAll?.(
      '.md-preview-source-anchor[data-source-start-offset]'
    ) ||[]),
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
    problems:[],
  })

  try {
    const result = renderPreview(md)
    renderedHtml.value = result instanceof Promise ? await result : result
    await nextTick()
    flushPendingForwardSync()
    workflowStore.setMarkdownPreviewState(resolvedSourcePath.value, {
      status: 'ready',
      problems:[],
    })
  } catch (error) {
    renderedHtml.value = ''
    workflowStore.setMarkdownPreviewState(resolvedSourcePath.value, {
      status: 'error',
      problems:[
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
    groups:[
      {
        key: 'markdown-preview-actions',
        items:[
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
            ?[{
              key: 'open-link',
              label: t('Open Link'),
              action: () => {
                void openExternalHttpUrl(externalLink.url)
              },
            }]
            :[]),
          ...(sourceLocation
            ?[{
              key: 'reveal-source',
              label: t('Reveal Source'),
              action: () => {
                void revealSourceLocation(sourceLocation)
              },
            }]
            :[]),
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

/* =========================================================
   Typography & Layout Box: 收紧排版，提升学术感
========================================================= */
.md-preview-content {
  max-width: 760px; /* 收窄阅读区，提升注视焦点体验 */
  margin: 0 auto;
  line-height: 1.6; /* 稍微收紧行高，呈现高密度严谨感 */
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
  max-width: 760px;
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

/* START OF FILE src/components/editor/MarkdownPreview.vue (只替换 style 部分) */
<style scoped>
.md-preview-container {
  height: 100%;
  overflow-y: auto;
  padding: 32px 24px 64px;
  background: inherit;
  color: var(--workspace-ink);
  -webkit-mask-image: linear-gradient(
    to bottom,
    transparent 0,
    black 16px,
    black calc(100% - 24px),
    transparent 100%
  );
  mask-image: linear-gradient(
    to bottom,
    transparent 0,
    black 16px,
    black calc(100% - 24px),
    transparent 100%
  );
  -webkit-mask-size: 100% 100%;
  mask-size: 100% 100%;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
}

.md-preview-content {
  max-width: 760px; /* 收束阅读区，符合最适眼球追踪宽度 */
  margin: 0 auto;
  line-height: 1.8;
  font-family: var(--font-markdown);
  font-size: var(--editor-font-size, 15px);
  color: var(--workspace-ink);
}

:deep(.md-preview-source-anchor-active) {
  animation: md-preview-source-flash 1.2s ease;
}

@keyframes md-preview-source-flash {
  0% { background: color-mix(in srgb, var(--accent) 22%, transparent); }
  100% { background: transparent; }
}

.md-preview-error {
  max-width: 760px;
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
</style>

<style>
.md-preview-content > :first-child { margin-top: 0 !important; }
.md-preview-content > :last-child { margin-bottom: 0 !important; }

/* Headings */
.md-preview-content h1,
.md-preview-content h2,
.md-preview-content h3,
.md-preview-content h4,
.md-preview-content h5,
.md-preview-content h6 {
  color: var(--hl-heading, var(--workspace-ink));
  font-family: var(--font-display);
  margin: 2em 0 0.8em; 
  line-height: 1.25;
  letter-spacing: -0.01em;
}

.md-preview-content h1 {
  font-size: 2.2em;
  font-weight: 600;
  border-bottom: 1px solid var(--border-subtle);
  padding-bottom: 0.3em;
}
.md-preview-content h2 { font-size: 1.6em; font-weight: 600; }
.md-preview-content h3 { font-size: 1.3em; font-weight: 600; }
.md-preview-content h4 { font-size: 1.1em; font-weight: 600; font-family: var(--font-markdown); }
.md-preview-content h5,
.md-preview-content h6 { color: var(--text-secondary); font-family: var(--font-markdown); }

.md-preview-content p { margin: 1.2em 0; }

/* 隐没的超链接气泡悬浮质感 */
.md-preview-content a {
  color: var(--hl-link);
  text-decoration: none;
  padding: 2px 4px;
  margin: 0 -4px;
  border-radius: 4px;
  transition: background 0.15s ease, color 0.15s ease;
}
.md-preview-content a:hover {
  background: color-mix(in srgb, var(--hl-link) 15%, transparent);
}

.md-preview-content strong { font-weight: 600; color: var(--workspace-ink); }
.md-preview-content em { font-style: italic; }
.md-preview-content del { text-decoration: line-through; opacity: 0.6; }

.md-preview-content code {
  font-family: var(--font-mono, 'SF Mono', 'Fira Code', monospace);
  font-size: 0.85em;
  padding: 0.2em 0.4em;
  border-radius: 4px;
  background: var(--surface-raised);
  color: var(--workspace-ink);
  border: 1px solid var(--border-subtle); 
}

.md-preview-content pre {
  margin: 1.5em 0;
  padding: 16px 20px;
  border-radius: 8px;
  background: var(--surface-raised);
  border: 1px solid var(--border-subtle);
  overflow-x: auto;
  font-size: 0.85em;
  line-height: 1.6;
}
.md-preview-content pre code { padding: 0; background: none; font-size: 1em; color: var(--workspace-ink); border: none; }

.md-preview-content blockquote {
  margin: 1.5em 0;
  padding: 0.5em 1.2em;
  border-left: 3px solid var(--border-strong);
  background: transparent;
  color: var(--text-secondary);
  font-style: italic;
}
.md-preview-content blockquote p { margin: 0.4em 0; }

.md-preview-content ul,
.md-preview-content ol { padding-left: 1.65em; margin: 1em 0; list-style-position: outside; }
.md-preview-content ul { list-style-type: disc; }
.md-preview-content ol { list-style-type: decimal; }
.md-preview-content li { margin: 0.5em 0; display: list-item; }

.md-preview-content hr { border: none; border-top: 1px solid var(--border-subtle); margin: 2.5em 0; }

.md-preview-content table {
  border-collapse: collapse;
  width: 100%;
  margin: 1.5em 0;
  overflow: hidden;
  border-radius: 6px;
  border-style: hidden;
  box-shadow: 0 0 0 1px var(--border-subtle);
  background: transparent;
}
.md-preview-content th,
.md-preview-content td { border: 1px solid var(--border-subtle); padding: 12px 16px; text-align: left; vertical-align: top; }
.md-preview-content th { background: color-mix(in srgb, var(--surface-raised) 50%, transparent); font-weight: 600; }

.md-preview-content img { max-width: 100%; border-radius: 8px; margin: 1.5em 0; border: 1px solid var(--border-subtle); }

.md-preview-content .md-preview-wikilink {
  color: var(--hl-link);
  cursor: pointer;
  text-decoration: none;
  padding: 2px 4px;
  margin: 0 -4px;
  border-radius: 4px;
  transition: background 0.15s ease;
}
.md-preview-content .md-preview-wikilink:hover {
  background: color-mix(in srgb, var(--hl-link) 15%, transparent);
}

.md-preview-content .footnotes {
  margin-top: 3em;
  padding-top: 1.5em;
  border-top: 1px solid var(--border-subtle);
  font-size: 0.9em;
  color: var(--text-secondary);
}

/* 核心优化：隐藏 KaTeX 公式长宽的物理滚动条，保持滑动功能且外观纯净 */
.md-preview-content .katex-display {
  margin: 1.5em 0;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 0.5em 0;
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* IE */
}
.md-preview-content .katex-display::-webkit-scrollbar {
  display: none; /* Safari/Chrome 极致隐藏 */
}
.md-preview-content .katex { font-size: 1.1em; }

.md-preview-content input[type='checkbox'] { margin-right: 8px; accent-color: var(--accent); }
</style>