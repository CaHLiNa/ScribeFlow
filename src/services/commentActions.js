import { invoke } from '@tauri-apps/api/core'
import { useChatStore } from '../stores/chat'
import { useCommentsStore } from '../stores/comments'
import { useEditorStore } from '../stores/editor'
import { useFilesStore } from '../stores/files'
import { useWorkspaceStore } from '../stores/workspace'
import { appendDocumentComments, appendUnresolvedCommentsToContent } from './documentComments'
import { launchAiTask } from './ai/launch'
import { createCommentReviewTask, createCommentThreadTask } from './ai/taskCatalog'
import { t } from '../i18n'

function getEditStatusKey(commentId, replyId = null) {
  return replyId ? `${commentId}:${replyId}` : `${commentId}:`
}

function getProposedEdit(comment, replyId = null) {
  if (!comment) return null
  if (!replyId) return comment.proposedEdit || null
  const reply = (comment.replies || []).find((item) => item.id === replyId)
  return reply?.proposedEdit || null
}

export async function applyCommentProposedEdit(commentId, replyId = null) {
  const commentsStore = useCommentsStore()
  const filesStore = useFilesStore()
  const editorStore = useEditorStore()
  const comment = commentsStore.comments.find((item) => item.id === commentId)
  if (!comment) return

  const statusKey = getEditStatusKey(commentId, replyId)
  if (commentsStore.editStatuses[statusKey]?.status === 'applied') return

  const proposedEdit = getProposedEdit(comment, replyId)
  if (!proposedEdit?.oldText || !proposedEdit?.newText) {
    commentsStore.editStatuses[statusKey] = {
      status: 'error',
      error: 'No proposed edit found.',
    }
    return
  }

  try {
    commentsStore.editStatuses[statusKey] = { status: 'pending' }

    const currentContent = await invoke('read_file', { path: comment.filePath })
    const rawFrom = Number(comment.range?.from)
    const rawTo = Number(comment.range?.to)
    const from = Number.isFinite(rawFrom) ? Math.max(0, Math.min(rawFrom, currentContent.length)) : 0
    const to = Number.isFinite(rawTo) ? Math.max(from, Math.min(rawTo, currentContent.length)) : from
    const anchorSlice = currentContent.slice(from, to)
    const localIdx = anchorSlice.indexOf(proposedEdit.oldText)

    if (localIdx === -1) {
      commentsStore.editStatuses[statusKey] = {
        status: 'error',
        error: 'oldText was not found inside the anchored comment range. The document likely changed and the suggestion must be re-anchored.',
      }
      return
    }

    const editStart = from + localIdx
    const editEnd = editStart + proposedEdit.oldText.length
    const newContent = currentContent.slice(0, editStart) + proposedEdit.newText + currentContent.slice(editEnd)
    await invoke('write_file', { path: comment.filePath, content: newContent })

    filesStore.fileContents[comment.filePath] = newContent
    editorStore.openFile(comment.filePath)

    comment.range = { from: editStart, to: editStart + proposedEdit.newText.length }
    comment.updatedAt = new Date().toISOString()
    commentsStore.editStatuses[statusKey] = { status: 'applied' }
    await commentsStore.saveComments()
  } catch (error) {
    commentsStore.editStatuses[statusKey] = {
      status: 'error',
      error: `Error applying edit: ${error}`,
    }
  }
}

export async function submitCommentsToChat(filePath) {
  const commentsStore = useCommentsStore()
  const unresolved = commentsStore.unresolvedForFile(filePath)
  if (!unresolved.length) return

  const workspace = useWorkspaceStore()
  const filesStore = useFilesStore()
  const chatStore = useChatStore()
  const editorStore = useEditorStore()

  const relativePath = workspace?.path
    ? filePath.replace(workspace.path + '/', '')
    : filePath

  let fileContent = ''
  try {
    fileContent = filesStore.fileContents[filePath] || await invoke('read_file', { path: filePath })
  } catch {}

  const fileRef = {
    path: filePath,
    content: appendUnresolvedCommentsToContent(filePath, fileContent, {
      includeReplies: true,
      includeAnchorText: true,
      escapeText: true,
    }),
  }

  const count = unresolved.length
  const task = createCommentReviewTask({
    filePath,
    relativePath,
    count,
    label: t('Comment review'),
  })

  await launchAiTask({
    editorStore,
    chatStore,
    beside: true,
    task: {
      ...task,
      fileRefs: [fileRef],
    },
  })
}

function collectCommentThreadFileRefs(comment, commentFileRef) {
  const refs = [commentFileRef]
  const seen = new Set(commentFileRef?.path ? [commentFileRef.path] : [])

  const sources = [
    ...(comment?.fileRefs || []),
    ...(comment?.replies || []).flatMap((reply) => reply.fileRefs || []),
  ]

  for (const fileRef of sources) {
    if (!fileRef?.path || seen.has(fileRef.path)) continue
    seen.add(fileRef.path)
    refs.push(fileRef)
  }

  return refs
}

export async function submitCommentThreadToChat(commentId, { paneId, beside = true } = {}) {
  const commentsStore = useCommentsStore()
  const comment = commentsStore.comments.find((item) => item.id === commentId)
  if (!comment) return

  const workspace = useWorkspaceStore()
  const filesStore = useFilesStore()
  const chatStore = useChatStore()
  const editorStore = useEditorStore()

  const relativePath = workspace?.path
    ? comment.filePath.replace(workspace.path + '/', '')
    : comment.filePath

  let fileContent = ''
  try {
    fileContent = filesStore.fileContents[comment.filePath] || await invoke('read_file', { path: comment.filePath })
  } catch {}

  const commentFileRef = {
    path: comment.filePath,
    content: appendDocumentComments(fileContent, [comment], {
      includeReplies: true,
      includeAnchorText: true,
      escapeText: true,
    }),
  }

  const task = createCommentThreadTask({
    relativePath,
    source: 'comment-thread',
    entryContext: 'comment-thread',
  })

  await launchAiTask({
    editorStore,
    chatStore,
    paneId,
    beside,
    task: {
      ...task,
      fileRefs: collectCommentThreadFileRefs(comment, commentFileRef),
    },
  })
}
