import { readFile } from "node:fs/promises"
import { relative } from "node:path"
import cssnano from "cssnano"
import preset from "cssnano-preset-default"
import postcss from "postcss"
import type { HmrContext, Plugin } from "vite"
import {
	getFilePathFromVirtualId,
	getSourceFilePath,
	hasQueryFlag,
	toVirtualId,
} from "./utils"

interface CssStylesheetPluginOptions {
	templateModulePath: string
	minify?: boolean
}

const minifier = postcss([cssnano({ preset })])
const VIRTUAL_PREFIX = "stylesheet:"

function normalizeMapPath(path: string): string {
	const rel = relative(process.cwd(), path)
	const normalized = (rel.startsWith("..") ? path : rel).replaceAll("\\", "/")
	return normalized.startsWith("/") ? normalized : `/${normalized}`
}

function toVirtualStylesheetId(filePath: string): string {
	return toVirtualId(filePath, VIRTUAL_PREFIX)
}

function getFilePathFromStylesheetId(id: string): string | null {
	return getFilePathFromVirtualId(id, VIRTUAL_PREFIX)
}

function createModuleSourceMap({
	id,
	filePath,
	sourceContent,
}: {
	id: string
	filePath: string
	sourceContent: string
}) {
	return JSON.stringify({
		version: 3,
		file: id,
		sources: [normalizeMapPath(filePath)],
		sourcesContent: [sourceContent],
		names: [],
		// Line 1 (import) unmapped, line 2 (export) mapped to CSS line 1.
		mappings: ";AAAA",
	})
}

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
			return toVirtualStylesheetId(getSourceFilePath(resolved.id))
		},
		async load(id: string) {
			const filePath = getFilePathFromStylesheetId(id)
			if (filePath == null) return null
			this.addWatchFile(filePath)

			const sourceContent = await readFile(filePath, "utf-8")
			let content = sourceContent
			if (minify) {
				let result = await minifier.process(content, {
					from: filePath,
					map: false,
				})
				content = result.css
			}

			return {
				code: [
					`import { createCssStylesheet } from ${JSON.stringify(templateModulePath)};`,
					`export default createCssStylesheet(${JSON.stringify(content)});`,
				].join("\n"),
				map: createModuleSourceMap({ id, filePath, sourceContent }),
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
