import { execSync } from "node:child_process"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"
import pkg from "./package.json" with { type: "json" }
import { cssStylesheetPlugin } from "./plugins/css-stylesheet-plugin.ts"
import { htmlTemplatePlugin } from "./plugins/html-template-plugin.ts"

const workspaceRoot = fileURLToPath(new URL(".", import.meta.url))
let gitVersionResult = execSync("git rev-parse --short HEAD").toString().trim()

function createTemplatePlugins({ minify }: { minify: boolean }) {
	return [cssStylesheetPlugin({ minify }), htmlTemplatePlugin({ minify })]
}

export default defineConfig(({ command }) => {
	const plugins = [...createTemplatePlugins({ minify: true })]

	const define = {
		"import.meta.env.VITE_LIB_VERSION": JSON.stringify(pkg.version),
		"import.meta.env.VITE_LIB_NAME": JSON.stringify(pkg.name),
		"import.meta.env.VITE_GIT_COMMIT_HASH": JSON.stringify(gitVersionResult),
		"import.meta.env.VITE_LIB_HOMEPAGE": JSON.stringify(pkg.homepage),
	}

	if (command !== "build") {
		return {
			plugins,
			define,
			resolve: {
				alias: {
					"@quentinroy/word-cloud": resolve(workspaceRoot, "lib/word-cloud.ts"),
				},
			},
		}
	}

	return {
		plugins,
		define,
		build: {
			lib: {
				entry: resolve(workspaceRoot, "lib/word-cloud.ts"),
				formats: ["es"],
				fileName: "word-cloud",
			},
			sourcemap: true,
			rollupOptions: {
				external: ["@quentinroy/custom-element-mixins", "matter-js"],
			},
		},
	}
})
