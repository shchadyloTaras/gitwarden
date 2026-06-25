import React from 'react'
import { useAppStore, type RightPanelTab } from '../store/appStore'
import Inspector from './Inspector'
import AiChatPanel from './AiChatPanel'
import { STR } from '../strings'

const TABS: Array<{ id: RightPanelTab; label: string; testId: string }> = [
  { id: 'context', label: STR.CHAT_TAB_CONTEXT, testId: 'right-panel-tab-context' },
  { id: 'chat', label: STR.CHAT_TAB_CHAT, testId: 'right-panel-tab-chat' },
]

/**
 * The right column: a two-tab panel (deterministic Context / AI Chat). Visibility
 * is controlled by `inspectorOpen` (the header ⓘ toggle) so existing behavior is
 * preserved; the new chat affordance opens it on the AI Chat tab.
 */
export default function RightPanel({ width }: { width: number }): React.ReactElement {
  const inspectorOpen = useAppStore((s) => s.inspectorOpen)
  const rightPanelTab = useAppStore((s) => s.rightPanelTab)
  const setRightPanelTab = useAppStore((s) => s.setRightPanelTab)

  if (!inspectorOpen) return <></>

  return (
    <aside
      data-testid="right-panel"
      style={{
        width,
        flex: `0 0 ${width}px`,
        minWidth: 0,
        background: 'var(--gw-surface, #18181b)',
        borderLeft: '1px solid var(--gw-border, #27272a)',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      <div
        role="tablist"
        style={{
          display: 'flex',
          flexShrink: 0,
          borderBottom: '1px solid var(--gw-border, #27272a)',
        }}
      >
        {TABS.map((tab) => {
          const selected = rightPanelTab === tab.id
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={selected}
              data-testid={tab.testId}
              onClick={() => setRightPanelTab(tab.id)}
              style={{
                flex: 1,
                padding: '8px 6px',
                background: 'none',
                border: 'none',
                borderBottom: selected
                  ? '2px solid var(--gw-accent, #6366f1)'
                  : '2px solid transparent',
                color: selected ? 'var(--gw-text, #f4f4f5)' : 'var(--gw-text-muted, #a1a1aa)',
                fontSize: 12,
                fontWeight: selected ? 600 : 400,
                cursor: 'pointer',
              }}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {rightPanelTab === 'chat' ? <AiChatPanel /> : <Inspector />}
      </div>
    </aside>
  )
}
