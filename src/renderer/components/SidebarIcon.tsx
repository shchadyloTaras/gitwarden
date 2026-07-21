import React from 'react'
import type { NavScreen } from '../store/appStore'

export type SidebarIconName = NavScreen | 'update'

interface SidebarIconProps {
  name: SidebarIconName
  size?: number
}

/** Compact, stroke-based navigation icons that remain crisp at desktop-tool sizes. */
export default function SidebarIcon({ name, size = 18 }: SidebarIconProps): React.ReactElement {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {iconPaths[name]}
    </svg>
  )
}

const iconPaths: Record<SidebarIconName, React.ReactNode> = {
  profiles: (
    <>
      <circle cx="10" cy="6.25" r="2.75" />
      <path d="M4.5 16c.45-3.1 2.3-4.65 5.5-4.65s5.05 1.55 5.5 4.65" />
    </>
  ),
  repositories: (
    <>
      <path d="M3 5.5h5l1.4 1.75H17v7.25a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 14.5z" />
      <path d="M3 7.25V5.5A1.5 1.5 0 0 1 4.5 4H8l1.4 1.5" />
    </>
  ),
  status: (
    <>
      <path d="M6.5 4.25h9" />
      <path d="M6.5 10h9" />
      <path d="M6.5 15.75h9" />
      <circle cx="3.5" cy="4.25" r=".75" fill="currentColor" stroke="none" />
      <circle cx="3.5" cy="10" r=".75" fill="currentColor" stroke="none" />
      <circle cx="3.5" cy="15.75" r=".75" fill="currentColor" stroke="none" />
    </>
  ),
  commit: (
    <>
      <path d="M2.75 10h4.5M12.75 10h4.5" />
      <circle cx="10" cy="10" r="3" />
      <path d="m8.65 10 1 1 1.85-2" />
    </>
  ),
  remote: (
    <>
      <path d="M6.25 7.25 10 3.5l3.75 3.75" />
      <path d="M10 3.75v8.5" />
      <path d="M4 12.25v2.25A1.5 1.5 0 0 0 5.5 16h9a1.5 1.5 0 0 0 1.5-1.5v-2.25" />
    </>
  ),
  branches: (
    <>
      <circle cx="5" cy="4.5" r="1.75" />
      <circle cx="15" cy="6.5" r="1.75" />
      <circle cx="5" cy="15.5" r="1.75" />
      <path d="M5 6.25v7.5" />
      <path d="M6.75 11.5h2.5A5.75 5.75 0 0 0 15 7.75" />
    </>
  ),
  history: (
    <>
      <path d="M4.1 6.1H1.75V3.75" />
      <path d="M2.15 6.05A7.5 7.5 0 1 1 3 14.9" />
      <path d="M10 5.75v4.5l3 1.75" />
    </>
  ),
  'safety-center': (
    <>
      <path d="M10 2.75 16 5v4.45c0 3.55-2 6.1-6 7.8-4-1.7-6-4.25-6-7.8V5z" />
      <path d="m7.25 10 1.75 1.75 3.75-4" />
    </>
  ),
  settings: (
    <>
      <path d="M3 5h4M11 5h6" />
      <path d="M3 10h9M16 10h1" />
      <path d="M3 15h2M9 15h8" />
      <circle cx="9" cy="5" r="2" />
      <circle cx="14" cy="10" r="2" />
      <circle cx="7" cy="15" r="2" />
    </>
  ),
  update: (
    <>
      <path d="M10 3.25v8.5" />
      <path d="m6.75 8.75 3.25 3.5 3.25-3.5" />
      <path d="M4 15.75h12" />
    </>
  ),
}
