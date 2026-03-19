import { defineStore } from 'pinia'

let pendingResolver = null

function resolvePending(choice) {
  const resolver = pendingResolver
  pendingResolver = null
  resolver?.(choice)
}

export const useUnsavedChangesStore = defineStore('unsavedChanges', {
  state: () => ({
    visible: false,
    title: '',
    message: '',
    details: [],
    saveLabel: '',
    discardLabel: '',
    cancelLabel: '',
  }),

  actions: {
    async prompt(options = {}) {
      if (this.visible) {
        resolvePending('cancel')
      }

      this.visible = true
      this.title = options.title || ''
      this.message = options.message || ''
      this.details = Array.isArray(options.details) ? [...options.details] : []
      this.saveLabel = options.saveLabel || 'Save'
      this.discardLabel = options.discardLabel || "Don't Save"
      this.cancelLabel = options.cancelLabel || 'Cancel'

      return new Promise((resolve) => {
        pendingResolver = resolve
      })
    },

    resolve(choice = 'cancel') {
      this.visible = false
      this.title = ''
      this.message = ''
      this.details = []
      this.saveLabel = ''
      this.discardLabel = ''
      this.cancelLabel = ''
      resolvePending(choice)
    },
  },
})
