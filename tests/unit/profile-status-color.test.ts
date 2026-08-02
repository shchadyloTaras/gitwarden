import { describe, expect, it } from 'vitest'
import { profileStatusColor } from '../../src/renderer/store/profilesStore'

describe('profileStatusColor', () => {
  it('uses the bright active indicator color for the active profile', () => {
    expect(profileStatusColor(true)).toBe('var(--gw-profile-active-indicator, #7be0b0)')
  })

  it('uses the bright inactive indicator color for inactive profiles', () => {
    expect(profileStatusColor(false)).toBe('var(--gw-profile-inactive-indicator, #ffd166)')
  })
})
