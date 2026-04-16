<!-- START OF FILE src/components/shared/ui/UiSelect.vue -->
<template>
  <div ref="shellRef" class="ui-select-shell" :class="shellClassName">
    <!-- 触发按钮 -->
    <button
      ref="triggerRef"
      type="button"
      class="ui-select-trigger"
      :disabled="disabled"
      :aria-label="triggerLabel"
      @click="toggleOpen"
      @focus="emit('focus', $event)"
      @blur="emit('blur', $event)"
    >
      <span class="ui-select-value">{{ selectedLabel || placeholder }}</span>
      <span class="ui-select-caret" :class="{ 'is-open': isOpen }" aria-hidden="true">
        <svg
          width="12"
          height="12"
          viewBox="0 0 15 15"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M4.5 9.5L7.5 12.5L10.5 9.5" />
          <path d="M4.5 5.5L7.5 2.5L10.5 5.5" />
        </svg>
      </span>
    </button>

    <!-- 纯原生传送门，脱离所有父级容器的样式干扰 -->
    <Teleport to="body">
      <!-- 全屏透明遮罩：点击外部关闭菜单 -->
      <div
        v-if="isOpen"
        class="ui-select-backdrop"
        @click.stop="close"
        @wheel.prevent.stop
        @touchmove.prevent.stop
      ></div>

      <!-- 下拉菜单本尊 -->
      <Transition name="popover">
        <div v-if="isOpen" ref="menuRef" class="ui-select-menu" :style="menuStyle">
          <div class="ui-select-viewport scrollbar-hidden">
            <button
              v-for="(option, index) in normalizedOptions"
              :key="index"
              type="button"
              class="ui-select-option"
              :class="{ 'is-selected': isSelected(option) }"
              :disabled="option.disabled"
              @click.stop="selectOption(option)"
            >
              <span class="ui-select-option-label">{{ option.label }}</span>
              <span v-if="isSelected(option)" class="ui-select-option-check" aria-hidden="true"
                >✓</span
              >
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, ref, nextTick, onBeforeUnmount } from 'vue'

const props = defineProps({
  modelValue: { type: [String, Number, Boolean], default: '' },
  disabled: { type: Boolean, default: false },
  shellClass: { type: [String, Array, Object], default: '' },
  size: { type: String, default: 'md' },
  options: { type: Array, default: () => [] },
  ariaLabel: { type: String, default: '' },
  placeholder: { type: String, default: '' },
})

const emit = defineEmits(['update:modelValue', 'focus', 'blur'])

const shellRef = ref(null)
const triggerRef = ref(null)
const menuRef = ref(null)
const isOpen = ref(false)
const menuStyle = ref({})

// 数据标准化
const normalizedOptions = computed(() =>
  (props.options || []).map((option) => {
    if (option && typeof option === 'object' && 'value' in option) {
      return {
        value: option.value,
        label: option.label ?? String(option.value ?? ''),
        disabled: option.disabled === true,
      }
    }
    return { value: option, label: String(option ?? ''), disabled: false }
  })
)

const selectedOption = computed(
  () => normalizedOptions.value.find((o) => o.value === props.modelValue) || null
)
const selectedLabel = computed(() => selectedOption.value?.label || '')
const triggerLabel = computed(() => props.ariaLabel || selectedLabel.value || 'Select')

const shellClassName = computed(() => [
  `ui-select-shell--${props.size}`,
  props.shellClass,
  { 'is-disabled': props.disabled, 'is-open': isOpen.value },
])

function isSelected(option) {
  return option.value === props.modelValue
}

// 核心：原生绝对定位算法（绝对精确，绝不跑飞）
async function calculatePosition() {
  if (!triggerRef.value) return
  const rect = triggerRef.value.getBoundingClientRect()

  // 默认在下方展示
  menuStyle.value = {
    top: `${rect.bottom + 6}px`,
    left: `${rect.left}px`,
    minWidth: `${rect.width}px`,
    maxWidth: `min(100vw - 32px, 460px)`,
  }

  await nextTick()
  if (!menuRef.value) return

  // 视口边界碰撞检测：如果超出了屏幕底部，就往上翻转
  const menuRect = menuRef.value.getBoundingClientRect()
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight

  if (menuRect.bottom > viewportHeight - 12) {
    menuStyle.value.top = `${rect.top - menuRect.height - 6}px`
  }
}

function handleGlobalEvents(e) {
  if (e.key === 'Escape') close()
}

