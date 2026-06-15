import { playwright } from "@vitest/browser-playwright"
import { defineConfig } from "vitest/config"
import type { BrowserCommand } from "vitest/node"
import { cssStylesheetPlugin } from "./plugins/css-stylesheet-plugin.ts"
import { htmlTemplatePlugin } from "./plugins/html-template-plugin.ts"

/**
 * Moves the Playwright cursor to (0, 0) so CSS :hover is cleared between
 * tests. CSS hover state is driven by the real cursor and cannot be reset
 * with synthetic DOM events.
 */
const resetMouse: BrowserCommand<[]> = async (ctx) => {
	if (ctx.provider.name === "playwright") {
		await (
			ctx as unknown as {
				page: { mouse: { move(x: number, y: number): Promise<void> } }
			}
		).page.mouse.move(0, 0)
	}
}

export default defineConfig({
	test: {
		projects: [
			{
				// DOM-free code — the pure physics helpers today, the extracted
				// simulation modules tomorrow — runs here against a real Matter
				// engine, with no browser and no shadow DOM. See ADR-0001.
				test: {
					name: "node",
					environment: "node",
					include: ["tests/**/*.node.test.ts"],
				},
			},
			{
				// The custom element and its DOM/measurement integration need a real
				// browser; Playwright/Chromium drives these.
				plugins: [
					cssStylesheetPlugin({ minify: false }),
					htmlTemplatePlugin({ minify: false }),
				],
				test: {
					name: "browser",
					include: ["tests/**/*.browser.test.ts"],
					browser: {
						enabled: true,
						provider: playwright(),
						headless: true,
						instances: [{ browser: "chromium" }],
						commands: { resetMouse },
					},
				},
			},
		],
	},
})
