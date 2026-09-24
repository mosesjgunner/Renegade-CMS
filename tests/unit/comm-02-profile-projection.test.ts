import { describe, expect, it } from 'vitest'
import {
  normalizeFieldAudience,
  normalizeProfileLinks,
  ProfileAccessError,
  projectMemberProfile,
} from '@/modules/community/profile-projection'

const owner = {
  id: 'profile-1',
  member: 'member-a',
  handle: 'alice',
  displayName: 'Alice',
  visibility: 'public',
  bio: 'Private story',
  locale: 'en-US',
  timeZone: 'America/Chicago',
  links: [{ label: 'Site', url: 'https://example.org/' }],
  fieldAudience: { bio: 'followers', locale: 'private', timeZone: 'members' },
}

describe('COMM-02 public profile projection', () => {
  it('allows only explicitly visible fields for anonymous, member, follower, and owner audiences', () => {
    const anonymous = projectMemberProfile(owner, { signedIn: false })
    expect(anonymous).not.toHaveProperty('bio')
    expect(anonymous).not.toHaveProperty('timeZone')
    expect(anonymous).not.toHaveProperty('locale')
    expect(anonymous.links).toEqual([{ label: 'Site', url: 'https://example.org/' }])
    const member = projectMemberProfile(owner, { signedIn: true, memberId: 'member-b' })
    expect(member.timeZone).toBe('America/Chicago')
    expect(member).not.toHaveProperty('bio')
    const follower = projectMemberProfile(owner, {
      signedIn: true,
      memberId: 'member-c',
      following: true,
    })
    expect(follower.bio).toBe('Private story')
    const self = projectMemberProfile(owner, { signedIn: true, memberId: 'member-a' })
    expect(self.locale).toBe('en-US')
  })

  it('does not serialize auth fields or blocked profiles', () => {
    const leaked = projectMemberProfile(
      { ...owner, email: 'private@example.org', tokenHash: 'secret', roles: ['administrator'] },
      { signedIn: false },
    )
    expect(JSON.stringify(leaked)).not.toContain('private@example.org')
    expect(JSON.stringify(leaked)).not.toContain('administrator')
    expect(() =>
      projectMemberProfile(owner, { signedIn: true, memberId: 'member-b', blocked: true }),
    ).toThrow(ProfileAccessError)
  })

  it('applies the one-way mute to the muting viewer only', () => {
    expect(() =>
      projectMemberProfile(owner, { signedIn: true, memberId: 'member-b', muted: true }),
    ).toThrow(ProfileAccessError)
    expect(projectMemberProfile(owner, { signedIn: false })).toMatchObject({ handle: 'alice' })
  })

  it('rejects unsafe links and unsupported field policy', () => {
    expect(() => normalizeProfileLinks([{ label: 'X', url: 'javascript:alert(1)' }])).toThrow(
      ProfileAccessError,
    )
    expect(() => normalizeProfileLinks([{ label: 'X', url: 'http://example.org' }])).toThrow(
      ProfileAccessError,
    )
    expect(() => normalizeFieldAudience({ email: 'public' })).toThrow(ProfileAccessError)
    expect(() => normalizeFieldAudience({ bio: 'everyone' })).toThrow(ProfileAccessError)
  })

  it('keeps unlisted profiles out of discovery', () => {
    expect(
      projectMemberProfile({ ...owner, visibility: 'unlisted' }, { signedIn: false }).discoverable,
    ).toBe(false)
    expect(
      projectMemberProfile({ ...owner, discoveryOptOut: true }, { signedIn: false }).discoverable,
    ).toBe(false)
  })

  it('never invents an image URL: the governed resolver must explicitly authorize it', () => {
    const pending = projectMemberProfile(
      { ...owner, avatar: 'private-asset', avatarAlt: 'A private original' },
      { signedIn: false },
    )
    expect(pending).not.toHaveProperty('avatarUrl')
    const approved = projectMemberProfile(
      { ...owner, avatar: 'approved-asset', avatarAlt: 'An approved image' },
      { signedIn: false },
      { avatarUrl: '/media/approved-asset' },
    )
    expect(approved).toMatchObject({
      avatarUrl: '/media/approved-asset',
      avatarAlt: 'An approved image',
    })
    expect(JSON.stringify(approved)).not.toContain('storageLocation')
  })
})
