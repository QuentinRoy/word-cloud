import { readFileSync } from "node:fs"
import { join } from "node:path"
import * as v from "valibot"
import { getPackageJson, workspaceRoot } from "./utils.ts"

const importMapSchema = v.object({ imports: v.record(v.string(), v.string()) })
type ImportMap = v.InferOutput<typeof importMapSchema>

interface DependencySpec {
	specifier: string
	npmName: string
	version: string
}

const distIndexPath = join(workspaceRoot, "dist-demo", "index.html")
const demoTemplatePath = join(workspaceRoot, "demo", "index.dist.html")

function fail(message: string): never {
	console.error(`[verify:demo] ${message}`)
	process.exit(1)
}

function toPinnedVersion(range: string): string {
	let value = range.trim()
	while (value.startsWith("^") || value.startsWith("~")) {
		value = value.slice(1)
	}
	return value
}

function parseDependencySpec(name: string, spec: string): DependencySpec {
	if (spec.startsWith("npm:")) {
		const npmSpec = spec.slice(4)
		const atIndex = npmSpec.lastIndexOf("@")
		if (atIndex <= 0) {
			throw new Error(`Invalid npm alias dependency for ${name}: ${spec}`)
		}
		return {
			specifier: name,
			npmName: npmSpec.slice(0, atIndex),
			version: toPinnedVersion(npmSpec.slice(atIndex + 1)),
		}
	}

	return { specifier: name, npmName: name, version: toPinnedVersion(spec) }
}

function parseInlineImportMap(html: string, label: string): ImportMap {
	const inlineImportMapMatch = html.match(
		/<script\s+type="importmap">\s*([\s\S]*?)\s*<\/script>/,
	)
	if (inlineImportMapMatch == null) {
		fail(`${label} must include an inline import map`)
	}

	try {
		return v.parse(importMapSchema, JSON.parse(inlineImportMapMatch[1]))
	} catch {
		fail(`${label} contains invalid inline import map JSON`)
	}
}

function parseEsmShTarget(
	target: string,
): { npmName: string; version: string } | null {
	const match = target.match(/^https:\/\/esm\.sh\/(.+)@([^/?#]+)/)
	if (match == null) return null
	return { npmName: match[1], version: match[2] }
}

function verifyImportMapVersions(
	label: string,
	imports: Record<string, string>,
	depSpecs: Record<string, string>,
) {
	for (const [specifier, target] of Object.entries(imports)) {
		const esm = parseEsmShTarget(target)
		if (esm == null) continue

		const spec = depSpecs[specifier]
		if (typeof spec !== "string") {
			fail(
				`${label}: import-map entry "${specifier}" is versioned via esm.sh but has no matching package.json dependency`,
			)
		}

		const dep = parseDependencySpec(specifier, spec)
		if (dep.npmName !== esm.npmName) {
			fail(
				`${label}: import-map entry "${specifier}" targets "${esm.npmName}" but package.json resolves to "${dep.npmName}"`,
			)
		}
		if (dep.version !== esm.version) {
			fail(
				`${label}: import-map entry "${specifier}" uses version "${esm.version}" but package.json pins "${dep.version}"`,
			)
		}
	}
}

const packageJson = await getPackageJson()
const depSpecs = {
	...(packageJson.dependencies ?? {}),
	...(packageJson.devDependencies ?? {}),
}

const demoTemplateHtml = readFileSync(demoTemplatePath, "utf8")
const distIndexHtml = readFileSync(distIndexPath, "utf8")
const demoTemplateMap = parseInlineImportMap(
	demoTemplateHtml,
	"demo/index.dist.html",
)
const distMap = parseInlineImportMap(distIndexHtml, "dist-demo/index.html")

verifyImportMapVersions(
	"demo/index.dist.html",
	demoTemplateMap.imports ?? {},
	depSpecs,
)
verifyImportMapVersions("dist-demo/index.html", distMap.imports ?? {}, depSpecs)

if (/%(?:VITE|DEMO)_[A-Z_]+%/.test(distIndexHtml)) {
	fail("dist-demo/index.html still contains unresolved metadata placeholders")
}

console.log("[verify:demo] dist-demo artifact contract passed")
