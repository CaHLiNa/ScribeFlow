import { basenamePath, dirnamePath } from '../services/pathUtils.js'
import { classify, getFileIconName } from '../services/fileTypes.js'
import { ref, watch } from 'vue'

export function useFileMetadata(pathRef) {
  const basename = ref('')
  const dirname = ref('')
  const classification = ref(null)

  watch(pathRef, async (path) => {
    if (!path) {
      basename.value = ''
      dirname.value = ''
      classification.value = null
      return
    }
    const [b, d, c] = await Promise.all([
      basenamePath(path),
      dirnamePath(path),
      classify(path),
    ])
    basename.value = b
    dirname.value = d
    classification.value = c
  }, { immediate: true })

  return { basename, dirname, classification }
}

export function useBasename(pathRef) {
  const basename = ref('')
  watch(pathRef, async (path) => {
    if (!path) { basename.value = ''; return }
    basename.value = await basenamePath(path)
  }, { immediate: true })
  return basename
}

export function useDirname(pathRef) {
  const dirname = ref('')
  watch(pathRef, async (path) => {
    if (!path) { dirname.value = ''; return }
    dirname.value = await dirnamePath(path)
  }, { immediate: true })
  return dirname
}

export function useFileClassification(pathRef) {
  const classification = ref(null)
  watch(pathRef, async (path) => {
    if (!path) { classification.value = null; return }
    classification.value = await classify(path)
  }, { immediate: true })
  return classification
}

export function useViewerType(pathRef) {
  const viewerType = ref('unsupported-binary')
  watch(pathRef, async (path) => {
    if (!path) { viewerType.value = 'unsupported-binary'; return }
    const c = await classify(path)
    viewerType.value = c.viewerType
  }, { immediate: true })
  return viewerType
}

export function useFileIconName(fileNameRef) {
  const iconName = ref('IconFile')
  watch(fileNameRef, async (fileName) => {
    if (!fileName) { iconName.value = 'IconFile'; return }
    iconName.value = await getFileIconName(fileName)
  }, { immediate: true })
  return iconName
}
