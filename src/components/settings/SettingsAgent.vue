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

    <SettingsAi v-if="!browserPreview" />
  </div>
</template>

<script setup>
import { defineAsyncComponent } from 'vue'
import { useI18n } from '../../i18n'
import { isBrowserPreviewRuntime } from '../../app/browserPreview/routes.js'

const SettingsAi = defineAsyncComponent(() => import('./SettingsAi.vue'))

const { t } = useI18n()
const browserPreview = isBrowserPreviewRuntime()
</script>

<style scoped>
.settings-agent-page {
  gap: 24px;
}

.settings-preview-card {
  padding: 8px 0;
}

.settings-row.is-stack {
  align-items: flex-start;
}
</style>
