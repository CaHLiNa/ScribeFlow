/**
 * Shared file-operation error formatter for toast and dialog surfaces.
 */
import { basenamePath } from './path'

export function formatFileError(operation, filePath, error) {
  const name = filePath ? basenamePath(filePath) : 'file'
  const str = typeof error === 'string' ? error : String(error || '')

  let reason = ''
  if (/permission|denied|access/i.test(str)) {
    reason = 'permission denied'
  } else if (/no such file|not found|does not exist/i.test(str)) {
    reason = 'file not found'
  } else if (/disk full|no space/i.test(str)) {
    reason = 'disk full'
  } else if (/read.only/i.test(str)) {
    reason = 'file is read-only'
  }

  const verb = operation === 'save' ? 'save' : operation === 'load' ? 'load' : 'restore'
  return reason
    ? `Cannot ${verb} '${name}' \u2014 ${reason}.`
    : `Cannot ${verb} '${name}'. ${str.length > 100 ? str.slice(0, 100) + '...' : str}`
}
