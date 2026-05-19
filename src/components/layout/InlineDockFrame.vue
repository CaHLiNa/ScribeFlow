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
      '--inline-dock-frame-width': open ? `${width}px` : '0px',
      '--inline-dock-current-width': `${width}px`,
      width: open ? `${width}px` : '0px',
      flexBasis: open ? `${width}px` : '0px',
      maxWidth: open ? `${width}px` : '0px',
    }"
  >
    <slot v-if="shouldRenderContent" :motion-active="motionActive" />
  </aside>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useDelayedRender } from '../../composables/useDelayedRender.ts'
import { useInlineDockResize } from '../../composables/useInlineDockResize.ts'
import ResizeHandle from './ResizeHandle.vue'

const props = defineProps({
  ariaLabel: { type: String, default: '' },
  open: { type: Boolean, default: false },
  renderActive: { type: Boolean, default: true },
  resizing: { type: Boolean, default: false },
  width: { type: Number, default: 360 },
  closeDelayMs: { type: Number, default: 680 },
  motionDelayMs: { type: Number, default: 680 },
  regionClass: { type: [String, Array, Object], default: '' },
  resizeSlotClass: { type: [String, Array, Object], default: '' },
  resizeHandleClass: { type: [String, Array, Object], default: '' },
  getContainerWidth: { type: Function, default: null },
})

const emit = defineEmits([
  'motion-state-change',
  'resize',
  'resize-start',
  'resize-end',
  'resize-snap',
])

const motionActive = ref(false)
const renderSource = computed(() => props.open && props.renderActive)
const shouldRenderContent = useDelayedRender(
  () => renderSource.value,
  { delayMs: props.closeDelayMs }
)
let motionTimer = null

function clearMotionTimer() {
  if (motionTimer === null) return
  globalThis.clearTimeout?.(motionTimer)
  motionTimer = null
}

function setMotionActive(nextValue) {
  if (motionActive.value === nextValue) return
  motionActive.value = nextValue
  emit('motion-state-change', nextValue)
}

function startMotionWindow() {
  clearMotionTimer()
  setMotionActive(true)
  const delayMs = Math.max(0, Number(props.motionDelayMs) || 0)
  motionTimer = globalThis.setTimeout?.(() => {
    motionTimer = null
    setMotionActive(false)
  }, delayMs) ?? null

  if (motionTimer === null) {
    setMotionActive(false)
  }
}

watch(
  () => props.open,
  (isOpen, wasOpen) => {
    if (wasOpen === undefined || isOpen === wasOpen) return
    startMotionWindow()
  }
)

onBeforeUnmount(() => {
  clearMotionTimer()
})

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
