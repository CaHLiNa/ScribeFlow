<template>
  <div ref="containerRef" class="editor-pane-text-surface">
    <KeepAlive :max="TEXT_EDITOR_CACHE_MAX">
      <component
        :is="TextEditor"
        :key="`text:${filePath}`"
        class="flex-1 min-w-0 h-full"
        :filePath="filePath"
        :paneId="paneId"
        @cursor-change="(pos) => $emit('cursor-change', pos)"
        @editor-stats="(stats) => $emit('editor-stats', stats)"
        @selection-change="(selection) => $emit('selection-change', selection)"
      />
    </KeepAlive>
    <CommentMargin
      v-if="showCommentMargin"
      :filePath="filePath"
      :paneId="paneId"
      :hasSelection="hasEditorSelection"
    />
    <CommentPanel
      v-if="showCommentPanel"
      :comment="activeComment"
      :filePath="filePath"
      :paneId="paneId"
      :editorView="editorView"
      :containerRect="containerRect"
      :mode="commentPanelMode"
      :selectionRange="commentSelectionRange"
      :selectionText="commentSelectionText"
      @close="$emit('close-comment-panel')"
      @comment-created="$emit('comment-created')"
    />
  </div>
</template>

<script setup>
import { defineAsyncComponent, ref } from 'vue'

const TextEditor = defineAsyncComponent(() => import('./TextEditor.vue'))
const CommentMargin = defineAsyncComponent(() => import('../comments/CommentMargin.vue'))
const CommentPanel = defineAsyncComponent(() => import('../comments/CommentPanel.vue'))

defineProps({
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

const TEXT_EDITOR_CACHE_MAX = 4
const containerRef = ref(null)

defineExpose({
  getBoundingClientRect() {
    return containerRef.value?.getBoundingClientRect?.() || null
  },
})
</script>

<style scoped>
.editor-pane-text-surface {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}
</style>
