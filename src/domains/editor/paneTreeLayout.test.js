import { describe, expect, it } from 'vitest'
import {
  ROOT_PANE_ID,
  collapsePaneNode,
  normalizePaneTree,
  splitPaneNode,
} from './paneTreeLayout.js'

describe('paneTreeLayout', () => {
  it('normalizes an empty tree into the default root leaf', () => {
    expect(normalizePaneTree(null)).toEqual({
      type: 'leaf',
      id: ROOT_PANE_ID,
      tabs: [],
      activeTab: null,
    })
  })

  it('flattens restored trees into a single vertical split and clamps the ratio', () => {
    const normalized = normalizePaneTree({
      type: 'split',
      direction: 'horizontal',
      ratio: 9,
      children: [
        { type: 'leaf', id: 'pane-a', tabs: ['a.md'], activeTab: 'a.md' },
        {
          type: 'split',
          direction: 'horizontal',
          children: [
            { type: 'leaf', id: 'pane-b', tabs: ['b.md'], activeTab: 'b.md' },
            { type: 'leaf', id: 'pane-c', tabs: ['c.md'], activeTab: 'c.md' },
          ],
        },
      ],
    })

    expect(normalized).toEqual({
      type: 'split',
      direction: 'vertical',
      ratio: 0.85,
      children: [
        { type: 'leaf', id: 'pane-a', tabs: ['a.md'], activeTab: 'a.md' },
        { type: 'leaf', id: 'pane-b', tabs: ['b.md'], activeTab: 'b.md' },
      ],
    })
  })

  it('splits a leaf root into a vertical two-pane tree', () => {
    const root = {
      type: 'leaf',
      id: ROOT_PANE_ID,
      tabs: ['draft.md'],
      activeTab: 'draft.md',
    }

    const newPane = splitPaneNode(root, ROOT_PANE_ID, 'pane-right', ['notes.md'], 'notes.md')

    expect(newPane).toEqual({
      type: 'leaf',
      id: 'pane-right',
      tabs: ['notes.md'],
      activeTab: 'notes.md',
    })
    expect(root).toEqual({
      type: 'split',
      direction: 'vertical',
      ratio: 0.5,
      children: [
        { type: 'leaf', id: ROOT_PANE_ID, tabs: ['draft.md'], activeTab: 'draft.md' },
        { type: 'leaf', id: 'pane-right', tabs: ['notes.md'], activeTab: 'notes.md' },
      ],
    })
  })

  it('collapses a pane and moves the active pane to the remaining sibling', () => {
    const root = {
      type: 'split',
      direction: 'vertical',
      ratio: 0.5,
      children: [
        { type: 'leaf', id: 'pane-left', tabs: ['draft.md'], activeTab: 'draft.md' },
        { type: 'leaf', id: 'pane-right', tabs: ['notes.md'], activeTab: 'notes.md' },
      ],
    }

    const result = collapsePaneNode(root, 'pane-right', 'pane-right')

    expect(result).toEqual({
      collapsed: true,
      activePaneId: 'pane-left',
    })
    expect(root).toEqual({
      type: 'leaf',
      id: 'pane-left',
      tabs: ['draft.md'],
      activeTab: 'draft.md',
    })
  })
})
