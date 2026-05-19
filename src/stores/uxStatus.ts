import { defineStore } from 'pinia'
import { nanoid } from './utils'

export const useUxStatusStore = defineStore('uxStatus', {
  state: () => ({
    current: null,
    _timer: null,
    _recentKeys: {},
  }),

  actions: {
    _scheduleClear(id, duration = 0) {
      if (this._timer) {
        clearTimeout(this._timer)
        this._timer = null
      }
      if (!(duration > 0)) return
      this._timer = setTimeout(() => {
        if (this.current?.id === id) {
          this.current = null
        }
        this._timer = null
      }, duration)
    },

    show(message, { type = 'info', duration = 3000, action = null } = {}) {
      const entry = {
        id: nanoid(),
        message,
        type,
        action,
        createdAt: Date.now(),
      }
      this.current = entry
      this._scheduleClear(entry.id, duration)
      return entry.id
    },

    update(id, message, { type, action, duration } = {}) {
      if (!this.current || this.current.id !== id) return
      this.current.message = message
      if (type !== undefined) this.current.type = type
      if (action !== undefined) this.current.action = action
      if (duration !== undefined) {
        this._scheduleClear(id, duration)
      }
    },

    clear(id = null) {
      if (id && this.current?.id !== id) return
      if (this._timer) {
        clearTimeout(this._timer)
        this._timer = null
      }
      this.current = null
    },

    success(message, options = {}) {
      return this.show(message, { ...options, type: 'success' })
    },

    warning(message, options = {}) {
      return this.show(message, { ...options, type: 'warning' })
    },

    error(message, options = {}) {
      return this.show(message, { ...options, type: 'error' })
    },

    showOnce(key, message, options = {}, cooldown = 5000) {
      const now = Date.now()
      if (this._recentKeys[key] && now - this._recentKeys[key] < cooldown) return null
      this._recentKeys[key] = now
      return this.show(message, options)
    },
  },
})
