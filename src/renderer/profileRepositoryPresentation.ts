export type RepositoryDataState = 'ready' | 'loading' | 'refreshing' | 'unavailable' | 'stale'

interface RepositoryDataStateInput {
  cachedRepositoryCount: number
  loading: boolean
  error: string | null
}

/**
 * Keep renderer copy honest about repository freshness. The summary count itself stays
 * pure core; this helper only decides whether loaded records are current, cached, or absent.
 */
export function deriveRepositoryDataState({
  cachedRepositoryCount,
  loading,
  error,
}: RepositoryDataStateInput): RepositoryDataState {
  const hasCachedData = cachedRepositoryCount > 0

  if (error) return hasCachedData ? 'stale' : 'unavailable'
  if (loading) return hasCachedData ? 'refreshing' : 'loading'
  return 'ready'
}
