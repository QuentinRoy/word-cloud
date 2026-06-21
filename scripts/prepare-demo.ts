import { execSync } from "node:child_process"
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { extname, join } from "node:path"
import {
	distDemoDir,
	distDir,
	getPackageJson,
	type PackageJson,
	workspaceRoot,
} from "./utils.ts"

const demoDir = join(workspaceRoot, "demo")
const indexTemplatePath = join(demoDir, "demo.html")

const builtLibraryPath = join(distDir, "word-cloud.js")
const builtLibraryMapPath = join(distDir, "word-cloud.js.map")

function getGitCommitHash(): string {
	try {
		return execSync("git rev-parse --short HEAD", {
			cwd: workspaceRoot,
			encoding: "utf8",
		}).trim()
	} catch {
		return "unknown"
	}
}

function stampDemoIndex(template: string, packageJson: PackageJson): string {
	const replacements: Record<string, string> = {
		"%DEMO_LIB_NAME%": packageJson.name,
		"%DEMO_LIB_VERSION%": packageJson.version,
		"%DEMO_LIB_HOMEPAGE%": packageJson.homepage ?? "",
		"%DEMO_GIT_COMMIT_HASH%": getGitCommitHash(),
	}

	let html = template
	for (const [token, value] of Object.entries(replacements)) {
		html = html.replaceAll(token, value)
	}

	return html
}

function shouldCopyDemoFile(source: string): boolean {
	const extension = extname(source)

	// Keep directories so `cpSync` can traverse them.
	if (!extension) {
		return true
	}

	return extension !== ".html" && extension !== ".ts"
}

const packageJson = await getPackageJson()
const template = readFileSync(indexTemplatePath, "utf8")

mkdirSync(distDemoDir, { recursive: true })

cpSync(demoDir, distDemoDir, { recursive: true, filter: shouldCopyDemoFile })

cpSync(builtLibraryPath, join(distDemoDir, "word-cloud.js"))
cpSync(builtLibraryMapPath, join(distDemoDir, "word-cloud.js.map"))

writeFileSync(
	join(distDemoDir, "index.html"),
	stampDemoIndex(template, packageJson),
	"utf8",
)
