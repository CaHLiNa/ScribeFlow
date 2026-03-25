<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 z-[1001]"
      @mousedown="emit('close')"
      @contextmenu.prevent="emit('close')"
    >
      <div
        ref="menuRef"
        class="context-menu surface-context-menu"
        :style="menuStyle"
        @mousedown.stop
        @click.stop
        @contextmenu.prevent.stop
      >
        <template v-for="(group, groupIndex) in normalizedGroups" :key="group.key || groupIndex">
          <div v-if="groupIndex > 0" class="context-menu-separator"></div>
          <div v-if="group.label" class="context-menu-section">{{ group.label }}</div>
          <button
            v-for="item in group.items"
            :key="item.key"
            type="button"
            class="context-menu-item surface-context-menu-item"
            :class="{ 'context-menu-item-danger': item.danger }"
            :disabled="item.disabled"
            @click="handleSelect(item)"
          >
            <span class="surface-context-menu-label">{{ item.label }}</span>
            <span v-if="item.meta" class="surface-context-menu-meta">{{ item.meta }}</span>
            <span v-else-if="item.checked" class="surface-context-menu-check">✓</span>
          </button>
        </template>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, onUpdated, ref, watch } from 'vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  x: { type: Number, default: 0 },
  y: { type: Number, default: 0 },
  groups: { type: Array, default: () => [] },
})

const emit = defineEmits(['close', 'select'])

const menuRef = ref(null)
const menuWidth = ref(0)
const menuHeight = ref(0)

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

const menuStyle = computed(() => {
  const margin = 8
  const maxX = Math.max(margin, window.innerWidth - menuWidth.value - margin)
  const maxY = Math.max(margin, window.innerHeight - menuHeight.value - margin)
  return {
    left: `${Math.min(Math.max(props.x, margin), maxX)}px`,
    top: `${Math.min(Math.max(props.y, margin), maxY)}px`,
  }
})

function syncSize() {
  nextTick(() => {
    menuWidth.value = menuRef.value?.offsetWidth || 0
    menuHeight.value = menuRef.value?.offsetHeight || 0
  })
}

function handleSelect(item) {
  if (!item || item.disabled) return
  emit('select', item.key, item)
  emit('close')
}

function handleKeydown(event) {
  if (event.key === 'Escape') {
    emit('close')
  }
}

watch(
  () => props.visible,
  (visible) => {
    if (visible) syncSize()
  }
)

watch(
  normalizedGroups,
  () => {
    if (props.visible) syncSize()
  },
  { deep: true }
)

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onUpdated(() => {
  if (props.visible) syncSize()
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<style scoped>
.surface-context-menu {
  min-width: 220px !important;
  max-width: min(320px, calc(100vw - 16px)) !important;
}

.surface-context-menu-item {
  width: 100%;
  border: none;
  background: transparent;
  text-align: left;
}

.surface-context-menu-item:disabled {
  cursor: default;
  color: var(--fg-muted) !important;
  opacity: 0.72;
}

.surface-context-menu-item:disabled:hover {
  background: transparent !important;
  color: var(--fg-muted) !important;
}

.surface-context-menu-label {
  min-width: 0;
  flex: 1 1 auto;
}

.surface-context-menu-meta,
.surface-context-menu-check {
  flex: 0 0 auto;
  font-size: var(--ui-font-caption);
  color: var(--fg-muted);
}

.surface-context-menu-check {
  color: var(--accent);
}
</style>
