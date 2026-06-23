import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { NavScreen } from '../store/appStore'
import { useAppStore } from '../store/appStore'
import { STR } from '../strings'

type Placement = 'center' | 'top' | 'right' | 'bottom' | 'left'

interface OnboardingStep {
  title: string
  body: string
  target?: string
  screen?: NavScreen
  placement: Placement
}

interface OnboardingTourProps {
  open: boolean
  onComplete(): void
  onSkip(): void
}

const TOOLTIP_WIDTH = 360
const TOOLTIP_GAP = 16
const EDGE_GAP = 16
const SPOTLIGHT_PAD = 6

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function buildSteps(): OnboardingStep[] {
  return [
    {
      title: STR.ONBOARDING_STEP_WELCOME_TITLE,
      body: STR.ONBOARDING_STEP_WELCOME_BODY,
      placement: 'center',
    },
    {
      title: STR.ONBOARDING_STEP_HEADER_TITLE,
      body: STR.ONBOARDING_STEP_HEADER_BODY,
      target: '[data-testid="global-header"]',
      placement: 'bottom',
    },
    {
      title: STR.ONBOARDING_STEP_NAV_TITLE,
      body: STR.ONBOARDING_STEP_NAV_BODY,
      target: '[data-testid="sidebar-nav"]',
      placement: 'right',
    },
    {
      title: STR.ONBOARDING_STEP_PROFILES_TITLE,
      body: STR.ONBOARDING_STEP_PROFILES_BODY,
      target: '[data-testid="profiles-new-btn"]',
      screen: 'profiles',
      placement: 'right',
    },
    {
      title: STR.ONBOARDING_STEP_REPOS_TITLE,
      body: STR.ONBOARDING_STEP_REPOS_BODY,
      target: '[data-testid="repos-add-btn"]',
      screen: 'repositories',
      placement: 'right',
    },
    {
      title: STR.ONBOARDING_STEP_STATUS_TITLE,
      body: STR.ONBOARDING_STEP_STATUS_BODY,
      target: '[data-testid="status-repo-select"]',
      screen: 'status',
      placement: 'bottom',
    },
    {
      title: STR.ONBOARDING_STEP_COMMIT_TITLE,
      body: STR.ONBOARDING_STEP_COMMIT_BODY,
      target: '[data-testid="commit-repo-select"]',
      screen: 'commit',
      placement: 'bottom',
    },
    {
      title: STR.ONBOARDING_STEP_REMOTE_TITLE,
      body: STR.ONBOARDING_STEP_REMOTE_BODY,
      target: '[data-testid="remote-repo-select"]',
      screen: 'remote',
      placement: 'bottom',
    },
    {
      title: STR.ONBOARDING_STEP_SAFETY_TITLE,
      body: STR.ONBOARDING_STEP_SAFETY_BODY,
      target: '[data-testid="safety-repo-select"]',
      screen: 'safety-center',
      placement: 'bottom',
    },
    {
      title: STR.ONBOARDING_STEP_SETTINGS_TITLE,
      body: STR.ONBOARDING_STEP_SETTINGS_BODY,
      target: '[data-testid="settings-onboarding-card"]',
      screen: 'settings',
      placement: 'top',
    },
  ]
}

function getTooltipPosition(rect: DOMRect | null, placement: Placement): React.CSSProperties {
  if (!rect || placement === 'center') {
    return {
      left: '50%',
      top: '50%',
      transform: 'translate(-50%, -50%)',
    }
  }

  const maxLeft = Math.max(EDGE_GAP, window.innerWidth - TOOLTIP_WIDTH - EDGE_GAP)
  const maxTop = Math.max(EDGE_GAP, window.innerHeight - 220)
  const preferredTop = rect.top + rect.height / 2 - 96
  const top = clamp(preferredTop, EDGE_GAP, maxTop)

  if (placement === 'right') {
    return {
      left: clamp(rect.right + TOOLTIP_GAP, EDGE_GAP, maxLeft),
      top,
    }
  }

  if (placement === 'left') {
    return {
      left: clamp(rect.left - TOOLTIP_WIDTH - TOOLTIP_GAP, EDGE_GAP, maxLeft),
      top,
    }
  }

  const left = clamp(rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2, EDGE_GAP, maxLeft)

  if (placement === 'top') {
    return {
      left,
      top: clamp(rect.top - 220 - TOOLTIP_GAP, EDGE_GAP, maxTop),
    }
  }

  return {
    left,
    top: clamp(rect.bottom + TOOLTIP_GAP, EDGE_GAP, maxTop),
  }
}

