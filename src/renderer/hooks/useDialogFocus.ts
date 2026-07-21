import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) =>
      element.getAttribute('aria-hidden') !== 'true' &&
      element.getClientRects().length > 0 &&
      window.getComputedStyle(element).visibility !== 'hidden'
  )
}

/**
 * Keeps keyboard focus inside an existing modal surface, supports Escape, and
 * returns focus to the control that opened it. The callback and preferred
 * initial target remain live without re-running the activation effect.
 */
export function useDialogFocus(
  active: boolean,
  containerRef: RefObject<HTMLElement>,
  onEscape: () => void,
  initialFocusRef?: RefObject<HTMLElement>
): void {
  const onEscapeRef = useRef(onEscape)
  const initialFocusRefRef = useRef(initialFocusRef)
  onEscapeRef.current = onEscape
  initialFocusRefRef.current = initialFocusRef

  useEffect(() => {
    if (!active) return

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    const frame = window.requestAnimationFrame(() => {
      const container = containerRef.current
      if (!container) return

      const preferred = initialFocusRefRef.current?.current
      const target = preferred ?? getFocusableElements(container)[0] ?? container
      target.focus()
    })

    function handleKeyDown(event: KeyboardEvent): void {
      const container = containerRef.current
      if (!container) return

      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onEscapeRef.current()
        return
      }

      if (event.key !== 'Tab') return

      const focusable = getFocusableElements(container)
      if (focusable.length === 0) {
        event.preventDefault()
        container.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const current = document.activeElement

      if (event.shiftKey && (current === first || !container.contains(current))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (current === last || !container.contains(current))) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown, true)
    return () => {
      window.cancelAnimationFrame(frame)
      document.removeEventListener('keydown', handleKeyDown, true)
      window.requestAnimationFrame(() => {
        if (previouslyFocused?.isConnected) previouslyFocused.focus()
      })
    }
  }, [active, containerRef])
}
