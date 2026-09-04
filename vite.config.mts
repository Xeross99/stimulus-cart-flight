import { resolve } from "path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  esbuild: {
    minifyIdentifiers: false,
  },
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "StimulusCartFlight",
      fileName: "stimulus-cart-flight",
    },
    rollupOptions: {
      external: ["@hotwired/stimulus"],
      output: {
        globals: {
          "@hotwired/stimulus": "Stimulus",
        },
      },
    },
  },
  test: {
    // The spec drives a Stimulus Application against a real DOM.
    environment: "jsdom",
  },
})
