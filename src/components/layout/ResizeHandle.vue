<template>
  <div
    class="resize-handle"
    :class="[direction, { dragging }]"
    @mousedown.prevent="startDrag"
    @dblclick.prevent="$emit('dblclick')"
  ></div>
</template>

<script setup>
import { ref } from 'vue'
import { setShellResizeActive } from '../../shared/shellResizeSignals'

const props = defineProps({
  direction: { type: String, default: 'vertical' }, // 'vertical' (left/right) or 'horizontal' (top/bottom)
})

const emit = defineEmits(['resize', 'resize-start', 'resize-end', 'dblclick'])

const dragging = ref(false)

function startDrag(e) {
  dragging.value = true
  emit('resize-start')
  setShellResizeActive(true, { source: 'layout-handle', direction: props.direction })
  const startX = e.clientX
  const startY = e.clientY

  // Prevent iframes from capturing mouse events during drag
  const style = document.createElement('style')
  style.id = 'resize-drag-iframe-block'
  style.textContent = 'iframe { pointer-events: none !important; }'
  document.head.appendChild(style)

  function onMouseMove(e) {
    const dx = e.clientX - startX
    const dy = e.clientY - startY
    emit('resize', { dx, dy, x: e.clientX, y: e.clientY })
  }

  function onMouseUp() {
    dragging.value = false
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    document.getElementById('resize-drag-iframe-block')?.remove()
    setShellResizeActive(false, { source: 'layout-handle', direction: props.direction })
    emit('resize-end')
  }

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
  document.body.style.cursor = props.direction === 'vertical' ? 'col-resize' : 'row-resize'
  document.body.style.userSelect = 'none'
}
</script>

<style scoped>
.resize-handle {
  flex-shrink: 0;
  z-index: 10;
  position: relative;
  transition: background 0.15s;
}

.resize-handle.vertical {
  width: 8px;
  cursor: col-resize;
  background: transparent;
}

.resize-handle.vertical::before {
  content: '';
  position: absolute;
  top: 12px;
  bottom: 12px;
  left: 0;
  right: 0;
  margin: 0 auto;
  width: 1px;
  border-radius: 999px;
  cursor: col-resize;
  background: var(--workbench-divider-soft);
  opacity: 1;
  transition:
    opacity 140ms ease,
    background-color 140ms ease,
    width 140ms ease;
}

.resize-handle.horizontal {
  height: 6px;
  cursor: row-resize;
  background: transparent;
}

.resize-handle.horizontal::before {
  content: '';
  position: absolute;
  left: 12px;
  right: 12px;
  top: 2px;
  height: 1px;
  border-radius: 999px;
  cursor: row-resize;
  background: color-mix(in srgb, var(--panel-border) 42%, transparent);
  opacity: 1;
  transition:
    opacity 140ms ease,
    background-color 140ms ease,
    height 140ms ease;
}

.resize-handle:hover::before {
  opacity: 1;
  background: color-mix(in srgb, var(--accent) 18%, var(--workbench-divider-soft));
}

.resize-handle.vertical:hover::before,
.resize-handle.vertical.dragging::before {
  width: 2px;
}

.resize-handle.horizontal:hover::before,
.resize-handle.horizontal.dragging::before {
  height: 2px;
}

.resize-handle.dragging::before {
  opacity: 1;
  background: color-mix(in srgb, var(--accent) 24%, transparent);
}
</style>
