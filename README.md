# Stimulus Cart Flight

[![npm](https://img.shields.io/npm/v/stimulus-cart-flight?color=%23e9573f)](https://www.npmjs.com/package/stimulus-cart-flight)
[![Downloads](https://img.shields.io/npm/dm/stimulus-cart-flight)](https://www.npmjs.com/package/stimulus-cart-flight)
[![CI](https://github.com/Xeross99/stimulus-cart-flight/actions/workflows/ci.yml/badge.svg)](https://github.com/Xeross99/stimulus-cart-flight/actions/workflows/ci.yml)
[![MIT](https://img.shields.io/badge/licence-MIT-blue)](LICENSE)

**Add to cart, and the product flies there.**

![The product's picture flying into the cart, the number counting up as each copy lands](https://raw.githubusercontent.com/Xeross99/stimulus-cart-flight/main/docs/demo.gif)

A [Stimulus](https://stimulus.hotwired.dev/) controller for shops: when a product is added, a copy of its picture lifts off, arcs across the viewport and shrinks into the cart icon in your navbar. The icon bumps as it lands and the number next to it counts up on impact. If the response is a Turbo Stream that re-renders the cart — the new total, a drawer sliding open — the stream waits until the flight has landed, so five quick adds are five landings, five steps of the number and one drawer at the end.

No dependencies beyond Stimulus. Pure Web Animations API, no CSS to ship, about 4 kB gzipped.

## Installation

```bash
npm install stimulus-cart-flight
```

With importmap-rails:

```bash
bin/importmap pin stimulus-cart-flight
```

Register the controller:

```js
// app/javascript/controllers/index.js
import { application } from "controllers/application"
import CartFlight from "stimulus-cart-flight"

application.register("cart-flight", CartFlight)
```

## Usage

Mark the cart icon in your navbar with `data-cart-flight-landing` and its number with `data-cart-flight-count`. Put the controller on the smallest element holding both the add-to-cart form and the product's picture — a card, or a product page's content column — and let it listen for the form's submission:

```erb
<header>
  <a href="/cart" data-cart-flight-landing>
    <svg><!-- the cart icon --></svg>
    <span data-cart-flight-count><%= current_cart.count %></span>
  </a>
</header>

<div data-controller="cart-flight" data-action="turbo:submit-start->cart-flight#launch">
  <%= image_tag product.image, data: { cart_flight_target: "image" } %>

  <%= form_with url: line_items_path(product_id: product.id) do |form| %>
    <%= form.number_field :quantity, value: 1 %>
    <%= form.submit "Add to cart" %>
  <% end %>
</div>
```

On submit a square copy of the picture lifts off, arcs across the viewport, shrinks into the cart icon and disappears; the icon bumps and the number next to it goes up by the form's quantity at the top of the bounce.

Without Turbo, listen for `submit` or `click` instead; anything whose target sits inside the controller's element (a form or a button) will do.

The copy lifts off from the image while at least half of it is on screen, otherwise from the button that was pressed — a sticky bar's, say, once the gallery has scrolled away. With several image targets (a gallery), the one showing the most of itself flies.

### With Turbo Streams

If your add-to-cart response re-renders the cart with a Turbo Stream, add the `holdStream` action too:

```erb
<div
  data-controller="cart-flight"
  data-action="turbo:submit-start->cart-flight#launch turbo:before-stream-render@document->cart-flight#holdStream"
>
```

A stream aimed at the element holding the cart icon (its `target` is an id that contains the landing) then waits until the last copy has landed and the clicking has stopped. Only the newest stream renders — the server's total, the drawer — so a burst of adds ends with one drawer opening after the flight, instead of a drawer opening over the first landing. Streams aimed anywhere else are not touched.

### A progress hairline

Optionally, a thin element under the cart icon fills from the click until the burst ends. The controller drives its `transform` (`scaleX`) and `opacity`; give it a size, a colour and `transform-origin: left`:

```html
<a href="/cart" style="position: relative" data-cart-flight-landing>
  ...
  <i
    style="position: absolute; left: 0; right: 0; bottom: -4px; height: 2px; transform-origin: left; opacity: 0"
    data-cart-flight-progress
  ></i>
</a>
```

### A navbar that hides on scroll

The flight is measured after a short pop in place, not at the click, so a navbar sliding back into view has time to arrive. Listen for `cart-flight:start` to bring it back:

```erb
<nav data-controller="navbar" data-action="scroll@window->navbar#handleScroll cart-flight:start@window->navbar#appear">
```

### Nested cards

A product page listing related products inside it can carry the controller on the page and on every card: the closest controller to the form that was submitted flies its own image, and targets do not leak across the boundary.

## Configuration

| Attribute                                | Default                       | Description                                                         |
| ---------------------------------------- | ----------------------------- | ------------------------------------------------------------------- |
| `data-cart-flight-landing-value`         | `[data-cart-flight-landing]`  | Selector of the cart icon the copy flies to.                        |
| `data-cart-flight-count-value`           | `[data-cart-flight-count]`    | Selector of the number that counts up on impact.                    |
| `data-cart-flight-progress-value`        | `[data-cart-flight-progress]` | Selector of the progress hairline.                                  |
| `data-cart-flight-quantity-value`        | `[name='quantity']`           | Selector of the form field holding how much one add stands for.     |
| `data-cart-flight-lift-duration-value`   | `250`                         | The pop in place before the travel, in milliseconds.                |
| `data-cart-flight-lift-height-value`     | `24`                          | How far the copy pops up, in pixels.                                |
| `data-cart-flight-travel-duration-value` | `650`                         | The flight to the cart, in milliseconds.                            |
| `data-cart-flight-arc-height-value`      | `120`                         | How far above the straight line the path arcs, in pixels.           |
| `data-cart-flight-settle-duration-value` | `400`                         | Quiet time after the last landing before the burst ends.            |
| `data-cart-flight-max-size-value`        | `180`                         | The largest copy, in pixels.                                        |
| `data-cart-flight-landing-size-value`    | `28`                          | The size the copy shrinks to at the cart, in pixels.                |
| `data-cart-flight-rotation-value`        | `180`                         | Degrees the copy spins on the way, towards the direction of travel. |
| `data-cart-flight-max-count-value`       | `99`                          | The number stops at this and shows it with a `+`.                   |
| `data-cart-flight-z-index-value`         | `50`                          | The copy's `z-index`.                                               |

## Events

All three are dispatched on `window`.

| Event               | Detail         | When                                                                     |
| ------------------- | -------------- | ------------------------------------------------------------------------ |
| `cart-flight:start` | `{ quantity }` | A copy has lifted off.                                                   |
| `cart-flight:hit`   | `{ quantity }` | A copy has struck the cart icon.                                         |
| `cart-flight:land`  |                | The last copy has landed and the clicking has stopped; held streams run. |

While anything is in the air the `<html>` element carries `data-cart-flight`.

The controller honours `prefers-reduced-motion`: with it set nothing flies and nothing is held.

## Extending

```js
import CartFlight from "stimulus-cart-flight"

export default class extends CartFlight {
  launch(event) {
    // Only forms that add to the cart, say.
    if (!event.target.action.includes("line_items")) return

    super.launch(event)
  }
}
```

## Development

```bash
npm install
npm run dev     # the demo page at http://localhost:5173
npm test        # Vitest, jsdom
npm run lint    # tsc + prettier
npm run build   # dist/
```

## License

[MIT](LICENSE)
