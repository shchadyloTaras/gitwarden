import React, { useCallback, useEffect, useRef, useState } from 'react'

const HANDLE_WIDTH = 8
const RESIZE_STEP = 16

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

function readSavedWidth(storageKey: string, fallback: number): number {
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return fallback
    const parsed: unknown = JSON.parse(raw)
    return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : fallback
  } catch {
    return fallback
  }
}

function saveWidth(storageKey: string, width: number): void {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(width))
  } catch {
    // Layout preference persistence is best-effort.
  }
}

export default function ResizableMainSplit({
  storageKey,
  resizeLabel,
  handleTestId,
  startPaneTestId,
  endPaneTestId,
  defaultStartWidth,
  minStartWidth,
  maxStartWidth,
  minEndWidth,
  start,
  end,
}: {
  storageKey: string
  resizeLabel: string
  handleTestId: string
  startPaneTestId?: string
  endPaneTestId?: string
  defaultStartWidth: number
  minStartWidth: number
  maxStartWidth: number
  minEndWidth: number
  start: React.ReactNode
  end: React.ReactNode
}): React.ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [resizing, setResizing] = useState(false)
  const [startWidth, setStartWidth] = useState(() =>
    clampNumber(readSavedWidth(storageKey, defaultStartWidth), minStartWidth, maxStartWidth)
  )

  const maxWidthForContainer = useCallback(
    (width: number): number => {
      const available = width - HANDLE_WIDTH - minEndWidth
      return Math.floor(Math.min(maxStartWidth, Math.max(minStartWidth, available)))
    },
    [maxStartWidth, minEndWidth, minStartWidth]
  )

  const clampStartWidth = useCallback(
    (width: number, availableWidth = containerWidth): number => {
      return Math.round(
        clampNumber(width, minStartWidth, maxWidthForContainer(availableWidth || window.innerWidth))
      )
    },
    [containerWidth, maxWidthForContainer, minStartWidth]
  )

  useEffect(() => {
    const element = containerRef.current
    if (!element) return

    const updateWidth = (): void => {
      setContainerWidth(Math.round(element.getBoundingClientRect().width))
    }

    updateWidth()

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateWidth)
      return () => window.removeEventListener('resize', updateWidth)
    }

    const observer = new ResizeObserver(updateWidth)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    setStartWidth((current) => clampStartWidth(current))
  }, [clampStartWidth])

  useEffect(() => {
    saveWidth(storageKey, startWidth)
  }, [startWidth, storageKey])

  const setWidth = useCallback(
    (width: number): void => {
      setStartWidth((current) => {
        const next = clampStartWidth(width)
        return current === next ? current : next
      })
    },
    [clampStartWidth]
  )

  const beginResize = useCallback(
    (event: React.PointerEvent<HTMLDivElement>): void => {
      if (event.button !== 0) return

      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)

      const startX = event.clientX
      const initialWidth = startWidth
      const initialContainerWidth =
        containerRef.current?.getBoundingClientRect().width ?? containerWidth
      const previousBodyCursor = document.body.style.cursor
      const previousBodyUserSelect = document.body.style.userSelect
      const previousRootCursor = document.documentElement.style.cursor

      setResizing(true)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      document.documentElement.style.cursor = 'col-resize'

      const handlePointerMove = (moveEvent: PointerEvent): void => {
        moveEvent.preventDefault()
        setStartWidth((current) => {
          const next = clampStartWidth(
            initialWidth + moveEvent.clientX - startX,
            initialContainerWidth
          )
          return current === next ? current : next
        })
      }

      const finishResize = (): void => {
        window.removeEventListener('pointermove', handlePointerMove)
        window.removeEventListener('pointerup', finishResize)
        window.removeEventListener('pointercancel', finishResize)
        document.body.style.cursor = previousBodyCursor
        document.body.style.userSelect = previousBodyUserSelect
        document.documentElement.style.cursor = previousRootCursor
        setResizing(false)
      }

      window.addEventListener('pointermove', handlePointerMove)
      window.addEventListener('pointerup', finishResize)
      window.addEventListener('pointercancel', finishResize)
    },
    [clampStartWidth, containerWidth, startWidth]
  )

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>): void => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        setWidth(startWidth - RESIZE_STEP)
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        setWidth(startWidth + RESIZE_STEP)
      } else if (event.key === 'Home') {
        event.preventDefault()
        setWidth(minStartWidth)
      } else if (event.key === 'End') {
        event.preventDefault()
        setWidth(maxWidthForContainer(containerWidth || window.innerWidth))
      }
    },
    [containerWidth, maxWidthForContainer, minStartWidth, setWidth, startWidth]
  )

  const maxWidth = maxWidthForContainer(containerWidth || window.innerWidth)

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      <div
        data-testid={startPaneTestId}
        style={{
          width: startWidth,
          flex: `0 0 ${startWidth}px`,
          minWidth: 0,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {start}
      </div>

      <div
        role="separator"
        aria-label={resizeLabel}
        aria-orientation="vertical"
        aria-valuemin={minStartWidth}
        aria-valuemax={maxWidth}
        aria-valuenow={startWidth}
        className={`gw-resize-handle gw-resize-handle--main${resizing ? ' gw-resize-handle--active' : ''}`}
        data-testid={handleTestId}
        tabIndex={0}
        onPointerDown={beginResize}
        onKeyDown={handleKeyDown}
      />

      <div
        data-testid={endPaneTestId}
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {end}
      </div>
    </div>
  )
}
