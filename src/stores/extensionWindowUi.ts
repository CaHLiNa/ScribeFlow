import { defineStore } from 'pinia'
import { respondExtensionWindowUiRequest } from '../services/extensions/extensionWindowUi'

function normalizeQuickPickItem(item = {}, index = 0) {
  return {
    id: String(item.id || `${index}`),
    label: String(item.label || ''),
    description: String(item.description || ''),
    detail: String(item.detail || ''),
    picked: Boolean(item.picked),
    value: Object.prototype.hasOwnProperty.call(item, 'value') ? item.value : String(item.label || ''),
  }
}

function normalizeRequest(payload = {}) {
  return {
    requestId: String(payload.requestId || ''),
    extensionId: String(payload.extensionId || ''),
    workspaceRoot: String(payload.workspaceRoot || ''),
    kind: String(payload.kind || ''),
    title: String(payload.title || ''),
    prompt: String(payload.prompt || ''),
    placeholder: String(payload.placeholder || ''),
    value: String(payload.value || ''),
    password: Boolean(payload.password),
    canPickMany: Boolean(payload.canPickMany),
    items: Array.isArray(payload.items) ? payload.items.map(normalizeQuickPickItem) : [],
  }
}

export const useExtensionWindowUiStore = defineStore('extensionWindowUi', {
  state: () => ({
    pendingRequest: null,
    busy: false,
  }),

  getters: {
    visible(state) {
      return Boolean(state.pendingRequest?.requestId)
    },
  },

  actions: {
    presentRequest(payload = {}) {
      this.pendingRequest = normalizeRequest(payload)
    },

    clearRequest() {
      this.pendingRequest = null
      this.busy = false
    },

    async resolve(result) {
      if (!this.pendingRequest?.requestId || this.busy) return
      this.busy = true
      try {
        await respondExtensionWindowUiRequest({
          requestId: this.pendingRequest.requestId,
          cancelled: false,
          result,
        })
      } finally {
        this.clearRequest()
      }
    },

    async cancel() {
      if (!this.pendingRequest?.requestId || this.busy) return
      this.busy = true
      try {
        await respondExtensionWindowUiRequest({
          requestId: this.pendingRequest.requestId,
          cancelled: true,
          result: null,
        })
      } finally {
        this.clearRequest()
      }
    },
  },
})
