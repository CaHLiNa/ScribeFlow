import {
  getWorkspaceSnapshotDisplayMessage,
  isFileWorkspaceSnapshot,
  isNamedWorkspaceSnapshot,
} from './workspaceSnapshotRuntime.js'
import { createWorkspaceSnapshotPayloadMeta } from './workspaceLocalSnapshotPayloadRuntime.js'

function normalizeSnapshotValue(value = '') {
  return String(value || '').trim()
}

export function getWorkspaceSnapshotCapabilities(snapshot = null) {
  const isFileSnapshot = isFileWorkspaceSnapshot(snapshot)
  const payload = createWorkspaceSnapshotPayloadMeta(snapshot?.payload)
  const hasRestorablePayload = (payload?.fileCount || 0) > 0

  return {
    canPreview: isFileSnapshot || hasRestorablePayload,
    canRestore: isFileSnapshot || hasRestorablePayload,
    canCopy: isFileSnapshot,
  }
}

export function getWorkspaceSnapshotTitle(snapshot = null) {
  const label = normalizeSnapshotValue(snapshot?.label)
  if (label) {
    return label
  }

  return getWorkspaceSnapshotDisplayMessage(snapshot)
}

export function createWorkspaceSnapshotMetadata({
  snapshot = null,
} = {}) {
  const capabilities = getWorkspaceSnapshotCapabilities(snapshot)
  const message = getWorkspaceSnapshotDisplayMessage(snapshot)
  const isNamed = isNamedWorkspaceSnapshot(snapshot)
  const payload = createWorkspaceSnapshotPayloadMeta(snapshot?.payload)

  return {
    snapshotId: normalizeSnapshotValue(snapshot?.id),
    scope: normalizeSnapshotValue(snapshot?.scope),
    backend: normalizeSnapshotValue(snapshot?.backend),
    sourceKind: normalizeSnapshotValue(snapshot?.sourceKind),
    kind: normalizeSnapshotValue(snapshot?.kind),
    title: getWorkspaceSnapshotTitle(snapshot),
    message,
    isNamed,
    isSystemGenerated: !isNamed && !!message,
    capabilities,
    payload,
  }
}

export function getWorkspaceSnapshotMetadata(snapshot = null) {
  const snapshotId = normalizeSnapshotValue(snapshot?.id)
  const metadata = snapshot?.metadata

  if (metadata?.snapshotId && metadata.snapshotId === snapshotId) {
    return metadata
  }

  return createWorkspaceSnapshotMetadata({ snapshot })
}

export function attachWorkspaceSnapshotMetadata(snapshot = null) {
  if (!snapshot) {
    return snapshot
  }

  return {
    ...snapshot,
    metadata: createWorkspaceSnapshotMetadata({ snapshot }),
  }
}

export function attachWorkspaceSnapshotMetadataList(snapshots = []) {
  return snapshots.map((snapshot) => attachWorkspaceSnapshotMetadata(snapshot))
}
