import { readFile } from "node:fs/promises"
import { minify as minifyHtml } from "html-minifier-terser"

interface HTMLTemplatePluginOptions {
	templateModulePath: string
	minify?: boolean
}

/**
 * Converts `*.html?template` imports into modules exporting a cloneable
 * fragment via `createHtmlTemplate(content)`.
 */
export function htmlTemplatePlugin({
	templateModulePath,
	minify,
}: HTMLTemplatePluginOptions) {
	return {
		name: "word-cloud-template-loader",
		enforce: "post",
		async transform(_code: string, id: string) {
			if (!id.endsWith(".html?template")) return null
			const filePath = id.replace(/\?.*$/, "")

			let content = await readFile(filePath, "utf-8")
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
				map: null,
			}
		},
	}
}
