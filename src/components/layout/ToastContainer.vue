<template>
  <Teleport to="body">
    <div class="toast-container">
      <TransitionGroup name="toast">
        <div
          v-for="toast in toastStore.toasts"
          :key="toast.id"
          class="toast-item"
          :class="`toast-${toast.type}`"
          @click="!toast.action && toastStore.dismiss(toast.id)"
        >
          <component
            :is="typeIcon(toast.type)"
            :size="16"
            :stroke-width="2"
            class="toast-type-icon"
          />
          <span class="toast-message">{{ toast.message }}</span>
          <UiButton
            v-if="toast.action"
            class="toast-action-btn"
            variant="primary"
            size="sm"
            @click.stop="handleToastAction(toast)"
          >
            {{ toast.action.label }}
          </UiButton>
          <UiButton
            v-if="toast.action"
            class="toast-dismiss-btn"
            variant="ghost"
            size="icon-sm"
            icon-only
            @click.stop="toastStore.dismiss(toast.id)"
          >
            <IconX :size="14" :stroke-width="2" />
          </UiButton>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<script setup>
import { useToastStore } from '../../stores/toast'
import {
  IconCircleCheck,
  IconCircleX,
  IconAlertTriangle,
  IconInfoCircle,
  IconX,
} from '@tabler/icons-vue'
import UiButton from '../shared/ui/UiButton.vue'

const toastStore = useToastStore()

function typeIcon(type) {
  switch (type) {
    case 'success':
      return IconCircleCheck
    case 'error':
      return IconCircleX
    case 'warning':
      return IconAlertTriangle
    case 'info':
      return IconInfoCircle
    default:
      return IconInfoCircle
  }
}

function handleToastAction(toast) {
  toast.action?.onClick?.()
  toastStore.dismiss(toast.id)
}
</script>

<style scoped>
.toast-container {
  position: fixed;
  bottom: 32px;
  right: 24px;
  z-index: var(--z-toast);
  display: flex;
  flex-direction: column-reverse; /* 新消息在底部 */
  gap: 12px;
  pointer-events: none;
}

.toast-item {
  pointer-events: auto;
  padding: 10px 16px;
  border-radius: 12px; /* macOS 原生胶囊圆角 */
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;

  /* 核心：极其高级的毛玻璃胶囊效果 */
  background: color-mix(in srgb, var(--surface-raised) 75%, transparent);
  backdrop-filter: blur(40px) saturate(1.5);
  border: 1px solid color-mix(in srgb, var(--border) 40%, transparent);
  box-shadow:
    0 12px 32px rgba(0, 0, 0, 0.15),
    0 0 0 1px rgba(0, 0, 0, 0.02);

  color: var(--text-primary);
  max-width: 360px;
  line-height: 1.4;
  display: flex;
  align-items: center;
  gap: 12px;
}

.theme-light .toast-item {
  background: rgba(255, 255, 255, 0.75);
  box-shadow:
    0 8px 24px rgba(0, 0, 0, 0.1),
    0 0 0 1px rgba(0, 0, 0, 0.05);
}

.toast-type-icon {
  flex-shrink: 0;
}

.toast-message {
  flex: 1;
}

.toast-action-btn {
  white-space: nowrap;
}

.toast-dismiss-btn {
  display: flex;
  align-items: center;
  padding: 0;
  margin-left: -4px;
  line-height: 1;
  color: var(--text-muted);
  border-radius: 50%;
}

.toast-dismiss-btn:hover {
  background: color-mix(in srgb, var(--text-primary) 10%, transparent);
  color: var(--text-primary);
}

/* 颜色标记：不再粗暴地更改背景，而是以高亮边框和发光图标的形式暗示状态 */
.toast-success .toast-type-icon {
  color: var(--success);
}
.toast-error .toast-type-icon {
  color: var(--error);
}
.toast-warning .toast-type-icon {
  color: var(--warning);
}
.toast-info .toast-type-icon {
  color: var(--accent);
}

/* 进出场动画，采用弹性曲线（Spring-like） */
.toast-enter-active {
  transition:
    opacity 0.4s cubic-bezier(0.16, 1, 0.3, 1),
    transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}
.toast-leave-active {
  transition:
    opacity 0.2s ease-in,
    transform 0.2s ease-in;
}
.toast-enter-from {
  opacity: 0;
  transform: translateY(20px) scale(0.95);
}
.toast-leave-to {
  opacity: 0;
  transform: translateX(20px) scale(0.95);
}
.toast-move {
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
</style>
