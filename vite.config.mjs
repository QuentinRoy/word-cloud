import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"
import { cssStylesheetPlugin } from "./plugins/css-stylesheet-plugin.ts"
import { htmlTemplatePlugin } from "./plugins/html-template-plugin.ts"

const workspaceRoot = fileURLToPath(new URL(".", import.meta.url))
const templateModulePath = resolve(workspaceRoot, "src/template.ts")

function normalizeBasePath(basePath) {
	if (!basePath || basePath === "/") {
		return "/"
	}
	return `/${basePath.replace(/^\/+|\/+$/g, "")}/`
}

function createTemplatePlugins({ minify }) {
	return [
		cssStylesheetPlugin({ templateModulePath, minify }),
		htmlTemplatePlugin({ templateModulePath, minify }),
	]
}

export default defineConfig(({ command, mode }) => {
	const plugins = createTemplatePlugins({ minify: true })

	if (command !== "build") {
		return { plugins }
	}

	if (mode === "demo") {
		return {
			plugins,
			base: normalizeBasePath(process.env.PAGES_BASE_PATH),
			build: {
				outDir: "dist-demo",
				rollupOptions: {
					input: resolve(workspaceRoot, "index.html"),
				},
			},
		}
	}

	return {
		plugins,
		build: {
			lib: {
				entry: resolve(workspaceRoot, "src/index.ts"),
				formats: ["es"],
				fileName: "index",
			},
			sourcemap: true,
			rollupOptions: {
				external: ["@quentinroy/custom-element-mixins", "matter-js"],
			},
		},
	}
})
