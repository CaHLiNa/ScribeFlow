<template>
  <div
    class="split-handle shrink-0"
    :class="[direction, { dragging }]"
    @mousedown.prevent="startDrag"
  ></div>
</template>

<script setup>
import { ref } from 'vue'
import { setShellResizeActive } from '../../shared/shellResizeSignals'

const props = defineProps({
  direction: { type: String, default: 'vertical' },
})

const emit = defineEmits(['resize', 'resize-start', 'resize-end'])
const dragging = ref(false)

function startDrag(e) {
  dragging.value = true
  emit('resize-start')
  setShellResizeActive(true, { source: 'split-handle', direction: props.direction })

  // Prevent iframes from capturing mouse events during drag
  const style = document.createElement('style')
  style.id = 'split-drag-iframe-block'
  style.textContent = 'iframe { pointer-events: none !important; }'
  document.head.appendChild(style)

  function onMouseMove(e) {
    emit('resize', { x: e.clientX, y: e.clientY, target: e.target })
  }

  function onMouseUp() {
    dragging.value = false
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    document.getElementById('split-drag-iframe-block')?.remove()
    setShellResizeActive(false, { source: 'split-handle', direction: props.direction })
    emit('resize-end')
  }

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
  document.body.style.cursor = props.direction === 'vertical' ? 'col-resize' : 'row-resize'
  document.body.style.userSelect = 'none'
}
</script>

<style scoped>
.split-handle {
  z-index: 5;
  background: transparent;
  position: relative;
}
.split-handle::before {
  content: '';
  position: absolute;
  background: var(--workbench-divider-soft);
  opacity: 1;
  transition:
    background 0.15s,
    opacity 0.15s;
}
.split-handle.vertical {
  width: 1px;
  margin: 0;
  cursor: col-resize;
}
.split-handle.vertical::before {
  top: 0;
  bottom: 0;
  left: 50%;
  transform: translateX(-0.5px);
  width: 1px;
}
.split-handle.horizontal {
  height: 1px;
  margin: 0;
  cursor: row-resize;
}
.split-handle.horizontal::before {
  left: 0;
  right: 0;
  top: 50%;
  transform: translateY(-0.5px);
  height: 1px;
}
.split-handle:hover::before,
.split-handle.dragging::before {
  opacity: 1;
}

.split-handle:hover::before {
  background: var(--workbench-divider);
}

.split-handle.dragging::before {
  opacity: 1;
  background: color-mix(in srgb, var(--accent) 26%, var(--workbench-divider));
}
</style>
