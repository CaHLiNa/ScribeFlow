import { defineStore } from 'pinia'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

const CHECK_CACHE_MS = 5 * 60 * 1000

export const useTinymistStore = defineStore('tinymistTool', {
  state: () => ({
    available: false,
    binaryPath: null,
    launchCommand: null,
    checkingBinary: false,
    lastBinaryCheckAt: 0,
    downloading: false,
    downloadProgress: 0,
    downloadError: null,
  }),

  actions: {
    async checkBinary(force = false) {
      if (this.checkingBinary) return
      if (!force && this.lastBinaryCheckAt && Date.now() - this.lastBinaryCheckAt < CHECK_CACHE_MS) return

      this.checkingBinary = true
      try {
        const result = await invoke('check_tinymist_binary')
        this.available = result?.installed === true
        this.binaryPath = result?.path || null
        this.launchCommand = result?.launchCommand || result?.launch_command || null
      } catch {
        this.available = false
        this.binaryPath = null
        this.launchCommand = null
      } finally {
        this.lastBinaryCheckAt = Date.now()
        this.checkingBinary = false
      }
    },

    async downloadTinymist() {
      this.downloading = true
      this.downloadProgress = 0
      this.downloadError = null

      const unlisten = await listen('tinymist-download-progress', (event) => {
        this.downloadProgress = event.payload.percent
      })

      try {
        const path = await invoke('download_tinymist')
        this.available = true
        this.binaryPath = path
        await this.checkBinary(true)
      } catch (error) {
        this.downloadError = typeof error === 'string' ? error : error.message || 'Download failed'
      } finally {
        unlisten()
        this.downloading = false
      }
    },
  },
})
