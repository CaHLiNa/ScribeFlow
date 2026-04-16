import { defineStore } from 'pinia'

const AI_MODE_STORAGE_KEY = 'altals.ai.currentMode'

function readPersistedAiMode() {
  try {
    const value = String(localStorage.getItem(AI_MODE_STORAGE_KEY) || '').trim()
    return value === 'chat' ? 'chat' : 'agent'
  } catch {
    return 'agent'
  }
}

function persistAiMode(mode = 'agent') {
  try {
    localStorage.setItem(AI_MODE_STORAGE_KEY, mode === 'chat' ? 'chat' : 'agent')
  } catch {
    // ignore local storage failures
  }
}

export const useAiModesStore = defineStore('aiModes', {
  state: () => ({
    currentMode: readPersistedAiMode(),
  }),

  getters: {
    isChatMode(state) {
      return state.currentMode === 'chat'
    },

    isAgentMode(state) {
      return state.currentMode === 'agent'
    },
  },

  actions: {
    setMode(mode = 'agent') {
      this.currentMode = String(mode || '').trim() === 'chat' ? 'chat' : 'agent'
      persistAiMode(this.currentMode)
    },
  },
})
