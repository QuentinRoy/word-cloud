import { readFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import * as v from "valibot"

export const workspaceRoot = resolve(
	fileURLToPath(new URL("..", import.meta.url)),
)
export const distDir = join(workspaceRoot, "dist")
export const distDemoDir = join(workspaceRoot, "dist-demo")

const packageJsonPath = join(workspaceRoot, "package.json")

export const packageJsonSchema = v.object({
	name: v.string(),
	version: v.string(),
	homepage: v.optional(v.string()),
	dependencies: v.optional(v.record(v.string(), v.string())),
	devDependencies: v.optional(v.record(v.string(), v.string())),
})
export type PackageJson = v.InferOutput<typeof packageJsonSchema>

export async function getPackageJson(): Promise<PackageJson> {
	return v.parse(
		packageJsonSchema,
		JSON.parse(await readFile(packageJsonPath, "utf8")),
	)
}
