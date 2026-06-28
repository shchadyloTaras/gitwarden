import React from 'react'
import Logo from './Logo'
import { STR } from '../strings'

export default function StartupLoader({
  exiting = false,
}: {
  exiting?: boolean
}): React.ReactElement {
  return (
    <div
      className={`gw-startup-loader${exiting ? ' gw-startup-loader--exit' : ''}`}
      data-testid="startup-loader"
      role="status"
      aria-live="polite"
      aria-label={STR.STARTUP_LOADING_ARIA}
    >
      <div className="gw-startup-loader__texture" aria-hidden="true" />
      <div className="gw-startup-loader__content">
        <div className="gw-startup-loader__mark" aria-hidden="true">
          <span className="gw-startup-loader__ring" />
          <span className="gw-startup-loader__ring gw-startup-loader__ring--reverse" />
          <Logo animated className="gw-startup-loader__logo" size={116} title={STR.APP_TITLE} />
          <span className="gw-startup-loader__scan" />
        </div>

        <div className="gw-startup-loader__copy">
          <p className="gw-startup-loader__eyebrow">{STR.STARTUP_LOADER_EYEBROW}</p>
          <h1>{STR.APP_TITLE}</h1>
          <p>{STR.STARTUP_LOADER_STATUS}</p>
        </div>

        <div className="gw-startup-loader__progress" aria-hidden="true">
          <span />
        </div>
      </div>
    </div>
  )
}
