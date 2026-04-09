/**
 * Modules loaded as `CSSStyleSheet` by css-stylesheet-plugin.
 */
declare module "*.css?stylesheet" {
	const stylesheet: CSSStyleSheet
	export default stylesheet
}

/**
 * Modules loaded as `DocumentFragment` by html-template-plugin.
 */
declare module "*.html?template" {
	const template: DocumentFragment
	export default template
}
