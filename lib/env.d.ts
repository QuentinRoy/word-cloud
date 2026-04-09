/** biome-ignore-all lint/correctness/noUnusedVariables: This is a definition file */

interface ImportMetaEnv {
	readonly VITE_LIB_VERSION: string
}

interface ImportMeta {
	readonly env: ImportMetaEnv
}
