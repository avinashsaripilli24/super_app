/**
 * On-screen keyboard support for phones (Android Chrome first).
 *
 * `interactive-widget=resizes-content` (index.html) already shrinks the layout
 * above the keyboard, so bottom sheets sit on top of it with their footer
 * (Save) pinned. This adds what CSS can't do, for every form at once:
 *  - `<html data-keyboard="open">` while the keyboard is up, driving the
 *    `keyboard-open:` variant (tab bar and floating + hide);
 *  - scrolls the focused field into view once the layout has shrunk;
 *  - Enter moves to the next field of a form and submits from the last one,
 *    with the keyboard's action key labelled to match (Next / Done / Search).
 * Touch devices only: desktop Enter-to-submit stays as it was.
 */

type TextField = HTMLInputElement | HTMLTextAreaElement

/** Input types that never open the keyboard. */
const NON_TEXT_TYPES = new Set([
  'button',
  'checkbox',
  'color',
  'date',
  'datetime-local',
  'file',
  'hidden',
  'image',
  'month',
  'radio',
  'range',
  'reset',
  'submit',
  'time',
  'week',
])

/** How far the viewport must shrink below its full height to count as a keyboard. */
const KEYBOARD_MIN_PX = 150

const touch = typeof window !== 'undefined' ? window.matchMedia('(pointer: coarse)') : null

function isTextField(el: EventTarget | null): el is TextField {
  if (el instanceof HTMLTextAreaElement) return true
  return el instanceof HTMLInputElement && !NON_TEXT_TYPES.has(el.type)
}

/** Fields Enter can move to: search boxes (list filters, pickers) handle Enter themselves. */
function isChainField(el: Element): el is TextField {
  return (
    isTextField(el) && el.type !== 'search' && !el.disabled && !el.readOnly && el.getClientRects().length > 0
  )
}

function nextField(el: TextField): TextField | null {
  if (!el.form) return null
  const fields = Array.from(el.form.elements).filter(isChainField)
  const i = fields.indexOf(el)
  return i === -1 ? null : (fields[i + 1] ?? null)
}

/** Label the keyboard's action key. Leaves hints set explicitly in markup alone. */
function applyEnterKeyHint(el: TextField) {
  if (el.hasAttribute('enterkeyhint') && !el.hasAttribute('data-auto-enterkeyhint')) return
  let hint: string
  if (el.type === 'search') hint = 'search'
  else if (el.form && !(el instanceof HTMLTextAreaElement)) hint = nextField(el) ? 'next' : 'done'
  else return
  el.enterKeyHint = hint
  el.setAttribute('data-auto-enterkeyhint', '')
}

/** Centre the field in whatever scrolls it (sheet body, page) after layout settles. */
function reveal(el: Element) {
  requestAnimationFrame(() => {
    if (document.activeElement === el) el.scrollIntoView({ block: 'center', inline: 'nearest' })
  })
}

function scrollParent(el: Element): Element | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const { overflowY } = getComputedStyle(p)
    if (overflowY === 'auto' || overflowY === 'scroll') return p
  }
  return null
}

// The container keeps shrinking for a moment after the viewport does (e.g. a
// sheet settling on its keyboard-open max height), so re-centre the field on
// every size change of its scroll container while the keyboard is up.
let watched: Element | null = null
const containerObserver =
  typeof ResizeObserver === 'undefined'
    ? null
    : new ResizeObserver(() => {
        if (keyboardOpen && document.activeElement) reveal(document.activeElement)
      })

function watchContainer(field: Element | null) {
  const next = keyboardOpen && field ? scrollParent(field) : null
  if (next === watched) return
  if (watched) containerObserver?.unobserve(watched)
  watched = next
  if (watched) containerObserver?.observe(watched)
}

// Tallest viewport seen at the current width = keyboard closed.
let baseline = 0
let baselineWidth = 0
let lastHeight = 0
let keyboardOpen = false

function viewportHeight() {
  const vv = window.visualViewport
  // × scale keeps pinch-zoom from looking like a keyboard.
  return vv ? vv.height * vv.scale : window.innerHeight
}

function update() {
  const width = window.innerWidth
  if (width !== baselineWidth) {
    baselineWidth = width
    baseline = 0
  }
  const height = viewportHeight()
  baseline = Math.max(baseline, height)
  const active = document.activeElement
  // Both checks: Android's back button hides the keyboard without blurring.
  const open = touch?.matches === true && isTextField(active) && baseline - height > KEYBOARD_MIN_PX
  if (open !== keyboardOpen) {
    keyboardOpen = open
    if (open) document.documentElement.dataset.keyboard = 'open'
    else delete document.documentElement.dataset.keyboard
  }
  if (open && active && height !== lastHeight) reveal(active)
  lastHeight = height
  watchContainer(open ? active : null)
}

let frame = 0
function scheduleUpdate() {
  if (!frame)
    frame = requestAnimationFrame(() => {
      frame = 0
      update()
    })
}

function onKeyDown(e: KeyboardEvent) {
  if (!touch?.matches) return
  if (e.key !== 'Enter' || e.defaultPrevented || e.isComposing) return
  if (e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return
  const el = e.target
  if (!(el instanceof HTMLInputElement) || !isTextField(el)) return
  if (el.type === 'search') {
    // List filters are live; Enter just puts the keyboard away. Pickers inside
    // forms own their Enter (and have already prevented it).
    if (!el.form) el.blur()
    return
  }
  const next = nextField(el)
  if (!next) return // last field: native implicit submit
  e.preventDefault()
  applyEnterKeyHint(next)
  next.focus()
}

function onFocusIn(e: FocusEvent) {
  if (!isTextField(e.target)) return
  applyEnterKeyHint(e.target)
  if (keyboardOpen) {
    reveal(e.target)
    watchContainer(e.target)
  }
  scheduleUpdate()
}

/** Set the hint before the keyboard opens for a tapped field. */
function onPointerDown(e: PointerEvent) {
  if (isTextField(e.target)) applyEnterKeyHint(e.target)
}

let installed = false

export function installKeyboardSupport() {
  if (installed || typeof window === 'undefined') return
  installed = true
  document.addEventListener('keydown', onKeyDown)
  document.addEventListener('focusin', onFocusIn, true)
  document.addEventListener('focusout', scheduleUpdate, true)
  document.addEventListener('pointerdown', onPointerDown, true)
  window.visualViewport?.addEventListener('resize', scheduleUpdate)
  window.addEventListener('resize', scheduleUpdate)
  update()
}
