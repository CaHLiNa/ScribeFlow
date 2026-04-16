<!-- START OF FILE src/components/shared/SurfaceContextMenu.vue -->
<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="context-menu-backdrop"
      @mousedown.prevent.stop="handleClose"
      @contextmenu.prevent.stop="handleClose"
    ></div>

    <Transition name="menu-fade">
      <div
        v-if="visible"
        ref="menuRef"
        class="context-menu surface-context-menu"
        :style="menuStyle"
        @contextmenu.prevent.stop
      >
        <template v-for="(group, groupIndex) in normalizedGroups" :key="group.key || groupIndex">
          <div v-if="groupIndex > 0" class="context-menu-separator"></div>
          <div v-if="group.label" class="context-menu-section">{{ group.label }}</div>

          <template v-for="item in group.items" :key="item.key">
            <!-- 有子菜单的项 -->
            <div
              v-if="hasChildren(item)"
              class="context-menu-item surface-context-menu-item has-submenu"
              :class="{ 'is-disabled': item.disabled }"
              @mouseenter="!item.disabled && (activeSubMenu = item.key)"
              @mouseleave="activeSubMenu = null"
            >
              <span class="surface-context-menu-label">{{ item.label }}</span>
              <IconChevronRight
                class="surface-context-menu-chevron"
                :size="14"
                :stroke-width="1.8"
              />

              <!-- 展开的子菜单 -->
              <div v-show="activeSubMenu === item.key" class="context-menu submenu-popover">
                <button
                  v-for="child in normalizedChildren(item)"
                  :key="child.key"
                  type="button"
                  class="context-menu-item surface-context-menu-item"
                  :class="{
                    'context-menu-item-danger': child.danger,
                    'is-disabled': child.disabled,
                  }"
                  @click.stop="handleSelect(child)"
                >
                  <span class="surface-context-menu-label">{{ child.label }}</span>
                  <span v-if="child.meta" class="surface-context-menu-meta">{{ child.meta }}</span>
                  <span v-else-if="child.checked" class="surface-context-menu-check">✓</span>
                </button>
              </div>
            </div>

            <!-- 普通菜单项 -->
            <button
              v-else
              type="button"
              class="context-menu-item surface-context-menu-item"
              :class="{ 'context-menu-item-danger': item.danger, 'is-disabled': item.disabled }"
              @click.stop="handleSelect(item)"
              @mouseenter="activeSubMenu = null"
            >
              <span class="surface-context-menu-label">{{ item.label }}</span>
              <span v-if="item.meta" class="surface-context-menu-meta">{{ item.meta }}</span>
              <span v-else-if="item.checked" class="surface-context-menu-check">✓</span>
            </button>
          </template>
        </template>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed, ref, watch, nextTick, onBeforeUnmount } from 'vue'
import { IconChevronRight } from '@tabler/icons-vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  x: { type: Number, default: 0 },
  y: { type: Number, default: 0 },
  groups: { type: Array, default: () => [] },
})

const emit = defineEmits(['close', 'select'])

const menuRef = ref(null)
const menuStyle = ref({ top: '0px', left: '0px' })
const activeSubMenu = ref(null)

const normalizedGroups = computed(() =>
  (props.groups || [])
    .map((group, index) => ({
      key: group?.key || `group-${index}`,
      label: group?.label || '',
      items: Array.isArray(group?.items)
        ? group.items.filter((item) => !!item?.key && !!item?.label)
        : [],
    }))
    .filter((group) => group.items.length > 0)
)

function hasChildren(item) {
  return (
    Array.isArray(item?.children) && item.children.some((child) => !!child?.key && !!child?.label)
  )
}

function normalizedChildren(item) {
  return Array.isArray(item?.children)
    ? item.children.filter((child) => !!child?.key && !!child?.label)
    : []
}

function handleSelect(item) {
  if (!item || item.disabled || hasChildren(item)) return
  emit('select', item.key, item)
  handleClose()
}

function handleClose() {
  activeSubMenu.value = null
  emit('close')
}

function handleKeyDown(e) {
  if (props.visible && e.key === 'Escape') {
    handleClose()
  }
}

// 原生碰撞计算引擎
async function calculatePosition() {
  menuStyle.value = { top: `${props.y}px`, left: `${props.x}px` }
  await nextTick()
  if (!menuRef.value) return

  const rect = menuRef.value.getBoundingClientRect()
  const vh = window.innerHeight || document.documentElement.clientHeight
  const vw = window.innerWidth || document.documentElement.clientWidth

  let top = props.y
  let left = props.x

  // 防溢出保护
  if (top + rect.height > vh) top = Math.max(8, vh - rect.height - 8)
  if (left + rect.width > vw) left = Math.max(8, vw - rect.width - 8)

  menuStyle.value = { top: `${top}px`, left: `${left}px` }
}

watch(
  () => props.visible,
  (isVisible) => {
    if (isVisible) {
      calculatePosition()
      document.addEventListener('keydown', handleKeyDown)
    } else {
      document.removeEventListener('keydown', handleKeyDown)
      activeSubMenu.value = null
    }
  }
)

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeyDown)
})
</script>

<style scoped>
.context-menu-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9998;
  cursor: default;
}

.surface-context-menu {
  position: fixed;
  min-width: 220px !important;
  max-width: min(320px, calc(100vw - 16px)) !important;
  max-height: min(400px, calc(100vh - 16px)) !important;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.surface-context-menu-item {
  width: 100%;
  border: none;
  background: transparent;
  text-align: left;
  font-size: 13px;
  outline: none;
}

.surface-context-menu-item.is-disabled {
  opacity: 0.45;
  cursor: default;
  color: var(--text-muted) !important;
}
.surface-context-menu-item.is-disabled:hover {
  background: transparent !important;
}

.surface-context-menu-label {
  min-width: 0;
  flex: 1 1 auto;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.surface-context-menu-meta,
.surface-context-menu-check {
  flex: 0 0 auto;
  font-size: 11px;
  color: var(--text-muted);
}

.surface-context-menu-check {
  color: var(--text-primary);
}
.surface-context-menu-item:hover .surface-context-menu-check {
  color: var(--list-active-fg);
}

.surface-context-menu-chevron {
  flex: 0 0 auto;
  color: var(--text-muted);
  margin-right: -4px;
}
.surface-context-menu-item:hover .surface-context-menu-chevron {
  color: var(--list-active-fg);
}

/* 子菜单定位 */
.has-submenu {
  position: relative;
}
.submenu-popover {
  position: absolute;
  top: -5px;
  left: 100%;
  margin-left: 2px;
  min-width: 180px;
  max-height: 300px;
  overflow-y: auto;
}

.menu-fade-enter-active {
  transition:
    opacity 0.1s ease-out,
    transform 0.1s cubic-bezier(0.16, 1, 0.3, 1);
}
.menu-fade-leave-active {
  transition: opacity 0.1s ease-in;
}
.menu-fade-enter-from {
  opacity: 0;
  transform: scaleY(0.98) translateY(-2px);
}
.menu-fade-leave-to {
  opacity: 0;
}
</style>
