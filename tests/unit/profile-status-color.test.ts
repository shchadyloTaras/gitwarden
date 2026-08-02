import { describe, expect, it } from 'vitest'
import { profileStatusColor } from '../../src/renderer/store/profilesStore'

describe('profileStatusColor', () => {
  it('uses the success color for the active profile', () => {
    expect(profileStatusColor(true)).toBe('var(--gw-success, #4ade80)')
  })

  it('uses the warning color for inactive profiles', () => {
    expect(profileStatusColor(false)).toBe('var(--gw-warning, #fbbf24)')
  })
})
