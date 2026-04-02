import { readFile } from "node:fs/promises"

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

/**
 * Converts `*.css?stylesheet` imports into modules exporting a constructed
 * stylesheet via `createCssStylesheet(content)`.
 */
export function cssStylesheetPlugin({
	templateModulePath,
	minify,
}: CssStylesheetPluginOptions) {
	return {
		name: "word-cloud-stylesheet-loader",
		enforce: "post",
		async transform(_code: string, id: string) {
			if (!id.endsWith(".css?stylesheet")) return null
			const filePath = id.replace(/\?.*$/, "")

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
	}
}
