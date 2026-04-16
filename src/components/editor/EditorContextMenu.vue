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
import { readText as readClipboardText } from '@tauri-apps/plugin-clipboard-manager'
import { useI18n } from '../../i18n'
import { useTransientOverlayDismiss } from '../../composables/useTransientOverlayDismiss'

const props = defineProps({
  visible: { type: Boolean, default: false },
  x: { type: Number, default: 0 },
  y: { type: Number, default: 0 },
  hasSelection: { type: Boolean, default: false },
  view: { type: Object, default: null },
  showFormatDocument: { type: Boolean, default: false },
  showMarkdownInsertTable: { type: Boolean, default: false },
  showMarkdownFormatTable: { type: Boolean, default: false },
})

const emit = defineEmits([
  'close',
  'format-document',
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
  if (props.showMarkdownInsertTable)
    tableItems.push({ key: 'insert', label: t('Insert Table'), action: insertMarkdownTable })
  if (props.showMarkdownFormatTable)
    tableItems.push({ key: 'format', label: t('Format Table'), action: formatMarkdownTable })

  const formatItems = props.showFormatDocument
    ? [{ key: 'format-doc', label: t('Format Document'), action: formatDocument }]
    : []

  return [
    { key: 'editing', items: editingItems },
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
      const text = await readClipboardText()
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
      } catch {}
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

<style scoped>
.context-menu-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9998;
  cursor: default;
}
.context-menu {
  position: fixed;
  min-width: 180px !important;
}
.context-menu-item {
  width: 100%;
  background: transparent;
  border: none;
  outline: none;
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
