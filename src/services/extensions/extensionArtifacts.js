import { invoke } from '@tauri-apps/api/core'

export async function openExtensionArtifact(artifact = {}) {
  return invoke('extension_artifact_open', {
    params: {
      path: artifact?.path,
    },
  })
}

export async function revealExtensionArtifact(artifact = {}) {
  return invoke('extension_artifact_reveal', {
    params: {
      path: artifact?.path,
    },
  })
}

export async function readExtensionArtifactText(artifact = {}, maxBytes) {
  const params = {
    path: artifact?.path,
  }
  if (maxBytes !== undefined) {
    params.maxBytes = maxBytes
  }
  return invoke('extension_artifact_read_text', {
    params,
  })
}
