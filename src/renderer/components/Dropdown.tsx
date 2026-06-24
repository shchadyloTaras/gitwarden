import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export interface DropdownOption {
  value: string
  label: string
  disabled?: boolean
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
  triggerStyle?: React.CSSProperties
}

/**
 * Dark-themed dropdown that fully replaces the native <select>. macOS renders the
 * native option popup itself (light, OS chrome) and it cannot be styled via CSS, so
 * we render our own listbox in a portal to match the app design.
 */
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
  triggerStyle,
}: DropdownProps): React.ReactElement {
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)

  const selected = options.find((o) => o.value === value)
  const label = selected?.label ?? placeholder

  const reposition = (): void => {
    if (triggerRef.current) setRect(triggerRef.current.getBoundingClientRect())
  }

  useLayoutEffect(() => {
    if (open) {
      reposition()
      setHighlight(
        Math.max(
          0,
          options.findIndex((o) => o.value === value)
        )
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      const t = e.target as Node
      if (triggerRef.current?.contains(t) || popupRef.current?.contains(t)) return
      setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const choose = (v: string): void => {
    onChange(v)
    setOpen(false)
    triggerRef.current?.focus()
  }

  const moveHighlight = (dir: 1 | -1): void => {
    setHighlight((h) => {
      let next = h
      for (let i = 0; i < options.length; i++) {
        next = (next + dir + options.length) % options.length
        if (!options[next]?.disabled) break
      }
      return next
    })
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        setOpen(true)
      }
      return
    }
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
      const opt = options[highlight]
      if (opt && !opt.disabled) choose(opt.value)
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-testid={testId}
        className="gw-dd-trigger"
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

      {open &&
        rect &&
        createPortal(
          <div
            ref={popupRef}
            role="listbox"
            data-testid={testId ? `${testId}-popup` : undefined}
            style={{
              position: 'fixed',
              top: rect.bottom + 4,
              left: rect.left,
              minWidth: Math.max(rect.width, 150),
              maxWidth: 340,
              maxHeight: 300,
              overflowY: 'auto',
              background: 'var(--gw-surface, #18181b)',
              border: '1px solid var(--gw-border-subtle, #3f3f46)',
              borderRadius: 6,
              boxShadow: '0 12px 32px var(--gw-shadow-strong)',
              padding: 4,
              zIndex: 2000,
            }}
          >
            {options.length === 0 && (
              <div
                style={{
                  padding: '6px 10px',
                  color: 'var(--gw-text-faint, #71717a)',
                  fontSize: 13,
                }}
              >
                No options
              </div>
            )}
            {options.map((o, i) => {
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
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => !o.disabled && choose(o.value)}
                  style={{ fontFamily: monospace ? 'monospace' : 'inherit' }}
                >
                  <span className="gw-dd-check" aria-hidden="true">
                    {isSel ? '✓' : ''}
                  </span>
                  <span
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {o.label}
                  </span>
                </div>
              )
            })}
          </div>,
          document.body
        )}
    </>
  )
}
