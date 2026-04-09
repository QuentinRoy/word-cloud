import { relative } from "node:path"

export function hasQueryFlag(id: string, flag: string): boolean {
	const [, query] = id.split("?", 2)
	if (query == null) return false
	return new URLSearchParams(query).has(flag)
}

export function getSourceFilePath(id: string): string {
	return id.split("?", 1)[0]
}

export function toVirtualId(filePath: string, virtualPrefix: string): string {
	return `${virtualPrefix}${Buffer.from(filePath, "utf-8").toString("base64url")}`
}

export function getFilePathFromVirtualId(
	id: string,
	virtualPrefix: string,
): string | null {
	if (!id.startsWith(virtualPrefix)) return null
	const encodedPath = id.slice(virtualPrefix.length)
	return Buffer.from(encodedPath, "base64url").toString("utf-8")
}

export function normalizeMapPath(path: string): string {
	const rel = relative(process.cwd(), path)
	const originalPath = rel.startsWith("..") ? path : rel
	const normalized = originalPath.replaceAll("\\", "/")
	const isWindowsAbsolute =
		/^[A-Za-z]:\//.test(normalized) || normalized.startsWith("//")
	return normalized.startsWith("/") || isWindowsAbsolute
		? normalized
		: `/${normalized}`
}

export function createModuleSourceMap({
	id,
	filePath,
	sourceContent,
}: {
	id: string
	filePath: string
	sourceContent: string
}) {
	return JSON.stringify({
		version: 3,
		file: id,
		sources: [normalizeMapPath(filePath)],
		sourcesContent: [sourceContent],
		names: [],
		// Line 1 (import) unmapped, line 2 (export) mapped to CSS line 1.
		mappings: ";AAAA",
	})
}
