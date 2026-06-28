// GitWarden — presentation deck. Narrative in Ukrainian; code / product / tech
// terms stay English by design. Content grounded in the repo's docs and source.

const slides = [
  {
    id: 'cover',
    className: 'slide-cover',
    eyebrow: 'GitWarden',
    title: 'Ніколи не робить <span class="grad">commit з чужого Git-акаунта</span>',
    lead: 'Desktop Git GUI, що перевіряє вашу identity перед кожним commit і push — щоб Personal, Work і Client ніколи не переплутались.',
    headExtra: `
      <div class="badge-row">
        <span class="badge">macOS · Windows · Linux</span>
        <span class="badge">Electron · TypeScript · React</span>
        <span class="badge">MIT · no telemetry</span>
      </div>
    `,
    aside: `
      <div class="terminal">
        <div class="terminal-bar">
          <span class="terminal-dot"></span>
          <span class="terminal-dot"></span>
          <span class="terminal-dot"></span>
          <span class="terminal-title">gitwarden · safety-check</span>
        </div>
        <pre><span class="prompt">$</span> gitwarden check --push
<span class="ok">✓</span> active profile     Work
<span class="ok">✓</span> author identity    matches profile
<span class="bad">✗</span> remote host        github.com-personal
                   <span class="dim">≠ expected github.com-work</span>
<span class="dim">─────────────────────────────────────</span>
verdict: <span class="verdict">BLOCKED</span> — likely wrong account / key</pre>
      </div>
    `,
  },

  {
    id: 'problem',
    className: 'slide-split',
    eyebrow: 'Проблема',
    title: 'Один ноутбук, <span class="grad">кілька GitHub-identities</span> — і легко помилитись',
    lead: 'Дві identities незалежні: можна мати правильний email — і все одно зробити push не тим SSH key чи акаунтом. Помилку зазвичай помічають, коли вона вже на remote.',
    points: [
      'Правильний email — але не той SSH key',
      "Робочий repository з commit під Personal-ім'ям",
      'Помилку видно лише коли вона вже на remote',
    ],
    aside: `
      <div class="stack">
        <div class="panel">
          <div class="panel-title">Author Identity</div>
          <div class="panel-copy">name + email, що вписуються у кожен commit.</div>
        </div>
        <div class="panel">
          <div class="panel-title">Transport Identity</div>
          <div class="panel-copy">SSH key / credential, що автентифікує push — незалежний від email.</div>
        </div>
        <div class="panel">
          <div class="panel-title">Прогалина в інструментах</div>
          <div class="panel-copy">Git GUIs дають identity <em>вибирати</em> — а не enforce та audit на момент push.</div>
        </div>
      </div>
    `,
  },

  {
    id: 'solution',
    className: 'slide-split',
    eyebrow: 'Ідея',
    title: 'Profiles + <span class="grad">Safety Verdict перед кожним commit і push</span>',
    lead: 'Profile (Personal / Work / Client) = name + email, очікуваний GitHub-host і SSH key alias. Кожен repository прив’язаний рівно до одного profile, а активна identity завжди на видноті.',
    points: [
      'HARD mismatch блокує commit / push',
      'SOFT mismatch — пройде лише після підтвердження',
      'Push-діалог переказує repo · branch · remote · identity',
      'Fix у один крок — лише --local, ніколи global',
    ],
    aside: `
      <div class="stack">
        <div class="panel">
          <div class="panel-title">Profile</div>
          <div class="panel-copy">name + email + expected GitHub host + SSH key alias.</div>
        </div>
        <div class="panel">
          <div class="panel-title">Bound Profile</div>
          <div class="panel-copy">Кожен repository прив’язаний рівно до одного profile.</div>
        </div>
        <div class="panel">
          <div class="panel-title">Safety Verdict</div>
          <div class="panel-copy">Три результати ще до того, як ви натиснете кнопку:</div>
          <div class="verdict-chips">
            <span class="vchip safe">safe</span>
            <span class="vchip warn">warning</span>
            <span class="vchip block">blocked</span>
          </div>
        </div>
      </div>
    `,
  },

  {
    id: 'product',
    className: 'slide-split',
    eyebrow: 'Продукт',
    title: 'Identity-стан <span class="grad">видно перед дією</span>',
    lead: 'Екран Status показує активний Profile, effective identity (author name + email) та її джерело, поточний branch і target remote — а Safety Verdict зʼявляється ще до commit чи push.',
    points: [
      'Щоденний Git без терміналу: stage, commit, branch, fetch, pull, push',
      'Guard · Ready завжди у шапці — активний Profile на видноті',
      'Лише commit і push проходять через blocking verdict',
    ],
    aside: `
      <figure class="shot">
        <div class="shot-bar">
          <span class="terminal-dot"></span>
          <span class="terminal-dot"></span>
          <span class="terminal-dot"></span>
          <span class="shot-name">GitWarden — Status</span>
        </div>
        <img src="./assets/status-dark.webp" alt="GitWarden Status screen — dark theme" loading="eager" />
      </figure>
    `,
  },

  {
    id: 'architecture',
    className: 'slide-split',
    eyebrow: 'Як це побудовано',
    title: 'Чотири шари з <span class="grad-alt">pure core як backbone верифікованості</span>',
    lead: 'core ↔ main ↔ preload ↔ renderer зі строгими правилами перетину. src/core/ тримається import-pure, тож Safety Engine і porcelain parser ганяються headless під Vitest.',
    points: [
      'GitRunner — єдиний виконавець git; args масивом, ніколи shell',
      'Secrets лише в Electron safeStorage, ніколи в renderer',
      '8 ADRs (MADR) фіксують фундаментальні рішення',
    ],
    aside: `
      <div class="arch">
        <div class="arch-layer">
          <div class="arch-head"><span class="arch-name">Renderer</span><span class="arch-tag">sandboxed</span></div>
          <div class="arch-desc">src/renderer/ — React UI. Бачить лише window.api.*, no Node.</div>
        </div>
        <div class="arch-link">↕ typed preload bridge</div>
        <div class="arch-layer">
          <div class="arch-head"><span class="arch-name">Preload</span></div>
          <div class="arch-desc">preload/index.ts — contextBridge, Zod-валідує кожен IPC payload.</div>
        </div>
        <div class="arch-link">↕</div>
        <div class="arch-layer">
          <div class="arch-head"><span class="arch-name">Main</span></div>
          <div class="arch-desc">src/main/ — OS · network · git · secrets (safeStorage).</div>
        </div>
        <div class="arch-link">↕ pure calls</div>
        <div class="arch-layer is-core">
          <div class="arch-head"><span class="arch-name">core</span><span class="arch-tag">pure · 0 forbidden imports</span></div>
          <div class="arch-desc">src/core/ — Safety Engine · parser · types. No child-process / fs / electron.</div>
        </div>
      </div>
    `,
  },

  {
    id: 'method',
    className: 'slide-split',
    eyebrow: 'Метод',
    title: 'Будували <span class="grad">AI-агентами за strict logic-first дисципліною</span>',
    lead: 'Один спільний source of truth — AGENTS.md. Продукт розбитий на фази; кожна фаза проходить однаковий цикл, а запис у progress-log — це hard gate перед commit.',
    points: [
      'AGENTS.md — єдиний source of truth для агентів',
      'Logic-first: core + git + safety зелені ДО будь-якого UI',
      'Executable guardrails: hooks блокують imports у core і --global config',
      'Maker ≠ checker: окремі read-only subagent reviewers',
    ],
    aside: `
      <div class="pipeline">
        <div class="pipe-step">
          <div class="pipe-number">1</div>
          <div><div class="pipe-label">Read</div><div class="pipe-detail">prompt + plan; перевірити gate попередньої фази</div></div>
        </div>
        <div class="pipe-step">
          <div class="pipe-number">2</div>
          <div><div class="pipe-label">Implement</div><div class="pipe-detail">logic-first, за architecture rules</div></div>
        </div>
        <div class="pipe-step is-live">
          <div class="pipe-number">3</div>
          <div><div class="pipe-label">Verify</div><div class="pipe-detail">tsc ×2 · Vitest · lint · Playwright — все зелене</div></div>
        </div>
        <div class="pipe-step is-live">
          <div class="pipe-number">4</div>
          <div><div class="pipe-label">Log</div><div class="pipe-detail">progress-log + tick Phase Checklist (hard gate)</div></div>
        </div>
        <div class="pipe-step">
          <div class="pipe-number">5</div>
          <div><div class="pipe-label">Commit</div><div class="pipe-detail">один commit «Phase N», ніколи push</div></div>
        </div>
      </div>
    `,
  },

  {
    id: 'journey',
    className: 'slide-full',
    eyebrow: 'Шлях побудови',
    title: 'Від <span class="grad-alt">Phase 0 до Landing і DX</span>',
    lead: 'Залежнісно-впорядкований маршрут: docs-фундамент → чистий верифікований core → storage/IPC → UI → і лише тоді feature-треки, distribution, лендінг та developer-experience.',
    headExtra: `
      <div class="badge-row">
        <span class="badge">116 commits</span>
        <span class="badge">v0.1.0 → v0.2.0</span>
        <span class="badge">engine verified headless before any UI</span>
      </div>
    `,
    aside: `
      <div class="timeline">
        <div class="tl-step">
          <div class="tl-dot"></div>
          <div class="tl-phase">Phase 0</div>
          <div class="tl-title">Foundations</div>
          <div class="tl-note">Рішення + threat model (docs-only)</div>
          <span class="tl-status done">done</span>
        </div>
        <div class="tl-step">
          <div class="tl-dot"></div>
          <div class="tl-phase">Phase 1–7</div>
          <div class="tl-title">Verifiable core</div>
          <div class="tl-note">GitRunner · parser · Safety Engine</div>
          <span class="tl-status done">done</span>
        </div>
        <div class="tl-step">
          <div class="tl-dot"></div>
          <div class="tl-phase">Phase 8–20</div>
          <div class="tl-title">MVP UI</div>
          <div class="tl-note">Profiles · Status · Commit · Branches</div>
          <span class="tl-status done">done</span>
        </div>
        <div class="tl-step">
          <div class="tl-dot"></div>
          <div class="tl-phase">Phase 21–39</div>
          <div class="tl-title">OAuth + AI advisory</div>
          <div class="tl-note">Device Flow · AI Connections</div>
          <span class="tl-status done">done</span>
        </div>
        <div class="tl-step">
          <div class="tl-dot"></div>
          <div class="tl-phase">Phase 52–62</div>
          <div class="tl-title">Chat · Access · GenUI</div>
          <div class="tl-note">AI Chat · Client Branch · GenUI</div>
          <span class="tl-status done">done</span>
        </div>
        <div class="tl-step">
          <div class="tl-dot"></div>
          <div class="tl-phase">Phase 40–51 · DX</div>
          <div class="tl-title">Distribution + Landing</div>
          <div class="tl-note">Installers · gitwarden.vercel.app</div>
          <span class="tl-status partial">43–44 open</span>
        </div>
      </div>
    `,
  },

  {
    id: 'features',
    className: 'slide-split',
    eyebrow: 'Можливості',
    title: 'OAuth, AI advisory, <span class="grad">Client Branch Access і GenUI</span>',
    lead: 'Поверх MVP — кілька завершених feature-треків. Кожен підпорядкований детермінованому Safety Engine, і жоден не виконує git за вас.',
    aside: `
      <div class="grid-cards">
        <div class="panel">
          <div class="panel-title">GitHub OAuth</div>
          <div class="panel-copy">Device Flow — без client secret; token лише в safeStorage.</div>
        </div>
        <div class="panel">
          <div class="panel-title">AI advisory</div>
          <div class="panel-copy">Bring-your-own key. Чисто радить — ніколи не запускає git.</div>
        </div>
        <div class="panel">
          <div class="panel-title">Client Branch Access</div>
          <div class="panel-copy">Per-repo push policy; protected-branch block.</div>
        </div>
        <div class="panel">
          <div class="panel-title">Generative UI</div>
          <div class="panel-copy">Закритий allowlist карток; без довільного HTML.</div>
        </div>
      </div>
    `,
  },

  {
    id: 'quality',
    className: 'slide-split',
    eyebrow: 'Якість і безпека',
    title: 'Offline-тести і <span class="grad-alt">чесний threat model</span>',
    lead: 'Логіка тестується first: pure core під Vitest, реальний застосунок — під Playwright проти тимчасових git-фікстур. Безпека задокументована в SECURITY.md і ензфорситься у runtime та статично.',
    points: [
      'Усі тести offline — жодного реального GitHub чи AI-виклику',
      'Secrets ніколи не логуються й не покидають main',
      'AI стоїть ПОРУЧ із Safety Engine, не всередині',
    ],
    aside: `
      <div class="grid-cards">
        <div class="stat">
          <div class="stat-kicker">Vitest</div>
          <div class="stat-value">634</div>
          <div class="stat-copy">unit + integration тести pure core — offline</div>
        </div>
        <div class="stat">
          <div class="stat-kicker">Playwright</div>
          <div class="stat-value">107</div>
          <div class="stat-copy">Electron e2e проти тимчасових git-фікстур</div>
        </div>
        <div class="stat">
          <div class="stat-kicker">core purity</div>
          <div class="stat-value">0</div>
          <div class="stat-copy">imports of child-process / fs / electron у src/core</div>
        </div>
        <div class="stat">
          <div class="stat-kicker">ADR · MADR</div>
          <div class="stat-value">8</div>
          <div class="stat-copy">зафіксованих рішень, одне на файл</div>
        </div>
      </div>
    `,
  },

  {
    id: 'status',
    className: 'slide-split',
    eyebrow: 'Статус і підсумок',
    title: 'MVP, OAuth, AI, Client і Landing <span class="grad">вже відвантажені</span>',
    lead: 'Сім feature-треків завершені; відкрите лише code signing (Phase 43) та повний auto-update (Phase 44) — заблоковані доступністю платних сертифікатів. Білди наразі unsigned.',
    aside: `
      <div class="stack">
        <div class="panel">
          <div class="panel-title">Готово</div>
          <div class="panel-copy">MVP Core · GitHub OAuth · AI Connections + Chat · Client Branch Access · GenUI · Landing · Agentic DX.</div>
        </div>
        <div class="panel">
          <div class="panel-title">Ще відкрите</div>
          <div class="panel-copy">Code signing (43) + auto-update (44) — чекають на платні сертифікати. Білди поки unsigned.</div>
        </div>
        <div class="panel">
          <div class="panel-title">Спробувати</div>
          <div class="panel-copy">↓ <a class="lnk" href="https://gitwarden.vercel.app" target="_blank" rel="noopener">gitwarden.vercel.app</a> · <a class="lnk" href="https://github.com/shchadyloTaras/gitwarden" target="_blank" rel="noopener">github.com/shchadyloTaras/gitwarden</a> · MIT.</div>
        </div>
      </div>
    `,
  },
]

