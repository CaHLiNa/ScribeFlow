<template>
  <footer class="grid items-center px-3 ui-text-xs select-none shrink-0"
    style="grid-template-columns: 1fr auto 1fr; background: var(--bg-secondary); border-top: 1px solid var(--border); color: var(--fg-muted); height: 26px; font-variant-numeric: tabular-nums;">

    <!-- LEFT: word count + sync status -->
    <div class="flex items-center gap-2 justify-self-start whitespace-nowrap">
      <!-- Word count -->
      <template v-if="stats.words > 0">
        <span :style="{ color: stats.selWords > 0 ? 'var(--accent)' : 'var(--fg-muted)' }">
          <span style="display:inline-block;min-width:3ch;text-align:right;">{{ (stats.selWords > 0 ? stats.selWords : stats.words).toLocaleString() }}</span> {{ t('words') }}
        </span>
        <span :style="{ color: stats.selChars > 0 ? 'var(--accent)' : 'var(--fg-muted)' }">
          <span style="display:inline-block;min-width:3ch;text-align:right;">{{ (stats.selChars > 0 ? stats.selChars : stats.chars).toLocaleString() }}</span> {{ t('chars') }}
        </span>
      </template>

      <!-- Separator -->
      <div v-if="workspace.githubUser && stats.words > 0" class="w-px h-3 shrink-0" style="background: var(--border);"></div>

      <!-- Sync status (only when GitHub connected) -->
      <span
        v-if="workspace.githubUser"
        ref="syncTriggerRef"
        class="flex items-center gap-1 cursor-pointer hover:opacity-80"
        :style="{ color: syncColor }"
        @click="toggleSyncPopover"
        :title="syncTooltip"
      >
        <!-- Cloud icon variations -->
        <svg v-if="workspace.syncStatus === 'synced'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z"/>
        </svg>
        <svg v-else-if="workspace.syncStatus === 'syncing'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sync-pulse">
          <path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z"/>
          <path d="M11 13l-2 2 2 2M13 11l2-2-2-2"/>
        </svg>
        <svg v-else-if="workspace.syncStatus === 'error' || workspace.syncStatus === 'conflict'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z"/>
          <path d="M12 9v4M12 17h.01"/>
        </svg>
        <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.4;">
          <path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z"/>
          <path d="M4 20L20 4"/>
        </svg>
        <span v-if="syncLabel" class="ui-text-xs">{{ syncLabel }}</span>
      </span>

      <!-- Pending changes -->
      <span v-if="reviews.pendingCount > 0"
        ref="pendingTriggerRef"
        class="flex items-center gap-1 cursor-pointer hover:opacity-80"
        style="color: var(--warning);"
        @click="togglePendingPopover">
        {{ reviews.pendingCount }} {{ t('Pending Changes') }}
      </span>
    </div>

    <!-- CENTER: zoom control OR save confirmation OR transient message (crossfade) -->
    <div class="footer-center justify-self-center">
      <!-- Zoom controls (default) -->
      <div class="footer-center-layer" :class="{ 'footer-center-hidden': saveConfirmationActive || centerMessage || uxStatusEntry }">
        <button
          class="w-5 h-5 flex items-center justify-center rounded cursor-pointer transition-colors border-none bg-transparent"
          style="color: var(--fg-muted);"
          @click="workspace.zoomOut()"
          :title="t('Zoom out ({shortcut})', { shortcut: `${modKey}+-` })"
          @mouseover="$event.target.style.color='var(--fg-primary)'"
          @mouseout="$event.target.style.color='var(--fg-muted)'"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2 5h6"/></svg>
        </button>
        <button
          ref="zoomTriggerRef"
          class="min-w-[36px] text-center ui-text-xs px-0.5 bg-transparent border-none cursor-pointer transition-colors"
          :style="{ color: zoomPercent !== 100 ? 'var(--accent)' : 'var(--fg-muted)' }"
          style="font-family: inherit;"
          @click="toggleZoomPopover"
          :title="t('Zoom level ({shortcut})', { shortcut: `${modKey}+0` })"
          @mouseover="$event.target.style.color='var(--fg-primary)'"
          @mouseout="$event.target.style.color = zoomPercent !== 100 ? 'var(--accent)' : 'var(--fg-muted)'"
        >
          {{ zoomPercent }}%
        </button>
        <button
          class="w-5 h-5 flex items-center justify-center rounded cursor-pointer transition-colors border-none bg-transparent"
          style="color: var(--fg-muted);"
          @click="workspace.zoomIn()"
          :title="t('Zoom in ({shortcut})', { shortcut: `${modKey}+=` })"
          @mouseover="$event.target.style.color='var(--fg-primary)'"
          @mouseout="$event.target.style.color='var(--fg-muted)'"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M5 2v6M2 5h6"/></svg>
        </button>
      </div>

      <!-- Save confirmation (shown during 8s window) -->
      <div class="footer-center-layer flex items-center gap-1" :class="{ 'footer-center-hidden': !saveConfirmationActive }">
      
        <IconCheck width="12" height="12" style="color: var(--success);" />
        <div class="font-medium ui-text-sm pe-2" style="color: var(--success);">
          {{ t('Saved') }}
        </div>
        <div
          class="cursor-pointer underline hover:opacity-80 ui-text-sm font-medium"
          style="color: var(--accent);"
          @click="openSnapshotDialog"
        >{{ t('Name this version?') }}</div>
      </div>

      <!-- Transient center message (e.g. "All saved (no changes)") -->
      <div class="footer-center-layer" :class="{ 'footer-center-hidden': !centerMessage }">
        <span class="flex items-center gap-1.5 ui-text-sm" style="color: var(--success);">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5l3.5 3.5 6.5-7"/></svg>
          {{ centerMessage }}
        </span>
      </div>

      <div class="footer-center-layer" :class="{ 'footer-center-hidden': !!centerMessage || saveConfirmationActive || !uxStatusEntry }">
        <span class="flex items-center gap-1.5 ui-text-sm" :style="{ color: uxStatusColor }">
          <svg v-if="uxStatusEntry?.type === 'success'" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5l3.5 3.5 6.5-7"/></svg>
          <svg v-else-if="uxStatusEntry?.type === 'error' || uxStatusEntry?.type === 'warning'" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2.5l5.5 9.5H2.5L8 2.5z"/><path d="M8 6v3"/><path d="M8 11.25h.01"/></svg>
          <svg v-else width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="5.5"/><path d="M8 6v2.5"/><path d="M8 10.75h.01"/></svg>
          <span>{{ uxStatusEntry?.message }}</span>
          <button
            v-if="uxStatusEntry?.action"
            class="bg-transparent border-none cursor-pointer underline ui-text-sm"
            :style="{ color: 'var(--accent)' }"
            @click="handleUxStatusAction"
          >
            {{ uxStatusEntry.action.label }}
          </button>
        </span>
      </div>
    </div>

    <!-- Snapshot naming dialog -->
    <SnapshotDialog
      :visible="snapshotDialogVisible"
      @resolve="onSnapshotResolve"
    />

    <!-- RIGHT: tools + editor info -->
    <div class="flex items-center gap-2 justify-self-end whitespace-nowrap">
      <!-- Tools -->
      <button
        class="w-6 h-6 flex items-center justify-center rounded hover:opacity-80 bg-transparent border-none cursor-pointer"
        style="color: var(--fg-muted);"
        @click="showShortcuts = !showShortcuts"
        :title="t('Keyboard shortcuts')"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="1" y="4" width="14" height="9" rx="1.5"/>
          <path d="M4 7h1M7 7h2M11 7h1M5 10h6"/>
        </svg>
      </button>
      <button
        class="w-6 h-6 flex items-center justify-center rounded hover:opacity-80 bg-transparent border-none cursor-pointer"
        :style="{ color: workspace.softWrap ? 'var(--accent)' : 'var(--fg-muted)' }"
        @click="workspace.toggleSoftWrap()"
        :title="workspace.softWrap ? t('Word wrap: on') : t('Word wrap: off')"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M2 3h12"/>
          <path d="M2 7h10a2 2 0 010 4H8"/>
          <path d="M10 13l-2-2 2-2"/>
          <path d="M2 11h3"/>
        </svg>
      </button>

      <!-- Separator -->
      <div class="w-px h-3 shrink-0" style="background: var(--border);"></div>

      <!-- Billing context display -->
      <template v-if="usageStore.showInFooter && footerBillingVisible">
        <span
          v-if="billingRoute?.route === 'direct'"
          class="cursor-pointer hover:opacity-80"
          :style="{ color: usageStore.isOverBudget ? 'var(--error)' : usageStore.isNearBudget ? 'var(--warning)' : 'var(--fg-muted)' }"
          :title="t('Estimated API cost this month - check provider dashboards for actual charges')"
          @click="$emit('open-settings', 'models')">
          {{ t('{cost} this month', { cost: `~${formatCost(usageStore.directCost)}` }) }}
        </span>
        <div class="w-px h-3 shrink-0" style="background: var(--border);"></div>
      </template>

      <!-- Save message -->
      <span v-if="saveMessage"
        class="transition-opacity"
        :style="{ color: 'var(--success)', opacity: saveMessageFading ? 0 : 1 }">
        {{ saveMessage }}
      </span>
    </div>
  </footer>

  <!-- Shortcuts popover -->
  <Teleport to="body">
    <div v-if="showShortcuts" class="fixed inset-0 z-50" @click="showShortcuts = false">
      <div class="fixed z-50 rounded-lg border overflow-hidden"
        style="background: var(--bg-secondary); border-color: var(--border); box-shadow: 0 8px 24px rgba(0,0,0,0.4); width: 300px; bottom: 44px; right: 12px;"
        @click.stop>
        <div class="px-3 py-2 ui-text-xs font-medium uppercase tracking-wider"
          style="color: var(--fg-muted); border-bottom: 1px solid var(--border);">
          {{ t('Keyboard shortcuts') }}
        </div>
        <div class="px-3 py-2 space-y-1.5 ui-text-sm" style="color: var(--fg-secondary);">
          <div class="flex justify-between"><span>{{ t('Toggle left sidebar') }}</span><kbd>{{ modKey }}+B</kbd></div>
          <div class="flex justify-between"><span>{{ t('Toggle right sidebar') }}</span><kbd>{{ modKey }}+J</kbd></div>
          <div class="flex justify-between"><span>{{ t('Quick open') }}</span><kbd>{{ modKey }}+P</kbd></div>
          <div class="flex justify-between"><span>{{ t('Save & commit') }}</span><kbd>{{ modKey }}+S</kbd></div>
          <div class="flex justify-between"><span>{{ t('Close tab') }}</span><kbd>{{ modKey }}+W</kbd></div>
          <div class="flex justify-between"><span>{{ t('Split vertical') }}</span><kbd>{{ modKey }}+\</kbd></div>
          <div class="flex justify-between"><span>{{ t('Split horizontal') }}</span><kbd>{{ modKey }}+Shift+\</kbd></div>
          <div class="flex justify-between"><span>{{ t('Add comment') }}</span><kbd>{{ modKey }}+Shift+L</kbd></div>
          <div class="flex justify-between"><span>{{ t('Insert citation') }}</span><kbd>{{ modKey }}+Shift+C</kbd></div>
          <div class="flex justify-between"><span>{{ t('Toggle terminal') }}</span><kbd>{{ modKey }}+`</kbd></div>
          <div class="flex justify-between"><span>{{ t('Zoom in') }}</span><kbd>{{ modKey }}+=</kbd></div>
          <div class="flex justify-between"><span>{{ t('Zoom out') }}</span><kbd>{{ modKey }}+-</kbd></div>
          <div class="flex justify-between"><span>{{ t('Reset zoom') }}</span><kbd>{{ modKey }}+0</kbd></div>
          <div class="flex justify-between"><span>{{ t('Toggle word wrap') }}</span><kbd>{{ altKey }}+Z</kbd></div>
          <div class="mt-2 pt-2" style="border-top: 1px solid var(--border); color: var(--fg-muted);">{{ t('File Explorer') }}</div>
          <div class="flex justify-between"><span>{{ t('Navigate') }}</span><kbd>↑ / ↓</kbd></div>
          <div class="flex justify-between"><span>{{ t('Expand folder') }}</span><kbd>→</kbd></div>
          <div class="flex justify-between"><span>{{ t('Collapse / parent') }}</span><kbd>←</kbd></div>
          <div class="flex justify-between"><span>{{ t('Open') }}</span><kbd>Space</kbd></div>
          <div class="flex justify-between"><span>{{ t('Rename') }}</span><kbd>Enter</kbd></div>
          <div class="mt-2 pt-2" style="border-top: 1px solid var(--border); color: var(--fg-muted);">{{ t('Ghost Suggestions') }}</div>
          <div class="flex justify-between"><span>{{ t('Trigger') }}</span><kbd>++</kbd></div>
          <div class="flex justify-between"><span>{{ t('Accept') }}</span><kbd>Tab / Enter / Right</kbd></div>
          <div class="flex justify-between"><span>{{ t('Cycle') }}</span><kbd>Up / Down</kbd></div>
          <div class="flex justify-between"><span>{{ t('Cancel') }}</span><kbd>Esc / Left / click</kbd></div>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- Zoom level popover -->
  <Teleport to="body">
    <div v-if="showZoomPopover" class="fixed inset-0 z-50" @click="showZoomPopover = false">
      <div class="fixed z-50 rounded-lg border overflow-hidden"
        :style="zoomPopoverPos"
        style="background: var(--bg-secondary); border-color: var(--border); box-shadow: 0 8px 24px rgba(0,0,0,0.4); width: 120px;"
        @click.stop>
        <div class="py-1">
          <div v-for="level in zoomPresets" :key="level"
            class="px-3 py-1.5 ui-text-sm cursor-pointer flex items-center justify-between hover:bg-[var(--bg-hover)]"
            :style="{ color: level === zoomPercent ? 'var(--accent)' : 'var(--fg-secondary)' }"
            @click="selectZoom(level)">
            <span>{{ level }}%</span>
            <span v-if="level === 100" class="ui-text-xs" style="color: var(--fg-muted);">{{ t('default') }}</span>
          </div>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- Pending changes popover -->
  <Teleport to="body">
    <div v-if="showPendingPopover" class="fixed inset-0 z-50" @click="showPendingPopover = false">
      <div class="fixed z-50 rounded-lg border overflow-hidden"
        :style="pendingPopoverPos"
        style="background: var(--bg-secondary); border-color: var(--border); box-shadow: 0 8px 24px rgba(0,0,0,0.4); min-width: 200px; max-width: 360px;"
        @click.stop>
        <div class="px-3 py-2 ui-text-xs font-medium uppercase tracking-wider"
          style="color: var(--fg-muted); border-bottom: 1px solid var(--border);">
          {{ t('Pending Changes') }}
        </div>
        <div class="py-1 max-h-48 overflow-y-auto">
          <div v-for="file in reviews.filesWithEdits" :key="file"
            class="px-3 py-1.5 ui-text-sm cursor-pointer flex items-center gap-2 hover:bg-[var(--bg-hover)]"
            style="color: var(--fg-secondary);"
            :title="file"
            @click="openPendingFile(file)">
            <span class="truncate">{{ file.split('/').pop() }}</span>
            <span class="ml-auto ui-text-xs shrink-0 px-1.5 rounded-full"
              style="background: rgba(224, 175, 104, 0.2); color: var(--warning);">
              {{ reviews.editsForFile(file).length }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- Sync popover -->
  <Teleport to="body">
    <div v-if="showSyncPopover" class="fixed inset-0 z-50" @click="showSyncPopover = false">
      <div class="fixed z-50 rounded-lg border overflow-hidden"
        :style="syncPopoverPos"
        style="background: var(--bg-secondary); border-color: var(--border); box-shadow: 0 8px 24px rgba(0,0,0,0.4);"
        @click.stop>
        <SyncPopover
          @sync-now="handleSyncNow"
          @refresh="handleSyncRefresh"
          @open-settings="handleOpenGitHubSettings"
        />
      </div>
    </div>
  </Teleport>

  <!-- Conflict dialog -->
  <GitHubConflictDialog
    :visible="showConflictDialog"
    @close="showConflictDialog = false"
  />
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { useWorkspaceStore } from '../../stores/workspace'
import { useReviewsStore } from '../../stores/reviews'
import { useEditorStore } from '../../stores/editor'
import { useUsageStore } from '../../stores/usage'
import { useToastStore } from '../../stores/toast'
import { useUxStatusStore } from '../../stores/uxStatus'
import { getBillingRoute } from '../../services/apiClient'
import { modKey, altKey } from '../../platform'
import { useI18n } from '../../i18n'
import SyncPopover from './SyncPopover.vue'
import SnapshotDialog from './SnapshotDialog.vue'
import GitHubConflictDialog from '../GitHubConflictDialog.vue'
import { IconCheck } from '@tabler/icons-vue'

const emit = defineEmits(['open-settings'])

const workspace = useWorkspaceStore()
const reviews = useReviewsStore()
const editorStore = useEditorStore()
const usageStore = useUsageStore()
const toastStore = useToastStore()
const uxStatusStore = useUxStatusStore()
const { t } = useI18n()

const stats = ref({ words: 0, chars: 0, selWords: 0, selChars: 0 })
const cursorPos = ref({ line: 0, col: 0 })
const saveMessage = ref('')
const saveMessageFading = ref(false)
let saveTimer = null
const showShortcuts = ref(false)
const showPendingPopover = ref(false)
const pendingTriggerRef = ref(null)
const pendingPopoverPos = ref({})
const showSyncPopover = ref(false)
const syncTriggerRef = ref(null)
const syncPopoverPos = ref({})
const showConflictDialog = ref(false)
const showZoomPopover = ref(false)
const zoomTriggerRef = ref(null)
const zoomPopoverPos = ref({})
const zoomPresets = [75, 80, 90, 100, 110, 125, 150]
const zoomPercent = computed(() => Math.round(workspace.editorFontSize / 14 * 100))

// Save confirmation state (center section swap)
const saveConfirmationActive = ref(false)
const snapshotDialogVisible = ref(false)
let saveConfirmationTimer = null
let saveConfirmationResolve = null

// Transient center message (e.g. "All saved (no changes)")
const centerMessage = ref('')
let centerMessageTimer = null
const uxStatusEntry = computed(() => uxStatusStore.current)

// Model-aware billing route
const billingRoute = computed(() => {
  if (!workspace.selectedModelId) return null
  return getBillingRoute(workspace.selectedModelId, workspace)
})

// Footer shows billing when the current model's route has something to show
const footerBillingVisible = computed(() => {
  const route = billingRoute.value
  if (!route) return false
  if (route.route === 'direct') return usageStore.showCostEstimates && usageStore.directCost > 0
  return false
})

const uxStatusColor = computed(() => {
  switch (uxStatusEntry.value?.type) {
    case 'success': return 'var(--success)'
    case 'error': return 'var(--error)'
    case 'warning': return 'var(--warning)'
    default: return 'var(--fg-secondary)'
  }
})

function formatCost(val) {
  if (!val) return '$0.00'
  return '$' + val.toFixed(2)
}

const syncColor = computed(() => {
  switch (workspace.syncStatus) {
    case 'synced': return 'var(--fg-muted)'
    case 'syncing': return 'var(--fg-muted)'
    case 'error': return 'var(--error)'
    case 'conflict': return 'var(--warning)'
    default: return 'var(--fg-muted)'
  }
})

const syncTooltip = computed(() => {
  switch (workspace.syncStatus) {
    case 'synced': return t('Synced with GitHub')
    case 'syncing': return t('Syncing with GitHub...')
    case 'conflict': return t('Needs your input - click for details')
    case 'error': return t('Needs attention - click for details')
    case 'idle': return t('GitHub: connected')
    default: return t('GitHub: not connected')
  }
})

const syncLabel = computed(() => {
  switch (workspace.syncStatus) {
    case 'synced': return t('Backed up')
    case 'syncing': return t('Saving...')
    case 'error':
    case 'conflict': return t('Sync issue')
    default: return null
  }
})

function toggleSyncPopover() {
  showSyncPopover.value = !showSyncPopover.value
  if (showSyncPopover.value) {
    nextTick(() => {
      const rect = syncTriggerRef.value?.getBoundingClientRect()
      if (rect) {
        syncPopoverPos.value = {
          bottom: (window.innerHeight - rect.top + 4) + 'px',
          left: rect.left + 'px',
        }
      }
    })
  }
}

async function handleSyncNow() {
  showSyncPopover.value = false
  await workspace.syncNow()
}

async function handleSyncRefresh() {
  showSyncPopover.value = false
  await workspace.fetchRemoteChanges()
}

function handleOpenGitHubSettings() {
  showSyncPopover.value = false
  emit('open-settings', 'github')
}

// Show conflict dialog and toasts when sync status changes
watch(() => workspace.syncStatus, (status) => {
  if (status === 'conflict') {
    showConflictDialog.value = true
    toastStore.showOnce('sync-conflict', t('Your changes conflict with updates on GitHub. Click to resolve.'), {
      type: 'warning',
      duration: 8000,
      action: { label: t('Resolve'), onClick: () => { showConflictDialog.value = true } },
    })
  } else if (status === 'error') {
    const errorType = workspace.syncErrorType
    if (errorType === 'auth') {
      toastStore.showOnce('sync-auth', t('GitHub connection expired. Reconnect in Settings.'), {
        type: 'error',
        duration: 8000,
        action: { label: t('Settings'), onClick: () => emit('open-settings', 'github') },
      })
    } else if (errorType === 'network') {
      // Network errors are quiet — no toast, just icon change
    } else {
      toastStore.showOnce('sync-error', workspace.syncError || t('Sync failed. Click for details.'), {
        type: 'error',
        duration: 6000,
        action: { label: t('Details'), onClick: () => { toggleSyncPopover() } },
      })
    }
  }
})

function togglePendingPopover() {
  showPendingPopover.value = !showPendingPopover.value
  if (showPendingPopover.value) {
    nextTick(() => {
      const rect = pendingTriggerRef.value?.getBoundingClientRect()
      if (rect) {
        pendingPopoverPos.value = {
          bottom: (window.innerHeight - rect.top + 4) + 'px',
          left: rect.left + 'px',
        }
      }
    })
  }
}

function toggleZoomPopover() {
  showZoomPopover.value = !showZoomPopover.value
  if (showZoomPopover.value) {
    nextTick(() => {
      const rect = zoomTriggerRef.value?.getBoundingClientRect()
      if (rect) {
        zoomPopoverPos.value = {
          bottom: (window.innerHeight - rect.top + 4) + 'px',
          left: (rect.left + rect.width / 2 - 60) + 'px',
        }
      }
    })
  }
}

function selectZoom(level) {
  workspace.setZoomPercent(level)
  showZoomPopover.value = false
}

function openPendingFile(file) {
  editorStore.openFile(file)
  showPendingPopover.value = false
}

// Auto-close popover when no more pending edits
watch(() => reviews.pendingCount, (count) => {
  if (count === 0) showPendingPopover.value = false
})

function showSaveMessage(msg) {
  saveMessage.value = msg
  saveMessageFading.value = false
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveMessageFading.value = true
    setTimeout(() => {
      saveMessage.value = ''
      saveMessageFading.value = false
    }, 500)
  }, 2000)
}

function showCenterMessage(msg, duration = 2000) {
  clearTimeout(centerMessageTimer)
  centerMessage.value = msg
  centerMessageTimer = setTimeout(() => {
    centerMessage.value = ''
  }, duration)
}

function handleUxStatusAction() {
  const action = uxStatusEntry.value?.action
  if (!action) return
  if (action.type === 'open-settings') {
    emit('open-settings', action.section ?? null)
  }
  uxStatusStore.clear(uxStatusEntry.value?.id)
}

function beginSaveConfirmation() {
  // Cancel any previous confirmation
  clearSaveConfirmation(null)

  return new Promise((resolve) => {
    saveConfirmationResolve = resolve
    saveConfirmationActive.value = true

    saveConfirmationTimer = setTimeout(() => {
      // Timeout — resolve with null (auto-commit with timestamp)
      clearSaveConfirmation(null)
    }, 8000)
  })
}

function openSnapshotDialog() {
  // Pause the timeout while dialog is open
  clearTimeout(saveConfirmationTimer)
  saveConfirmationTimer = null
  snapshotDialogVisible.value = true
}

function onSnapshotResolve(name) {
  snapshotDialogVisible.value = false
  clearSaveConfirmation(name)
}

function clearSaveConfirmation(result) {
  clearTimeout(saveConfirmationTimer)
  saveConfirmationTimer = null
  saveConfirmationActive.value = false
  if (saveConfirmationResolve) {
    const resolve = saveConfirmationResolve
    saveConfirmationResolve = null
    resolve(result)
  }
}

// Expose methods for editor to call
defineExpose({
  setEditorStats(s) {
    stats.value = s
  },
  setCursorPos(pos) {
    cursorPos.value = pos
  },
  showSaveMessage,
  showCenterMessage,
  beginSaveConfirmation,
})

</script>

<style scoped>
.sync-pulse {
  animation: syncPulse 2s ease-in-out infinite;
}
@keyframes syncPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
</style>
