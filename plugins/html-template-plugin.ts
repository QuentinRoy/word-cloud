import { readFile } from "node:fs/promises"
import { relative } from "node:path"
import { minify as minifyHtml } from "html-minifier-terser"
import type { HmrContext, Plugin } from "vite"
import {
	getFilePathFromVirtualId,
	getSourceFilePath,
	hasQueryFlag,
	toVirtualId,
} from "./utils"

interface HTMLTemplatePluginOptions {
	templateModulePath: string
	minify?: boolean
}

const VIRTUAL_PREFIX = "template:"

function normalizeMapPath(path: string): string {
	const rel = relative(process.cwd(), path)
	const normalized = (rel.startsWith("..") ? path : rel).replaceAll("\\", "/")
	return normalized.startsWith("/") ? normalized : `/${normalized}`
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
		// Line 1 (import) unmapped, line 2 (export) mapped to HTML line 1.
		mappings: ";AAAA",
	})
}

/**
 * Converts `*.html?template` imports into modules exporting a cloneable
 * fragment via `createHtmlTemplate(content)`.
 */
export function htmlTemplatePlugin({
	templateModulePath,
	minify,
}: HTMLTemplatePluginOptions): Plugin {
	return {
		name: "word-cloud-template-loader",
		enforce: "pre",
		async resolveId(source, importer) {
			if (!hasQueryFlag(source, "template")) return null
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

			const sourceContent = await readFile(filePath, "utf-8")
			let content = sourceContent
			if (minify) {
				try {
					content = await minifyHtml(content, {
						collapseWhitespace: true,
						conservativeCollapse: true,
						removeComments: true,
						keepClosingSlash: true,
						caseSensitive: true,
						removeAttributeQuotes: false,
						minifyCSS: false,
						minifyJS: false,
					})
				} catch {
					// Preserve original markup if minification fails.
				}
			}

			return {
				code: [
					`import { createHtmlTemplate } from ${JSON.stringify(templateModulePath)};`,
					`export default createHtmlTemplate(${JSON.stringify(content)});`,
				].join("\n"),
				map: createModuleSourceMap({ id, filePath, sourceContent }),
			}
		},
		handleHotUpdate(context: HmrContext) {
			if (!context.file.endsWith(".html")) return
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
