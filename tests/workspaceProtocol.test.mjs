import test from 'node:test'
import assert from 'node:assert/strict'

import { toWorkspaceProtocolUrl } from '../src/utils/workspaceProtocol.js'

test('maps Windows workspace files into the workspace protocol', () => {
  const workspace = {
    path: 'E:\\miaosen\\project',
    workspaceDataDir: 'C:\\Users\\math173sr\\AppData\\Roaming\\Altals\\workspaces\\abc123',
  }

  const url = toWorkspaceProtocolUrl(
    'E:\\miaosen\\project\\papers\\Control Notes.pdf',
    workspace,
  )

  assert.equal(
    url,
    'altals-workspace://localhost/workspace/papers/Control%20Notes.pdf',
  )
})

test('maps Windows workspace data files into the data scope', () => {
  const workspace = {
    path: 'E:\\miaosen\\project',
    workspaceDataDir: 'C:\\Users\\math173sr\\AppData\\Roaming\\Altals\\workspaces\\abc123',
  }

  const url = toWorkspaceProtocolUrl(
    'C:\\Users\\math173sr\\AppData\\Roaming\\Altals\\workspaces\\abc123\\project\\exports\\build.pdf',
    workspace,
  )

  assert.equal(
    url,
    'altals-workspace://localhost/data/project/exports/build.pdf',
  )
})

test('keeps POSIX workspace paths working', () => {
  const workspace = {
    path: '/Users/math173sr/Documents/GitHub项目/Altals',
    workspaceDataDir: '/Users/math173sr/.altals/workspaces/abc123',
  }

  const url = toWorkspaceProtocolUrl(
    '/Users/math173sr/Documents/GitHub项目/Altals/docs/report.pdf',
    workspace,
  )

  assert.equal(
    url,
    'altals-workspace://localhost/workspace/docs/report.pdf',
  )
})

test('maps global config files into the global scope', () => {
  const workspace = {
    path: '/Users/math173sr/Documents/GitHub项目/Altals',
    workspaceDataDir: '/Users/math173sr/.altals/workspaces/abc123',
    globalConfigDir: '/Users/math173sr/.altals',
  }

  const url = toWorkspaceProtocolUrl(
    '/Users/math173sr/.altals/references/pdfs/an2026.pdf',
    workspace,
  )

  assert.equal(
    url,
    'altals-workspace://localhost/global/references/pdfs/an2026.pdf',
  )
})
