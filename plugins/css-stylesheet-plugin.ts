import { readFile } from "node:fs/promises"
import CleanCSS from "clean-css"

const cleanCSS = new CleanCSS({ compatibility: "*" })

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
				let minifyResult = await cleanCSS.minify(content)
				content = minifyResult.styles
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
