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
