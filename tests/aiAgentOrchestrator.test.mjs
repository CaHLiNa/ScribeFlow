import test from 'node:test'
import assert from 'node:assert/strict'

import { executePreparedAgentRun, prepareAgentRun } from '../src/services/ai/agentOrchestrator.js'

test('prepareAgentRun builds an agent-first run plan with referenced files', async () => {
  let ensuredFlatFiles = 0
  const prepared = await prepareAgentRun({
    activeSession: {
      id: 'session-1',
      mode: 'agent',
      promptDraft: 'Inspect @src/app.ts and fix the issue',
      messages: [],
      attachments: [],
      permissionMode: 'accept-edits',
    },
    activeSkill: { id: 'workspace-agent', kind: 'built-in-action' },
    builtInActions: [{ id: 'workspace-agent', kind: 'built-in-action' }],
    altalsSkills: [],
    contextBundle: {
      workspace: { available: true, path: '/workspace' },
      document: { available: true, filePath: '/workspace/src/app.ts' },
      selection: { available: false },
      reference: { available: false },
    },
    sessionMode: 'agent',
    resolveEffectivePermissionMode: () => 'accept-edits',
    skillHasRequiredContext: () => true,
    refreshProviderState: async () => ({ ready: true, currentProviderId: 'openai' }),
    loadConfig: async () => ({
      currentProviderId: 'openai',
      enabledTools: ['create-workspace-file', 'write-workspace-file', 'open-workspace-file'],
      providers: { openai: { model: 'gpt-5.4' } },
    }),
    getProviderConfig: () => ({ baseUrl: 'https://example.com', model: 'gpt-5.4' }),
    loadApiKey: async () => 'sk-test',
    workspacePath: '/workspace',
    flatFiles: [{ path: '/workspace/src/app.ts' }],
    ensureFlatFilesReady: async () => {
      ensuredFlatFiles += 1
    },
    readWorkspaceFile: async () => 'export const ok = false',
  })

  assert.equal(prepared.ok, true)
  assert.equal(prepared.skill.id, 'workspace-agent')
  assert.equal(prepared.runtimeIntent, 'agent')
  assert.equal(prepared.referencedFiles.length, 1)
  assert.equal(prepared.referencedFiles[0].relativePath, 'src/app.ts')
  assert.equal(ensuredFlatFiles, 1)
  assert.deepEqual(prepared.config.enabledTools, [
    'create-workspace-file',
    'write-workspace-file',
    'open-workspace-file',
  ])
})

test('prepareAgentRun lets the agent auto-route to a matching filesystem skill when appropriate', async () => {
  const prepared = await prepareAgentRun({
    activeSession: {
      id: 'session-auto-skill',
      mode: 'agent',
      promptDraft: 'Please revise this paragraph and tighten the citation.',
      messages: [],
      attachments: [],
      permissionMode: 'accept-edits',
    },
    activeSkill: { id: 'workspace-agent', kind: 'built-in-action' },
    builtInActions: [{ id: 'workspace-agent', kind: 'built-in-action' }],
    altalsSkills: [
      {
        id: 'fs-1',
        slug: 'revise-with-citations',
        name: 'revise-with-citations',
        source: 'altals-workspace',
        kind: 'filesystem-skill',
        directoryPath: '/workspace/.altals/skills/revise-with-citations',
      },
    ],
    contextBundle: {
      workspace: { available: true, path: '/workspace' },
      document: { available: true, filePath: '/workspace/src/app.ts' },
      selection: { available: true, text: 'Paragraph', preview: 'Paragraph' },
      reference: { available: true, title: 'A paper', citationKey: 'paper2024' },
    },
    sessionMode: 'agent',
    resolveEffectivePermissionMode: () => 'accept-edits',
    skillHasRequiredContext: () => true,
    refreshProviderState: async () => ({ ready: true, currentProviderId: 'openai' }),
    loadConfig: async () => ({
      currentProviderId: 'openai',
      providers: { openai: { model: 'gpt-5.4' } },
    }),
    getProviderConfig: () => ({ baseUrl: 'https://example.com', model: 'gpt-5.4' }),
    loadApiKey: async () => 'sk-test',
    workspacePath: '/workspace',
    flatFiles: [],
    ensureFlatFilesReady: async () => {},
    readWorkspaceFile: async () => '',
  })

  assert.equal(prepared.ok, true)
  assert.equal(prepared.skill.id, 'fs-1')
  assert.equal(prepared.runtimeIntent, 'agent')
})

test('prepareAgentRun returns a provider error when the runtime is not ready', async () => {
  const prepared = await prepareAgentRun({
    activeSession: {
      id: 'session-2',
      mode: 'agent',
      promptDraft: 'Inspect the workspace',
      messages: [],
      attachments: [],
      permissionMode: 'accept-edits',
    },
    activeSkill: { id: 'workspace-agent', kind: 'built-in-action' },
    builtInActions: [{ id: 'workspace-agent', kind: 'built-in-action' }],
    altalsSkills: [],
    contextBundle: {
      workspace: { available: true, path: '/workspace' },
      document: { available: false },
      selection: { available: false },
      reference: { available: false },
    },
    sessionMode: 'agent',
    resolveEffectivePermissionMode: () => 'accept-edits',
    skillHasRequiredContext: () => true,
    refreshProviderState: async () => ({ ready: false }),
  })

  assert.equal(prepared.ok, false)
  assert.equal(prepared.code, 'PROVIDER_NOT_READY')
})

test('executePreparedAgentRun forwards a prepared run into the executor seam', async () => {
  const result = await executePreparedAgentRun(
    {
      ok: true,
      skill: { id: 'workspace-agent', kind: 'built-in-action' },
      contextBundle: { workspace: { available: true, path: '/workspace' } },
      config: { model: 'gpt-5.4' },
      providerId: 'openai',
      apiKey: 'sk-test',
      userInstruction: 'Inspect the workspace',
      priorConversation: [],
      attachments: [],
      referencedFiles: [],
      requestedTools: [],
      runtimeIntent: 'agent',
    },
    {
      altalsSkills: [],
      toolRuntime: {},
      executeRun: async (payload) => payload,
    }
  )

  assert.equal(result.skillId, 'workspace-agent')
  assert.equal(result.runtimeIntent, 'agent')
  assert.equal(result.config.providerId, 'openai')
})
