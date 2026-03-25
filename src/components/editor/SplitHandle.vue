<template>
  <div
    class="split-handle shrink-0"
    :class="[direction, { dragging }]"
    @mousedown.prevent="startDrag"
  ></div>
</template>

<script setup>
import { ref } from 'vue'

const props = defineProps({
  direction: { type: String, default: 'vertical' },
})

const emit = defineEmits(['resize'])
const dragging = ref(false)

function startDrag(e) {
  dragging.value = true

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
  background: var(--border);
  transition: background 0.15s;
}
.split-handle.vertical {
  width: 5px;
  margin: 0 -2px;
  cursor: col-resize;
}
.split-handle.vertical::before {
  top: 0;
  bottom: 0;
  left: 2px;
  width: 1px;
}
.split-handle.horizontal {
  height: 5px;
  margin: -2px 0;
  cursor: row-resize;
}
.split-handle.horizontal::before {
  left: 0;
  right: 0;
  top: 2px;
  height: 1px;
}
.split-handle:hover::before,
.split-handle.dragging::before {
  background: var(--accent);
}
</style>
