import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"

const workspaceRoot = fileURLToPath(new URL(".", import.meta.url))

function normalizeBasePath(basePath) {
	if (!basePath || basePath === "/") {
		return "/"
	}
	return `/${basePath.replace(/^\/+|\/+$/g, "")}/`
}

export default defineConfig(({ command, mode }) => {
	if (command !== "build") {
		return {}
	}

	if (mode === "demo") {
		return {
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