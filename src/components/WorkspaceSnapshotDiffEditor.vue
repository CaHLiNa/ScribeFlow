<template>
  <div ref="editorContainer" class="workspace-snapshot-diff-editor"></div>
</template>

<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { getChunks } from '@codemirror/merge'

import { mergeViewExtension, reconfigureMergeView } from '../editor/diffOverlay'
import { createEditorExtensions, createEditorState } from '../editor/setup'
import { computeMinimalChange } from '../utils/textDiff'

const props = defineProps({
  snapshotContent: { type: String, default: '' },
  currentContent: { type: String, default: '' },
  interactive: { type: Boolean, default: false },
})

const emit = defineEmits([
  'update:mergedContent',
  'chunk-state-change',
])

const editorContainer = ref(null)
let view = null

function createReadOnlyExtensions() {
  return createEditorExtensions({
    onSave: null,
    onDocChanged: () => {
      syncEditorState()
    },
    onCursorChange: null,
    onStats: null,
    softWrap: true,
    languageExtension: null,
    autoSaveEnabled: false,
    extraExtensions: [
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
      mergeViewExtension(),
    ],
  })
}

function syncEditorState() {
  if (!view) {
    return
  }

  emit('update:mergedContent', view.state.doc.toString())
  const chunkState = getChunks(view.state)
  emit('chunk-state-change', {
    unresolvedCount: chunkState?.chunks?.length || 0,
  })
}

function applyDiffState() {
  if (!view) {
    return
  }

  const nextCurrentContent = props.currentContent ?? ''
  const currentDoc = view.state.doc.toString()
  const change = computeMinimalChange(currentDoc, nextCurrentContent)
  if (change) {
    view.dispatch({ changes: change })
  }

  reconfigureMergeView(view, props.snapshotContent || '', null, {
    mergeControls: props.interactive,
  })
  syncEditorState()
}

function mountEditor() {
  if (!editorContainer.value || view) {
    return
  }

  const state = createEditorState(props.currentContent ?? '', createReadOnlyExtensions())
  view = new EditorView({
    state,
    parent: editorContainer.value,
  })
  applyDiffState()
}

onMounted(() => {
  mountEditor()
})

onUnmounted(() => {
  if (!view) {
    return
  }
  view.destroy()
  view = null
})

watch(
  () => [props.snapshotContent, props.currentContent, props.interactive],
  () => {
    applyDiffState()
  },
)
</script>

<style scoped>
.workspace-snapshot-diff-editor {
  min-height: 220px;
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
  background: var(--bg-secondary);
}

.workspace-snapshot-diff-editor :deep(.cm-editor) {
  height: 100%;
  min-height: 220px;
}

.workspace-snapshot-diff-editor :deep(.cm-scroller) {
  overflow: auto;
  max-height: 360px;
}
</style>