const state = {
  index: 0,
  overviewOpen: false,
}

const root = document.documentElement
const slidesEl = document.querySelector('#slides')
const deckEl = document.querySelector('.deck')
const progressBar = document.querySelector('#progress-bar')
const overview = document.querySelector('#overview')
const previousButton = document.querySelector('#prev')
const nextButton = document.querySelector('#next')
const overviewButton = document.querySelector('#overview-toggle')
const slideNoEl = document.querySelector('#slide-no')
const slideTotalEl = document.querySelector('#slide-total')

let renderedIndex = -1
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

/* --------------------------------------------------------------- Scale to fit */

const DECK_W = 1280
const DECK_H = 720

function fit() {
  const scale = Math.max(
    0.2,
    Math.min((window.innerWidth - 80) / DECK_W, (window.innerHeight - 104) / DECK_H, 1.7),
  )
  root.style.setProperty('--scale', String(scale))
}

/* ------------------------------------------------------------------- Helpers */

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function pad2(value) {
  return String(value).padStart(2, '0')
}

function stripTags(value) {
  const element = document.createElement('div')
  element.innerHTML = value
  return element.textContent || element.innerText || ''
}

/* ----------------------------------------------------------------- Hash sync */

function parseHash() {
  const path = window.location.hash.replace(/^#\/?/, '').split('?')[0]
  const index = slides.findIndex((slide, i) => slide.id === path || String(i + 1) === path)
  state.index = index >= 0 ? index : 0
}

function writeHash() {
  const nextHash = `#/${slides[state.index].id}`
  if (window.location.hash !== nextHash) {
    window.history.replaceState(null, '', nextHash)
  }
}

/* ------------------------------------------------------------------- Render */

function buildInner(slide) {
  const points = (slide.points || []).map((p) => `<li class="point">${p}</li>`).join('')

  const head = `
    <div class="slide-content slide-head">
      <div class="eyebrow">${slide.eyebrow}</div>
      <h1>${slide.title}</h1>
      ${slide.lead ? `<p class="lead">${slide.lead}</p>` : ''}
      ${slide.headExtra || ''}
      ${points ? `<ul class="points">${points}</ul>` : ''}
    </div>
  `

  const aside = slide.aside ? `<div class="slide-content slide-aside">${slide.aside}</div>` : ''

  return head + aside
}

function renderSlide(direction) {
  const slide = slides[state.index]
  const dir = direction === 'back' ? 'back' : 'fwd'

  // Drop any slide still animating out (rapid navigation) before adding the next.
  slidesEl.querySelectorAll('.slide[data-leave]').forEach((el) => el.remove())
  const outgoing = slidesEl.querySelector('.slide')

  const section = document.createElement('section')
  section.className = `slide ${slide.className}`
  section.setAttribute('aria-label', `Slide ${state.index + 1}: ${stripTags(slide.title)}`)
  if (!reduceMotion) section.dataset.anim = dir
  section.innerHTML = buildInner(slide)
  slidesEl.appendChild(section)

  if (outgoing) {
    if (reduceMotion) {
      outgoing.remove()
    } else {
      outgoing.dataset.leave = dir
      let done = false
      const drop = () => {
        if (done) return
        done = true
        outgoing.remove()
      }
      outgoing.addEventListener(
        'animationend',
        (event) => {
          if (event.target === outgoing) drop()
        },
        { once: true },
      )
      // Fallback in case animationend does not fire (e.g. tab hidden).
      setTimeout(drop, 650)
    }
  }
}

function updateChrome() {
  progressBar.style.width = `${((state.index + 1) / slides.length) * 100}%`
  if (slideNoEl) slideNoEl.textContent = pad2(state.index + 1)
  overview.querySelectorAll('.thumb').forEach((thumb, index) => {
    thumb.classList.toggle('is-active', index === state.index)
  })
}

function commit(direction) {
  if (state.index !== renderedIndex) {
    renderSlide(direction)
    renderedIndex = state.index
  }
  updateChrome()
  writeHash()
}

/* ----------------------------------------------------------------- Overview */

function buildOverview() {
  overview.innerHTML = slides
    .map((slide, index) => {
      return `
        <button class="thumb" type="button" data-slide="${index}">
          <div class="thumb-kicker">${pad2(index + 1)} · ${slide.eyebrow}</div>
          <div class="thumb-title">${stripTags(slide.title)}</div>
        </button>
      `
    })
    .join('')
}

function toggleOverview(force) {
  state.overviewOpen = typeof force === 'boolean' ? force : !state.overviewOpen
  overview.hidden = !state.overviewOpen
  overviewButton.setAttribute('aria-pressed', String(state.overviewOpen))
}

/* --------------------------------------------------------------- Navigation */

function goTo(index, direction) {
  const next = clamp(index, 0, slides.length - 1)
  if (next === state.index && renderedIndex === state.index) return
  state.index = next
  commit(direction)
}

function next() {
  if (state.index < slides.length - 1) goTo(state.index + 1, 'fwd')
}

function previous() {
  if (state.index > 0) goTo(state.index - 1, 'back')
}

/* ------------------------------------------------------------------- Events */

previousButton.addEventListener('click', previous)
nextButton.addEventListener('click', next)
overviewButton.addEventListener('click', () => toggleOverview())

overview.addEventListener('click', (event) => {
  const thumb = event.target.closest('[data-slide]')
  if (!thumb) return
  toggleOverview(false)
  goTo(Number(thumb.dataset.slide), 'fwd')
})

deckEl.addEventListener('click', (event) => {
  if (event.target.closest('button, a')) return
  next()
})

window.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') {
    event.preventDefault()
    next()
  } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
    event.preventDefault()
    previous()
  } else if (event.key === 'Home') {
    event.preventDefault()
    goTo(0, 'back')
  } else if (event.key === 'End') {
    event.preventDefault()
    goTo(slides.length - 1, 'fwd')
  } else if (event.key.toLowerCase() === 'o') {
    event.preventDefault()
    toggleOverview()
  } else if (event.key === 'Escape') {
    toggleOverview(false)
  }
})

window.addEventListener('hashchange', () => {
  parseHash()
  commit('fwd')
})

window.addEventListener('resize', fit)
window.addEventListener('orientationchange', fit)
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(fit)
}

/* --------------------------------------------------------------------- Boot */

if (slideTotalEl) slideTotalEl.textContent = pad2(slides.length)
fit()
buildOverview()
parseHash()
commit('fwd')
