import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export interface DropdownOption {
  value: string
  label: string
  disabled?: boolean
  /** Native tooltip shown on hover — e.g. explaining why a disabled option can't be picked. */
  title?: string
}

interface DropdownProps {
  value: string
  options: DropdownOption[]
  onChange: (value: string) => void
  /** Trigger gets this as its data-testid; options get `${testId}-option-${value}`. */
  testId?: string
  placeholder?: string
  disabled?: boolean
  ariaLabel?: string
  /** Render the trigger full-width with label/caret pushed apart (for form fields). */
  block?: boolean
  monospace?: boolean
  /** Show a filter field at the top of the popup (for long lists such as model catalogs). */
  searchable?: boolean
  searchPlaceholder?: string
  noMatchesLabel?: string
  /** Override popup width bounds (defaults widen when searchable). */
  popupMinWidth?: number
  popupMaxWidth?: number
  triggerStyle?: React.CSSProperties
  /** Extra class names merged onto the trigger button (after `gw-dd-trigger`). */
  triggerClassName?: string
  /** Override the visible trigger label while keeping `value` for selection state. */
  displayValue?: string
  /** When false, render the popup in-place above/below the trigger (for nested panels). */
  portaled?: boolean
  /** Preferred popup direction; `auto` picks based on viewport space. */
  placement?: 'auto' | 'above' | 'below'
}

interface PopupLayout {
  top: number
  left: number
  width: number
}

const VIEWPORT_MARGIN = 8
const POPUP_GAP = 4
const POPUP_MAX_HEIGHT = 300
const DEFAULT_POPUP_MIN = 150
const DEFAULT_POPUP_MAX = 340
const SEARCHABLE_POPUP_MIN = 280
const SEARCHABLE_POPUP_MAX = 420

function computePopupLayout(
  trigger: DOMRect,
  searchable: boolean,
  popupMinWidth?: number,
  popupMaxWidth?: number,
  placement: 'auto' | 'above' | 'below' = 'auto',
  popupHeight = POPUP_MAX_HEIGHT
): PopupLayout {
  const minW = popupMinWidth ?? (searchable ? SEARCHABLE_POPUP_MIN : DEFAULT_POPUP_MIN)
  const maxW = popupMaxWidth ?? (searchable ? SEARCHABLE_POPUP_MAX : DEFAULT_POPUP_MAX)
  const availableW = window.innerWidth - VIEWPORT_MARGIN * 2
  const width = Math.min(maxW, availableW, Math.max(minW, trigger.width))

  let left = trigger.left
  if (left + width > window.innerWidth - VIEWPORT_MARGIN) {
    left = Math.max(VIEWPORT_MARGIN, window.innerWidth - VIEWPORT_MARGIN - width)
  }
  left = Math.max(VIEWPORT_MARGIN, left)

  const spaceBelow = window.innerHeight - VIEWPORT_MARGIN - trigger.bottom - POPUP_GAP
  const spaceAbove = trigger.top - VIEWPORT_MARGIN - POPUP_GAP
  const openAbove =
    placement === 'above' ||
    (placement === 'auto' && spaceBelow < popupHeight && spaceAbove >= spaceBelow)

  let top: number
  if (openAbove) {
    top = trigger.top - POPUP_GAP - Math.min(popupHeight, spaceAbove)
    top = Math.max(VIEWPORT_MARGIN, top)
  } else {
    top = trigger.bottom + POPUP_GAP
  }

  return { top, left, width }
}

function inlinePopupStyle(
  placement: 'above' | 'below',
  searchable: boolean,
  popupMinWidth?: number,
  popupMaxWidth?: number
): React.CSSProperties {
  const minW = popupMinWidth ?? (searchable ? SEARCHABLE_POPUP_MIN : DEFAULT_POPUP_MIN)
  const maxW = popupMaxWidth ?? (searchable ? SEARCHABLE_POPUP_MAX : DEFAULT_POPUP_MAX)
  return {
    position: 'absolute',
    left: 0,
    ...(placement === 'above'
      ? { bottom: `calc(100% + ${POPUP_GAP}px)` }
      : { top: `calc(100% + ${POPUP_GAP}px)` }),
    minWidth: minW,
    width: 'max-content',
    maxWidth: maxW,
    maxHeight: POPUP_MAX_HEIGHT,
    overflowY: 'auto',
    overflowX: 'hidden',
    boxSizing: 'border-box',
    background: 'var(--gw-surface, #18181b)',
    border: '1px solid var(--gw-border-subtle, #3f3f46)',
    borderRadius: 6,
    boxShadow: '0 12px 32px var(--gw-shadow-strong)',
    padding: 4,
    zIndex: 20,
  }
}

