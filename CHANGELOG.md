# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## 1.0.1 - 2026-09-04

### Changed

- README: the demo animation and badges, so the package page on npm shows what the controller does.

## 1.0.0 - 2026-09-04

### Added

- Initial release.
- `launch` action: a copy of the most visible image target lifts off, arcs across the viewport and shrinks into the cart icon; the icon bumps and the cart's number counts up by the form's quantity at the top of the bounce.
- `holdStream` action: Turbo Streams aimed at the element holding the cart icon wait until the last copy has landed and the clicking has stopped, then only the newest one renders.
- An optional progress hairline under the cart icon that fills from the click to the end of the burst.
- `cart-flight:start`, `cart-flight:hit` and `cart-flight:land` events on `window`.
- Honours `prefers-reduced-motion`.
