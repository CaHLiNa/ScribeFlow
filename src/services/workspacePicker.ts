import { openNativeDialog } from './nativeDialog.ts'
import { getHomeDirCached } from './workspacePaths.ts'

export async function pickWorkspaceDirectory(title = 'Open Workspace') {
  const home = await getHomeDirCached()
  return openNativeDialog({
    directory: true,
    multiple: false,
    title,
    defaultPath: home,
  })
}
