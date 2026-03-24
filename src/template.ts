export function html(...args: Parameters<typeof String.raw>) {
	let html = String.raw(...args)
	let template = document.createElement("template")
	template.innerHTML = html
	return template.content
}

export function css(...args: Parameters<typeof String.raw>) {
	let css = String.raw(...args)
	const stylesheet = new CSSStyleSheet()
	stylesheet.replaceSync(css)
	return stylesheet
}
