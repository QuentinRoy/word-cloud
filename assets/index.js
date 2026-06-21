import { WithAttributeProps as e, boolean as t, number as n, pickList as r, string as i } from "@quentinroy/custom-element-mixins";
import a from "matter-js";
//#region lib/events.ts
var o = class extends Event {
	#e;
	constructor({ type: e, handle: t }, n) {
		super(e, {
			bubbles: !0,
			composed: !0,
			...n
		}), this.#e = t;
	}
	get handle() {
		return this.#e;
	}
}, s = class e extends o {
	static get type() {
		return "word-add";
	}
	constructor({ handle: t }) {
		super({
			type: e.type,
			handle: t
		});
	}
}, c = class e extends o {
	#e;
	static get type() {
		return "word-check";
	}
	constructor({ handle: t, checked: n }) {
		super({
			type: e.type,
			handle: t
		}), this.#e = n;
	}
	get checked() {
		return this.#e;
	}
}, l = class e extends o {
	#e;
	#t;
	static get type() {
		return "word-change";
	}
	constructor({ handle: t, value: n, oldValue: r }) {
		super({
			type: e.type,
			handle: t
		}), this.#e = n, this.#t = r;
	}
	get value() {
		return this.#e;
	}
	get oldValue() {
		return this.#t;
	}
}, u = class e extends o {
	static get type() {
		return "word-delete";
	}
	constructor({ handle: t }) {
		super({
			type: e.type,
			handle: t
		});
	}
}, d = class e extends Event {
	#e;
	#t;
	static get type() {
		return "word-action-change";
	}
	constructor({ wordAction: t, oldWordAction: n }) {
		super(e.type, {
			bubbles: !0,
			composed: !0
		}), this.#e = t, this.#t = n;
	}
	get wordAction() {
		return this.#e;
	}
	get oldWordAction() {
		return this.#t;
	}
}, f = class e extends Event {
	#e;
	#t;
	static get type() {
		return "word-input-toggle";
	}
	constructor({ wordInput: t, oldWordInput: n }) {
		super(e.type, {
			bubbles: !0,
			composed: !0
		}), this.#e = t, this.#t = n;
	}
	get wordInput() {
		return this.#e;
	}
	get oldWordInput() {
		return this.#t;
	}
}, p = class e extends Event {
	#e;
	#t;
	static get type() {
		return "physics-pause";
	}
	constructor({ physicsPaused: t, oldPhysicsPaused: n }) {
		super(e.type, {
			bubbles: !0,
			composed: !0
		}), this.#e = t, this.#t = n;
	}
	get physicsPaused() {
		return this.#e;
	}
	get oldPhysicsPaused() {
		return this.#t;
	}
}, m = 50, h = class {
	#e;
	#t;
	#n = null;
	#r = [];
	#i = !1;
	constructor(e, t) {
		this.#e = e, this.#t = t, e.addEventListener("pointerdown", this.#a);
	}
	get enabled() {
		return this.#i;
	}
	set enabled(e) {
		this.#i !== e && (this.#i = e, e || this.#d());
	}
	#a = (e) => {
		if (!this.#i || this.#n != null || e.button !== 0) return;
		let t = this.#t.resolveWord(e.clientX, e.clientY);
		if (t == null) return;
		e.preventDefault();
		let n = this.#t.toContainerPoint(e.clientX, e.clientY);
		this.#n = {
			word: t,
			pointerId: e.pointerId
		}, this.#r = [{
			x: n.x,
			y: n.y,
			t: e.timeStamp
		}];
		try {
			this.#e.setPointerCapture(e.pointerId);
		} catch {}
		this.#e.addEventListener("pointermove", this.#o), this.#e.addEventListener("pointerup", this.#s), this.#e.addEventListener("pointercancel", this.#c), this.#t.onGrab(t, n);
	};
	#o = (e) => {
		let t = this.#n;
		if (t == null || e.pointerId !== t.pointerId) return;
		let n = this.#t.toContainerPoint(e.clientX, e.clientY);
		this.#l({
			x: n.x,
			y: n.y,
			t: e.timeStamp
		}), this.#t.onMove(t.word, n);
	};
	#s = (e) => {
		let t = this.#n;
		if (t == null || e.pointerId !== t.pointerId) return;
		let n = this.#t.toContainerPoint(e.clientX, e.clientY);
		this.#l({
			x: n.x,
			y: n.y,
			t: e.timeStamp
		});
		let r = this.#u();
		this.#f(t.pointerId), this.#t.onRelease(t.word, r);
	};
	#c = (e) => {
		this.#n == null || e.pointerId !== this.#n.pointerId || this.#d();
	};
	#l(e) {
		this.#r.push(e);
		let t = e.t - m;
		for (; this.#r.length > 1 && this.#r[0].t < t;) this.#r.shift();
	}
	#u() {
		let e = this.#r;
		if (e.length < 2) return {
			x: 0,
			y: 0
		};
		let t = e[e.length - 1], n = e[0], r = t.t - n.t;
		return r <= 0 ? {
			x: 0,
			y: 0
		} : {
			x: (t.x - n.x) / r,
			y: (t.y - n.y) / r
		};
	}
	#d() {
		let e = this.#n;
		e != null && (this.#f(e.pointerId), this.#t.onRelease(e.word, {
			x: 0,
			y: 0
		}));
	}
	#f(e) {
		this.#n = null, this.#r = [];
		try {
			this.#e.releasePointerCapture(e);
		} catch {}
		this.#e.removeEventListener("pointermove", this.#o), this.#e.removeEventListener("pointerup", this.#s), this.#e.removeEventListener("pointercancel", this.#c);
	}
};
function g({ dragLocked: e, ignoresInput: t }) {
	return e ? 0 : t ? 9 : 11;
}
//#endregion
//#region lib/utils.ts
function _(e, t, n) {
	let r = e.querySelector(t);
	if (r instanceof n) return r;
	throw Error(`Expected ${t} to be an instance of ${n.name}`);
}
function v(e, t) {
	let n = 10 ** Math.floor(t);
	return Math.round(e * n) / n;
}
function y() {
	return Date.now().toString(36) + Math.random().toString(36).substring(2);
}
function b(e) {
	return e %= 2 * Math.PI, e < -Math.PI ? e += 2 * Math.PI : e > Math.PI && (e -= 2 * Math.PI), e;
}
function ee(e) {
	return typeof e?.[Symbol.iterator] == "function";
}
//#endregion
//#region lib/physics-utils.ts
function te({ margin: e, gap: t }) {
	return e <= 0 || t >= e ? null : Math.min(1, (e - t) / e);
}
function x({ body: e, bodySize: t, restAngle: n, restAngleEpsilon: r, springTorqueStiffness: i, dampingCoefficient: o, springWidthReference: s }) {
	if (e.isStatic || e.isSleeping) return;
	let c = b(e.angle) - n;
	if (Math.abs(c) <= r) return;
	let l = (-c * i - e.angularVelocity * o) * (t.width / s) ** 2, u = Math.min(t.width, t.height) * .25;
	if (u <= 0) return;
	let d = l / (2 * u), f = a.Vector.rotate(a.Vector.create(1, 0), e.angle), p = a.Vector.add(e.position, a.Vector.mult(f, u)), m = a.Vector.add(e.position, a.Vector.mult(f, -u)), h = a.Vector.mult(a.Vector.perp(f), d);
	a.Body.applyForce(e, p, h), a.Body.applyForce(e, m, a.Vector.neg(h));
}
var S = 3e-4, C = class {
	#e;
	#t;
	#n = /* @__PURE__ */ new Map();
	#r = /* @__PURE__ */ new Map();
	#i = /* @__PURE__ */ new Set();
	#a = 5;
	#o = 5;
	#s = 5;
	#c = 5;
	constructor(e, { inputVolumeBody: t }) {
		this.#e = e, this.#t = t, a.Events.on(e, "collisionStart", this.#p), a.Events.on(e, "collisionEnd", this.#m);
	}
	addWord(e, { width: t, height: n, isRepellable: r, ignoresInputVolume: i }) {
		let o = {
			width: t,
			height: n
		}, s = this.#l(o), c = a.Bodies.rectangle(e.position.x, e.position.y, s.width, s.height, {
			angle: e.angle,
			isSensor: !0,
			sleepThreshold: Infinity,
			collisionFilter: {
				category: 4,
				mask: 14
			}
		}), l = {
			body: e,
			bodySize: o,
			sensorBody: c,
			sensorSize: s,
			isRepellable: r,
			ignoresInputVolume: i
		};
		this.#n.set(e.id, l), this.#r.set(c.id, l), a.Composite.add(this.#e.world, c);
	}
	setWordSize(e, { width: t, height: n }) {
		let r = this.#n.get(e);
		r != null && (r.bodySize = {
			width: t,
			height: n
		}, this.#u(r));
	}
	removeWord(e) {
		let t = this.#n.get(e);
		if (t != null) {
			this.#r.delete(t.sensorBody.id), this.#n.delete(e);
			for (let e of this.#i) (e.bodyA === t.sensorBody || e.bodyB === t.sensorBody) && this.#i.delete(e);
			a.Composite.remove(this.#e.world, t.sensorBody);
		}
	}
	setSpacing({ word: e, edge: t, input: n }) {
		this.#o = e, this.#s = t, this.#c = n;
		let r = Math.max(e, t, n, 0);
		if (r !== this.#a) {
			this.#a = r;
			for (let e of this.#n.values()) this.#u(e);
		}
	}
	applyForces() {
		this.#d();
		for (let e of this.#i) {
			if (!e.isActive) continue;
			let t = this.#r.get(e.bodyA.id), n = this.#r.get(e.bodyB.id);
			if (t != null && n != null) {
				this.#f(e, {
					margin: this.#o,
					inflation: 2 * this.#a,
					wordA: t,
					wordB: n
				});
				continue;
			}
			let r = t ?? n;
			if (r == null) continue;
			let i = (t == null ? e.bodyA : e.bodyB) === this.#t;
			i && r.ignoresInputVolume() || this.#f(e, {
				margin: i ? this.#c : this.#s,
				inflation: this.#a,
				wordA: t == null ? null : r,
				wordB: n == null ? null : r
			});
		}
	}
	dispose() {
		a.Events.off(this.#e, "collisionStart", this.#p), a.Events.off(this.#e, "collisionEnd", this.#m);
	}
	#l({ width: e, height: t }) {
		let n = this.#a;
		return {
			width: e + 2 * n,
			height: t + 2 * n
		};
	}
	#u(e) {
		let t = this.#l(e.bodySize), { width: n, height: r } = e.sensorSize;
		t.width === n && t.height === r || (a.Body.scale(e.sensorBody, t.width / n, t.height / r), e.sensorSize = t);
	}
	#d() {
		for (let e of this.#n.values()) {
			let { body: t, sensorBody: n } = e;
			t.isSleeping || (a.Body.setPosition(n, t.position), a.Body.setAngle(n, t.angle));
		}
	}
	#f(e, { margin: t, inflation: n, wordA: r, wordB: i }) {
		if (r != null && !r.isRepellable() || i != null && !i.isRepellable()) return;
		let o = e.collision, s = te({
			margin: t,
			gap: n - o.depth
		});
		if (s == null) return;
		let c = o.normal.x, l = o.normal.y, u = e.bodyB.position.x - e.bodyA.position.x, d = e.bodyB.position.y - e.bodyA.position.y;
		c * u + l * d < 0 && (c = -c, l = -l);
		let f = s * S, p = c * f, m = l * f;
		r != null && a.Body.applyForce(r.body, r.body.position, {
			x: -p,
			y: -m
		}), i != null && a.Body.applyForce(i.body, i.body.position, {
			x: p,
			y: m
		});
	}
	#p = (e) => {
		for (let t of e.pairs) t.isSensor && this.#i.add(t);
	};
	#m = (e) => {
		for (let t of e.pairs) t.isSensor && this.#i.delete(t);
	};
};
//#endregion
//#region plugins/template-runtime.ts
function w(e) {
	let t = document.createElement("template");
	return t.innerHTML = e, t.content;
}
function T(e) {
	let t = new CSSStyleSheet();
	return t.replaceSync(e), t;
}
//#endregion
//#region stylesheet:L2hvbWUvcnVubmVyL3dvcmsvd29yZC1jbG91ZC93b3JkLWNsb3VkL2xpYi93b3JkLWVsZW1lbnQuY3Nz
var E = T("*{margin:0}*,input{padding:0}input{position:absolute;top:50%;left:50%;z-index:-1000;width:1px;height:1px;margin:-1px;overflow:hidden;border:0;clip:rect(0 0 0 0)}label{position:relative;display:block;padding:var(--word-padding-y) var(--word-padding-x);font-family:var(--font-family);font-size:var(--font-size);color:var(--word-text-color);text-align:center;cursor:inherit;background-color:var(--word-background-color);border:var(--line-width) solid var(--word-border-color);border-radius:var(--chamfer-radius,0);opacity:var(--opacity,1);filter:drop-shadow(0 0 0 transparent);transition:all var(--word-state-transition-duration,0s) ease-out,transform var(--word-grabbed-scaling-duration,0s) ease-out,filter var(--word-state-transition-duration,0s) ease-out;animation:none}label:before{position:absolute;top:50%;right:var(--word-padding-x);left:var(--word-padding-x);height:var(--line-width);pointer-events:none;content:\"\";background-color:currentColor;transform:translateY(-50%) scaleX(0);transform-origin:left center;transition:transform var(--word-state-transition-duration,0s) ease-out}input:focus-visible~label{outline:var(--word-focus-outline-width) solid var(--word-focus-outline-color);outline-offset:var(--word-focus-outline-offset)}:host(:state(entering)){animation:word-fade-in var(--word-fade-in-duration,0s) ease}:host(:state(chip-entering)) label{animation:chip-fade var(--word-chip-fade-duration,0s)}:host([action=check]){label{cursor:pointer}input:focus-visible~label,label:hover{color:var(--word-checked-hover-text-color);transition:all ease-out var(--word-state-transition-duration,0s),color 0s}}:host([action=delete]){label{cursor:pointer}}:host(:state(exiting)){opacity:0}:host([deleted]){display:none;opacity:0}:host(:state(exiting)) label,:host([action=delete]) input:focus-visible~label,:host([action=delete]) label:hover,:host([deleted]) label{color:var(--word-delete-hover-text-color);background-color:var(--word-delete-hover-background-color);border-color:var(--word-delete-hover-background-color);transition:all ease-out var(--word-state-transition-duration,0s)}:host([action=delete]) label:hover{transition:all ease-out var(--word-state-transition-duration,0s),color 0s}:host([checked]){label{color:var(--word-checked-text-color);background-color:var(--word-checked-background-color);border-color:var(--word-checked-background-color);transition:all ease-out var(--word-state-transition-duration,0s)}label:before{transform:translateY(-50%) scaleX(1);transform-origin:left center}}:host([grabbed]) label{color:var(--word-grabbed-text-color);background-color:var(--word-grabbed-background-color);border-color:var(--word-grabbed-border-color);filter:drop-shadow(0 0 var(--word-grabbed-shadow-blur,0) var(--word-grabbed-shadow-color,transparent));transform:scale(var(--word-grabbed-scale-factor,1));transition-timing-function:ease-out}:host{display:block;width:fit-content;height:fit-content;opacity:1;transition:opacity var(--word-fade-out-duration,0s) ease,display var(--word-fade-out-duration,0s) ease;transition-behavior:allow-discrete}@keyframes word-fade-in{0%{opacity:0}to{opacity:1}}@keyframes chip-fade{0%{background-color:transparent;border-color:transparent;color:var(--input-focus-color)}to{background-color:var(--word-background-color);border-color:var(--word-border-color);color:var(--word-text-color)}}"), D = w("<input type=\"checkbox\" part=\"checked-checkbox\" name=\"checked\"> <input type=\"checkbox\" part=\"deleted-checkbox\" name=\"deleted\"> <label></label> "), O = class e extends Event {
	static get type() {
		return "word-element-checked-change";
	}
	#e;
	constructor({ checked: t }) {
		super(e.type, {
			bubbles: !1,
			composed: !1
		}), this.#e = t;
	}
	get checked() {
		return this.#e;
	}
}, k = class e extends Event {
	static get type() {
		return "word-element-value-change";
	}
	#e;
	#t;
	constructor({ value: t, oldValue: n }) {
		super(e.type, {
			bubbles: !1,
			composed: !1
		}), this.#e = t, this.#t = n;
	}
	get value() {
		return this.#e;
	}
	get oldValue() {
		return this.#t;
	}
}, A = class e extends Event {
	static get type() {
		return "word-element-delete";
	}
	constructor() {
		super(e.type, {
			bubbles: !1,
			composed: !1
		});
	}
}, j = class e extends Event {
	static get type() {
		return "word-element-deleted-change";
	}
	#e;
	constructor({ deleted: t }) {
		super(e.type, {
			bubbles: !1,
			composed: !1
		}), this.#e = t;
	}
	get deleted() {
		return this.#e;
	}
}, M = class extends e(HTMLElement, {
	checked: t(),
	deleted: t(),
	grabbed: t(),
	action: r({ values: ["check", "delete"] }),
	value: i({ default: "" })
}) {
	#e;
	#t;
	#n;
	#r;
	#i = y();
	#a = this.attachInternals();
	constructor() {
		super(), this.#e = this.attachShadow({
			mode: "closed",
			delegatesFocus: !0
		}), this.#e.adoptedStyleSheets = [E], this.#e.appendChild(D.cloneNode(!0)), this.#t = _(this.#e, "input[name='checked']", HTMLInputElement), this.#t.id = `${this.#i}-checkbox`, this.#n = _(this.#e, "input[name='deleted']", HTMLInputElement), this.#n.id = `${this.#i}-deleted`, this.#r = _(this.#e, "label", HTMLLabelElement);
	}
	static get observedAttributes() {
		return [
			"checked",
			"deleted",
			"action",
			"value"
		];
	}
	connectedCallback() {
		this.#s(), this.#c(), this.#o(), this.#l(), this.#t.addEventListener("change", this.#p), this.#t.addEventListener("keydown", this.#m), this.#n.addEventListener("change", this.#h), this.#n.addEventListener("keydown", this.#g);
	}
	disconnectedCallback() {
		this.#t.removeEventListener("change", this.#p), this.#t.removeEventListener("keydown", this.#m), this.#n.removeEventListener("change", this.#h), this.#n.removeEventListener("keydown", this.#g);
	}
	attributeChangedCallback(e, t, n) {
		switch (e) {
			case "checked":
				this.#s(), t !== n && this.isConnected && this.#u();
				break;
			case "deleted":
				this.#c(), t !== n && this.isConnected && this.#d();
				break;
			case "action":
				this.#o();
				break;
			case "value":
				this.#l(), t !== n && this.isConnected && this.#f({
					oldValue: t ?? "",
					value: n ?? ""
				});
				break;
		}
	}
	#o() {
		this.#r.htmlFor = this.action === "delete" ? this.#n.id : this.#t.id, this.#t.disabled = this.action !== "check", this.#n.disabled = this.action !== "delete";
	}
	#s() {
		this.#t.checked = this.checked;
	}
	#c() {
		this.#n.checked = this.deleted;
	}
	#l() {
		this.#r.textContent = this.value;
	}
	#u() {
		this.dispatchEvent(new O({ checked: this.checked }));
	}
	#d() {
		this.dispatchEvent(new j({ deleted: this.deleted }));
	}
	#f({ oldValue: e, value: t }) {
		this.dispatchEvent(new k({
			oldValue: e,
			value: t
		}));
	}
	#p = () => {
		this.checked !== this.#t.checked && (this.checked = this.#t.checked);
	};
	#m = (e) => {
		e.key === "Enter" && this.#t.click();
	};
	#h = () => {
		this.#n.checked && !this.deleted ? (this.deleted = !0, this.dispatchEvent(new A())) : !this.#n.checked && this.deleted && (this.deleted = !1);
	};
	#g = (e) => {
		e.key === "Enter" && this.#n.click();
	};
	async animateEntry(e = "fade") {
		this.#a.states.delete("entering"), this.#a.states.delete("chip-entering"), this.#a.states.add("entering"), e === "chip-fade" && this.#a.states.add("chip-entering"), await Promise.allSettled(this.getAnimations({ subtree: !0 }).map((e) => e.finished)), this.#a.states.delete("entering"), this.#a.states.delete("chip-entering");
	}
	async animateExit(e = "fade") {
		this.#a.states.add("exiting"), await Promise.allSettled(this.getAnimations({ subtree: !0 }).map((e) => e.finished)), this.#a.states.delete("exiting");
	}
}, N = class {
	#e;
	constructor(e) {
		this.#e = e;
	}
	get word() {
		return this.#e.getWord();
	}
	set word(e) {
		this.#e.setWord(e);
	}
	get x() {
		return this.#e.getX();
	}
	get y() {
		return this.#e.getY();
	}
	get angle() {
		return this.#e.getAngle();
	}
	get checked() {
		return this.#e.getChecked();
	}
	set checked(e) {
		this.#e.setChecked(e);
	}
	remove(e) {
		this.#e.remove(e);
	}
}, ne = class {
	id;
	body;
	element;
	handle;
	bodySize;
	#e;
	constructor({ body: e, element: t, bodySize: n, remove: r, onDelete: i, onCheckedChange: a, onValueChange: o }) {
		this.id = e.id, this.body = e, this.element = t, this.bodySize = n, this.handle = new N({
			getWord: () => t.value ?? "",
			setWord: (e) => {
				t.value = e;
			},
			getX: () => e.position.x,
			getY: () => e.position.y,
			getAngle: () => e.angle,
			getChecked: () => t.checked,
			setChecked: (e) => {
				t.checked = e;
			},
			remove: r
		});
		let s = () => i(), c = () => a(t.checked), l = (e) => {
			let { value: t, oldValue: n } = e;
			o({
				value: t,
				oldValue: n
			});
		};
		t.addEventListener(A.type, s), t.addEventListener(O.type, c), t.addEventListener(k.type, l), this.#e = () => {
			t.removeEventListener(A.type, s), t.removeEventListener(O.type, c), t.removeEventListener(k.type, l);
		};
	}
	dispose() {
		this.#e();
	}
}, re = class {
	#e = /* @__PURE__ */ new Map();
	#t = /* @__PURE__ */ new WeakMap();
	add(e) {
		this.#e.set(e.id, e), this.#t.set(e.element, e);
	}
	get(e) {
		return this.#e.get(e);
	}
	getByElement(e) {
		return this.#t.get(e);
	}
	delete(e) {
		this.#e.delete(e.id), this.#t.delete(e.element);
	}
	values() {
		return this.#e.values();
	}
}, ie = T(":host{--space-s:0.5rem;--space-m:1rem;--input-padding-y:var(--space-s);--input-padding-x:var(--space-m);--word-padding-y:var(--space-s);--word-padding-x:var(--space-m);--fast-animation:50ms;--slow-animation:150ms;--extra-slow-animation:1s;--line-width:2px;--font-size:1.5rem;--font-family:Arial;--input-text-color:#000;--input-background-color:hwb(0 93% 7%);--input-border-color:hwb(0 27% 73%);--input-hover-text-color:var(--input-text-color);--input-hover-border-color:hwb(0 20% 66%);--input-hover-background-color:hwb(0 96% 4%);--input-hover-shadow-color:transparent;--input-focus-text-color:hwb(212 2% 88%);--input-focus-border-color:hwb(212 16% 22%);--input-focus-shadow-color:hwb(212 76% 0%);--input-focus-background-color:hwb(212 95% 0%);--input-caret-color:var(--input-focus-border-color);--word-focus-outline-color:hwb(212 50% 0%/0.95);--word-focus-outline-width:4px;--word-focus-outline-offset:4px;--word-text-color:hwb(276 2% 80%);--word-background-color:hwb(276 96% 0%);--word-border-color:var(--word-background-color);--word-delete-hover-text-color:hwb(357 45% 11%);--word-delete-hover-background-color:hwb(351 99% 0%);--word-checked-text-color:hwb(276 54% 31%);--word-checked-background-color:hwb(276 98% 0%);--word-checked-hover-text-color:hwb(276 21% 21%);--word-grabbed-background-color:hwb(212 90% 0%);--word-grabbed-border-color:hwb(212 76% 0%);--word-grabbed-text-color:hwb(211 5% 70%);--word-grabbed-shadow-blur:5px;--word-grabbed-shadow-color:hwb(0 0% 100%/0.05);--word-grabbed-scale-factor:1.1;--word-grabbed-scaling-duration:var(--fast-animation);--word-chip-fade-duration:var(--extra-slow-animation);--word-fade-in-duration:var(--slow-animation);--word-fade-out-duration:var(--slow-animation);--word-state-transition-duration:var(--slow-animation);--input-state-transition-duration:var(--slow-animation);display:block}.word-cloud{position:relative;display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-size:var(--font-size);line-height:1}.word-cloud .word{position:absolute;top:0;left:0;z-index:3;will-change:transform}input[type=text]{padding:var(--input-padding-y) var(--input-padding-x);font-family:var(--font-family);font-size:var(--font-size);color:var(--input-text-color);text-align:center;caret-color:var(--input-caret-color);background-color:var(--input-background-color);border:var(--line-width) solid var(--input-border-color);border-radius:var(--chamfer-radius,0);opacity:var(--opacity,1);transition:color var(--input-state-transition-duration,0s) ease-in,background-color var(--input-state-transition-duration,0s) ease-in,border-color var(--input-state-transition-duration,0s) ease-in,filter var(--input-state-transition-duration,0s) ease-in;&:hover{color:var(--input-hover-text-color);background-color:var(--input-hover-background-color);border-color:var(--input-hover-border-color);filter:drop-shadow(0 0 6px var(--input-hover-shadow-color))}&:focus,&:focus-visible{color:var(--input-focus-text-color);outline:none;background-color:var(--input-focus-background-color);border-color:var(--input-focus-border-color);border-radius:var(--chamfer-radius,0);filter:drop-shadow(0 0 10px var(--input-focus-shadow-color))}&:focus,&:focus-visible,&:hover{transition:color var(--input-state-transition-duration,0s) ease-out,background-color var(--input-state-transition-duration,0s) ease-out,border-color var(--input-state-transition-duration,0s) ease-out,filter var(--input-state-transition-duration,0s) ease-out}}form{z-index:2;display:none;opacity:0;transition:opacity var(--input-state-transition-duration,0s) ease-in-out,display var(--input-state-transition-duration,0s) allow-discrete ease-in-out}:host([word-input]){form{display:block;opacity:1}@starting-style{form{opacity:0}}}:host([word-action=drag]){.word{cursor:grab;user-select:none}.word[grabbed]{z-index:5;cursor:grabbing}}.word:focus{z-index:4}:host(:state(active)){.word,.word-cloud{cursor:grabbing}}.word-cloud-debug{top:0;left:0;z-index:1;width:100%;height:100%}.framerate-display,.word-cloud-debug{position:absolute;pointer-events:none}.framerate-display{right:6px;bottom:4px;display:none;font-family:monospace;font-size:.75rem;color:hwb(0 40% 60%/.7)}:host([show-framerate]) .framerate-display{display:block}"), P = w("<div class=\"word-cloud\"> <div class=\"word-cloud-debug\"></div> <div class=\"framerate-display\"></div> <form><input name=\"word-input\" type=\"text\" autocomplete=\"off\"></form> </div> "), F = 1, I = class {
	#e;
	#t;
	#n = {
		width: F,
		height: F
	};
	#r = !1;
	#i = /* @__PURE__ */ new Map();
	constructor(e) {
		this.#e = e, this.#t = a.Bodies.rectangle(0, 0, F, F, {
			isStatic: !0,
			collisionFilter: {
				category: 2,
				mask: 5
			}
		});
	}
	get body() {
		return this.#t;
	}
	get enabled() {
		return this.#r;
	}
	setRect(e) {
		if (e == null) return this.#r ? (a.Composite.remove(this.#e.world, this.#t), this.#r = !1, this.#a()) : [];
		let t = Math.max(F, e.width), n = Math.max(F, e.height), r = t / this.#n.width, i = n / this.#n.height;
		return (r !== 1 || i !== 1) && (a.Body.scale(this.#t, r, i), this.#n = {
			width: t,
			height: n
		}), a.Body.setPosition(this.#t, {
			x: e.x,
			y: e.y
		}), this.#r ||= (a.Composite.add(this.#e.world, this.#t), !0), [];
	}
	beginGrace(e) {
		this.#i.set(e.id, e);
	}
	ignores(e) {
		return this.#i.has(e);
	}
	releaseExitedWords() {
		if (!this.#r || this.#i.size === 0) return [];
		let e = [];
		for (let [t, n] of this.#i) this.#o(n) || (this.#i.delete(t), e.push(t));
		return e;
	}
	forget(e) {
		this.#i.delete(e);
	}
	#a() {
		let e = [...this.#i.keys()];
		return this.#i.clear(), e;
	}
	#o(e) {
		let t = e.bounds, n = this.#t.bounds;
		return t.min.x <= n.max.x && t.max.x >= n.min.x && t.min.y <= n.max.y && t.max.y >= n.min.y;
	}
}, L = 1e3, R = 0, z = .001, B = .4, V = .2, H = 150, U = 60, W = .04, G = .2, K = class {
	#e;
	#t;
	#n;
	#r = {
		horizontalLength: 1,
		verticalLength: 1
	};
	#i;
	#a;
	#o = /* @__PURE__ */ new Map();
	#s = !1;
	onTick = null;
	constructor() {
		this.#e = a.Engine.create(), this.#e.gravity.y = 0, this.#e.gravity.scale = 0, this.#e.enableSleeping = !0, this.#t = a.Runner.create(), this.#n = this.#c(), this.#i = new I(this.#e), this.#a = new C(this.#e, { inputVolumeBody: this.#i.body }), a.Events.on(this.#e, "beforeUpdate", this.#p), a.Events.on(this.#t, "tick", this.#m);
	}
	get engine() {
		return this.#e;
	}
	addWord({ x: e, y: t, width: n, height: r, angle: i = 0, velocity: o, ignoreInputVolumeUntilExit: s = !1 }) {
		let c = a.Bodies.rectangle(e, t, n, r, {
			chamfer: { radius: 8 },
			angle: i,
			frictionAir: W,
			restitution: G,
			collisionFilter: { category: 1 }
		});
		o && a.Body.setVelocity(c, o), a.Composite.add(this.#e.world, c);
		let l = {
			body: c,
			bodySize: {
				width: n,
				height: r
			},
			dragLock: null
		};
		return this.#o.set(c.id, l), s && this.#i.beginGrace(c), this.#l(c.id), this.#a.addWord(c, {
			width: n,
			height: r,
			isRepellable: () => !c.isStatic && l.dragLock == null,
			ignoresInputVolume: () => this.#i.ignores(c.id)
		}), c;
	}
	removeWord(e) {
		let t = this.#o.get(e);
		t != null && (this.unlockDrag(e), this.#i.forget(e), this.#a.removeWord(e), a.Composite.remove(this.#e.world, t.body), this.#o.delete(e));
	}
	setWordSize(e, { width: t, height: n }) {
		let r = this.#o.get(e);
		if (r == null) return;
		let { width: i, height: o } = r.bodySize;
		if (t === i && n === o) return;
		let { dragLock: s } = r;
		s != null && a.Body.setInertia(r.body, s.initialInertia), a.Body.scale(r.body, t / i, n / o), r.bodySize = {
			width: t,
			height: n
		}, this.#a.setWordSize(e, {
			width: t,
			height: n
		}), s != null && (s.initialInertia = r.body.inertia, this.#u(r.body));
	}
	setFrameSize({ width: e, height: t }) {
		let { left: n, right: r, top: i, bottom: o } = this.#n, s = Math.max(1, e + L * 2), c = Math.max(1, t + L * 2), l = s / this.#r.horizontalLength, u = c / this.#r.verticalLength;
		u !== 1 && (a.Body.scale(n, 1, u), a.Body.scale(r, 1, u)), l !== 1 && (a.Body.scale(i, l, 1), a.Body.scale(o, l, 1)), this.#r = {
			horizontalLength: s,
			verticalLength: c
		}, a.Body.setPosition(n, {
			x: -1e3 / 2,
			y: t / 2
		}), a.Body.setPosition(r, {
			x: e + L / 2,
			y: t / 2
		}), a.Body.setPosition(i, {
			x: e / 2,
			y: -1e3 / 2
		}), a.Body.setPosition(o, {
			x: e / 2,
			y: t + L / 2
		});
	}
	setInputVolume(e) {
		for (let t of this.#i.setRect(e)) this.#l(t);
	}
	setSpacing(e) {
		this.#a.setSpacing(e);
	}
	lockDrag(e) {
		let t = this.#o.get(e);
		t == null || t.dragLock != null || (t.dragLock = { initialInertia: t.body.inertia }, this.#l(e), this.#u(t.body));
	}
	unlockDrag(e) {
		let t = this.#o.get(e);
		t == null || t.dragLock == null || (a.Body.setInertia(t.body, t.dragLock.initialInertia), a.Body.setAngularVelocity(t.body, 0), t.dragLock = null, this.#l(e));
	}
	grabWord(e) {
		let t = this.#o.get(e);
		t != null && (a.Sleeping.set(t.body, !1), this.lockDrag(e), a.Body.setVelocity(t.body, {
			x: 0,
			y: 0
		}));
	}
	moveWord(e, { x: t, y: n }) {
		let r = this.#o.get(e);
		r != null && a.Body.setPosition(r.body, {
			x: t,
			y: n
		});
	}
	releaseWord(e, t) {
		let n = this.#o.get(e);
		if (n == null) return;
		this.unlockDrag(e);
		let r = this.#s ? {
			x: t.x * (1e3 / 60),
			y: t.y * (1e3 / 60)
		} : {
			x: 0,
			y: 0
		};
		a.Body.setVelocity(n.body, r);
	}
	start() {
		this.#s || (this.#s = !0, a.Runner.run(this.#t, this.#e));
	}
	stop() {
		this.#s && (this.#s = !1, a.Runner.stop(this.#t));
	}
	#c() {
		let e = {
			category: 8,
			mask: 5
		}, t = {
			left: a.Bodies.rectangle(0, 0, L, 1, {
				isStatic: !0,
				collisionFilter: e
			}),
			right: a.Bodies.rectangle(0, 0, L, 1, {
				isStatic: !0,
				collisionFilter: e
			}),
			top: a.Bodies.rectangle(0, 0, 1, L, {
				isStatic: !0,
				collisionFilter: e
			}),
			bottom: a.Bodies.rectangle(0, 0, 1, L, {
				isStatic: !0,
				collisionFilter: e
			})
		};
		return a.Composite.add(this.#e.world, [
			t.left,
			t.right,
			t.top,
			t.bottom
		]), t;
	}
	#l(e) {
		let t = this.#o.get(e);
		t != null && (t.body.collisionFilter.mask = g({
			dragLocked: t.dragLock != null,
			ignoresInput: this.#i.ignores(e)
		}));
	}
	#u(e) {
		a.Body.setInertia(e, Infinity), a.Body.setAngularVelocity(e, 0);
	}
	#d() {
		for (let { body: e } of this.#o.values()) e.isStatic || (Math.abs(b(e.angle) - R) <= z ? e.sleepThreshold = U : (e.sleepThreshold = Infinity, e.isSleeping && a.Sleeping.set(e, !1)));
	}
	#f() {
		for (let { body: e, bodySize: { width: t, height: n } } of this.#o.values()) x({
			body: e,
			bodySize: {
				width: t,
				height: n
			},
			restAngle: R,
			restAngleEpsilon: z,
			springTorqueStiffness: B,
			dampingCoefficient: V,
			springWidthReference: H
		});
	}
	#p = () => {
		this.#d(), this.#f();
		for (let e of this.#i.releaseExitedWords()) this.#l(e);
		this.#a.applyForces();
	};
	#m = () => {
		this.onTick?.(this.#t.frameDelta);
	};
}, q = 10, J = 40, Y = 1, ae = 3, X = null, Z = "x-word";
try {
	X = new CustomElementRegistry(), X.define(Z, M);
} catch {
	Z = `x-word-${y()}`, customElements.define(Z, M);
}
var Q = [
	"none",
	"drag",
	"check",
	"delete"
];
function $(e) {
	return Q.includes(e);
}
var oe = class i extends e(HTMLElement, {
	wordAction: r({
		values: Q,
		default: "none"
	}),
	wordInput: t(),
	showFramerate: t(),
	physicsPaused: t(),
	wordSpacing: n({ default: 5 }),
	edgeSpacing: n({ default: 5 }),
	inputSpacing: n({ default: 5 })
}) {
	static #e = {
		none: null,
		drag: null,
		check: "check",
		delete: "delete"
	};
	static #t(e) {
		let t = getComputedStyle(e), n = Number.parseFloat(t.width), r = Number.parseFloat(t.height);
		return {
			width: Number.isFinite(n) ? n : e.offsetWidth,
			height: Number.isFinite(r) ? r : e.offsetHeight
		};
	}
	#n;
	#r;
	#i;
	#a = new K();
	#o = new re();
	#s;
	#c = {
		x: 0,
		y: 0
	};
	#l;
	#u = new ResizeObserver(() => {
		this.#a.setFrameSize({
			width: this.#i.offsetWidth,
			height: this.#i.offsetHeight
		}), this.#S();
	});
	#d = new ResizeObserver(() => {
		this.#S();
	});
	#f = new ResizeObserver((e) => {
		for (let { target: t } of e) {
			if (!(t instanceof M)) continue;
			let e = this.#o.getByElement(t);
			e != null && this.#b(e);
		}
	});
	#p = this.attachInternals();
	#m = null;
	constructor() {
		super();
		let { container: e, wordForm: t, wordInput: n, framerateDisplay: r } = this.#_();
		this.#i = e, this.#n = t, this.#r = n, this.#l = r, this.#v(), this.#s = this.#A();
	}
	static get observedAttributes() {
		return [
			"word-action",
			"word-input",
			"physics-paused",
			"word-spacing",
			"edge-spacing",
			"input-spacing"
		];
	}
	attributeChangedCallback(e, t, n) {
		switch (e) {
			case "word-action":
				if (n !== null && !$(n)) this.removeAttribute("word-action");
				else {
					let e = t !== null && $(t) ? t : "none", r = n !== null && $(n) ? n : "none";
					this.#k(), this.#j(), e !== r && this.dispatchEvent(new d({
						oldWordAction: e,
						wordAction: r
					}));
				}
				break;
			case "word-input": {
				let e = t !== null, r = n !== null;
				this.#S(), e !== r && this.dispatchEvent(new f({
					oldWordInput: e,
					wordInput: r
				}));
				break;
			}
			case "physics-paused": {
				let e = t !== null, r = n !== null;
				r ? (this.#P(), this.#E(0)) : this.#N(), e !== r && this.dispatchEvent(new p({
					oldPhysicsPaused: e,
					physicsPaused: r
				}));
				break;
			}
			case "word-spacing":
			case "edge-spacing":
			case "input-spacing":
				this.#C();
				break;
		}
	}
	connectedCallback() {
		this.#n.addEventListener("submit", this.#w), this.#a.onTick = this.#T, this.#a.setFrameSize({
			width: this.#i.offsetWidth,
			height: this.#i.offsetHeight
		}), this.#k(), this.#S(), this.#C(), this.#j(), this.#u.observe(this.#i), this.#d.observe(this.#r);
		for (let e of this.#o.values()) this.#f.observe(e.element), this.#b(e);
		this.physicsPaused || this.#N();
	}
	disconnectedCallback() {
		this.#n.removeEventListener("submit", this.#w), this.#u.unobserve(this.#i), this.#d.unobserve(this.#r);
		for (let { element: e } of this.#o.values()) this.#f.unobserve(e);
		this.#s.enabled = !1, this.#P(), this.#a.onTick = null;
	}
	add(e, t) {
		return ee(e) ? Array.from(e, (e) => this.#h({
			...t,
			...e
		})) : this.#h({
			...t,
			...e
		});
	}
	#h({ word: e, x: t, y: n, angle: r = 0, checked: a = !1, velocity: o, entryAnimation: u = "fade", ignoreInputVolumeUntilExit: d = !1 }) {
		let f = document.createElement(Z);
		this.#i.appendChild(f), f.value = e, f.checked = a, u !== "none" && f.animateEntry(u), f.classList.add("word"), f.action = i.#e[this.wordAction];
		let { width: p, height: m } = i.#t(f), h, g = (e = {}) => {
			e.exitAnimation = e.exitAnimation ?? "fade", this.#g(h, e);
		};
		return h = new ne({
			body: this.#a.addWord({
				x: t,
				y: n,
				width: p,
				height: m,
				angle: r,
				velocity: o,
				ignoreInputVolumeUntilExit: d
			}),
			element: f,
			bodySize: {
				width: p,
				height: m
			},
			remove: g,
			onDelete: () => g(),
			onCheckedChange: (e) => {
				this.dispatchEvent(new c({
					handle: h.handle,
					checked: e
				}));
			},
			onValueChange: ({ value: e, oldValue: t }) => {
				this.dispatchEvent(new l({
					handle: h.handle,
					value: e,
					oldValue: t
				}));
			}
		}), f.style.transform = this.#O(h), this.#o.add(h), this.#f.observe(f), this.dispatchEvent(new s({ handle: h.handle })), h.handle;
	}
	async #g(e, { exitAnimation: t = "none" } = {}) {
		t === "none" || await e.element.animateExit(t), this.#i.removeChild(e.element), this.dispatchEvent(new u({ handle: e.handle })), this.#y(e), e.dispose(), this.#o.delete(e);
	}
	clear(e) {
		for (let t of this.#o.values()) this.#g(t, e);
	}
	*getWords() {
		for (let e of this.#o.values()) yield e.handle;
	}
	addEventListener(e, t, n) {
		t != null && super.addEventListener(e, t, n);
	}
	removeEventListener(e, t, n) {
		t != null && super.removeEventListener(e, t, n);
	}
	#_() {
		let e = this.attachShadow(X == null ? { mode: "closed" } : {
			mode: "closed",
			customElementRegistry: X
		});
		e.appendChild(P.cloneNode(!0)), e.adoptedStyleSheets = [ie];
		let t = _(e, ".word-cloud", HTMLElement);
		return {
			container: t,
			wordForm: _(t, "form", HTMLFormElement),
			wordInput: _(t, "input", HTMLInputElement),
			framerateDisplay: _(t, ".framerate-display", HTMLElement)
		};
	}
	#v() {
		this.#i.style.setProperty("--chamfer-radius", "8px");
	}
	#y(e) {
		this.#f.unobserve(e.element), this.#a.removeWord(e.id);
	}
	#b(e) {
		let t = i.#t(e.element), { width: n, height: r } = e.bodySize;
		t.width === n && t.height === r || (this.#a.setWordSize(e.id, t), e.bodySize = t);
	}
	#x() {
		let e = Math.random() * 2 * Math.PI, t = Math.random() * (J - q) + q;
		return {
			x: Math.cos(e) * t,
			y: Math.sin(e) * t
		};
	}
	#S() {
		if (!this.wordInput) {
			this.#a.setInputVolume(null);
			return;
		}
		let { offsetLeft: e, offsetTop: t, offsetWidth: n, offsetHeight: r } = this.#r;
		this.#a.setInputVolume({
			x: e + n / 2,
			y: t + r / 2,
			width: n,
			height: r
		});
	}
	#C() {
		this.#a.setSpacing({
			word: this.wordSpacing,
			edge: this.edgeSpacing,
			input: this.inputSpacing
		});
	}
	#w = (e) => {
		e.preventDefault();
		let t = this.#r.value.trim();
		if (t !== "") {
			this.wordInput && this.#S();
			let e = this.#r.offsetLeft + this.#r.offsetWidth / 2, n = this.#r.offsetTop + this.#r.offsetHeight / 2;
			this.#h({
				word: t,
				x: e,
				y: n,
				angle: 0,
				checked: !1,
				velocity: this.#x(),
				entryAnimation: "chip-fade",
				ignoreInputVolumeUntilExit: !0
			});
		}
		this.#r.value = "";
	};
	#T = (e) => {
		this.#D(), this.showFramerate && this.#E(1e3 / e);
	};
	#E(e) {
		this.#l.textContent = `${Math.round(e)} fps`;
	}
	#D() {
		for (let e of this.#o.values()) e.element.style.transform = this.#O(e);
	}
	#O({ body: e, bodySize: { width: t, height: n } }) {
		let r = v(e.angle, ae), i = v(e.position.x - t / 2, Y), a = v(e.position.y - n / 2, Y);
		return r === 0 ? `translate(${i}px, ${a}px)` : `translate(${i}px, ${a}px) rotate(${r}rad)`;
	}
	#k() {
		let e = i.#e[this.wordAction];
		for (let { element: t } of this.#o.values()) t.action = e;
	}
	#A() {
		return new h(this.#i, {
			resolveWord: (e, t) => {
				let n = this.#i.getRootNode(), r = n instanceof Document || n instanceof ShadowRoot ? n.elementFromPoint(e, t) : null;
				return r instanceof M ? this.#o.getByElement(r) ?? null : null;
			},
			toContainerPoint: (e, t) => this.#M(e, t),
			onGrab: (e, t) => {
				this.#c = {
					x: e.body.position.x - t.x,
					y: e.body.position.y - t.y
				}, this.#a.grabWord(e.id), e.element.grabbed = !0, this.#p.states.add("active");
			},
			onMove: (e, t) => {
				this.#a.moveWord(e.id, {
					x: t.x + this.#c.x,
					y: t.y + this.#c.y
				}), e.element.style.transform = this.#O(e);
			},
			onRelease: (e, t) => {
				this.#a.releaseWord(e.id, t), e.element.grabbed = !1, this.#p.states.delete("active");
			}
		});
	}
	#j() {
		this.#s.enabled = this.wordAction === "drag";
	}
	#M(e, t) {
		let n = this.#i.getBoundingClientRect(), r = getComputedStyle(this.#i), i = Number.parseFloat(r.width), a = Number.parseFloat(r.height), o = i > 0 ? n.width / i : 1, s = a > 0 ? n.height / a : 1;
		return {
			x: (e - n.left) / o,
			y: (t - n.top) / s
		};
	}
	#N() {
		this.#a.start();
	}
	#P() {
		this.#a.stop(), this.#m != null && a.Render.stop(this.#m);
	}
}, se = "0.15.0";
//#endregion
export { oe as HTMLWordCloudElement, p as PhysicsPauseEvent, d as WordActionChangeEvent, s as WordAddEvent, l as WordChangeEvent, c as WordCheckEvent, u as WordDeleteEvent, N as WordHandle, f as WordInputToggleEvent, se as version };

//# sourceMappingURL=index.js.map