const reEnhancerLevel = /\|enhancer-level=(\d)\|/;

customElements.define("fh-enhancer", class FhEnhancer extends HTMLElement {
	#level = +(reEnhancerLevel.exec(window.name)?.[1] ?? 1);

	get level() {
		return this.#level;
	}

	connectedCallback() {
		this.addEventListener('change', this);

		const levelStr = String(this.#level);
		for (const input of this.querySelectorAll('input')) {
			input.checked = input.value === levelStr;
		}
	}

	/** @param {Event} event */
	handleEvent(event) {
		if (event.type !== 'change') {
			return;
		}

		event.stopPropagation();

		this.#level = +/** @type {HTMLInputElement} */(event.target).value;
		if (reEnhancerLevel.test(window.name)) {
			window.name = window.name.replace(reEnhancerLevel, `|enhancer-level=${this.#level}|`);
		} else {
			window.name += `|enhancer-level=${this.#level}|`;
		}

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
		let title = `Base cost of ${baseCost}g`;
		if (lost && !persistent) {
			cost /= 2;
			title += `, halved because the action is lost but not persistent`;
		}
		if (persistent) {
			cost *= 3;
			title += `, tripled because the action is persistent`;
		}
		if (targetMultiple) {
			cost *= 2;
			title += `, doubled because the improvement has multiple targets`;
		}

		const levelIncrement = (level - 1) * (enhancerLevel >= 3 ? 15 : 25);
		if (levelIncrement) {
			cost += levelIncrement;
			title += `, plus an extra ${levelIncrement}g because the card is level ${level}`;
		}

		if (enhancerLevel >= 2) {
			cost -= 10;
			title += `, minus 10g for the enhancer level`;
		}

		this.innerText = `${Math.ceil(cost)}g`;
		this.title = title;
	}
});
