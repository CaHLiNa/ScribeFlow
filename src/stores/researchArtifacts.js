import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { nanoid } from './utils'
import { useWorkspaceStore } from './workspace'
import { buildPdfAnchorFingerprint } from '../services/pdfAnchors'

let saveTimer = null
const SAVE_DEBOUNCE_MS = 350
const EMPTY_STATE = Object.freeze({
  version: 1,
  annotations: [],
  notes: [],
})

function createEmptyState() {
  return {
    version: EMPTY_STATE.version,
    annotations: [],
    notes: [],
  }
}

function cloneState(state) {
  return {
    version: Number(state?.version || 1),
    annotations: Array.isArray(state?.annotations) ? state.annotations : [],
    notes: Array.isArray(state?.notes) ? state.notes : [],
  }
}

export const useResearchArtifactsStore = defineStore('researchArtifacts', () => {
  const annotations = ref([])
  const notes = ref([])
  const loaded = ref(false)
  const loading = ref(false)
  const activeAnnotationId = ref(null)
  const activeNoteId = ref(null)

  const workspace = useWorkspaceStore()

  const storagePath = computed(() => workspace.researchArtifactsPath || null)

  function getAnnotation(id) {
    return annotations.value.find((item) => item.id === id) || null
  }

  function getNote(id) {
    return notes.value.find((item) => item.id === id) || null
  }

  function annotationsForPdf(pdfPath) {
    return annotations.value
      .filter((item) => item.pdfPath === pdfPath)
      .sort((a, b) => {
        const pageDelta = Number(a.page || 0) - Number(b.page || 0)
        if (pageDelta !== 0) return pageDelta
        return String(a.createdAt || '').localeCompare(String(b.createdAt || ''))
      })
  }

  function notesForAnnotation(annotationId) {
    return notes.value
      .filter((item) => item.sourceAnnotationId === annotationId)
      .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')))
  }

  function noteForAnnotation(annotationId) {
    return notesForAnnotation(annotationId)[0] || null
  }

  function queueSave() {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      saveTimer = null
      void saveResearchArtifacts()
    }, SAVE_DEBOUNCE_MS)
  }

  async function saveResearchArtifacts() {
    if (!storagePath.value) return
    const payload = {
      version: 1,
      annotations: annotations.value,
      notes: notes.value,
    }

    try {
      await invoke('write_file', {
        path: storagePath.value,
        content: JSON.stringify(payload, null, 2),
      })
    } catch (error) {
      console.warn('Failed to save research artifacts:', error)
    }
  }

  async function loadResearchArtifacts() {
    if (!storagePath.value) return
    loading.value = true
    loaded.value = false
    activeAnnotationId.value = null
    activeNoteId.value = null

    try {
      const exists = await invoke('path_exists', { path: storagePath.value })
      if (!exists) {
        const empty = createEmptyState()
        annotations.value = empty.annotations
        notes.value = empty.notes
        loaded.value = true
        return
      }

      const raw = await invoke('read_file', { path: storagePath.value })
      const parsed = JSON.parse(raw)
      const state = cloneState(parsed)
      annotations.value = state.annotations
      notes.value = state.notes
      loaded.value = true
    } catch (error) {
      console.warn('Failed to load research artifacts:', error)
      const empty = createEmptyState()
      annotations.value = empty.annotations
      notes.value = empty.notes
      loaded.value = true
    } finally {
      loading.value = false
    }
  }

  function createAnnotation({
    type = 'pdf_annotation',
    pdfPath,
    referenceKey = null,
    page,
    quote,
    anchor,
    color = 'yellow',
    tags = [],
  } = {}) {
    const now = new Date().toISOString()
    const annotation = {
      id: `ann-${nanoid(10)}`,
      type,
      pdfPath,
      referenceKey: referenceKey || null,
      page: Number(page || 0),
      quote: String(quote || ''),
      anchor,
      anchorFingerprint: buildPdfAnchorFingerprint(anchor),
      color,
      tags: Array.isArray(tags) ? tags : [],
      createdAt: now,
      updatedAt: now,
    }
    annotations.value.push(annotation)
    activeAnnotationId.value = annotation.id
    queueSave()
    return annotation
  }

  function updateAnnotation(id, updates = {}) {
    const target = getAnnotation(id)
    if (!target) return false
    Object.assign(target, updates, {
      updatedAt: new Date().toISOString(),
    })
    if (updates.anchor) {
      target.anchorFingerprint = buildPdfAnchorFingerprint(updates.anchor)
    }
    queueSave()
    return true
  }

  function removeAnnotation(id) {
    const idx = annotations.value.findIndex((item) => item.id === id)
    if (idx === -1) return false
    annotations.value.splice(idx, 1)
    notes.value = notes.value.filter((note) => note.sourceAnnotationId !== id)
    if (activeAnnotationId.value === id) activeAnnotationId.value = null
    queueSave()
    return true
  }

  function setActiveAnnotation(id = null) {
    activeAnnotationId.value = id || null
  }

  function createResearchNote({
    sourceAnnotationId,
    quote = '',
    comment = '',
    insertedInto = null,
    sourceRef = null,
  } = {}) {
    const now = new Date().toISOString()
    const note = {
      id: `note-${nanoid(10)}`,
      sourceAnnotationId: sourceAnnotationId || null,
      quote: String(quote || ''),
      comment: String(comment || ''),
      insertedInto: insertedInto || null,
      sourceRef: sourceRef || null,
      createdAt: now,
      updatedAt: now,
    }
    notes.value.push(note)
    activeNoteId.value = note.id
    queueSave()
    return note
  }

  function updateResearchNote(id, updates = {}) {
    const target = getNote(id)
    if (!target) return false
    Object.assign(target, updates, {
      updatedAt: new Date().toISOString(),
    })
    queueSave()
    return true
  }

  function removeResearchNote(id) {
    const idx = notes.value.findIndex((item) => item.id === id)
    if (idx === -1) return false
    notes.value.splice(idx, 1)
    if (activeNoteId.value === id) activeNoteId.value = null
    queueSave()
    return true
  }

  function setActiveNote(id = null) {
    activeNoteId.value = id || null
  }

  function cleanup() {
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    annotations.value = []
    notes.value = []
    loaded.value = false
    loading.value = false
    activeAnnotationId.value = null
    activeNoteId.value = null
  }

  return {
    annotations,
    notes,
    loaded,
    loading,
    activeAnnotationId,
    activeNoteId,
    storagePath,
    getAnnotation,
    getNote,
    annotationsForPdf,
    notesForAnnotation,
    noteForAnnotation,
    loadResearchArtifacts,
    saveResearchArtifacts,
    createAnnotation,
    updateAnnotation,
    removeAnnotation,
    setActiveAnnotation,
    createResearchNote,
    updateResearchNote,
    removeResearchNote,
    setActiveNote,
    cleanup,
  }
})
