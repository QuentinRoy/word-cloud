import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { playwright } from "@vitest/browser-playwright"
import { defineConfig } from "vitest/config"
import type { BrowserCommand } from "vitest/node"
import { cssStylesheetPlugin } from "./plugins/css-stylesheet-plugin.ts"
import { htmlTemplatePlugin } from "./plugins/html-template-plugin.ts"

const workspaceRoot = fileURLToPath(new URL(".", import.meta.url))
const templateModulePath = resolve(workspaceRoot, "lib/template.ts")

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
	plugins: [
		cssStylesheetPlugin({ templateModulePath, minify: false }),
		htmlTemplatePlugin({ templateModulePath, minify: false }),
	],
	test: {
		include: ["tests/**/*.browser.test.ts"],
		browser: {
			enabled: true,
			provider: playwright(),
			headless: true,
			instances: [{ browser: "chromium" }],
			commands: { resetMouse },
		},
	},
})
