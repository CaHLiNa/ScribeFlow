import { unref } from 'vue'
import {
  normalizeReferenceDetailCollectionMemberships,
  normalizeReferenceDetailTagValues,
  normalizeReferenceDetailText,
  resolveReferenceDetailCollection,
  resolveReferenceDetailCollectionLabel,
} from '../../domains/references/referenceDetailDraft.js'

export function useReferenceDetailTokenActions({
  availableCollections,
  clearActiveDraftField,
  clearDraftDirtyField,
  draft,
  markDraftDirty,
  tagInput,
  updateSelectedReference,
} = {}) {
  function currentCollections() {
    return unref(availableCollections) || []
  }

  function resolveCollection(value = '') {
    return resolveReferenceDetailCollection(currentCollections(), value)
  }

  function normalizeCollectionMemberships(values = []) {
    return normalizeReferenceDetailCollectionMemberships(currentCollections(), values)
  }

  function collectionLabel(value = '') {
    return resolveReferenceDetailCollectionLabel(currentCollections(), value)
  }

  function updateTagInput(value = '') {
    tagInput.value = value
    markDraftDirty?.('tagInput')
  }

  async function removeCollection(value = '') {
    const target = resolveCollection(value)?.key || normalizeReferenceDetailText(value)
    draft.collections = normalizeCollectionMemberships(draft.collections).filter(
      (item) => item !== target
    )
    await updateSelectedReference?.({ collections: [...draft.collections] })
  }

  async function addTag(event) {
    event?.preventDefault?.()
    const nextTags = normalizeReferenceDetailTagValues(tagInput.value)
    if (nextTags.length === 0) return

    const existing = new Set(
      draft.tags.map((tag) => normalizeReferenceDetailText(tag).toLowerCase())
    )
    for (const tag of nextTags) {
      const normalized = tag.toLowerCase()
      if (!existing.has(normalized)) {
        existing.add(normalized)
        draft.tags.push(tag)
      }
    }

    tagInput.value = ''
    clearDraftDirtyField?.('tagInput')
    await updateSelectedReference?.({ tags: [...draft.tags] })
  }

  function handleTagInputKeydown(event) {
    if (event.key === ',') {
      void addTag(event)
    }
  }

  async function handleTagInputBlur(event) {
    try {
      if (normalizeReferenceDetailTagValues(tagInput.value).length > 0) {
        await addTag(event)
      }
    } finally {
      clearDraftDirtyField?.('tagInput')
      clearActiveDraftField?.('tagInput')
    }
  }

  async function removeTag(tag = '') {
    const normalizedTarget = normalizeReferenceDetailText(tag).toLowerCase()
    draft.tags = draft.tags.filter(
      (item) => normalizeReferenceDetailText(item).toLowerCase() !== normalizedTarget
    )
    await updateSelectedReference?.({ tags: [...draft.tags] })
  }

  return {
    addTag,
    collectionLabel,
    handleTagInputBlur,
    handleTagInputKeydown,
    removeCollection,
    removeTag,
    updateTagInput,
  }
}
