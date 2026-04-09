export function html(...args: Parameters<typeof String.raw>) {
	const content = String.raw(...args)
	return createHtmlTemplate(content)
}

export function createHtmlTemplate(content: string) {
	let template = document.createElement("template")
	template.innerHTML = content
	return template.content
}

export function css(...args: Parameters<typeof String.raw>) {
	const content = String.raw(...args)
	return createCssStylesheet(content)
}

export function createCssStylesheet(content: string) {
	const stylesheet = new CSSStyleSheet()
	stylesheet.replaceSync(content)
	return stylesheet
}
