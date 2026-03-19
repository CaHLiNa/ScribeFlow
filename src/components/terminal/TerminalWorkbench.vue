<template>
  <div class="terminal-workbench flex h-full min-h-0 flex-col overflow-hidden">
    <TerminalTabs
      :instances="terminalStore.orderedInstances"
      :active-instance-id="terminalStore.activeInstanceId"
      @activate="activateInstance"
      @close="closeInstance"
      @rename="renameInstance"
      @new="createTerminal"
      @split="splitTerminal"
      @find="toggleFind"
      @clear="clearActive"
      @kill="killActive"
      @panel-close="workspace.toggleBottomPanel()"
      @reorder="reorderTabs"
      @tab-contextmenu="openTabContextMenu"
    />

    <div class="terminal-body relative flex-1 min-h-0 overflow-hidden">
      <div class="terminal-groups flex h-full min-h-0 min-w-0">
        <div
          v-for="(group, index) in terminalStore.groupEntries"
          :key="group.id"
          class="terminal-group-shell min-h-0 min-w-0 flex-1"
          :class="{ 'has-left-border': index > 0 }"
        >
          <TerminalGroup
            :ref="(element) => setGroupRef(group.id, element)"
            :group="group"
            @activate-group="terminalStore.activateGroup"
            @surface-contextmenu="openSurfaceContextMenu"
          />
        </div>
      </div>

      <div v-if="terminalStore.find.visible" class="absolute right-3 top-3 z-20">
        <TerminalFindWidget
          :visible="terminalStore.find.visible"
          :model-value="terminalStore.find.query"
          :case-sensitive="terminalStore.find.caseSensitive"
          :whole-word="terminalStore.find.wholeWord"
          :regex="terminalStore.find.regex"
          @update:model-value="updateFindQuery"
          @next="findNext"
          @previous="findPrevious"
          @toggle-case="toggleFindOption('caseSensitive')"
          @toggle-word="toggleFindOption('wholeWord')"
          @toggle-regex="toggleFindOption('regex')"
          @close="terminalStore.setFindVisible(false)"
        />
      </div>
    </div>

    <TerminalContextMenu
      :visible="contextMenu.visible"
      :x="contextMenu.x"
      :y="contextMenu.y"
      :items="contextMenu.items"
      @close="closeContextMenu"
      @select="handleContextMenuSelect"
    />
  </div>
</template>

<script setup>
import { nextTick, reactive } from 'vue'
import { useTerminalStore } from '../../stores/terminal'
import { useWorkspaceStore } from '../../stores/workspace'
import TerminalContextMenu from './TerminalContextMenu.vue'
import TerminalFindWidget from './TerminalFindWidget.vue'
import TerminalGroup from './TerminalGroup.vue'
import TerminalTabs from './TerminalTabs.vue'

const workspace = useWorkspaceStore()
const terminalStore = useTerminalStore()
const groupRefs = new Map()
const contextMenu = reactive({
  visible: false,
  x: 0,
  y: 0,
  instanceId: null,
  scope: 'surface',
  items: [],
})

function setGroupRef(groupId, element) {
  if (element) groupRefs.set(groupId, element)
  else groupRefs.delete(groupId)
}

function getActiveGroupRef() {
  return groupRefs.get(terminalStore.activeGroupId) || null
}

function buildSearchOptions() {
  return {
    caseSensitive: terminalStore.find.caseSensitive,
    wholeWord: terminalStore.find.wholeWord,
    regex: terminalStore.find.regex,
  }
}

function activateInstance(instanceId) {
  terminalStore.activateInstance(instanceId)
  nextTick(() => {
    getActiveGroupRef()?.focusSurface?.()
  })
}

function createTerminal() {
  terminalStore.createTerminal()
  nextTick(() => {
    getActiveGroupRef()?.focusSurface?.()
  })
}

function splitTerminal() {
  const id = terminalStore.splitInstance()
  if (id === null) return
  nextTick(() => {
    getActiveGroupRef()?.focusSurface?.()
  })
}

async function closeInstance(instanceId) {
  await terminalStore.closeInstance(instanceId)
}

function renameInstance({ instanceId, label }) {
  terminalStore.renameInstance(instanceId, label)
}

function reorderTabs({ fromIndex, toIndex }) {
  terminalStore.reorderTabs(fromIndex, toIndex)
}

function clearActive() {
  const instance = terminalStore.activeInstance
  if (!instance) return
  if (instance.kind === 'log') {
    terminalStore.clearLogInstance(instance.id)
  }
  getActiveGroupRef()?.clearSurface?.()
}

async function killActive() {
  if (!terminalStore.activeInstanceId) return
  await terminalStore.closeInstance(terminalStore.activeInstanceId)
}

