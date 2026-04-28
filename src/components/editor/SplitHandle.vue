<!-- START OF FILE src/components/editor/SplitHandle.vue -->
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
  position: relative;
  z-index: 5;
  background: transparent;
}

/* 核心：将边框设为透明，鼠标经过才展示亮色 Accent */
.split-handle::before {
  content: '';
  position: absolute;
  background: var(--workbench-divider-soft);
  opacity: 0;
  transition: opacity 0.2s ease, background 0.2s ease;
}

.split-handle.vertical {
  width: 1px;
  margin: 0;
  cursor: col-resize;
}

/* 热区（不可见） */
.split-handle.vertical::after {
  content: '';
  position: absolute;
  left: -4px;
  right: -4px;
  top: 0;
  bottom: 0;
  z-index: 1;
}

/* 视觉线 */
.split-handle.vertical::before {
  top: 0;
  bottom: 0;
  left: -1px;
  width: 3px;
}

.split-handle.horizontal {
  height: 1px;
  margin: 0;
  cursor: row-resize;
}

.split-handle.horizontal::after {
  content: '';
  position: absolute;
  top: -4px;
  bottom: -4px;
  left: 0;
  right: 0;
  z-index: 1;
}

.split-handle.horizontal::before {
  left: 0;
  right: 0;
  top: -1px;
  height: 3px;
}

.split-handle:hover::before,
.split-handle.dragging::before {
  opacity: 1;
  background: var(--accent);
}
</style>