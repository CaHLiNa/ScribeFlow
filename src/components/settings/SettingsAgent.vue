<template>
  <div class="settings-page settings-agent-page">
    <section class="settings-group">
      <div class="ui-segmented-control" role="tablist" :aria-label="t('Agent pages')">
        <UiButton
          v-for="item in subpages"
          :key="item.id"
          variant="ghost"
          size="sm"
          class="ui-segmented-item"
          :class="{ 'is-active': activeSubpage === item.id }"
          :aria-selected="activeSubpage === item.id"
          @click="setActiveSubpage(item.id)"
        >
          {{ item.label }}
        </UiButton>
      </div>
    </section>

    <component :is="activeComponent" />
  </div>
</template>

<script setup>
import { computed, defineAsyncComponent, ref } from 'vue'
import { useI18n } from '../../i18n'
import UiButton from '../shared/ui/UiButton.vue'

const SettingsAi = defineAsyncComponent(() => import('./SettingsAi.vue'))
const SettingsSkills = defineAsyncComponent(() => import('./SettingsSkills.vue'))
const SettingsTools = defineAsyncComponent(() => import('./SettingsTools.vue'))

const AGENT_SETTINGS_SUBPAGE_STORAGE_KEY = 'altals.settings.agentSubpage'

const { t } = useI18n()

const AGENT_SETTINGS_SUBPAGES = Object.freeze(['models', 'skills', 'tools'])

function normalizeAgentSubpage(value = '') {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'runtime') return 'models'
  return AGENT_SETTINGS_SUBPAGES.includes(normalized) ? normalized : 'models'
}

function readPersistedAgentSubpage() {
  try {
    const value = String(localStorage.getItem(AGENT_SETTINGS_SUBPAGE_STORAGE_KEY) || '').trim()
    return normalizeAgentSubpage(value)
  } catch {
    return 'models'
  }
}

function persistAgentSubpage(value = 'models') {
  try {
    localStorage.setItem(AGENT_SETTINGS_SUBPAGE_STORAGE_KEY, normalizeAgentSubpage(value))
  } catch {
    // ignore local storage failures
  }
}

const activeSubpage = ref(readPersistedAgentSubpage())

const subpages = computed(() => [
  {
    id: 'models',
    label: t('Models'),
  },
  {
    id: 'skills',
    label: t('Agent Skills'),
  },
  {
    id: 'tools',
    label: t('Tools'),
  },
])

const activeComponent = computed(() => {
  if (activeSubpage.value === 'skills') return SettingsSkills
  if (activeSubpage.value === 'tools') return SettingsTools
  return SettingsAi
})

function setActiveSubpage(subpageId = 'models') {
  activeSubpage.value = normalizeAgentSubpage(subpageId)
  persistAgentSubpage(activeSubpage.value)
}
</script>

<style scoped>
.settings-agent-page {
  gap: 24px;
}
</style>
