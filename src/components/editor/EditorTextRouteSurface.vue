<template>
  <DocumentWorkspaceTab v-if="useWorkspace" :preview-visible="previewVisible">
    <template #source>
      <EditorTextWorkspaceSurface
        ref="textSurfaceRef"
        :filePath="filePath"
        :paneId="paneId"
        :show-comment-margin="showCommentMargin"
        :has-editor-selection="hasEditorSelection"
        :show-comment-panel="showCommentPanel"
        :active-comment="activeComment"
        :editor-view="editorView"
        :container-rect="containerRect"
        :comment-panel-mode="commentPanelMode"
        :comment-selection-range="commentSelectionRange"
        :comment-selection-text="commentSelectionText"
        @cursor-change="(pos) => $emit('cursor-change', pos)"
        @editor-stats="(stats) => $emit('editor-stats', stats)"
        @selection-change="(selection) => $emit('selection-change', selection)"
        @close-comment-panel="$emit('close-comment-panel')"
        @comment-created="$emit('comment-created')"
      />
    </template>
    <template #preview>
      <slot name="preview" />
    </template>
  </DocumentWorkspaceTab>
  <EditorTextWorkspaceSurface
    v-else
    ref="textSurfaceRef"
    :filePath="filePath"
    :paneId="paneId"
    :show-comment-margin="showCommentMargin"
    :has-editor-selection="hasEditorSelection"
    :show-comment-panel="showCommentPanel"
    :active-comment="activeComment"
    :editor-view="editorView"
    :container-rect="containerRect"
    :comment-panel-mode="commentPanelMode"
    :comment-selection-range="commentSelectionRange"
    :comment-selection-text="commentSelectionText"
    @cursor-change="(pos) => $emit('cursor-change', pos)"
    @editor-stats="(stats) => $emit('editor-stats', stats)"
    @selection-change="(selection) => $emit('selection-change', selection)"
    @close-comment-panel="$emit('close-comment-panel')"
    @comment-created="$emit('comment-created')"
  />
</template>

<script setup>
import { defineAsyncComponent, ref } from 'vue'

const DocumentWorkspaceTab = defineAsyncComponent(() => import('./DocumentWorkspaceTab.vue'))
const EditorTextWorkspaceSurface = defineAsyncComponent(() => import('./EditorTextWorkspaceSurface.vue'))

defineProps({
  useWorkspace: { type: Boolean, default: false },
  previewVisible: { type: Boolean, default: false },
  filePath: { type: String, required: true },
  paneId: { type: String, required: true },
  showCommentMargin: { type: Boolean, default: false },
  hasEditorSelection: { type: Boolean, default: false },
  showCommentPanel: { type: Boolean, default: false },
  activeComment: { type: Object, default: null },
  editorView: { type: Object, default: null },
  containerRect: { type: Object, default: null },
  commentPanelMode: { type: String, default: 'view' },
  commentSelectionRange: { type: Object, default: null },
  commentSelectionText: { type: String, default: '' },
})

defineEmits([
  'cursor-change',
  'editor-stats',
  'selection-change',
  'close-comment-panel',
  'comment-created',
])

const textSurfaceRef = ref(null)

defineExpose({
  getBoundingClientRect() {
    return textSurfaceRef.value?.getBoundingClientRect?.() || null
  },
})
</script>
