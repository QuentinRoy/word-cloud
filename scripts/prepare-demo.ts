import { execSync } from "node:child_process"
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import {
	distDemoDir,
	distDir,
	getPackageJson,
	type PackageJson,
	workspaceRoot,
} from "./utils.ts"

const distDemoAssetsDir = join(distDemoDir, "assets")

const indexTemplatePath = join(workspaceRoot, "demo", "index.dist.html")
const demoCssPath = join(workspaceRoot, "demo", "main.css")
const demoFaviconPath = join(workspaceRoot, "demo", "favicon.svg")
const demoGithubLogoPath = join(workspaceRoot, "demo", "github.svg")
const builtLibraryPath = join(distDir, "word-cloud.js")
const builtLibraryMapPath = join(distDir, "word-cloud.js.map")

const outputIndexPath = join(distDemoDir, "index.html")
const outputDemoCssPath = join(distDemoAssetsDir, "main.css")
const outputFaviconPath = join(distDemoAssetsDir, "favicon.svg")
const outputGithubLogoPath = join(distDemoAssetsDir, "github.svg")
const outputLibraryPath = join(distDemoAssetsDir, "word-cloud.js")
const outputLibraryMapPath = join(distDemoAssetsDir, "word-cloud.js.map")

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

const packageJson = await getPackageJson()
const template = readFileSync(indexTemplatePath, "utf8")
const stampedIndex = stampDemoIndex(template, packageJson)

mkdirSync(distDemoAssetsDir, { recursive: true })

cpSync(demoCssPath, outputDemoCssPath)
cpSync(demoFaviconPath, outputFaviconPath)
cpSync(demoGithubLogoPath, outputGithubLogoPath)
cpSync(builtLibraryPath, outputLibraryPath)
cpSync(builtLibraryMapPath, outputLibraryMapPath)

writeFileSync(outputIndexPath, stampedIndex, "utf8")
