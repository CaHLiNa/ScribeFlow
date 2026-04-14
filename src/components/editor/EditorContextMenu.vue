<template>
  <DropdownMenuRoot :open="visible" :modal="false" @update:open="handleOpenChange">
    <DropdownMenuPortal>
      <DropdownMenuContent
        class="context-menu editor-context-menu py-1 ui-text-md"
        :reference="menuReference"
        position="popper"
        position-strategy="fixed"
        side="bottom"
        align="start"
        :avoid-collisions="true"
        :prioritize-position="true"
        :side-flip="true"
        :align-flip="true"
        :side-offset="2"
        :collision-padding="8"
        @close-auto-focus.prevent
        @pointer-down-outside="emit('close')"
        @focus-outside="emit('close')"
        @interact-outside="emit('close')"
        @escape-key-down="emit('close')"
      >
        <template v-for="(group, groupIndex) in menuGroups" :key="group.key">
          <DropdownMenuSeparator v-if="groupIndex > 0" class="context-menu-separator" />
          <DropdownMenuItem
            v-for="item in group.items"
            :key="item.key"
            class="context-menu-item"
            @select="handleSelect(item)"
          >
            {{ item.label }}
          </DropdownMenuItem>
        </template>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>

<script setup>
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuSeparator,
} from 'reka-ui'
import { computed, watch } from 'vue'
import { readText as readClipboardText } from '@tauri-apps/plugin-clipboard-manager'
import { useI18n } from '../../i18n'
import { createPointReference } from '../../utils/floatingReference'
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
const { dismissOtherTransientOverlays } = useTransientOverlayDismiss('editor-context-menu', () => {
  emit('close')
})

const menuReference = computed(() => createPointReference(props.x, props.y))

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
  if (props.showMarkdownInsertTable) {
    tableItems.push({
      key: 'insert-markdown-table',
      label: t('Insert Table'),
      action: insertMarkdownTable,
    })
  }
  if (props.showMarkdownFormatTable) {
    tableItems.push({
      key: 'format-markdown-table',
      label: t('Format Table'),
      action: formatMarkdownTable,
    })
  }

  const formatItems = props.showFormatDocument
    ? [{ key: 'format-document', label: t('Format Document'), action: formatDocument }]
    : []

  return [
    { key: 'editing', items: editingItems },
    ...(tableItems.length ? [{ key: 'tables', items: tableItems }] : []),
    ...(formatItems.length ? [{ key: 'document', items: formatItems }] : []),
  ]
})

function handleOpenChange(open) {
  if (!open) emit('close')
}

function handleSelect(item) {
  item?.action?.()
  emit('close')
}

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
      } catch {
        // Last resort falls through to a host hint instead of showing the native paste popup.
      }
    }
  }

  emit('paste-unavailable')
}

function selectAll() {
  if (props.view) {
    props.view.dispatch({
      selection: { anchor: 0, head: props.view.state.doc.length },
    })
  }
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

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return
    dismissOtherTransientOverlays()
  }
)
</script>

<style scoped>
.editor-context-menu {
  max-height: min(360px, calc(100vh - 16px));
  overflow-y: auto;
}

.editor-context-menu-shortcut {
  color: var(--fg-muted);
  font-size: var(--ui-font-caption);
}
</style>
