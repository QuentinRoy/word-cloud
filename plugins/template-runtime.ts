/**
 * Runtime payload for the two asset plugins in this directory.
 *
 * These helpers turn raw markup/CSS strings into the `DocumentFragment` and
 * `CSSStyleSheet` objects the custom elements adopt at runtime. Unlike the rest
 * of `plugins/`, this file is NOT build-time plugin logic — it is shipped into
 * the browser bundle. Keep it browser-only: no `node:*` imports here.
 *
 * The imports are synthesized at build time:
 *
 *   - `html-template-plugin.ts` rewrites each `*.html?template` import into
 *     `import { createHtmlTemplate } from "<this file>"`
 *     `export default createHtmlTemplate("<inlined markup>")`.
 *   - `css-stylesheet-plugin.ts` does the same for `*.css?stylesheet` using
 *     `createCssStylesheet`.
 *
 * Both plugins reference this file through the single `TEMPLATE_RUNTIME_PATH`
 * constant in `./utils`, so every generated import resolves to the same module
 * specifier. That shared identity is what guarantees the helpers are bundled
 * once and injected once, no matter how many assets import them — the dedup is a
 * property of the canonical path, not of where this file lives. Inlining the
 * helper bodies per asset instead would defeat that; don't.
 */
export function createHtmlTemplate(content: string) {
	let template = document.createElement("template")
	template.innerHTML = content
	return template.content
}

export function createCssStylesheet(content: string) {
	const stylesheet = new CSSStyleSheet()
	stylesheet.replaceSync(content)
	return stylesheet
}
