/**
 * @vitest-environment jsdom
 */

import { beforeEach, afterEach, describe, it, expect, vi } from "vitest"
import { Application } from "@hotwired/stimulus"
import CartFlight from "../src/index"

let application: Application
let events: string[] = []

// Registered once: the controller talks to the page through window events.
for (const name of ["cart-flight:start", "cart-flight:hit", "cart-flight:land"]) {
  window.addEventListener(name, () => events.push(name))
}

const FLYER = "body > div[style*='position: fixed']"

const startStimulus = (): void => {
  application = Application.start()
  application.register("cart-flight", CartFlight)
}

// jsdom has neither the Web Animations API nor layout. Every animation
// finishes at once, so a flight runs through lift, travel and landing as
// soon as the microtask queue drains; rectangles are all zero, which sends
// the copy off from the button instead of the (never visible) image.
const stubAnimations = (): void => {
  Element.prototype.animate = vi.fn(() => ({ finished: Promise.resolve(), cancel: vi.fn() })) as never
  vi.stubGlobal("requestAnimationFrame", vi.fn())
}

const flush = async (): Promise<void> => {
  await vi.advanceTimersByTimeAsync(0)
}

const settle = async (): Promise<void> => {
  await vi.advanceTimersByTimeAsync(2000)
}

const render = (markup: string): void => {
  document.body.innerHTML = markup
}

const page = (quantity = ""): string => `
  <turbo-frame id="cart">
    <a data-cart-flight-landing><svg></svg><span data-cart-flight-count>3</span></a>
    <i data-cart-flight-progress></i>
  </turbo-frame>

  <div id="card" data-controller="cart-flight" data-action="submit->cart-flight#launch turbo:before-stream-render@document->cart-flight#holdStream">
    <img id="picture" src="track.jpg" data-cart-flight-target="image" />
    <form id="form" action="/line_items" method="post">
      ${quantity}
      <button id="add" type="submit">Add to cart</button>
    </form>
  </div>
`

const add = (): void => {
  document
    .querySelector<HTMLFormElement>("#form")
    .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
}

const count = (): string => document.querySelector("[data-cart-flight-count]").textContent

// A burst is shared state inside the module, so every test ends its own
// before the next begins.
afterEach(async (): Promise<void> => {
  await settle()
  application.stop()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

beforeEach((): void => {
  vi.useFakeTimers()
  stubAnimations()
  startStimulus()
  events = []
})

describe("#launch", () => {
  beforeEach(async (): Promise<void> => {
    render(page())
    await flush()
  })

  it("sends a copy of the image flying and marks the document", async (): Promise<void> => {
    add()

    const flyer = document.querySelector<HTMLElement>(FLYER)
    expect(flyer).not.toBeNull()
    expect(flyer.querySelector("img").getAttribute("src")).toBe("track.jpg")
    expect(flyer.querySelector("img").hasAttribute("data-cart-flight-target")).toBe(false)
    expect(document.documentElement.hasAttribute("data-cart-flight")).toBe(true)
    expect(events).toEqual(["cart-flight:start"])
  })

  it("lands on the cart: the copy is gone, the icon bumps and the number counts up", async (): Promise<void> => {
    add()
    await flush()

    expect(document.querySelector(FLYER)).toBeNull()
    expect(events).toEqual(["cart-flight:start", "cart-flight:hit"])
    expect(document.querySelector("[data-cart-flight-landing] svg").animate).toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(200)
    expect(count()).toBe("4")
  })

  it("ends the burst once the clicking has stopped", async (): Promise<void> => {
    add()
    await flush()
    expect(document.documentElement.hasAttribute("data-cart-flight")).toBe(true)

    await settle()
    expect(document.documentElement.hasAttribute("data-cart-flight")).toBe(false)
    expect(events.at(-1)).toBe("cart-flight:land")
  })

  it("counts a burst up one hit at a time, however fast the hits come", async (): Promise<void> => {
    add()
    add()
    add()
    await flush()
    await vi.advanceTimersByTimeAsync(200)

    expect(count()).toBe("6")
    expect(events.filter((name) => name === "cart-flight:hit")).toHaveLength(3)
  })

  it("does nothing under prefers-reduced-motion", async (): Promise<void> => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true })),
    )

    add()

    expect(document.querySelector(FLYER)).toBeNull()
    expect(events).toEqual([])
  })

  it("does nothing without a cart to land on", async (): Promise<void> => {
    document.querySelector("[data-cart-flight-landing]").remove()

    add()

    expect(document.querySelector(FLYER)).toBeNull()
  })
})

