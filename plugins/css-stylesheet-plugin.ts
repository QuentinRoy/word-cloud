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
const VIRTUAL_PREFIX = "/@id/stylesheet:"

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

function toSourceMapString(
	rawMap: ReturnType<NonNullable<postcss.LazyResult["map"]>["toJSON"]>,
) {
	const sources = rawMap.sources.map(normalizeMapPath)
	return JSON.stringify({
		version: Number(rawMap.version) || 3,
		file: rawMap.file,
		sources,
		sourcesContent: null,
		names: rawMap.names,
		mappings: rawMap.mappings,
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

			let content = await readFile(filePath, "utf-8")
			let map = null
			if (minify) {
				let result = await minifier.process(content, {
					from: filePath,
					map: { inline: false, annotation: false, sourcesContent: false },
				})
				content = result.css
				map = result.map == null ? null : toSourceMapString(result.map.toJSON())
			}

			return {
				code: [
					`import { createCssStylesheet } from ${JSON.stringify(templateModulePath)};`,
					`export default createCssStylesheet(${JSON.stringify(content)});`,
				].join("\n"),
				map,
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
