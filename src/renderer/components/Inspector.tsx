import React from 'react'
import type { Profile } from '../../core/types'
import {
  buildProfileRepositorySummary,
  type ProfileRepositorySummary,
} from '../../core/profiles/profileRepositorySummary'
import { useAppStore } from '../store/appStore'
import { useProfilesStore, profileStatusColor } from '../store/profilesStore'
import { useRepositoriesStore } from '../store/repositoriesStore'
import { useHeaderGuardStore } from '../store/headerGuardStore'
import type { HeaderGuardState } from '../../core/safety/headerGuard'
import {
  deriveRepositoryDataState,
  type RepositoryDataState,
} from '../profileRepositoryPresentation'
import { STR } from '../strings'

// Same state→colour mapping as the header GuardBadge, at lower visual weight (softer text
// colours rather than solid fills). The header owns the refresh effect; the Inspector only
// reads the resulting state — single source of truth.
const GUARD_LABEL: Record<HeaderGuardState, string> = {
  ready: STR.GUARD_READY,
  review: STR.GUARD_REVIEW,
  blocked: STR.GUARD_BLOCKED,
  checking: STR.GUARD_CHECKING,
  'not-checked': STR.GUARD_NOT_CHECKED,
}

const GUARD_TEXT_COLOR: Record<HeaderGuardState, string> = {
  ready: 'var(--gw-success, #4ade80)',
  review: 'var(--gw-warning, #fbbf24)',
  blocked: 'var(--gw-danger, #f87171)',
  checking: 'var(--gw-text-muted, #a1a1aa)',
  'not-checked': 'var(--gw-text-muted, #a1a1aa)',
}

export default function Inspector(): React.ReactElement {
  const { activeRepo, currentBranch, activeScreen, selectedProfileId } = useAppStore()
  const guardState = useHeaderGuardStore((s) => s.state)
  const profiles = useProfilesStore((s) => s.profiles)
  const activeProfileId = useProfilesStore((s) => s.activeProfileId)
  const repos = useRepositoriesStore((s) => s.repos)
  const repositoriesLoading = useRepositoriesStore((s) => s.loading)
  const repositoriesError = useRepositoriesStore((s) => s.error)
  const activeProfile = profiles.find((p) => p.id === activeProfileId) ?? null
  const selectedProfile = profiles.find((p) => p.id === selectedProfileId) ?? null
  const repositoryDataState = deriveRepositoryDataState({
    cachedRepositoryCount: repos.length,
    loading: repositoriesLoading,
    error: repositoriesError,
  })
  const selectedSummary = selectedProfile
    ? buildProfileRepositorySummary(selectedProfile.id, repos)
    : null

  const activeWorkspace = (
    <>
      <Section label="Profile">
        {activeProfile ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div
              data-testid="inspector-profile-status-indicator"
              aria-hidden="true"
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: profileStatusColor(true),
              }}
            />
            <span style={{ color: 'var(--gw-text, #f4f4f5)' }}>{activeProfile.displayName}</span>
          </div>
        ) : (
          <Empty>None</Empty>
        )}
        {activeProfile && (
          <>
            <Row label="Name" value={activeProfile.gitAuthorName} />
            <Row label="Email" value={activeProfile.gitAuthorEmail} />
          </>
        )}
      </Section>

      <Section label="Repository">
        {activeRepo ? (
          <span style={{ color: 'var(--gw-text, #f4f4f5)', fontFamily: 'monospace', fontSize: 14 }}>
            {activeRepo.name}
          </span>
        ) : (
          <Empty>None selected</Empty>
        )}
      </Section>

      <Section label="Branch">
        {currentBranch ? (
          <span style={{ color: 'var(--gw-text, #f4f4f5)', fontFamily: 'monospace' }}>
            {currentBranch}
          </span>
        ) : (
          <Empty>—</Empty>
        )}
      </Section>

      <Section label="Guard">
        <span
          data-testid="inspector-guard-state"
          style={{
            color: GUARD_TEXT_COLOR[guardState],
            fontWeight: 500,
            fontSize: 13,
          }}
        >
          {GUARD_LABEL[guardState].replace('Guard · ', '')}
        </span>
      </Section>
    </>
  )

  return (
    <div data-testid="inspector-panel" className="gw-inspector">
      <div className="gw-inspector__title">CONTEXT</div>

      {activeScreen === 'profiles' ? (
        <>
          <div data-testid="inspector-active-workspace-group" className="gw-inspector__group">
            <GroupHeading>{STR.INSPECTOR_ACTIVE_WORKSPACE}</GroupHeading>
            {activeWorkspace}
          </div>
          <div className="gw-inspector__divider" aria-hidden="true" />
          <SelectedProfileContext
            profile={selectedProfile}
            activeProfileId={activeProfileId}
            summary={selectedSummary}
            repositoryDataState={repositoryDataState}
          />
        </>
      ) : (
        activeWorkspace
      )}
    </div>
  )
}

