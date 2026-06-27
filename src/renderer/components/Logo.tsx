import React from 'react'

/**
 * Git Warden brand mark — a warden's shield guarding a Git branch.
 * Transparent background so it sits on any surface; size is square (px).
 */
export default function Logo({
  size = 22,
  title = 'Git Warden',
}: {
  size?: number
  title?: string
}): React.ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      role="img"
      aria-label={title}
      style={{ display: 'block', flexShrink: 0 }}
    >
      <title>{title}</title>
      <defs>
        <linearGradient id="gwShieldMark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#818cf8" />
          <stop offset="0.55" stopColor="#6366f1" />
          <stop offset="1" stopColor="#3b82f6" />
        </linearGradient>
      </defs>
      <path
        d="M256 44 C338 78 388 86 424 90 L424 250 C424 356 354 432 256 472 C158 432 88 356 88 250 L88 90 C124 86 174 78 256 44 Z"
        fill="url(#gwShieldMark)"
      />
      <path
        d="M304 232 C304 300 212 270 212 306"
        fill="none"
        stroke="#ffffff"
        strokeWidth="24"
        strokeLinecap="round"
      />
      <line
        x1="212"
        y1="190"
        x2="212"
        y2="352"
        stroke="#ffffff"
        strokeWidth="26"
        strokeLinecap="round"
      />
      <circle cx="212" cy="190" r="30" fill="#ffffff" />
      <circle cx="212" cy="352" r="30" fill="#ffffff" />
      <circle cx="304" cy="206" r="30" fill="#ffffff" />
      <circle cx="212" cy="190" r="13" fill="#4f46e5" />
      <circle cx="212" cy="352" r="13" fill="#3b82f6" />
      <circle cx="304" cy="206" r="13" fill="#6366f1" />
    </svg>
  )
}
