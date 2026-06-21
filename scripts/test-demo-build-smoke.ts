import { existsSync, readFileSync } from "node:fs"
import { createServer } from "node:http"
import { extname, join, normalize, sep } from "node:path"
import { chromium } from "playwright"
import { distDemoDir } from "./utils.ts"

function fail(message: string): never {
	console.error(`[test:demo-smoke] ${message}`)
	process.exit(1)
}

const mimeByExtension: Record<string, string> = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".svg": "image/svg+xml",
	".json": "application/json; charset=utf-8",
	".map": "application/json; charset=utf-8",
}

function isWithin(root: string, path: string): boolean {
	const normalizedRoot = `${normalize(root)}${root.endsWith(sep) ? "" : sep}`
	const normalizedPath = normalize(path)
	return normalizedPath.startsWith(normalizedRoot)
}

const requiredFiles = ["index.html", "main.js"]

for (const file of requiredFiles) {
	const path = join(distDemoDir, file)
	if (!existsSync(path)) {
		fail(`missing required artifact: dist-demo/${file}`)
	}
}

const server = createServer((request, response) => {
	const requestPath = request.url?.split("?")[0] ?? "/"
	const relativePath = requestPath === "/" ? "index.html" : requestPath.slice(1)
	const filePath = join(distDemoDir, relativePath)

	if (!isWithin(distDemoDir, filePath) || !existsSync(filePath)) {
		response.statusCode = 404
		response.end("Not found")
		return
	}

	const extension = extname(filePath)
	response.setHeader(
		"Content-Type",
		mimeByExtension[extension] ?? "application/octet-stream",
	)
	response.end(readFileSync(filePath))
})

await new Promise<void>((resolveListen) => {
	server.listen(0, "127.0.0.1", () => resolveListen())
})

const address = server.address()
if (address == null || typeof address === "string") {
	fail("could not start local dist-demo server")
}

const url = `http://127.0.0.1:${address.port}/`
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()

const requestFailures: string[] = []
const localHttpErrors: string[] = []
const pageErrors: string[] = []

page.on("requestfailed", (request) => {
	if (request.url().startsWith("data:")) return
	const reason = request.failure()?.errorText ?? "unknown reason"
	requestFailures.push(`${request.method()} ${request.url()} (${reason})`)
})

page.on("response", (response) => {
	if (!response.url().startsWith(url)) return
	if (response.status() >= 400) {
		localHttpErrors.push(
			`${response.status()} ${response.request().method()} ${response.url()}`,
		)
	}
})

page.on("pageerror", (error) => {
	pageErrors.push(error.message)
})

await page.goto(url, { waitUntil: "networkidle" })

if (requestFailures.length > 0) {
	await browser.close()
	server.close()
	fail(`network request failures:\n${requestFailures.join("\n")}`)
}

if (localHttpErrors.length > 0) {
	await browser.close()
	server.close()
	fail(`local HTTP errors:\n${localHttpErrors.join("\n")}`)
}

if (pageErrors.length > 0) {
	await browser.close()
	server.close()
	fail(`page errors:\n${pageErrors.join("\n")}`)
}

const initial = await page.evaluate(() => {
	const cloud = document.querySelector("x-word-cloud") as {
		hasAttribute: (name: string) => boolean
		wordInput?: boolean
		getWords?: () => Iterable<unknown>
		add?: (
			word: { word: string; x: number; y: number },
			defaults?: { entryAnimation?: string },
		) => unknown
	} | null
	if (cloud == null) {
		return { hasCloud: false, hasWordInputEnabled: false, beforeCount: 0 }
	}

	const hasWordInputEnabled =
		cloud.wordInput === true || cloud.hasAttribute("word-input")
	const beforeCount = Array.from(cloud.getWords?.() ?? []).length
	cloud.add?.({ word: "Smoke", x: 160, y: 120 }, { entryAnimation: "none" })
	return { hasCloud: true, hasWordInputEnabled, beforeCount }
})

if (!initial.hasCloud) {
	await browser.close()
	server.close()
	fail("demo page did not render x-word-cloud")
}

if (!initial.hasWordInputEnabled) {
	await browser.close()
	server.close()
	fail("word-cloud input mode is not enabled")
}

const targetCount = Math.max(initial.beforeCount + 1, 1)
try {
	await page.waitForFunction((expected) => {
		const cloud = document.querySelector("x-word-cloud") as {
			getWords?: () => Iterable<unknown>
		} | null
		if (cloud == null) return false
		return Array.from(cloud.getWords?.() ?? []).length >= expected
	}, targetCount)
} catch {
	const diagnostics = await page.evaluate(() => {
		const cloud = document.querySelector("x-word-cloud") as {
			getWords?: () => Iterable<unknown>
			add?: unknown
		} | null
		return {
			hasCloud: cloud != null,
			hasAdd: typeof cloud?.add === "function",
			wordCount: Array.from(cloud?.getWords?.() ?? []).length,
		}
	})
	await browser.close()
	server.close()
	fail(`word render wait timed out: ${JSON.stringify(diagnostics)}`)
}

const renderedWordCount = await page.evaluate(() => {
	const cloud = document.querySelector("x-word-cloud") as {
		getWords?: () => Iterable<unknown>
	} | null
	if (cloud == null) return 0
	return Array.from(cloud.getWords?.() ?? []).length
})

await browser.close()
server.close()

if (renderedWordCount < 1) {
	fail("word-cloud did not render a word after add()")
}

console.log("[test:demo-smoke] demo build smoke checks passed")
