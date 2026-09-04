import { Controller } from "@hotwired/stimulus"

// A burst of adds is one thing however many cards started it, so what is in
// the air, what the cart's number is heading to and which streams are
// waiting is shared by every instance on the page.
const state = {
  airborne: 0,
  launchedAt: 0,
  wait: 0,
  progress: "",
  ticking: false,
  settleTimer: undefined as ReturnType<typeof setTimeout> | undefined,
  held: [] as Array<(render: boolean) => void>,
  heading: null as number | null,
}

const FLYING = "data-cart-flight"
const HELD = "data-cart-flight-held"
const BOUNCE = 350
const PEAK = 0.4

interface Rect {
  left: number
  top: number
  width: number
  height: number
}

export default class CartFlight extends Controller {
  static targets = ["image"]

  static values = {
    landing: { type: String, default: "[data-cart-flight-landing]" },
    count: { type: String, default: "[data-cart-flight-count]" },
    progress: { type: String, default: "[data-cart-flight-progress]" },
    quantity: { type: String, default: "[name='quantity']" },
    liftDuration: { type: Number, default: 250 },
    liftHeight: { type: Number, default: 24 },
    travelDuration: { type: Number, default: 650 },
    arcHeight: { type: Number, default: 120 },
    settleDuration: { type: Number, default: 400 },
    maxSize: { type: Number, default: 180 },
    landingSize: { type: Number, default: 28 },
    rotation: { type: Number, default: 180 },
    maxCount: { type: Number, default: 99 },
    zIndex: { type: Number, default: 50 },
  }

  declare readonly imageTargets: HTMLImageElement[]
  declare readonly hasImageTarget: boolean
  declare landingValue: string
  declare countValue: string
  declare progressValue: string
  declare quantityValue: string
  declare liftDurationValue: number
  declare liftHeightValue: number
  declare travelDurationValue: number
  declare arcHeightValue: number
  declare settleDurationValue: number
  declare maxSizeValue: number
  declare landingSizeValue: number
  declare rotationValue: number
  declare maxCountValue: number
  declare zIndexValue: number

  // From `turbo:submit-start`, `submit` or `click`: the form (or button) the
  // event came from must belong to this instance, which is what lets a
  // product page and the cards nested inside it each fly their own image.
  launch(event: Event): void {
    const origin = event.target as Element | null
    const form = origin?.closest("form") ?? null
    const owner = (form ?? origin)?.closest(`[data-controller~="${this.identifier}"]`)
    if (owner !== this.element) return
    if (this.reducedMotion) return

    const image = this.image
    if (!image || !this.landing) return

    const submitter = this.submitter(event) ?? origin ?? this.element
    const source = this.sourceRect(image, submitter)
    const flyer = this.buildFlyer(image, source)
    const quantity = Number(form?.querySelector<HTMLInputElement>(this.quantityValue)?.value) || 1

    state.airborne += 1
    state.launchedAt = performance.now()
    state.wait = this.liftDurationValue + this.travelDurationValue + this.settleDurationValue
    state.progress = this.progressValue
    this.scheduleSettle()
    document.documentElement.setAttribute(FLYING, "")
    if (!state.ticking) requestAnimationFrame(tick)

    document.body.append(flyer)
    this.dispatch("start", { target: window, prefix: "cart-flight", detail: { quantity } })
    this.lift(flyer, quantity)
  }

  // From `turbo:before-stream-render@document`: a stream aimed at the
  // element holding the cart icon, while copies are in the air, waits for the
  // burst to end — so the number can count up hit by hit and a drawer the
  // stream opens does not cover a landing. Every instance hears the event;
  // the first one holds the stream.
  holdStream(event: Event): void {
    const stream = event.target as Element
    const detail = (event as CustomEvent<{ render?: (element: Element) => unknown }>).detail
    if (!document.documentElement.hasAttribute(FLYING) || stream.hasAttribute(HELD)) return
    if (typeof detail?.render !== "function") return

    const targetId = stream.getAttribute("target") ?? ""
    const landing = this.landing
    if (!landing || !document.getElementById(targetId)?.contains(landing)) return

    stream.setAttribute(HELD, "")
    const render = detail.render
    const released = new Promise<boolean>((release) => state.held.push(release))
    detail.render = async (element: Element) => {
      if (await released) await render(element)
    }
  }

  // Looked up afresh at every step, never kept: a stream may replace the
  // cart between lift-off and landing, and a stale element measures as nothing.
  get landing(): Element | null {
    return document.querySelector(this.landingValue)
  }

  get reducedMotion(): boolean {
    return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  }