function toggleFind() {
  if (!terminalStore.activeInstanceId) return
  terminalStore.setFindVisible(!terminalStore.find.visible)
}

function updateFindQuery(query) {
  terminalStore.setFindQuery(query)
  if (!query) return
  nextTick(() => {
    getActiveGroupRef()?.searchNext?.(query, buildSearchOptions())
  })
}

function toggleFindOption(key) {
  terminalStore.setFindOption(key, !terminalStore.find[key])
  if (!terminalStore.find.query) return
  nextTick(() => {
    getActiveGroupRef()?.searchNext?.(terminalStore.find.query, buildSearchOptions())
  })
}

function findNext() {
  if (!terminalStore.find.query) return
  getActiveGroupRef()?.searchNext?.(terminalStore.find.query, buildSearchOptions())
}

function findPrevious() {
  if (!terminalStore.find.query) return
  getActiveGroupRef()?.searchPrevious?.(terminalStore.find.query, buildSearchOptions())
}

function goToPreviousCommand() {
  return getActiveGroupRef()?.scrollToCommand?.('previous')
}

function goToNextCommand() {
  return getActiveGroupRef()?.scrollToCommand?.('next')
}

function closeContextMenu() {
  contextMenu.visible = false
  contextMenu.instanceId = null
  contextMenu.scope = 'surface'
  contextMenu.items = []
}

function openContextMenu(event, scope, instanceId) {
  const instance = terminalStore.instances.find((item) => item.id === instanceId) || terminalStore.activeInstance
  const isLog = instance?.kind === 'log'

  contextMenu.visible = true
  contextMenu.x = event.clientX
  contextMenu.y = event.clientY
  contextMenu.scope = scope
  contextMenu.instanceId = instanceId
  contextMenu.items = scope === 'tab'
    ? [
        { key: 'rename', label: 'Rename' },
        { key: 'split', label: 'Split' },
        { key: 'close', label: 'Close' },
      ]
    : [
        { key: 'copy', label: 'Copy' },
        { key: 'paste', label: 'Paste', disabled: isLog },
        { key: 'select-all', label: 'Select All' },
        { key: 'find', label: 'Find' },
        { key: 'command-previous', label: 'Previous Command' },
        { key: 'command-next', label: 'Next Command' },
        { key: 'clear', label: 'Clear' },
        { key: 'split', label: 'Split' },
        { key: 'close', label: 'Close' },
      ]
}

function openTabContextMenu({ event, instanceId }) {
  openContextMenu(event, 'tab', instanceId)
}

function openSurfaceContextMenu({ event, instanceId }) {
  terminalStore.activateInstance(instanceId)
  openContextMenu(event, 'surface', instanceId)
}

async function handleContextMenuSelect(key) {
  const instanceId = contextMenu.instanceId || terminalStore.activeInstanceId
  closeContextMenu()

  if (key === 'rename' && instanceId) {
    const instance = terminalStore.instances.find((item) => item.id === instanceId)
    const nextLabel = window.prompt('Rename terminal', instance?.label || '')
    if (nextLabel) terminalStore.renameInstance(instanceId, nextLabel)
    return
  }

  if (key === 'find') {
    toggleFind()
    return
  }

  if (key === 'copy') {
    getActiveGroupRef()?.copySelection?.()
    return
  }

  if (key === 'paste') {
    await getActiveGroupRef()?.paste?.()
    return
  }

  if (key === 'select-all') {
    getActiveGroupRef()?.selectAll?.()
    return
  }

  if (key === 'command-previous') {
    goToPreviousCommand()
    return
  }

  if (key === 'command-next') {
    goToNextCommand()
    return
  }

  if (key === 'clear') {
    clearActive()
    return
  }

  if (key === 'split') {
    splitTerminal()
    return
  }

  if (key === 'close' && instanceId) {
    await terminalStore.closeInstance(instanceId)
  }
}

defineExpose({
  focusActiveSurface() {
    nextTick(() => {
      getActiveGroupRef()?.focusSurface?.()
    })
  },
  refitActiveSurface() {
    getActiveGroupRef()?.refitSurface?.()
  },
  refitAllSurfaces() {
    for (const groupRef of groupRefs.values()) {
      groupRef?.refitSurface?.()
    }
  },
})
</script>

<style scoped>
.terminal-workbench {
  background: color-mix(in srgb, var(--bg-primary) 96%, black 4%);
}

.terminal-body {
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--bg-primary) 98%, black 2%),
      color-mix(in srgb, var(--bg-primary) 95%, black 5%)
    );
}

.terminal-group-shell.has-left-border {
  border-left: 1px solid color-mix(in srgb, var(--border) 85%, transparent);
}
</style>