function SelectedProfileContext({
  profile,
  activeProfileId,
  summary,
  repositoryDataState,
}: {
  profile: Profile | null
  activeProfileId: string | null
  summary: ProfileRepositorySummary | null
  repositoryDataState: RepositoryDataState
}): React.ReactElement {
  if (!profile || !summary) {
    return (
      <div data-testid="inspector-selected-profile-group" className="gw-inspector__group">
        <GroupHeading>{STR.INSPECTOR_SELECTED_PROFILE}</GroupHeading>
        <EmptyState testId="inspector-selected-profile-prompt">
          {STR.INSPECTOR_SELECT_PROFILE}
        </EmptyState>
      </div>
    )
  }

  const countAvailable = repositoryDataState !== 'loading' && repositoryDataState !== 'unavailable'
  const headingCount = countAvailable ? summary.count : '—'
  const canShowRepositories = countAvailable

  return (
    <div data-testid="inspector-selected-profile-group" className="gw-inspector__group">
      <GroupHeading>{STR.INSPECTOR_SELECTED_PROFILE}</GroupHeading>
      <div className="gw-inspector__selected-profile">
        <span
          data-testid="inspector-selected-profile-status-indicator"
          data-profile-state={profile.id === activeProfileId ? 'active' : 'inactive'}
          className="gw-inspector__profile-dot"
          aria-hidden="true"
          style={{ background: profileStatusColor(profile.id === activeProfileId) }}
        />
        <span data-testid="inspector-selected-profile-name" className="gw-inspector__profile-name">
          {profile.displayName}
        </span>
      </div>

      <div
        data-testid="inspector-assigned-repository-count"
        className="gw-inspector__repository-heading"
      >
        {STR.INSPECTOR_ASSIGNED_REPOSITORIES(headingCount)}
      </div>

      {repositoryDataState === 'loading' && (
        <EmptyState testId="inspector-repositories-loading">
          {STR.INSPECTOR_REPOSITORIES_LOADING}
        </EmptyState>
      )}
      {repositoryDataState === 'unavailable' && (
        <EmptyState testId="inspector-repositories-unavailable">
          {STR.INSPECTOR_REPOSITORIES_UNAVAILABLE}
        </EmptyState>
      )}
      {repositoryDataState === 'refreshing' && (
        <div data-testid="inspector-repositories-refreshing" className="gw-inspector__freshness">
          {STR.INSPECTOR_REPOSITORIES_REFRESHING}
        </div>
      )}
      {repositoryDataState === 'stale' && (
        <div data-testid="inspector-repositories-stale" className="gw-inspector__freshness">
          {STR.INSPECTOR_REPOSITORIES_STALE}
        </div>
      )}

      {canShowRepositories && summary.count === 0 && (
        <EmptyState testId="inspector-repositories-empty">
          {STR.INSPECTOR_REPOSITORIES_EMPTY}
        </EmptyState>
      )}

      {canShowRepositories && summary.count > 0 && (
        <div
          data-testid="inspector-assigned-repository-list"
          className="gw-inspector__repo-list"
          role="list"
        >
          {summary.repositories.map((repository) => (
            <div
              key={repository.id}
              data-testid="inspector-assigned-repository-row"
              className="gw-inspector__repo-row"
              role="listitem"
            >
              <div
                data-testid="inspector-assigned-repository-name"
                className="gw-inspector__repo-name"
                title={repository.name}
              >
                {repository.name}
              </div>
              <div
                data-testid="inspector-assigned-repository-path"
                className="gw-inspector__repo-path"
                title={repository.localPath}
              >
                <span aria-hidden="true">{repository.localPath}</span>
                <span className="gw-visually-hidden">
                  {STR.INSPECTOR_REPOSITORY_PATH_LABEL(repository.name, repository.localPath)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function GroupHeading({ children }: { children: React.ReactNode }): React.ReactElement {
  return <div className="gw-inspector__group-heading">{children}</div>
}

function Section({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}): React.ReactElement {
  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: 'var(--gw-text-dim, #52525b)',
          letterSpacing: '0.06em',
          marginBottom: 4,
        }}
      >
        {label.toUpperCase()}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>{children}</div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 4 }}>
      <span style={{ color: 'var(--gw-text-dim, #52525b)' }}>{label}</span>
      <span
        style={{
          color: 'var(--gw-text-muted, #a1a1aa)',
          textAlign: 'right',
          wordBreak: 'break-all',
        }}
      >
        {value}
      </span>
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <span style={{ color: 'var(--gw-text-dim, #52525b)', fontStyle: 'italic' }}>{children}</span>
  )
}

function EmptyState({
  testId,
  children,
}: {
  testId: string
  children: React.ReactNode
}): React.ReactElement {
  return (
    <div data-testid={testId} className="gw-inspector__empty-state">
      {children}
    </div>
  )
}
