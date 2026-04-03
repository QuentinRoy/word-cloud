import { readFile } from "node:fs/promises"
import type { HmrContext, Plugin } from "vite"
import {
	getFilePathFromVirtualId,
	getSourceFilePath,
	hasQueryFlag,
	toVirtualId,
} from "./utils"

function minifyCSS(css: string): string {
	return (
		css
			// Remove comments
			.replace(/\/\*[\s\S]*?\*\//g, "")
			// Remove leading/trailing whitespace
			.trim()
			// Replace multiple whitespaces with single space
			.replace(/\s+/g, " ")
			// Remove spaces around special characters
			.replace(/\s*([{};:,>+~])\s*/g, "$1")
			// Remove trailing semicolons before closing braces
			.replace(/;}/g, "}")
	)
}

interface CssStylesheetPluginOptions {
	templateModulePath: string
	minify?: boolean
}

const VIRTUAL_PREFIX = "\0word-cloud-stylesheet:"

/**
 * Converts `*.css?stylesheet` imports into modules exporting a constructed
 * stylesheet via `createCssStylesheet(content)`.
 */
export function cssStylesheetPlugin({
	templateModulePath,
	minify,
}: CssStylesheetPluginOptions): Plugin {
	return {
		name: "word-cloud-stylesheet-loader",
		enforce: "pre",
		async resolveId(source, importer) {
			if (!hasQueryFlag(source, "stylesheet")) return null
			const filePath = getSourceFilePath(source)
			const resolved = await this.resolve(filePath, importer, {
				skipSelf: true,
			})
			if (resolved == null) return null
			return toVirtualId(getSourceFilePath(resolved.id), VIRTUAL_PREFIX)
		},
		async load(id: string) {
			const filePath = getFilePathFromVirtualId(id, VIRTUAL_PREFIX)
			if (filePath == null) return null
			this.addWatchFile(filePath)

			let content = await readFile(filePath, "utf-8")
			if (minify) {
				content = minifyCSS(content)
			}

			return {
				code: [
					`import { createCssStylesheet } from ${JSON.stringify(templateModulePath)};`,
					`export default createCssStylesheet(${JSON.stringify(content)});`,
				].join("\n"),
				map: null,
			}
		},
		handleHotUpdate(context: HmrContext) {
			if (!context.file.endsWith(".css")) return
			const modules = context.server.moduleGraph.getModulesByFile(context.file)
			if (modules == null) return

			const hotModules = []
			for (const module of modules) {
				if (module.id == null || !module.id.startsWith(VIRTUAL_PREFIX)) continue
				context.server.moduleGraph.invalidateModule(module)
				hotModules.push(module)
			}

			return hotModules.length > 0 ? hotModules : undefined
		},
	}
}
