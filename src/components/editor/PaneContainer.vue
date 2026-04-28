<template>
  <!-- Leaf pane -->
  <EditorPane
    v-if="node.type === 'leaf'"
    :key="`pane:${node.id}:${editorStore.restoreGeneration}`"
    :paneId="node.id"
    :tabs="node.tabs"
    :activeTab="node.activeTab"
    :topbarTabsTargetSelector="topbarTabsTargetSelector"
    :topbarWorkflowTargetSelector="topbarWorkflowTargetSelector"
    @cursor-change="(pos) => $emit('cursor-change', pos)"
    @editor-stats="(stats) => $emit('editor-stats', stats)"
    @selection-change="(selection) => $emit('selection-change', selection)"
  />

  <!-- Split pane -->
  <div
    v-else-if="node.type === 'split'"
    ref="splitContainer"
    class="pane-container-split flex h-full w-full"
  >
    <div :style="firstChildStyle" class="pane-container-slot overflow-hidden">
      <PaneContainer
        :node="node.children[0]"
        :topbarTabsTargetSelector="topbarTabsTargetSelector"
        :topbarWorkflowTargetSelector="topbarWorkflowTargetSelector"
        @cursor-change="(pos) => $emit('cursor-change', pos)"
        @editor-stats="(stats) => $emit('editor-stats', stats)"
        @selection-change="(selection) => $emit('selection-change', selection)"
      />
    </div>

    <SplitHandle
      direction="vertical"
      @resize="(e) => handleResize(e)"
      @resize-end="handleResizeEnd"
    />

    <div :style="secondChildStyle" class="pane-container-slot overflow-hidden">
      <PaneContainer
        :node="node.children[1]"
        :topbarTabsTargetSelector="topbarTabsTargetSelector"
        :topbarWorkflowTargetSelector="topbarWorkflowTargetSelector"
        @cursor-change="(pos) => $emit('cursor-change', pos)"
        @editor-stats="(stats) => $emit('editor-stats', stats)"
        @selection-change="(selection) => $emit('selection-change', selection)"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import {
  flushWorkbenchMotionCommit,
  scheduleWorkbenchMotionCommit,
} from '../../domains/workbench/workbenchMotionRuntime.js'
import { useEditorStore } from '../../stores/editor'
import EditorPane from './EditorPane.vue'
import SplitHandle from './SplitHandle.vue'

const props = defineProps({
  node: { type: Object, required: true },
  topbarTabsTargetSelector: { type: String, default: '' },
  topbarWorkflowTargetSelector: { type: String, default: '' },
})

const emit = defineEmits(['cursor-change', 'editor-stats', 'selection-change'])
const editorStore = useEditorStore()
const splitContainer = ref(null)
const splitMotionKey = computed(() => `pane-split:${props.node?.id || 'root'}`)

const firstChildStyle = computed(() => {
  if (props.node.type !== 'split') return {}
  const ratio = props.node.ratio || 0.5
  return { width: `calc(${ratio * 100}% - 1px)` }
})

const secondChildStyle = computed(() => {
  if (props.node.type !== 'split') return {}
  const ratio = props.node.ratio || 0.5
  return { width: `calc(${(1 - ratio) * 100}% - 1px)` }
})

function handleResize(e) {
  if (props.node.type !== 'split') return

  const container = splitContainer.value
  if (!container) return

  const rect = container.getBoundingClientRect()
  if (!rect.width) return
  const ratio = (e.x - rect.left) / rect.width

  scheduleWorkbenchMotionCommit(splitMotionKey.value, ratio, (nextRatio) => {
    editorStore.setSplitRatio(props.node, nextRatio)
  })
}

function handleResizeEnd() {
  if (props.node.type !== 'split') return
  flushWorkbenchMotionCommit(splitMotionKey.value)
  editorStore.commitSplitRatio(props.node)
}
</script>

<style scoped>
.pane-container-split {
  gap: 0;
}

.pane-container-slot {
  min-width: 0;
  min-height: 0;
}
</style>