export default function OnboardingTour({
  open,
  onComplete,
  onSkip,
}: OnboardingTourProps): React.ReactElement | null {
  const navigate = useAppStore((s) => s.navigate)
  const steps = useMemo(() => buildSteps(), [])
  const [stepIndex, setStepIndex] = useState(0)
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)
  const nextButtonRef = useRef<HTMLButtonElement>(null)

  const step = steps[stepIndex]
  const isFirst = stepIndex === 0
  const isLast = stepIndex === steps.length - 1

  useEffect(() => {
    if (open) setStepIndex(0)
  }, [open])

  useEffect(() => {
    if (!open || !step.screen) return
    navigate(step.screen)
  }, [navigate, open, step.screen])

  useEffect(() => {
    if (!open) return

    let frame = 0
    let timeout = 0

    const updateTargetRect = (): void => {
      if (!step.target) {
        setTargetRect(null)
        return
      }

      const element = document.querySelector<HTMLElement>(step.target)
      if (!element) {
        setTargetRect(null)
        return
      }

      element.scrollIntoView({ block: 'center', inline: 'nearest' })
      frame = window.requestAnimationFrame(() => {
        setTargetRect(element.getBoundingClientRect())
      })
    }

    timeout = window.setTimeout(updateTargetRect, 80)
    window.addEventListener('resize', updateTargetRect)
    document.addEventListener('scroll', updateTargetRect, true)

    return () => {
      window.clearTimeout(timeout)
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', updateTargetRect)
      document.removeEventListener('scroll', updateTargetRect, true)
    }
  }, [open, step.target, step.screen])

  useEffect(() => {
    if (!open) return
    nextButtonRef.current?.focus()
  }, [open, stepIndex])

  useEffect(() => {
    if (!open) return

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault()
        onSkip()
      } else if (event.key === 'ArrowRight' || event.key === 'Enter') {
        event.preventDefault()
        if (isLast) onComplete()
        else setStepIndex((current) => current + 1)
      } else if (event.key === 'ArrowLeft' && !isFirst) {
        event.preventDefault()
        setStepIndex((current) => current - 1)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isFirst, isLast, onComplete, onSkip, open])

  if (!open) return null

  const tooltipStyle = getTooltipPosition(targetRect, step.placement)
  const hasSpotlight = targetRect !== null && step.placement !== 'center'

  return (
    <div
      data-testid="onboarding-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        pointerEvents: 'auto',
      }}
    >
      {!hasSpotlight && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(3, 7, 18, 0.72)',
          }}
        />
      )}

      {hasSpotlight && (
        <div
          data-testid="onboarding-spotlight"
          style={{
            position: 'fixed',
            top: targetRect.top - SPOTLIGHT_PAD,
            left: targetRect.left - SPOTLIGHT_PAD,
            width: targetRect.width + SPOTLIGHT_PAD * 2,
            height: targetRect.height + SPOTLIGHT_PAD * 2,
            border: '2px solid #818cf8',
            borderRadius: 8,
            boxShadow: '0 0 0 9999px rgba(3, 7, 18, 0.7), 0 0 0 4px rgba(99, 102, 241, 0.25)',
            pointerEvents: 'none',
          }}
        />
      )}

      <section
        data-testid="onboarding-card"
        style={{
          position: 'fixed',
          width: TOOLTIP_WIDTH,
          maxWidth: 'calc(100vw - 32px)',
          maxHeight: 'calc(100vh - 32px)',
          overflowY: 'auto',
          background: 'var(--gw-surface, #18181b)',
          border: '1px solid var(--gw-border-subtle, #3f3f46)',
          borderRadius: 8,
          boxShadow: '0 22px 70px rgba(0, 0, 0, 0.38)',
          color: 'var(--gw-text, #f4f4f5)',
          padding: 18,
          ...tooltipStyle,
        }}
      >
        <div
          data-testid="onboarding-progress"
          style={{
            color: 'var(--gw-text-faint, #71717a)',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            marginBottom: 10,
          }}
        >
          {STR.ONBOARDING_PROGRESS(stepIndex + 1, steps.length)}
        </div>

        <h2
          id="onboarding-title"
          data-testid="onboarding-title"
          style={{ margin: '0 0 8px', fontSize: 18, lineHeight: 1.25 }}
        >
          {step.title}
        </h2>

        <p
          data-testid="onboarding-body"
          style={{
            margin: '0 0 18px',
            color: 'var(--gw-text-muted, #a1a1aa)',
            fontSize: 13,
            lineHeight: 1.55,
          }}
        >
          {step.body}
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            data-testid="onboarding-skip"
            onClick={onSkip}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--gw-text-faint, #71717a)',
              cursor: 'pointer',
              fontSize: 12,
              padding: '6px 0',
            }}
          >
            {STR.ONBOARDING_SKIP}
          </button>

          <div style={{ flex: 1 }} />

          <button
            data-testid="onboarding-back"
            disabled={isFirst}
            onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
            style={{
              padding: '6px 12px',
              background: 'none',
              border: '1px solid var(--gw-border-subtle, #3f3f46)',
              borderRadius: 4,
              color: isFirst ? 'var(--gw-text-dim, #52525b)' : 'var(--gw-text-muted, #a1a1aa)',
              cursor: isFirst ? 'default' : 'pointer',
              fontSize: 12,
            }}
          >
            {STR.ONBOARDING_BACK}
          </button>

          <button
            ref={nextButtonRef}
            data-testid="onboarding-next"
            onClick={() => {
              if (isLast) onComplete()
              else setStepIndex((current) => Math.min(steps.length - 1, current + 1))
            }}
            style={{
              padding: '6px 14px',
              background: 'var(--gw-accent, #6366f1)',
              border: 'none',
              borderRadius: 4,
              color: '#fff',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {isLast ? STR.ONBOARDING_FINISH : STR.ONBOARDING_NEXT}
          </button>
        </div>
      </section>
    </div>
  )
}
