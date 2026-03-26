import test from 'node:test'
import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import { collectArtifactsFromMessage } from '../src/services/ai/artifacts.js'
import { useAiArtifactsStore } from '../src/stores/aiArtifacts.js'

test('inferred workflow text artifacts do not duplicate summary and body', () => {
  const artifacts = collectArtifactsFromMessage(
    {
      id: 'msg-1',
      role: 'assistant',
      parts: [
        {
          type: 'text',
          text: '已明确这次运行的任务目标、输出边界和停止条件。',
        },
      ],
    },
    {
      role: 'reviewer',
      label: '审查当前草稿',
      artifactIntent: 'review',
      sourceFile: '/Users/math173sr/Desktop/Altals.md',
    },
  )

  assert.equal(artifacts.length, 1)
  assert.equal(artifacts[0].body, '已明确这次运行的任务目标、输出边界和停止条件。')
  assert.equal(artifacts[0].summary, '')
})

test('artifact store skips synthetic workflow narration messages', () => {
  setActivePinia(createPinia())
  const store = useAiArtifactsStore()

  const artifacts = store.syncSessionArtifacts(
    {
      id: 'session-1',
      label: 'Compile diagnosis',
      _ai: {
        role: 'tex_typ_fixer',
        label: 'Compile diagnosis',
        artifactIntent: 'compile_diagnosis',
        filePath: '/workspace/main.tex',
      },
    },
    [
      {
        id: 'workflow-msg-1',
        role: 'assistant',
        _workflowRunId: 'run-1',
        parts: [{ type: 'text', text: 'Generated a prioritized diagnosis of the current TeX / Typst compile issues.' }],
      },
      {
        id: 'assistant-msg-1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'Unknown citation key: Lu2025 at line 75.' }],
      },
    ],
  )

  assert.equal(artifacts.length, 1)
  assert.equal(artifacts[0].messageId, 'assistant-msg-1')
  assert.match(artifacts[0].body, /Unknown citation key/)
})
