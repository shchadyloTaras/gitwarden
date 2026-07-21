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
  const tabRefs = React.useRef<Record<RightPanelTab, HTMLButtonElement | null>>({
    context: null,
    chat: null,
  })

  const handleTabKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    currentIndex: number
  ): void => {
    let nextIndex: number | undefined

    if (event.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % TABS.length
    } else if (event.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + TABS.length) % TABS.length
    } else if (event.key === 'Home') {
      nextIndex = 0
    } else if (event.key === 'End') {
      nextIndex = TABS.length - 1
    }

    if (nextIndex === undefined) return

    event.preventDefault()
    const nextTab = TABS[nextIndex]
    setRightPanelTab(nextTab.id)
    tabRefs.current[nextTab.id]?.focus()
  }

  if (!inspectorOpen) return <></>

  return (
    <aside
      id="gitwarden-right-panel"
      data-testid="right-panel"
      className="gw-right-panel"
      style={{
        width,
        flex: `0 0 ${width}px`,
      }}
    >
      <div role="tablist" aria-orientation="horizontal" className="gw-right-panel__tabs">
        {TABS.map((tab, index) => {
          const selected = rightPanelTab === tab.id
          return (
            <button
              key={tab.id}
              id={`right-panel-tab-${tab.id}`}
              role="tab"
              aria-selected={selected}
              aria-controls={`right-panel-tabpanel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              data-testid={tab.testId}
              className="gw-right-panel__tab"
              ref={(node) => {
                tabRefs.current[tab.id] = node
              }}
              onClick={() => setRightPanelTab(tab.id)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      <div className="gw-right-panel__body">
        {TABS.map((tab) => {
          const selected = rightPanelTab === tab.id
          return (
            <div
              key={tab.id}
              id={`right-panel-tabpanel-${tab.id}`}
              role="tabpanel"
              aria-labelledby={`right-panel-tab-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              hidden={!selected}
              className="gw-right-panel__tabpanel"
            >
              {selected && (tab.id === 'chat' ? <AiChatPanel /> : <Inspector />)}
            </div>
          )
        })}
      </div>
    </aside>
  )
}