  // The image to fly: the target showing the most of itself on screen.
  private get image(): HTMLImageElement | null {
    if (!this.hasImageTarget) return null

    return this.imageTargets
      .map((image) => ({ image, area: visibleArea(image.getBoundingClientRect()) }))
      .sort((a, b) => b.area - a.area)[0].image
  }

  private submitter(event: Event): Element | null {
    const detail = (event as CustomEvent<{ formSubmission?: { submitter?: Element } }>).detail
    return detail?.formSubmission?.submitter ?? (event as SubmitEvent).submitter ?? null
  }

  // Where the copy lifts off: the image while at least half of it is on
  // screen and laid out, otherwise the button that was pressed — a sticky
  // bar's, say, once the gallery has scrolled away.
  private sourceRect(image: HTMLImageElement, fallback: Element): Rect {
    const rect = image.getBoundingClientRect()
    const laidOut = rect.width > 0 && rect.height > 0

    return laidOut && visibleArea(rect) >= (rect.width * rect.height) / 2 ? rect : fallback.getBoundingClientRect()
  }

  // A square copy of the image, centred where the original is and sized to
  // its shorter side, in three nested boxes: the outer one travels on the x
  // axis, the middle one on the y axis (an arc), the inner one spins and
  // shrinks — each with its own easing, which is what makes the path a
  // parabola rather than a line.
  private buildFlyer(image: HTMLImageElement, source: Rect): HTMLElement {
    const size = Math.max(this.landingSizeValue, Math.min(this.maxSizeValue, source.width, source.height))

    const outer = document.createElement("div")
    Object.assign(outer.style, {
      position: "fixed",
      zIndex: String(this.zIndexValue),
      pointerEvents: "none",
      left: `${source.left + source.width / 2 - size / 2}px`,
      top: `${source.top + source.height / 2 - size / 2}px`,
      width: `${size}px`,
      height: `${size}px`,
    })

    const middle = document.createElement("div")
    Object.assign(middle.style, { width: "100%", height: "100%", display: "grid", placeItems: "center" })

    const inner = document.createElement("div")
    Object.assign(inner.style, {
      width: `${size}px`,
      height: `${size}px`,
      overflow: "hidden",
      borderRadius: "12px",
      background: "#fff",
      boxShadow: "0 10px 25px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(0, 0, 0, 0.1)",
    })

    const copy = image.cloneNode(false) as HTMLImageElement
    copy.removeAttribute("id")
    copy.removeAttribute("class")
    copy.removeAttribute("loading")
    copy.removeAttribute(`data-${this.identifier}-target`)
    copy.alt = ""
    Object.assign(copy.style, { width: "100%", height: "100%", objectFit: "cover", display: "block" })

    inner.append(copy)
    middle.append(inner)
    outer.append(middle)
    return outer
  }

  // Two phases. First the copy pops up in place; only then is the cart
  // measured and the travel begun. The pause is what makes the landing
  // accurate: a navbar hidden by scrolling may be sliding back into view
  // right now (see cart-flight:start) and would otherwise be measured mid-slide.
  private lift(flyer: HTMLElement, quantity: number): void {
    const middle = flyer.firstElementChild as HTMLElement
    const inner = middle.firstElementChild as HTMLElement
    const timing = {
      duration: this.liftDurationValue,
      easing: "cubic-bezier(0.2, 0.7, 0.4, 1)",
      fill: "forwards" as const,
    }

    middle.animate([{ translate: "0 0" }, { translate: `0 -${this.liftHeightValue}px` }], timing)
    const pop = inner.animate([{ scale: 1 }, { scale: 1.06 }], timing)

    pop.finished.then(
      () => this.travel(flyer, quantity),
      () => this.land(flyer, quantity),
    )
  }

