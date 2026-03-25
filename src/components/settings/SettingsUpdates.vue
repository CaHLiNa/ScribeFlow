<template>
  <div>
    <h3 class="settings-section-title">{{ t('Updates') }}</h3>

    <div class="update-card ui-surface-card">
      <div class="update-identity-row">
        <span class="env-lang-dot good"></span>
        <span class="update-app-name">Altals</span>
        <div class="ui-flex-spacer"></div>
        <span class="update-version-tag">v{{ appVersion }}</span>
      </div>

      <p class="update-copy">
        {{
          t(
            'Automatic updates are disabled in this local build. Use the GitHub releases page when you want to download a newer version.'
          )
        }}
      </p>

      <div class="update-actions">
        <UiButton variant="primary" @click="openReleases">
          {{ t('Open Releases') }}
        </UiButton>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { getAppVersion, openReleasesPage } from '../../services/appUpdater'
import { useI18n } from '../../i18n'
import UiButton from '../shared/ui/UiButton.vue'

const appVersion = ref('...')
const { t } = useI18n()

async function openReleases() {
  await openReleasesPage()
}

onMounted(async () => {
  appVersion.value = await getAppVersion()
})
</script>

<style scoped>
.update-card {
  padding: var(--space-3);
}

.update-identity-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.update-app-name {
  font-size: var(--ui-font-body);
  color: var(--text-secondary);
}

.update-version-tag {
  font-size: var(--ui-font-caption);
  color: var(--text-muted);
  font-family: var(--font-mono);
}

.update-copy {
  margin: var(--space-3) 0 0;
  font-size: var(--ui-font-body);
  line-height: var(--line-height-relaxed);
  color: var(--text-secondary);
}

.update-actions {
  margin-top: var(--space-3);
  padding-left: 14px;
}
</style>
