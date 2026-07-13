import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import WorkingCopyDestinationCard from '../../src/renderer/components/WorkingCopyDestinationCard'

function renderCard(props: React.ComponentProps<typeof WorkingCopyDestinationCard>): string {
  return renderToStaticMarkup(React.createElement(WorkingCopyDestinationCard, props))
}

describe('WorkingCopyDestinationCard', () => {
  test('shows an unknown state while Status has not loaded', () => {
    const markup = renderCard({ count: null, branch: null, detached: false })

    expect(markup).toContain('Checking working copy…')
    expect(markup).toContain('Checking checked-out branch…')
    expect(markup).not.toContain('0 uncommitted changes')
  })

  test('uses singular dirty copy and keeps changes out of branches until commit', () => {
    const markup = renderCard({ count: 1, branch: 'main', detached: false })

    expect(markup).toContain('1 uncommitted change')
    expect(markup).toContain('Not in any branch yet.')
    expect(markup).toContain('Checked out: main')
    expect(markup).toContain('Changes join this branch only after commit.')
  })

  test('uses plural dirty copy', () => {
    expect(renderCard({ count: 2, branch: 'main', detached: false })).toContain(
      '2 uncommitted changes'
    )
  })

  test('keeps the full card for a clean working copy', () => {
    const markup = renderCard({ count: 0, branch: 'main', detached: false })

    expect(markup).toContain('Working copy clean')
    expect(markup).toContain('No changes are waiting to commit.')
    expect(markup).toContain('DESTINATION BRANCH')
    expect(markup).toContain('COMMIT →')
  })

  test('does not invent a destination branch while detached', () => {
    const markup = renderCard({ count: 0, branch: 'main', detached: true })

    expect(markup).toContain('Detached HEAD')
    expect(markup).toContain('A commit will not join a branch until you create one.')
    expect(markup).not.toContain('Checked out: main')
  })

  test('is a non-interactive labelled region', () => {
    const markup = renderCard({ count: 0, branch: 'main', detached: false })

    expect(markup).toContain('aria-label="Working copy destination"')
    expect(markup).not.toContain('<button')
  })
})
