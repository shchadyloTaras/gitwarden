import React, { useId } from 'react'

/**
 * Git Warden brand mark — a warden's shield guarding a Git branch.
 * Transparent background so it sits on any surface; size is square (px).
 */
export default function Logo({
  size = 22,
  title = 'Git Warden',
  className,
  animated = false,
}: {
  size?: number
  title?: string
  className?: string
  animated?: boolean
}): React.ReactElement {
  const gradientId = `${useId().replace(/:/g, '')}-gwShieldMark`
  const animatedClass = (name: string): string | undefined => (animated ? name : undefined)

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 512 512"
      role="img"
      aria-label={title}
      style={{ display: 'block', flexShrink: 0 }}
    >
      <title>{title}</title>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#818cf8" />
          <stop offset="0.55" stopColor="#6366f1" />
          <stop offset="1" stopColor="#3b82f6" />
        </linearGradient>
      </defs>
      <path
        className={animatedClass('gw-logo-shield')}
        d="M256 44 C338 78 388 86 424 90 L424 250 C424 356 354 432 256 472 C158 432 88 356 88 250 L88 90 C124 86 174 78 256 44 Z"
        fill={`url(#${gradientId})`}
      />
      <path
        className={animatedClass('gw-logo-branch gw-logo-branch-curve')}
        d="M304 232 C304 300 212 270 212 306"
        fill="none"
        stroke="#ffffff"
        strokeWidth="24"
        strokeLinecap="round"
      />
      <line
        className={animatedClass('gw-logo-branch gw-logo-branch-line')}
        x1="212"
        y1="190"
        x2="212"
        y2="352"
        stroke="#ffffff"
        strokeWidth="26"
        strokeLinecap="round"
      />
      <circle
        className={animatedClass('gw-logo-node gw-logo-node--top')}
        cx="212"
        cy="190"
        r="30"
        fill="#ffffff"
      />
      <circle
        className={animatedClass('gw-logo-node gw-logo-node--bottom')}
        cx="212"
        cy="352"
        r="30"
        fill="#ffffff"
      />
      <circle
        className={animatedClass('gw-logo-node gw-logo-node--branch')}
        cx="304"
        cy="206"
        r="30"
        fill="#ffffff"
      />
      <circle
        className={animatedClass('gw-logo-core gw-logo-core--top')}
        cx="212"
        cy="190"
        r="13"
        fill="#4f46e5"
      />
      <circle
        className={animatedClass('gw-logo-core gw-logo-core--bottom')}
        cx="212"
        cy="352"
        r="13"
        fill="#3b82f6"
      />
      <circle
        className={animatedClass('gw-logo-core gw-logo-core--branch')}
        cx="304"
        cy="206"
        r="13"
        fill="#6366f1"
      />
    </svg>
  )
}
