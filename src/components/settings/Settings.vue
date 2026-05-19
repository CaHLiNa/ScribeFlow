<template>
  <SettingsSurface :title="activeSectionLabel">
    <component :is="activeSectionComponent" :key="activeSection" />
  </SettingsSurface>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'
import { useI18n } from '../../i18n'
import { useWorkspaceStore } from '../../stores/workspace'
import {
  resolveSettingsSectionId,
  resolveSettingsSectionMeta,
} from '../../domains/settings/settingsSections.ts'
import SettingsSurface from './SettingsSurface.vue'

const SettingsGeneral = defineAsyncComponent(() => import('./SettingsGeneral.vue'))
const SettingsEditor = defineAsyncComponent(() => import('./SettingsEditor.vue'))
const SettingsEnvironment = defineAsyncComponent(() => import('./SettingsEnvironment.vue'))
const SettingsUpdates = defineAsyncComponent(() => import('./SettingsUpdates.vue'))
const SettingsZotero = defineAsyncComponent(() => import('./SettingsZotero.vue'))

const workspace = useWorkspaceStore()
const { t } = useI18n()

const sectionComponents = {
  general: SettingsGeneral,
  editor: SettingsEditor,
  system: SettingsEnvironment,
  updates: SettingsUpdates,
  zotero: SettingsZotero,
}

const activeSection = computed(() =>
  resolveSettingsSectionId(workspace.settingsSection)
)

const activeSectionMeta = computed(
  () => resolveSettingsSectionMeta({
    sectionId: activeSection.value,
    translate: t,
  }).activeSectionMeta
)

const activeSectionLabel = computed(() => activeSectionMeta.value?.label ?? t('Settings'))
const activeSectionComponent = computed(
  () => sectionComponents[activeSection.value] || SettingsGeneral
)
</script>