function toggleOpen() {
  if (props.disabled) return
  if (isOpen.value) {
    close()
  } else {
    isOpen.value = true
    calculatePosition()
    window.addEventListener('resize', close)
    window.addEventListener('keydown', handleGlobalEvents)
  }
}

function close() {
  isOpen.value = false
  window.removeEventListener('resize', close)
  window.removeEventListener('keydown', handleGlobalEvents)
}

function selectOption(option) {
  if (option.disabled) return
  emit('update:modelValue', option.value)
  close()
}

onBeforeUnmount(() => {
  window.removeEventListener('resize', close)
  window.removeEventListener('keydown', handleGlobalEvents)
})

defineExpose({
  el: triggerRef,
  focus: () => triggerRef.value?.focus(),
  blur: () => triggerRef.value?.blur(),
  click: () => toggleOpen(),
})
</script>

<style scoped>
.ui-select-shell {
  position: relative;
  display: inline-flex;
  width: 100%;
  min-width: 0;
}

.ui-select-trigger {
  position: relative;
  display: inline-flex;
  align-items: center;
  width: 100%;
  min-width: 0;
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  background: var(--surface-base);
  color: var(--text-primary);
  font: inherit;
  text-align: left;
  transition:
    border-color 0.15s,
    box-shadow 0.15s,
    background-color 0.15s;
  cursor: pointer;
  outline: none;
}

.ui-select-trigger:focus-visible {
  border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
  box-shadow:
    0 0 0 3px color-mix(in srgb, var(--accent) 30%, transparent),
    0 0 0 1px var(--accent);
}

.ui-select-trigger:disabled {
  opacity: 0.55;
  cursor: default;
}

.ui-select-shell--sm .ui-select-trigger {
  height: 24px;
  padding: 0 28px 0 10px;
}

.ui-select-shell--md .ui-select-trigger {
  height: 28px;
  padding: 0 32px 0 12px;
}

.ui-select-shell--lg .ui-select-trigger {
  height: 32px;
  padding: 0 36px 0 12px;
}

.ui-select-value {
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ui-select-caret {
  position: absolute;
  top: 50%;
  right: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  pointer-events: none;
  transform: translateY(-50%);
  opacity: 0.8;
  transition:
    transform 0.2s ease,
    opacity 0.2s ease;
}

.ui-select-caret.is-open {
  transform: translateY(-50%) rotate(180deg);
  opacity: 1;
}

/* =========================================================================
   纯原生菜单面板，抛弃第三方库
========================================================================= */

/* 全屏隐形遮罩，确保点击空白处关闭且滚动不溢出 */
.ui-select-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9998;
  cursor: default;
}

.ui-select-menu {
  position: fixed; /* 脱离文档流 */
  z-index: 9999;
  display: flex;
  flex-direction: column;
  padding: 5px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--surface-raised) 70%, transparent);
  backdrop-filter: blur(40px) saturate(1.5);
  border: 1px solid color-mix(in srgb, var(--border) 40%, transparent);
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.15),
    0 0 0 1px rgba(0, 0, 0, 0.05);
}

.theme-light .ui-select-menu {
  background: rgba(255, 255, 255, 0.85);
  box-shadow:
    0 8px 24px rgba(0, 0, 0, 0.1),
    0 0 0 1px rgba(0, 0, 0, 0.05);
}

.ui-select-viewport {
  flex: 1;
  overflow-y: auto;
  width: 100%;
  max-height: 40vh; /* 防止超长选项撑爆屏幕 */
}

.ui-select-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  height: 24px;
  padding: 0 8px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  outline: none;
}

.ui-select-option:hover:not(:disabled) {
  background: var(--list-active-bg);
  color: var(--list-active-fg);
}

.ui-select-option:disabled {
  opacity: 0.45;
  cursor: default;
}

.ui-select-option-label {
  min-width: 0;
  flex: 1 1 auto;
}

.ui-select-option-check {
  flex: 0 0 auto;
  color: var(--text-primary);
}

.ui-select-option:hover .ui-select-option-check {
  color: var(--list-active-fg);
}

/* 原生弹窗动画 */
.popover-enter-active {
  transition:
    opacity 0.15s ease-out,
    transform 0.15s cubic-bezier(0.16, 1, 0.3, 1);
}
.popover-leave-active {
  transition:
    opacity 0.1s ease-in,
    transform 0.1s ease-in;
}
.popover-enter-from {
  opacity: 0;
  transform: scaleY(0.95) translateY(-4px);
}
.popover-leave-to {
  opacity: 0;
}
</style>