/**
 * Dark-themed dropdown that fully replaces the native <select>. macOS renders the
 * native option popup itself (light, OS chrome) and it cannot be styled via CSS, so
 * we render our own listbox in a portal to match the app design.
 */
function matchesQuery(option: DropdownOption, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (q.length === 0) return true
  return option.label.toLowerCase().includes(q) || option.value.toLowerCase().includes(q)
}

export default function Dropdown({
  value,
  options,
  onChange,
  testId,
  placeholder = 'Select…',
  disabled = false,
  ariaLabel,
  block = false,
  monospace = false,
  searchable = false,
  searchPlaceholder = 'Search…',
  noMatchesLabel = 'No matches',
  popupMinWidth,
  popupMaxWidth,
  triggerStyle,
  triggerClassName,
  displayValue,
  portaled = true,
  placement = 'auto',
}: DropdownProps): React.ReactElement {
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const [query, setQuery] = useState('')
  const [layout, setLayout] = useState<PopupLayout | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const filteredOptions = searchable ? options.filter((o) => matchesQuery(o, query)) : options
  const inlinePlacement: 'above' | 'below' = placement === 'below' ? 'below' : 'above'

  const selected = options.find((o) => o.value === value)
  const label = displayValue ?? selected?.label ?? placeholder

  const reposition = (): void => {
    if (!portaled || !triggerRef.current) return
    const popupHeight = popupRef.current?.getBoundingClientRect().height ?? POPUP_MAX_HEIGHT
    setLayout(
      computePopupLayout(
        triggerRef.current.getBoundingClientRect(),
        searchable,
        popupMinWidth,
        popupMaxWidth,
        placement,
        popupHeight
      )
    )
  }

  useLayoutEffect(() => {
    if (open) {
      if (portaled) {
        reposition()
        requestAnimationFrame(() => reposition())
      }
      setHighlight(
        Math.max(
          0,
          filteredOptions.findIndex((o) => o.value === value)
        )
      )
      if (searchable) searchRef.current?.focus()
    } else {
      setQuery('')
      if (portaled) setLayout(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useLayoutEffect(() => {
    if (!open || !portaled) return
    reposition()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredOptions.length, query])

  useEffect(() => {
    if (!open || !searchable) return
    const idx = filteredOptions.findIndex((o) => o.value === value)
    setHighlight(Math.max(0, idx))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      const t = e.target as Node
      if (triggerRef.current?.contains(t) || popupRef.current?.contains(t)) return
      setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  useEffect(() => {
    if (!open || !portaled) return
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, portaled])

  const choose = (v: string): void => {
    onChange(v)
    setOpen(false)
    triggerRef.current?.focus()
  }

  const moveHighlight = (dir: 1 | -1): void => {
    setHighlight((h) => {
      let next = h
      for (let i = 0; i < filteredOptions.length; i++) {
        next = (next + dir + filteredOptions.length) % filteredOptions.length
        if (!filteredOptions[next]?.disabled) break
      }
      return next
    })
  }

  const selectHighlighted = (): void => {
    const opt = filteredOptions[highlight]
    if (opt && !opt.disabled) choose(opt.value)
  }

  const onPopupKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape' || e.key === 'Tab') {
      setOpen(false)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      moveHighlight(1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      moveHighlight(-1)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      selectHighlighted()
    }
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        setOpen(true)
      }
      return
    }
    onPopupKeyDown(e)
  }

  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter') {
      onPopupKeyDown(e)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
      triggerRef.current?.focus()
    }
  }

  const triggerButton = (
    <button
      ref={triggerRef}
      type="button"
      data-testid={testId}
      className={['gw-dd-trigger', triggerClassName].filter(Boolean).join(' ')}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => !disabled && setOpen((o) => !o)}
      onKeyDown={onKeyDown}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: block ? 'space-between' : undefined,
        gap: 6,
        width: block ? '100%' : undefined,
        cursor: disabled ? 'not-allowed' : 'pointer',
        color: selected ? 'var(--gw-text, #f4f4f5)' : 'var(--gw-text-faint, #71717a)',
        ...triggerStyle,
      }}
    >
      <span
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontFamily: monospace ? 'monospace' : 'inherit',
        }}
      >
        {label}
      </span>
      <svg
        width="10"
        height="6"
        viewBox="0 0 10 6"
        aria-hidden="true"
        style={{
          flexShrink: 0,
          transform: open ? 'rotate(180deg)' : 'none',
          transition: 'transform 0.15s ease',
        }}
      >
        <path
          d="M1 1l4 4 4-4"
          stroke="currentColor"
          strokeWidth="1.5"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.7"
        />
      </svg>
    </button>
  )

  const popupNode =
    open && (portaled ? layout : true) ? (
      <div
        ref={popupRef}
        role="listbox"
        data-testid={testId ? `${testId}-popup` : undefined}
        style={
          portaled
            ? {
                position: 'fixed',
                top: layout!.top,
                left: layout!.left,
                width: layout!.width,
                maxHeight: POPUP_MAX_HEIGHT,
                overflowY: 'auto',
                overflowX: 'hidden',
                boxSizing: 'border-box',
                background: 'var(--gw-surface, #18181b)',
                border: '1px solid var(--gw-border-subtle, #3f3f46)',
                borderRadius: 6,
                boxShadow: '0 12px 32px var(--gw-shadow-strong)',
                padding: 4,
                zIndex: 2000,
              }
            : inlinePopupStyle(inlinePlacement, searchable, popupMinWidth, popupMaxWidth)
        }
        onKeyDown={onPopupKeyDown}
      >
        {searchable && (
          <div
            style={{
              padding: '2px 2px 4px',
              position: 'sticky',
              top: 0,
              background: 'inherit',
            }}
          >
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onSearchKeyDown}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              data-testid={testId ? `${testId}-search` : undefined}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                background: 'var(--gw-input-bg, #09090b)',
                border: '1px solid var(--gw-border-subtle, #3f3f46)',
                borderRadius: 4,
                color: 'var(--gw-text, #f4f4f5)',
                fontSize: 14,
                padding: '6px 10px',
                fontFamily: monospace ? 'monospace' : 'inherit',
              }}
            />
          </div>
        )}
        {options.length === 0 && (
          <div
            style={{
              padding: '6px 10px',
              color: 'var(--gw-text-faint, #71717a)',
              fontSize: 14,
            }}
          >
            No options
          </div>
        )}
        {searchable && options.length > 0 && filteredOptions.length === 0 && (
          <div
            data-testid={testId ? `${testId}-no-matches` : undefined}
            style={{
              padding: '6px 10px',
              color: 'var(--gw-text-faint, #71717a)',
              fontSize: 14,
            }}
          >
            {noMatchesLabel}
          </div>
        )}
        {filteredOptions.map((o, i) => {
          const isSel = o.value === value
          const cls = [
            'gw-dd-option',
            isSel ? 'gw-dd-option--selected' : '',
            o.disabled ? 'gw-dd-option--disabled' : '',
            i === highlight && !o.disabled ? 'gw-dd-option--active' : '',
          ]
            .filter(Boolean)
            .join(' ')
          return (
            <div
              key={o.value}
              role="option"
              aria-selected={isSel}
              data-testid={testId ? `${testId}-option-${o.value}` : undefined}
              className={cls}
              title={o.title}
              onMouseEnter={() => setHighlight(i)}
              onClick={() => !o.disabled && choose(o.value)}
              style={{
                fontFamily: monospace ? 'monospace' : 'inherit',
                alignItems: searchable ? 'flex-start' : 'center',
              }}
            >
              <span className="gw-dd-check" aria-hidden="true">
                {isSel ? '✓' : ''}
              </span>
              <span
                style={{
                  overflow: searchable ? 'visible' : 'hidden',
                  textOverflow: searchable ? 'clip' : 'ellipsis',
                  whiteSpace: searchable ? 'normal' : 'nowrap',
                  wordBreak: searchable ? 'break-word' : undefined,
                  lineHeight: searchable ? 1.35 : undefined,
                }}
              >
                {o.label}
              </span>
            </div>
          )
        })}
      </div>
    ) : null

  if (!portaled) {
    return (
      <div
        style={{
          position: 'relative',
          display: 'inline-flex',
          maxWidth: block ? '100%' : undefined,
          width: block ? '100%' : undefined,
        }}
      >
        {triggerButton}
        {popupNode}
      </div>
    )
  }

  return (
    <>
      {triggerButton}
      {popupNode && createPortal(popupNode, document.body)}
    </>
  )
}