  private travel(flyer: HTMLElement, quantity: number): void {
    const landing = this.landing
    if (!landing) return this.land(flyer, quantity)

    const middle = flyer.firstElementChild as HTMLElement
    const inner = middle.firstElementChild as HTMLElement
    const from = inner.getBoundingClientRect()
    const to = landing.getBoundingClientRect()
    const fromY = from.top + from.height / 2
    const dx = to.left + to.width / 2 - (from.left + from.width / 2)
    const dy = to.top + to.height / 2 - fromY
    // The arc peaks above the straight line, but never above the viewport:
    // the cart sits in the navbar, so a full lift would leave the screen.
    const arc = Math.min(this.arcHeightValue, Math.max(0, fromY + dy / 2 - this.landingSizeValue))
    const landingScale = this.landingSizeValue / Math.max(inner.offsetWidth, inner.offsetHeight, 1)
    const spin = dx < 0 ? -this.rotationValue : this.rotationValue
    const lift = this.liftHeightValue
    const timing = { duration: this.travelDurationValue, fill: "forwards" as const }

    flyer.animate([{ translate: "0 0" }, { translate: `${dx}px 0` }], {
      ...timing,
      easing: "cubic-bezier(0.45, 0, 0.55, 1)",
    })

    // Up first, then down into the cart: the climb eases out, the drop eases in.
    middle.animate(
      [
        { translate: `0 -${lift}px`, easing: "cubic-bezier(0.2, 0.7, 0.4, 1)" },
        { translate: `0 ${dy / 2 - arc - lift}px`, easing: "cubic-bezier(0.6, 0, 0.8, 0.3)", offset: 0.5 },
        { translate: `0 ${dy - lift}px` },
      ],
      timing,
    )

    const arrival = inner.animate(
      [
        { scale: 1.06, rotate: "0deg", borderRadius: "12px", opacity: 1 },
        { scale: landingScale, rotate: `${spin}deg`, borderRadius: "50%", opacity: 1, offset: 0.85 },
        { scale: landingScale * 0.6, rotate: `${spin}deg`, borderRadius: "50%", opacity: 0 },
      ],
      { ...timing, easing: "cubic-bezier(0.4, 0, 0.6, 1)" },
    )

    arrival.finished.then(
      () => this.land(flyer, quantity),
      () => this.land(flyer, quantity),
    )
  }

  // Also the way out when a flight cannot finish: streams and the number
  // are waiting for the burst to end and must not be left waiting.
  private land(flyer: HTMLElement, quantity: number): void {
    flyer.remove()

    const landing = this.landing
    if (landing) {
      const icon = landing.querySelector("svg, img") ?? landing
      icon.animate([{ scale: 1 }, { scale: 1.3, offset: PEAK }, { scale: 1 }], {
        duration: BOUNCE,
        easing: "cubic-bezier(0.34, 1.56, 0.64, 1)",
      })
      this.countUp(quantity)
      this.dispatch("hit", { target: window, prefix: "cart-flight", detail: { quantity } })
    }

    state.airborne = Math.max(0, state.airborne - 1)
    this.scheduleSettle()
  }

  // The number on the cart, one step up at the top of a bounce. Only what is
  // already a plain number moves (an over-the-limit badge and an absent one
  // wait for the server's re-render). The target is kept in memory rather
  // than read off the page: hits can come faster than the bounce that shows
  // each step, and two of them reading the same old number would lose one.
  private countUp(quantity: number): void {
    const count = document.querySelector<HTMLElement>(this.countValue)
    if (!count) return

    count.animate([{ scale: 1 }, { scale: 1.4, offset: PEAK }, { scale: 1 }], {
      duration: BOUNCE,
      easing: "cubic-bezier(0.34, 1.56, 0.64, 1)",
    })

    const from = state.heading ?? count.textContent?.trim() ?? ""
    if (!/^\d+$/.test(String(from))) return

    state.heading = Number(from) + quantity
    const next = state.heading
    const max = this.maxCountValue
    setTimeout(() => {
      count.textContent = next > max ? `${max}+` : String(next)
    }, BOUNCE * PEAK)
  }

  // Called after every launch and every landing; only the last one, with
  // nothing left in the air, ends the burst.
  private scheduleSettle(): void {
    clearTimeout(state.settleTimer)
    state.settleTimer = setTimeout(settle, this.settleDurationValue)
  }
}

function settle(): void {
  if (state.airborne > 0) return

  document.documentElement.removeAttribute(FLYING)
  state.heading = null
  const last = state.held[state.held.length - 1]
  state.held.splice(0).forEach((release) => release(release === last))
  window.dispatchEvent(new CustomEvent("cart-flight:land"))
}

// The optional hairline under the cart icon: from empty at the click to full
// when the burst ends, restarted by every further click. Looked up on every
// frame because a stream may replace the cart, bar included, meanwhile.
function tick(): void {
  const bar = state.progress ? document.querySelector<HTMLElement>(state.progress) : null
  const flying = document.documentElement.hasAttribute(FLYING)

  if (bar) {
    bar.style.opacity = flying ? "1" : "0"
    bar.style.transform = `scaleX(${flying ? Math.min(1, (performance.now() - state.launchedAt) / state.wait) : 0})`
  }

  state.ticking = flying
  if (flying) requestAnimationFrame(tick)
}

// How much of a rectangle lies inside the viewport, in square pixels.
function visibleArea({ left, top, right, bottom }: DOMRect): number {
  const width = Math.min(right, window.innerWidth) - Math.max(left, 0)
  const height = Math.min(bottom, window.innerHeight) - Math.max(top, 0)
  return width > 0 && height > 0 ? width * height : 0
}
