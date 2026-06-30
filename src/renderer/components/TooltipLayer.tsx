import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * Universal tooltip controller.
 *
 * Mounted once near the app root. Listens (via event delegation) for hover and
 * keyboard focus on any element carrying a non-empty `data-tooltip` attribute,
 * and renders a single bubble portaled to <body>. Because the bubble lives at
 * the body and is positioned with getBoundingClientRect — flipping to the
 * opposite side and clamping into the viewport when there isn't room — it never
 * clips at a window edge or inside an `overflow:hidden`/scroll container.
 *
 * API (on the target element):
 *   data-tooltip="text"                         — the bubble text (empty ⇒ none)
 *   data-tooltip-pos="top|bottom|left|right"    — PREFERRED side (default "top")
 *
 * The bubble styling lives in tooltip.css (.gw-tip).
 */

type TipPos = 'top' | 'bottom' | 'left' | 'right'

interface TipSource {
  text: string
  pref: TipPos
  rect: DOMRect
}

interface TipPlacement {
  side: TipPos
  top: number
  left: number
  arrow: number
}

const GAP = 8 // distance between target and bubble
const MARGIN = 8 // min distance from the viewport edge
const SHOW_DELAY_MS = 120 // so a passing cursor doesn't flash the bubble
const ARROW_INSET = 12 // keep the arrow this far from the bubble's corners

function opposite(pos: TipPos): TipPos {
  switch (pos) {
    case 'top':
      return 'bottom'
    case 'bottom':
      return 'top'
    case 'left':
      return 'right'
    case 'right':
      return 'left'
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

/** Pick a side that fits (preferred → opposite → the rest), then clamp on-screen. */
function place(
  target: DOMRect,
  bubble: { width: number; height: number },
  pref: TipPos
): TipPlacement {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const cx = target.left + target.width / 2
  const cy = target.top + target.height / 2

  const coordsFor = (side: TipPos): { top: number; left: number } => {
    switch (side) {
      case 'top':
        return { left: cx - bubble.width / 2, top: target.top - GAP - bubble.height }
      case 'bottom':
        return { left: cx - bubble.width / 2, top: target.bottom + GAP }
      case 'left':
        return { left: target.left - GAP - bubble.width, top: cy - bubble.height / 2 }
      case 'right':
        return { left: target.right + GAP, top: cy - bubble.height / 2 }
    }
  }

  const order: TipPos[] = [pref, opposite(pref), 'top', 'bottom', 'left', 'right']
  const seen = new Set<TipPos>()

  let side = pref
  let { top, left } = coordsFor(pref) // fallback to the preferred side

  for (const candidate of order) {
    if (seen.has(candidate)) continue
    seen.add(candidate)
    const c = coordsFor(candidate)
    const fits =
      c.top >= MARGIN &&
      c.top + bubble.height <= vh - MARGIN &&
      c.left >= MARGIN &&
      c.left + bubble.width <= vw - MARGIN
    if (fits) {
      side = candidate
      top = c.top
      left = c.left
      break
    }
  }

  // Keep the bubble fully on screen even when no side had room.
  left = clamp(left, MARGIN, vw - MARGIN - bubble.width)
  top = clamp(top, MARGIN, vh - MARGIN - bubble.height)

  // Offset the arrow along the bubble edge so it still points at the target.
  const arrow =
    side === 'top' || side === 'bottom'
      ? clamp(cx - left, ARROW_INSET, bubble.width - ARROW_INSET)
      : clamp(cy - top, ARROW_INSET, bubble.height - ARROW_INSET)

  return { side, top, left, arrow }
}

export default function TooltipLayer(): React.ReactElement | null {
  const [tip, setTip] = useState<TipSource | null>(null)
  const [placement, setPlacement] = useState<TipPlacement | null>(null)
  const bubbleRef = useRef<HTMLDivElement | null>(null)
  const targetRef = useRef<HTMLElement | null>(null)
  const timerRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    const resolveTarget = (node: EventTarget | null): HTMLElement | null => {
      if (!(node instanceof Element)) return null
      const el = node.closest<HTMLElement>('[data-tooltip]')
      if (!el) return null
      return el.getAttribute('data-tooltip') ? el : null
    }

    const hide = (): void => {
      window.clearTimeout(timerRef.current)
      targetRef.current = null
      setTip(null)
      setPlacement(null)
    }

    const show = (el: HTMLElement): void => {
      targetRef.current = el
      window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => {
        if (targetRef.current !== el || !el.isConnected) return
        const pref = (el.getAttribute('data-tooltip-pos') as TipPos | null) ?? 'top'
        setPlacement(null)
        setTip({
          text: el.getAttribute('data-tooltip') ?? '',
          pref,
          rect: el.getBoundingClientRect(),
        })
      }, SHOW_DELAY_MS)
    }

    const onPointerOver = (e: Event): void => {
      const el = resolveTarget(e.target)
      if (el) {
        if (el !== targetRef.current) show(el)
      } else if (targetRef.current) {
        hide()
      }
    }
    const onFocusIn = (e: FocusEvent): void => {
      const el = resolveTarget(e.target)
      if (el && el.matches(':focus-visible')) show(el)
      else if (targetRef.current) hide()
    }
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') hide()
    }

    document.addEventListener('pointerover', onPointerOver)
    document.addEventListener('pointerdown', hide)
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', hide)
    document.addEventListener('mouseleave', hide)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('scroll', hide, true)
    window.addEventListener('resize', hide)
    window.addEventListener('blur', hide)

    return () => {
      window.clearTimeout(timerRef.current)
      document.removeEventListener('pointerover', onPointerOver)
      document.removeEventListener('pointerdown', hide)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', hide)
      document.removeEventListener('mouseleave', hide)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('scroll', hide, true)
      window.removeEventListener('resize', hide)
      window.removeEventListener('blur', hide)
    }
  }, [])

  // Once the bubble has rendered (so we can measure it), resolve its placement.
  useLayoutEffect(() => {
    if (!tip || !bubbleRef.current) return
    const b = bubbleRef.current.getBoundingClientRect()
    setPlacement(place(tip.rect, { width: b.width, height: b.height }, tip.pref))
  }, [tip])

  if (!tip) return null

  const style = (
    placement
      ? { top: placement.top, left: placement.left, '--gw-tip-arrow': `${placement.arrow}px` }
      : { top: -9999, left: -9999 }
  ) as React.CSSProperties

  return createPortal(
    <div
      ref={bubbleRef}
      data-testid="tooltip-bubble"
      role="tooltip"
      className={`gw-tip${placement ? ` gw-tip--shown gw-tip--${placement.side}` : ''}`}
      style={style}
    >
      {tip.text}
    </div>,
    document.body
  )
}
