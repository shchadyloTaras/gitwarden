import React from 'react'
import { STR } from '../strings'

export interface WorkingCopyDestinationCardProps {
  count: number | null
  branch: string | null
  detached: boolean
}

interface CardCopy {
  title: string
  detail: string | null
}

/**
 * A read-only explanation of where the current working copy will land. The
 * Status screen owns loading and branch state; this component only presents
 * the values it is given.
 */
export default function WorkingCopyDestinationCard({
  count,
  branch,
  detached,
}: WorkingCopyDestinationCardProps): React.ReactElement {
  const workingCopy: CardCopy =
    count === null
      ? { title: STR.WORKING_COPY_CHECKING, detail: null }
      : count === 0
        ? { title: STR.WORKING_COPY_CLEAN, detail: STR.WORKING_COPY_CLEAN_DETAIL }
        : {
            title: STR.WORKING_COPY_UNCOMMITTED_CHANGES(count),
            detail: STR.WORKING_COPY_NOT_IN_BRANCH,
          }

  const destination: CardCopy = detached
    ? { title: STR.WORKING_COPY_DETACHED_HEAD, detail: STR.WORKING_COPY_DETACHED_DETAIL }
    : branch
      ? { title: STR.WORKING_COPY_CHECKED_OUT(branch), detail: STR.WORKING_COPY_BRANCH_DETAIL }
      : { title: STR.WORKING_COPY_BRANCH_CHECKING, detail: null }

  const destinationHeading = detached
    ? STR.WORKING_COPY_DETACHED_HEAD
    : STR.WORKING_COPY_DESTINATION_HEADING
  const summary = [workingCopy.title, workingCopy.detail, destination.title, destination.detail]
    .filter((part): part is string => part !== null)
    .join(' ')

  return (
    <section
      aria-label={STR.WORKING_COPY_DESTINATION_REGION}
      className="gw-working-copy-destination-card"
      data-testid="working-copy-destination-card"
    >
      <span className="gw-visually-hidden">{summary}</span>
      <div aria-hidden="true" className="gw-working-copy-destination-part">
        <span className="gw-working-copy-destination-eyebrow">{STR.WORKING_COPY_HEADING}</span>
        <strong className="gw-working-copy-destination-title">{workingCopy.title}</strong>
        {workingCopy.detail && (
          <span className="gw-working-copy-destination-detail">{workingCopy.detail}</span>
        )}
      </div>

      <span aria-hidden="true" className="gw-working-copy-destination-connector">
        {STR.WORKING_COPY_COMMIT_CONNECTOR}
      </span>

      <div aria-hidden="true" className="gw-working-copy-destination-part">
        <span className="gw-working-copy-destination-eyebrow">{destinationHeading}</span>
        {!detached && (
          <strong className="gw-working-copy-destination-title">{destination.title}</strong>
        )}
        {destination.detail && (
          <span className="gw-working-copy-destination-detail">{destination.detail}</span>
        )}
      </div>
    </section>
  )
}
