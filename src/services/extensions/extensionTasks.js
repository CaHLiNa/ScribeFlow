import { invokeCommand as invoke } from '../tauriBridge.ts'

export async function listExtensionTasks(workspaceRoot = '') {
  return invoke('extension_task_list', {
    params: {
      workspaceRoot,
    },
  })
}

export async function getExtensionTask(taskId = '') {
  return invoke('extension_task_get', {
    params: {
      taskId,
    },
  })
}

export async function cancelExtensionTask(taskId = '') {
  return invoke('extension_task_cancel', {
    params: {
      taskId,
    },
  })
}

export async function cancelExtensionTasksForExtension(extensionId = '', workspaceRoot = '') {
  return invoke('extension_task_cancel_extension', {
    params: {
      extensionId,
      workspaceRoot,
    },
  })
}
