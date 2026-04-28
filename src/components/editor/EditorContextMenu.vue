<!-- START OF FILE src/components/editor/EditorContextMenu.vue -->
<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="context-menu-backdrop"
      @mousedown.prevent.stop="emit('close')"
      @contextmenu.prevent.stop="emit('close')"
    ></div>

    <Transition name="menu-fade">
      <div
        v-if="visible"
        ref="menuRef"
        class="context-menu"
        :style="menuStyle"
        @contextmenu.prevent.stop
      >
        <template v-for="(group, groupIndex) in menuGroups" :key="group.key">
          <div v-if="groupIndex > 0" class="context-menu-separator"></div>
          <button
            v-for="item in group.items"
            :key="item.key"
            type="button"
            class="context-menu-item"
            @click.stop="handleSelect(item)"
          >
            <span>{{ item.label }}</span>
          </button>
        </template>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed, ref, watch, nextTick, onBeforeUnmount } from 'vue'
import { useI18n } from '../../i18n'
import { useTransientOverlayDismiss } from '../../composables/useTransientOverlayDismiss'
import { readNativeClipboardText } from '../../services/nativeClipboard.js'

const props = defineProps({
  visible: { type: Boolean, default: false },
  x: { type: Number, default: 0 },
  y: { type: Number, default: 0 },
  hasSelection: { type: Boolean, default: false },
  view: { type: Object, default: null },
  showFormatDocument: { type: Boolean, default: false },
  showInsertCitation: { type: Boolean, default: false },
  showMarkdownInsertTable: { type: Boolean, default: false },
  showMarkdownFormatTable: { type: Boolean, default: false },
})

const emit = defineEmits([
  'close',
  'format-document',
  'insert-citation',
  'insert-markdown-table',
  'format-markdown-table',
  'paste-unavailable',
])
const { t } = useI18n()
const { dismissOtherTransientOverlays } = useTransientOverlayDismiss('editor-context-menu', () =>
  emit('close')
)

const menuRef = ref(null)
const menuStyle = ref({ top: '0px', left: '0px' })

const menuGroups = computed(() => {
  const editingItems = props.hasSelection
    ? [
        { key: 'cut', label: t('Cut'), action: cut },
        { key: 'copy', label: t('Copy'), action: copy },
        { key: 'paste', label: t('Paste'), action: paste },
      ]
    : [
        { key: 'paste', label: t('Paste'), action: paste },
        { key: 'select-all', label: t('Select All'), action: selectAll },
      ]

  const tableItems = []
  const citationItems = props.showInsertCitation
    ? [{ key: 'insert-citation', label: t('Insert Citation'), action: insertCitation }]
    : []
  if (props.showMarkdownInsertTable)
    tableItems.push({ key: 'insert', label: t('Insert Table'), action: insertMarkdownTable })
  if (props.showMarkdownFormatTable)
    tableItems.push({ key: 'format', label: t('Format Table'), action: formatMarkdownTable })

  const formatItems = props.showFormatDocument
    ? [{ key: 'format-doc', label: t('Format Document'), action: formatDocument }]
    : []

  return [
    { key: 'editing', items: editingItems },
    ...(citationItems.length ? [{ key: 'citations', items: citationItems }] : []),
    ...(tableItems.length ? [{ key: 'tables', items: tableItems }] : []),
    ...(formatItems.length ? [{ key: 'document', items: formatItems }] : []),
  ]
})

function handleSelect(item) {
  item?.action?.()
  emit('close')
}

// 编辑器行为
function cut() {
  document.execCommand('cut')
}
function copy() {
  document.execCommand('copy')
}
async function paste() {
  if (props.view) {
    try {
      const text = await readNativeClipboardText()
      if (typeof text === 'string') {
        const selection = props.view.state.selection.main
        const from = selection?.from ?? 0
        const to = selection?.to ?? from
        props.view.focus()
        props.view.dispatch({
          changes: { from, to, insert: text },
          selection: { anchor: from + text.length },
        })
        return
      }
    } catch {
      try {
        const text = await navigator.clipboard?.readText?.()
        if (typeof text === 'string') {
          const selection = props.view.state.selection.main
          const from = selection?.from ?? 0
          const to = selection?.to ?? from
          props.view.focus()
          props.view.dispatch({
            changes: { from, to, insert: text },
            selection: { anchor: from + text.length },
          })
          return
        }
      } catch {
        // Fall back to the app-level paste-unavailable path below.
      }
    }
  }
  emit('paste-unavailable')
}
function selectAll() {
  if (props.view)
    props.view.dispatch({ selection: { anchor: 0, head: props.view.state.doc.length } })
}
function formatDocument() {
  emit('format-document')
}
function insertCitation() {
  emit('insert-citation')
}
function formatMarkdownTable() {
  emit('format-markdown-table')
}
function insertMarkdownTable() {
  emit('insert-markdown-table')
}

// 碰撞计算
async function calculatePosition() {
  menuStyle.value = { top: `${props.y}px`, left: `${props.x}px` }
  await nextTick()
  if (!menuRef.value) return

  const rect = menuRef.value.getBoundingClientRect()
  const vh = window.innerHeight || document.documentElement.clientHeight
  const vw = window.innerWidth || document.documentElement.clientWidth

  let top = props.y
  let left = props.x

  if (top + rect.height > vh) top = Math.max(8, vh - rect.height - 8)
  if (left + rect.width > vw) left = Math.max(8, vw - rect.width - 8)

  menuStyle.value = { top: `${top}px`, left: `${left}px` }
}

function handleKeyDown(e) {
  if (props.visible && e.key === 'Escape') emit('close')
}

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      dismissOtherTransientOverlays()
      calculatePosition()
      document.addEventListener('keydown', handleKeyDown)
    } else {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }
)

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeyDown)
})
</script>

<!-- (仅修改 style 部分) -->
<style scoped>
.context-menu-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9998;
  cursor: default;
}

.context-menu {
  position: fixed;
  z-index: 9999;
  min-width: 200px !important;
  padding: 5px;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
  background: color-mix(in srgb, var(--surface-raised) 85%, transparent);
  box-shadow: 
    0 8px 24px rgba(0, 0, 0, 0.12), 
    0 0 0 1px rgba(0, 0, 0, 0.04);
  backdrop-filter: blur(24px) saturate(1.5);
  display: flex;
  flex-direction: column;
}

.theme-light .context-menu {
  background: rgba(255, 255, 255, 0.85);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(0, 0, 0, 0.04);
}

.context-menu-separator {
  height: 1px;
  margin: 4px 0;
  background: color-mix(in srgb, var(--border-subtle) 60%, transparent);
}

.context-menu-item {
  width: 100%;
  padding: 4px 10px;
  text-align: left;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-primary);
  font-size: 13px;
  cursor: default;
  outline: none;
  transition: none; /* 移除过渡，原生菜单 hover 应该立刻响应 */
}

/* 原生高亮蓝 */
.context-menu-item:hover,
.context-menu-item:focus-visible {
  background: var(--accent);
  color: #ffffff;
}

.menu-fade-enter-active {
  transition: opacity 0.08s ease-out, transform 0.08s cubic-bezier(0.16, 1, 0.3, 1);
}
.menu-fade-leave-active {
  transition: opacity 0.08s ease-in;
}
.menu-fade-enter-from {
  opacity: 0;
  transform: scale(0.98);
}
.menu-fade-leave-to {
  opacity: 0;
}
</style>
