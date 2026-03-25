<template>
  <nav
    class="workbench-rail flex h-full w-11 shrink-0 flex-col items-center gap-1.5 border-r px-1.5 pt-1.5 pb-1.5"
    :aria-label="t('Project navigation')"
  >
    <div class="flex w-full flex-col items-center gap-1.5">
      <button
        v-for="entry in entries"
        :key="entry.key"
        type="button"
        class="workbench-rail-button"
        :class="{ 'is-active': activeKey === entry.key }"
        :title="entry.title"
        :aria-label="entry.label"
        @click="activate(entry.key)"
      >
        <component :is="entry.icon" :size="18" :stroke-width="1.7" />
      </button>
    </div>

    <div class="mt-auto flex w-full flex-col items-center">
      <button
        type="button"
        class="workbench-rail-button"
        :title="t('Settings ({shortcut})', { shortcut: `${modKey}+,` })"
        :aria-label="t('Settings')"
        @click="$emit('open-settings')"
      >
        <IconSettings :size="18" :stroke-width="1.7" />
      </button>
    </div>
  </nav>
</template>

<script setup>
import { computed } from 'vue'
import { IconBook2, IconHome, IconSettings, IconSparkles } from '@tabler/icons-vue'
import { useWorkspaceStore } from '../../stores/workspace'
import { modKey } from '../../platform'
import { useI18n } from '../../i18n'

defineEmits(['open-settings'])

const workspace = useWorkspaceStore()
const { t } = useI18n()

const entries = computed(() => ([
  {
    key: 'workspace',
    label: t('Project'),
    title: t('Open project workspace'),
    icon: IconHome,
  },
  {
    key: 'library',
    label: t('Library'),
    title: t('Open global library'),
    icon: IconBook2,
  },
  {
    key: 'ai',
    label: t('AI'),
    title: t('Open AI workspace'),
    icon: IconSparkles,
  },
]))

const activeKey = computed(() => {
  if (workspace.isAiSurface) return 'ai'
  if (workspace.isLibrarySurface) return 'library'
  return 'workspace'
})

function activate(key) {
  if (!workspace.isOpen) return

  if (key === 'library') {
    workspace.openLibrarySurface()
    return
  }
  if (key === 'ai') {
    workspace.openAiSurface()
    return
  }
  workspace.openWorkspaceSurface()
}
</script>

<style scoped>
.workbench-rail {
  background: var(--bg-primary);
  border-color: var(--border);
}

.workbench-rail-button {
  position: relative;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--fg-muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background-color 140ms ease, color 140ms ease, opacity 140ms ease;
  opacity: 0.88;
}

.workbench-rail-button:hover {
  background: color-mix(in srgb, var(--bg-hover) 38%, transparent);
  color: var(--fg-secondary);
  opacity: 1;
}

.workbench-rail-button.is-active {
  color: var(--fg-primary);
  background: color-mix(in srgb, var(--accent) 8%, transparent);
  opacity: 1;
}

.workbench-rail-button.is-active::before {
  content: '';
  position: absolute;
  left: -7px;
  top: 50%;
  width: 2px;
  height: 14px;
  border-radius: 999px;
  transform: translateY(-50%);
  background: color-mix(in srgb, var(--accent) 78%, white 12%);
}
</style>
