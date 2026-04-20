<template>
  <div class="settings-page settings-agent-page">
    <section v-if="browserPreview" class="settings-group">
      <h4 class="settings-group-title">{{ t('Agent') }}</h4>
      <div class="settings-group-body settings-preview-card">
        <div class="settings-row is-stack">
          <div class="settings-row-copy">
            <div class="settings-row-title">{{ t('Browser preview mode') }}</div>
            <div class="settings-row-hint">
              {{
                t(
                  'Provider catalogs, keys, and tool policies still depend on the desktop runtime. This preview keeps the layout routable in the browser without invoking native APIs.'
                )
              }}
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="settings-group">
      <div class="settings-group-body">
        <div class="settings-row">
          <div class="settings-row-control settings-agent-subpage-control">
            <div class="settings-segmented" role="tablist" :aria-label="t('Agent pages')">
              <button
                v-for="item in subpages"
                :key="item.id"
                type="button"
                class="settings-segmented-btn"
                :class="{ 'is-active': activeSubpage === item.id }"
                :aria-selected="activeSubpage === item.id"
                @click="setActiveSubpage(item.id)"
              >
                {{ item.label }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <component :is="activeComponent" v-if="activeComponent" />
  </div>
</template>

<script setup>
import { computed, defineAsyncComponent, ref } from 'vue'
import { useI18n } from '../../i18n'
import { isBrowserPreviewRuntime } from '../../app/browserPreview/routes.js'

const SettingsAi = defineAsyncComponent(() => import('./SettingsAi.vue'))
const SettingsSkills = defineAsyncComponent(() => import('./SettingsSkills.vue'))

const AGENT_SETTINGS_SUBPAGE_STORAGE_KEY = 'scribeflow.settings.agentSubpage'

const { t } = useI18n()
const browserPreview = isBrowserPreviewRuntime()

const AGENT_SETTINGS_SUBPAGES = Object.freeze(['models', 'skills'])

function normalizeAgentSubpage(value = '') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
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
    label: t('Codex runtime'),
  },
  {
    id: 'skills',
    label: t('Skills'),
  },
])

const activeComponent = computed(() => {
  if (browserPreview) return null
  if (activeSubpage.value === 'skills') return SettingsSkills
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

.settings-agent-subpage-control {
  width: 100%;
  justify-content: flex-start;
}

.settings-preview-card {
  padding: 8px 0;
}

.settings-row.is-stack {
  align-items: flex-start;
}
</style>
