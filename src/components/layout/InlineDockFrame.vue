<template>
  <div
    class="workbench-inline-dock-resize-slot"
    :class="[
      resizeSlotClass,
      { 'is-visible': open, 'is-hidden': !open },
    ]"
  >
    <ResizeHandle
      class="workbench-inline-dock-resize-handle"
      :class="resizeHandleClass"
      direction="vertical"
      @resize="handleResize"
      @resize-start="handleResizeStart"
      @resize-end="handleResizeEnd"
      @dblclick="handleResizeSnap"
    />
  </div>

  <aside
    class="workbench-inline-dock-region"
    :class="[
      regionClass,
      {
        'is-open': open,
        'is-collapsed': !open,
        'is-resizing': resizing,
      },
    ]"
    :aria-hidden="open ? 'false' : 'true'"
    :aria-label="ariaLabel || undefined"
    :style="{
      '--inline-dock-current-width': `${width}px`,
      width: open ? `${width}px` : '0px',
    }"
  >
    <slot v-if="shouldRenderContent" />
  </aside>
</template>

<script setup>
import { computed } from 'vue'
import { useDelayedRender } from '../../composables/useDelayedRender.js'
import { useInlineDockResize } from '../../composables/useInlineDockResize.js'
import ResizeHandle from './ResizeHandle.vue'

const props = defineProps({
  ariaLabel: { type: String, default: '' },
  open: { type: Boolean, default: false },
  renderActive: { type: Boolean, default: true },
  resizing: { type: Boolean, default: false },
  width: { type: Number, default: 360 },
  closeDelayMs: { type: Number, default: 680 },
  regionClass: { type: [String, Array, Object], default: '' },
  resizeSlotClass: { type: [String, Array, Object], default: '' },
  resizeHandleClass: { type: [String, Array, Object], default: '' },
  getContainerWidth: { type: Function, default: null },
})

const emit = defineEmits([
  'resize',
  'resize-start',
  'resize-end',
  'resize-snap',
])

const renderSource = computed(() => props.open && props.renderActive)
const shouldRenderContent = useDelayedRender(
  () => renderSource.value,
  { delayMs: props.closeDelayMs }
)

const {
  handleResize,
  handleResizeEnd,
  handleResizeSnap,
  handleResizeStart,
} = useInlineDockResize({
  getWidth: () => props.width,
  getContainerWidth: () => props.getContainerWidth?.(),
  onResize: (event) => emit('resize', event),
  onResizeStart: () => emit('resize-start'),
  onResizeEnd: () => emit('resize-end'),
  onResizeSnap: (event) => emit('resize-snap', event),
})
</script>
