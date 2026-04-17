<!-- START OF FILE src/components/shared/ui/UiModalShell.vue -->
<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div
        v-if="visible"
        class="ui-modal-overlay"
        :class="[`ui-modal-overlay--${position}`, overlayClass]"
      >
        <!-- 遮罩层 -->
        <div class="ui-modal-backdrop ui-overlay-scrim" @mousedown="handleBackdropClick"></div>

        <!-- 弹窗本体 -->
        <div
          class="ui-modal-surface"
          :class="[
            `ui-modal-surface--${size}`,
            {
              'is-flush': !bodyPadding,
              'is-absolute': position === 'absolute',
            },
            surfaceClass,
          ]"
          :style="surfaceStyle"
          role="dialog"
          aria-modal="true"
        >
          <div v-if="$slots.header" class="ui-modal-header">
            <slot name="header" />
          </div>
          <div class="ui-modal-body" :class="[bodyClass, { 'is-flush': !bodyPadding }]">
            <slot />
          </div>
          <div v-if="$slots.footer" class="ui-modal-footer">
            <slot name="footer" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { onUnmounted, watch } from 'vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  closeOnBackdrop: { type: Boolean, default: true },
  size: { type: String, default: 'md' },
  position: { type: String, default: 'center' },
  bodyPadding: { type: Boolean, default: true },
  overlayClass: { type: [String, Array, Object], default: '' },
  surfaceClass: { type: [String, Array, Object], default: '' },
  bodyClass: { type: [String, Array, Object], default: '' },
  surfaceStyle: { type: [String, Object, Array], default: '' },
})

const emit = defineEmits(['close'])

function handleBackdropClick() {
  if (props.closeOnBackdrop) {
    emit('close')
  }
}

function handleKeyDown(e) {
  if (props.visible && e.key === 'Escape') {
    emit('close')
  }
}

watch(
  () => props.visible,
  (isVisible) => {
    if (isVisible) {
      document.addEventListener('keydown', handleKeyDown)
    } else {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }
)

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeyDown)
})
</script>

<style scoped>
.ui-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  display: flex;
  padding: var(--space-5);
}

.ui-modal-backdrop {
  position: absolute;
  inset: 0;
}

.ui-modal-overlay--center {
  align-items: center;
  justify-content: center;
}

.ui-modal-overlay--absolute {
  align-items: stretch;
  justify-content: stretch;
}

.ui-modal-surface {
  position: relative;
  display: flex;
  flex-direction: column;
  max-width: min(100%, 90vw);
  max-height: min(100%, 90vh);
  border: 1px solid var(--border-subtle);
  border-radius: var(--shell-radius-lg);
  background: var(--surface-raised);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
  z-index: 1;
}

.ui-modal-surface.is-absolute {
  position: absolute;
}

.ui-modal-surface--sm {
  width: min(420px, 100%);
}
.ui-modal-surface--md {
  width: min(520px, 100%);
}
.ui-modal-surface--lg {
  width: min(760px, 100%);
}
.ui-modal-surface--xl {
  width: min(1000px, 100%);
}

.ui-modal-header,
.ui-modal-footer {
  flex: 0 0 auto;
}

.ui-modal-body {
  min-height: 0;
  padding: var(--space-4);
  overflow-y: auto;
}

.ui-modal-body.is-flush {
  padding: 0;
}

/* 原生弹窗进场动画 */
.modal-fade-enter-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
.modal-fade-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}
.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}
.modal-fade-enter-from .ui-modal-surface {
  transform: scale(0.97) translateY(10px);
}
.modal-fade-leave-to .ui-modal-surface {
  transform: scale(0.98) translateY(5px);
}
</style>
