import { basenamePath, dirnamePath } from '../utils/path.js'
import { classify, getFileIconName } from '../utils/fileTypes.js'
import { ref, watch } from 'vue'

export function useFileMetadata(pathRef) {
  const basename = ref('')
  const dirname = ref('')
  const classification = ref(null)

  watch(pathRef, (path) => {
    if (!path) {
      basename.value = ''
      dirname.value = ''
      classification.value = null
      return
    }
    basename.value = basenamePath(path)
    dirname.value = dirnamePath(path)
    classification.value = classify(path)
  }, { immediate: true })

  return { basename, dirname, classification }
}

export function useBasename(pathRef) {
  const basename = ref('')
  watch(pathRef, (path) => {
    if (!path) { basename.value = ''; return }
    basename.value = basenamePath(path)
  }, { immediate: true })
  return basename
}

export function useDirname(pathRef) {
  const dirname = ref('')
  watch(pathRef, (path) => {
    if (!path) { dirname.value = ''; return }
    dirname.value = dirnamePath(path)
  }, { immediate: true })
  return dirname
}

export function useFileClassification(pathRef) {
  const classification = ref(null)
  watch(pathRef, (path) => {
    if (!path) { classification.value = null; return }
    classification.value = classify(path)
  }, { immediate: true })
  return classification
}

export function useViewerType(pathRef) {
  const viewerType = ref('unsupported-binary')
  watch(pathRef, (path) => {
    if (!path) { viewerType.value = 'unsupported-binary'; return }
    const c = classify(path)
    viewerType.value = c.viewerType
  }, { immediate: true })
  return viewerType
}

export function useFileIconName(fileNameRef) {
  const iconName = ref('IconFile')
  watch(fileNameRef, (fileName) => {
    if (!fileName) { iconName.value = 'IconFile'; return }
    iconName.value = getFileIconName(fileName)
  }, { immediate: true })
  return iconName
}
