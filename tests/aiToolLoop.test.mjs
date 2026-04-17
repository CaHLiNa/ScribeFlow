import test from 'node:test'
import assert from 'node:assert/strict'

import { executeAiToolCalls, resolveAiRuntimeTools } from '../src/services/ai/runtime/toolLoop.js'
import {
  resolveEffectiveAiToolIds,
  resolveRuntimeAiToolIds,
} from '../src/services/ai/toolRegistry.js'

test('resolveRuntimeAiToolIds adds core workspace tools in agent mode', () => {
  const toolIds = resolveRuntimeAiToolIds(['delete-workspace-path'], {
    runtimeIntent: 'agent',
  })

  assert.equal(toolIds.includes('list-workspace-directory'), true)
  assert.equal(toolIds.includes('search-workspace-files'), true)
  assert.equal(toolIds.includes('read-workspace-file'), true)
  assert.equal(toolIds.includes('read-selected-reference'), true)
  assert.equal(toolIds.includes('create-workspace-file'), true)
  assert.equal(toolIds.includes('delete-workspace-path'), true)
})

test('resolveEffectiveAiToolIds keeps built-in safe tools always enabled and only adds risky toggles explicitly', () => {
  const defaultToolIds = resolveEffectiveAiToolIds([])
  assert.equal(defaultToolIds.includes('create-workspace-file'), true)
  assert.equal(defaultToolIds.includes('write-workspace-file'), true)
  assert.equal(defaultToolIds.includes('delete-workspace-path'), false)
})

test('resolveAiRuntimeTools registers workspace file tools when enabled', async () => {
  const { tools, executors } = resolveAiRuntimeTools({
    enabledToolIds: [
      'list-workspace-directory',
      'search-workspace-files',
      'read-workspace-file',
      'create-workspace-file',
      'write-workspace-file',
      'open-workspace-file',
      'delete-workspace-path',
    ],
    toolRuntime: {
      listWorkspaceDirectory: async () => ({ entries: [{ name: 'src', kind: 'directory' }] }),
      searchWorkspaceFiles: async () => ({ matches: [{ relativePath: 'src/app.ts' }] }),
      readWorkspaceFile: async () => ({
        relativePath: 'src/app.ts',
        content: 'export const ok = true',
      }),
      createWorkspaceFile: async () => ({
        relativePath: 'notes/test.md',
        created: true,
        opened: true,
      }),
      writeWorkspaceFile: async () => ({
        relativePath: 'notes/test.md',
        saved: true,
        opened: true,
      }),
      openWorkspaceFile: async () => ({
        relativePath: 'notes/test.md',
        opened: true,
      }),
      deleteWorkspacePath: async () => ({
        relativePath: 'notes/test.md',
        deleted: true,
      }),
    },
  })

  assert.deepEqual(
    tools.map((tool) => tool.name),
    [
      'list_workspace_directory',
      'search_workspace_files',
      'read_workspace_file',
      'create_workspace_file',
      'write_workspace_file',
      'open_workspace_file',
      'delete_workspace_path',
    ]
  )

  const results = await executeAiToolCalls(
    [
      { id: 'tool-1', name: 'list_workspace_directory', arguments: {} },
      { id: 'tool-2', name: 'search_workspace_files', arguments: { query: 'app' } },
      { id: 'tool-3', name: 'read_workspace_file', arguments: { path: 'src/app.ts' } },
      { id: 'tool-4', name: 'create_workspace_file', arguments: { path: 'notes/test.md' } },
      {
        id: 'tool-5',
        name: 'write_workspace_file',
        arguments: { path: 'notes/test.md', content: '# Test' },
      },
      { id: 'tool-6', name: 'open_workspace_file', arguments: { path: 'notes/test.md' } },
      { id: 'tool-7', name: 'delete_workspace_path', arguments: { path: 'notes/test.md' } },
    ],
    executors
  )

  assert.equal(results.length, 7)
  assert.match(results[0].content, /"src"/)
  assert.match(results[1].content, /src\/app\.ts/)
  assert.match(results[2].content, /export const ok = true/)
  assert.match(results[3].content, /"created": true/)
  assert.match(results[4].content, /"saved": true/)
  assert.match(results[5].content, /"opened": true/)
  assert.match(results[6].content, /"deleted": true/)
})
