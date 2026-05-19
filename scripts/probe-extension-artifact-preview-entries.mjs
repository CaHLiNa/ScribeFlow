import assert from 'node:assert/strict'
import {
  buildExtensionArtifactPreviewEntries,
  buildExtensionTaskResultEntries,
  buildDefaultResultEntries,
  mergeDefaultResultEntries,
} from '../src/domains/extensions/extensionResultEntries.ts'

async function main() {
  const entries = buildExtensionArtifactPreviewEntries([
    {
      id: 'artifact-pdf',
      kind: 'translated-pdf',
      mediaType: 'application/pdf',
      path: '/tmp/paper.pdf',
    },
    {
      id: 'artifact-text',
      kind: 'translated-text',
      mediaType: 'text/plain',
      path: '/tmp/paper.pdf.zh-CN.translation.txt',
    },
    {
      id: 'artifact-html',
      kind: 'translation-html',
      mediaType: 'text/html',
      path: '/tmp/translation.html',
    },
  ])

  assert.equal(entries.length, 3)
  assert.deepEqual(
    entries.map((entry) => ({
      id: entry.id,
      previewMode: entry.previewMode,
      previewPath: entry.previewPath,
      title: entry.previewTitle,
    })),
    [
      {
        id: 'artifact-pdf',
        previewMode: 'pdf',
        previewPath: '/tmp/paper.pdf',
        title: 'Translated Pdf',
      },
      {
        id: 'artifact-text',
        previewMode: 'text',
        previewPath: '/tmp/paper.pdf.zh-CN.translation.txt',
        title: 'Translated Text',
      },
      {
        id: 'artifact-html',
        previewMode: 'html',
        previewPath: '/tmp/translation.html',
        title: 'Translation Html',
      },
    ],
  )

  const taskEntries = buildExtensionTaskResultEntries({
    id: 'task-1',
    extensionId: 'example-pdf-extension',
    commandId: 'scribeflow.pdf.translate',
    target: {
      kind: 'pdf',
      referenceId: 'ref-123',
      path: '/tmp/paper.pdf',
    },
    settings: {
      'examplePdfExtension.targetLang': 'zh-CN',
    },
    logPath: '/tmp/extension-task.log',
    outputs: [
      {
        id: 'inline-summary',
        type: 'inlineText',
        mediaType: 'text/plain',
        title: 'Inline Summary',
        text: 'inline summary text',
      },
      {
        id: 'inline-html',
        type: 'inlineHtml',
        mediaType: 'text/html',
        title: 'Inline HTML',
        html: '<p>inline html preview</p>',
      },
    ],
    artifacts: [
      {
        id: 'artifact-text',
        kind: 'translated-text',
        mediaType: 'text/plain',
        path: '/tmp/paper.pdf.zh-CN.translation.txt',
      },
    ],
  })

  assert.deepEqual(
    taskEntries.map((entry) => ({
      id: entry.id,
      action: entry.action,
      previewMode: entry.previewMode,
      commandId: entry.commandId || '',
      previewTitle: entry.previewTitle || '',
    })),
    [
      {
        id: 'artifact-text',
        action: 'open',
        previewMode: 'text',
        commandId: '',
        previewTitle: 'Translated Text',
      },
      {
        id: 'inline-summary',
        action: 'open',
        previewMode: 'text',
        commandId: '',
        previewTitle: 'Inline Summary',
      },
      {
        id: 'inline-html',
        action: 'open',
        previewMode: 'html',
        commandId: '',
        previewTitle: 'Inline HTML',
      },
      {
        id: 'task-1:log',
        action: 'open',
        previewMode: 'text',
        commandId: '',
        previewTitle: 'Task Log',
      },
      {
        id: 'task-1:rerun',
        action: 'execute-command',
        previewMode: undefined,
        commandId: 'scribeflow.pdf.translate',
        previewTitle: '',
      },
    ],
  )

  const defaultEntries = buildDefaultResultEntries({
    artifacts: [
      {
        id: 'artifact-pdf',
        kind: 'translated-pdf',
        mediaType: 'application/pdf',
        path: '/tmp/paper.pdf',
      },
    ],
    outputs: [
      {
        id: 'inline-summary',
        type: 'inlineText',
        mediaType: 'text/plain',
        title: 'Inline Summary',
        text: 'inline summary text',
      },
    ],
  })

  assert.deepEqual(
    defaultEntries.map((entry) => ({
      id: entry.id,
      previewMode: entry.previewMode,
      previewTitle: entry.previewTitle,
    })),
    [
      {
        id: 'artifact-pdf',
        previewMode: 'pdf',
        previewTitle: 'Translated Pdf',
      },
      {
        id: 'inline-summary',
        previewMode: 'text',
        previewTitle: 'Inline Summary',
      },
    ],
  )

  const mergedEntries = mergeDefaultResultEntries({
    existingEntries: [
      {
        id: 'artifact-pdf',
        label: 'Old PDF Label',
        action: 'open',
        previewMode: 'text',
        previewTitle: 'Old PDF Label',
      },
      {
        id: 'run-again',
        label: 'Run Again',
        action: 'execute-command',
      },
    ],
    artifacts: [
      {
        id: 'artifact-pdf',
        kind: 'translated-pdf',
        mediaType: 'application/pdf',
        path: '/tmp/paper.pdf',
      },
    ],
    outputs: [
      {
        id: 'inline-summary',
        type: 'inlineText',
        mediaType: 'text/plain',
        title: 'Inline Summary',
        text: 'inline summary text',
      },
    ],
  })

  assert.deepEqual(
    mergedEntries.map((entry) => ({
      id: entry.id,
      action: entry.action,
      previewMode: entry.previewMode,
      previewTitle: entry.previewTitle,
    })),
    [
      {
        id: 'artifact-pdf',
        action: 'open',
        previewMode: 'text',
        previewTitle: 'Old PDF Label',
      },
      {
        id: 'run-again',
        action: 'execute-command',
        previewMode: undefined,
        previewTitle: undefined,
      },
      {
        id: 'inline-summary',
        action: 'open',
        previewMode: 'text',
        previewTitle: 'Inline Summary',
      },
    ],
  )

  const explicitOutputWins = mergeDefaultResultEntries({
    existingEntries: [
      {
        id: 'inline-summary',
        label: 'Pinned Summary',
        action: 'open',
        previewMode: 'text',
        previewTitle: 'Pinned Summary',
        payload: {
          text: 'pinned summary text',
        },
      },
    ],
    outputs: [
      {
        id: 'inline-summary',
        type: 'inlineText',
        mediaType: 'text/plain',
        title: 'Inline Summary',
        text: 'generated summary text',
      },
    ],
  })

  assert.deepEqual(
    explicitOutputWins.map((entry) => ({
      id: entry.id,
      previewTitle: entry.previewTitle,
      text: entry.payload?.text,
    })),
    [
      {
        id: 'inline-summary',
        previewTitle: 'Pinned Summary',
        text: 'pinned summary text',
      },
    ],
  )

  console.log(JSON.stringify({
    ok: true,
    entries,
    taskEntries,
    defaultEntries,
    mergedEntries,
    explicitOutputWins,
  }, null, 2))
}

void main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error?.message || String(error),
  }, null, 2))
  process.exitCode = 1
})