describe("the quantity", () => {
  it("is read from the form and counted at the top of the bounce", async (): Promise<void> => {
    render(page('<input name="quantity" value="4" />'))
    await flush()

    add()
    await flush()
    expect(count()).toBe("3")

    await vi.advanceTimersByTimeAsync(200)
    expect(count()).toBe("7")
  })

  it("stops at the badge's limit", async (): Promise<void> => {
    render(page('<input name="quantity" value="200" />'))
    await flush()

    add()
    await vi.advanceTimersByTimeAsync(200)

    expect(count()).toBe("99+")
  })

  it("leaves a badge that is not a plain number alone", async (): Promise<void> => {
    render(page())
    document.querySelector("[data-cart-flight-count]").textContent = "99+"
    await flush()

    add()
    await vi.advanceTimersByTimeAsync(200)

    expect(count()).toBe("99+")
  })
})

describe("nested controllers", () => {
  it("fly the image of the card the form belongs to", async (): Promise<void> => {
    render(`
      <a data-cart-flight-landing></a>
      <div data-controller="cart-flight" data-action="submit->cart-flight#launch">
        <img src="page.jpg" data-cart-flight-target="image" />
        <div data-controller="cart-flight" data-action="submit->cart-flight#launch">
          <img src="card.jpg" data-cart-flight-target="image" />
          <form id="form" action="/line_items" method="post"><button type="submit">Add</button></form>
        </div>
      </div>
    `)
    await flush()

    add()

    expect(document.querySelectorAll(FLYER)).toHaveLength(1)
    expect(document.querySelector<HTMLImageElement>(`${FLYER} img`).getAttribute("src")).toBe("card.jpg")
  })
})

describe("#holdStream", () => {
  const stream = (
    target: string,
  ): { element: Element; render: ReturnType<typeof vi.fn>; detail: { render: (element: Element) => unknown } } => {
    const element = document.createElement("turbo-stream")
    element.setAttribute("action", "replace")
    element.setAttribute("target", target)
    document.body.append(element)
    const render = vi.fn()
    const detail = { render }
    element.dispatchEvent(new CustomEvent("turbo:before-stream-render", { bubbles: true, cancelable: true, detail }))
    return { element, render, detail }
  }

  beforeEach(async (): Promise<void> => {
    render(page())
    await flush()
  })

  it("holds a stream aimed at the cart until the burst ends, then renders the newest one", async (): Promise<void> => {
    add()
    const first = stream("cart")
    const second = stream("cart")

    const firstRender = first.detail.render(first.element)
    const secondRender = second.detail.render(second.element)
    await flush()
    expect(first.render).not.toHaveBeenCalled()
    expect(second.render).not.toHaveBeenCalled()

    await settle()
    await Promise.all([firstRender, secondRender])
    expect(first.render).not.toHaveBeenCalled()
    expect(second.render).toHaveBeenCalledWith(second.element)
  })

  it("lets a stream aimed elsewhere through at once", async (): Promise<void> => {
    add()
    const elsewhere = stream("flash")

    expect(elsewhere.element.hasAttribute("data-cart-flight-held")).toBe(false)
    expect(elsewhere.detail.render).toBe(elsewhere.render)
  })

  it("lets a cart stream through when nothing is in the air", async (): Promise<void> => {
    const idle = stream("cart")

    expect(idle.element.hasAttribute("data-cart-flight-held")).toBe(false)
  })
})

describe("the progress hairline", () => {
  it("is driven while something is in the air and switched off afterwards", async (): Promise<void> => {
    render(page())
    await flush()
    const raf = vi.mocked(requestAnimationFrame)

    add()
    expect(raf).toHaveBeenCalledTimes(1)
    raf.mock.calls[0][0](0)

    const bar = document.querySelector<HTMLElement>("[data-cart-flight-progress]")
    expect(bar.style.opacity).toBe("1")
    expect(bar.style.transform).toMatch(/^scaleX\(/)

    await flush()
    await settle()
    raf.mock.calls.at(-1)[0](0)
    expect(bar.style.opacity).toBe("0")
  })
})
