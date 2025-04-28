customElements.define("fh-enhancer", class FhEnhancer extends HTMLElement {
	#level = 1;

	get level() {
		return this.#level;
	}

	connectedCallback() {
		this.addEventListener('change', this);
	}

	/** @param {Event} event */
	handleEvent(event) {
		if (event.type !== 'change') {
			return;
		}

		event.stopPropagation();

		this.#level = +/** @type {HTMLInputElement} */(event.target).value;

		for (const el of document.querySelectorAll("fh-cost")) {
			el.recompute();
		}
	}
});

customElements.define("fh-action", class FhAction extends HTMLElement {

});

customElements.define("fh-cost", class FhCompute extends HTMLElement {
	/** @type {FhEnhancer?} */
	#enhancer;

	connectedCallback() {
		this.#enhancer = document.querySelector("fh-enhancer");

		this.recompute();
	}

	recompute() {
		const baseCost = +this.getAttribute("base-cost");
		const levelStr = this.getAttribute("card-level");
		const level = +(levelStr === "X" ? 1 : levelStr);
		const enhancerLevel = this.#enhancer?.level ?? 1;

		const lost = this.hasAttribute("lost");
		const persistent = this.hasAttribute("persistent");
		const targetMultiple = this.hasAttribute("target-multiple");

		let cost = baseCost;
		if (lost && !persistent) {
			cost /= 2;
		}
		if (persistent) {
			cost *= 3;
		}
		if (targetMultiple) {
			cost *= 2;
		}

		cost += (level - 1) * (enhancerLevel >= 3 ? 15 : 25);

		if (enhancerLevel >= 2) {
			cost -= 10;
		}

		this.innerText = `${Math.ceil(cost)}g`;
	}
});
