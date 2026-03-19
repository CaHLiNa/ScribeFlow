<template>
  <Teleport to="body">
    <Transition name="unsaved-dialog">
      <div
        v-if="store.visible"
        class="unsaved-overlay"
        tabindex="-1"
        @click.self="store.resolve('cancel')"
        @keydown.esc.prevent="store.resolve('cancel')"
      >
        <div class="unsaved-dialog">
          <div class="unsaved-title">{{ store.title }}</div>
          <div v-if="store.message" class="unsaved-message">{{ store.message }}</div>
          <div v-if="store.details.length > 0" class="unsaved-list">
            <div
              v-for="detail in store.details"
              :key="detail"
              class="unsaved-list-item"
            >
              {{ detail }}
            </div>
          </div>
          <div class="unsaved-actions">
            <button class="unsaved-btn unsaved-btn-ghost" @click="store.resolve('cancel')">
              {{ store.cancelLabel || t('Cancel') }}
            </button>
            <button class="unsaved-btn unsaved-btn-ghost" @click="store.resolve('discard')">
              {{ store.discardLabel || t("Don't Save") }}
            </button>
            <button class="unsaved-btn unsaved-btn-primary" @click="store.resolve('save')">
              {{ store.saveLabel || t('Save') }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { useUnsavedChangesStore } from '../stores/unsavedChanges'
import { useI18n } from '../i18n'

const store = useUnsavedChangesStore()
const { t } = useI18n()
</script>

<style scoped>
.unsaved-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(6, 8, 15, 0.48);
  backdrop-filter: blur(6px);
}

.unsaved-dialog {
  width: min(440px, 100%);
  border: 1px solid var(--border);
  border-radius: 14px;
  background: color-mix(in srgb, var(--bg-secondary) 92%, black);
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.34);
  padding: 18px;
}

.unsaved-title {
  color: var(--fg-primary);
  font-size: var(--ui-font-body);
  font-weight: 600;
}

.unsaved-message {
  margin-top: 8px;
  color: var(--fg-muted);
  font-size: var(--ui-font-body);
  line-height: 1.5;
}

.unsaved-list {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 180px;
  overflow-y: auto;
  padding: 10px;
  border: 1px solid color-mix(in srgb, var(--border) 88%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--bg-primary) 92%, transparent);
}

.unsaved-list-item {
  color: var(--fg-secondary);
  font-size: var(--ui-font-body);
  line-height: 1.4;
  word-break: break-word;
}

.unsaved-actions {
  margin-top: 18px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.unsaved-btn {
  min-width: 88px;
  height: 32px;
  border-radius: 9px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--fg-secondary);
  font-size: var(--ui-font-body);
  cursor: pointer;
  transition: background 0.14s ease, border-color 0.14s ease, color 0.14s ease, transform 0.12s ease;
}

.unsaved-btn:hover {
  background: var(--bg-hover);
}

.unsaved-btn:active {
  transform: translateY(1px);
}

.unsaved-btn-primary {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  color: var(--accent);
}

.unsaved-dialog-enter-active,
.unsaved-dialog-leave-active {
  transition: opacity 0.16s ease;
}

.unsaved-dialog-enter-from,
.unsaved-dialog-leave-to {
  opacity: 0;
}
</style>
