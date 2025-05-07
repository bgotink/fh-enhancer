// @ts-check

const reEnhancerLevel = /\|enhancer-level=(\d)\|/;

class FhEnhancer extends HTMLElement {
	#level = +(reEnhancerLevel.exec(window.name)?.[1] ?? 1);

	get level() {
		return this.#level;
	}

	connectedCallback() {
		this.addEventListener("change", this);

		const levelStr = String(this.#level);
		for (const input of this.querySelectorAll("input")) {
			input.checked = input.value === levelStr;
		}
	}

	/** @param {Event} event */
	handleEvent(event) {
		if (event.type !== "change") {
			return;
		}

		event.stopPropagation();

		this.#level = +(/** @type {HTMLInputElement} */ (event.target).value);
		if (reEnhancerLevel.test(window.name)) {
			window.name = window.name.replace(
				reEnhancerLevel,
				`|enhancer-level=${this.#level}|`,
			);
		} else {
			window.name += `|enhancer-level=${this.#level}|`;
		}

		for (const el of /** @type {NodeListOf<FhCost>} */ (
			document.querySelectorAll("fh-cost")
		)) {
			el.recompute();
		}
	}
}
customElements.define("fh-enhancer", FhEnhancer);

class FhAction extends HTMLElement {
	connectedCallback() {
		this.addEventListener("change", this);
	}

	disconnectedCallback() {
		this.removeEventListener("change", this);
	}

	/** @param {Event} event */
	handleEvent(event) {
		if (
			event.type !== "change" ||
			!(event.target instanceof HTMLElement) ||
			!event.target.closest("fh-enhancement")
		) {
			return;
		}

		console.log(this.numberOfBoughtEnhancements);

		for (const cost of /** @type {NodeListOf<FhCost>} */ (
			this.querySelectorAll("fh-cost")
		)) {
			cost.recompute();
		}
	}

	get numberOfBoughtEnhancements() {
		return Array.from(
			/** @type {NodeListOf<FhEnhancement>} */ (
				this.querySelectorAll("fh-enhancement")
			),
		).filter((el) => el.bought).length;
	}
}
customElements.define("fh-action", FhAction);

class FhEnhancement extends HTMLElement {
	#input = document.createElement("input");

	connectedCallback() {
		if (!this.matches(":only-of-type")) {
			this.classList.add("multiple");

			this.insertBefore(this.#input, this.firstChild);
			this.#input.type = "checkbox";
			this.#input.ariaLabel = "enhancement bought";
		}
	}

	get bought() {
		return this.#input.checked;
	}
}
customElements.define("fh-enhancement", FhEnhancement);

class FhCost extends HTMLElement {
	/** @type {FhEnhancer?} */
	#enhancer;
	/** @type {FhAction?} */
	#action;
	/** @type {FhEnhancement?} */
	#enhancement;

	connectedCallback() {
		this.#enhancer = document.querySelector("fh-enhancer");
		this.#action = this.closest("fh-action");
		this.#enhancement = this.closest("fh-enhancement");

		this.recompute();
	}

	recompute() {
		if (this.#enhancement?.bought) {
			this.innerText = "";
			this.title = "";
			return;
		}

		const baseCost = +(/** @type {string} */ (this.getAttribute("base-cost")));
		const levelStr = /** @type {string} */ (this.getAttribute("card-level"));
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

		const numberOfBoughtEnhancements = this.#action?.numberOfBoughtEnhancements;
		if (numberOfBoughtEnhancements) {
			const increment =
				numberOfBoughtEnhancements * (enhancerLevel >= 4 ? 50 : 75);
			cost += increment;

			if (numberOfBoughtEnhancements > 1) {
				title += `, with an additional ${increment}g for the ${numberOfBoughtEnhancements} previously bought enhancement${
					numberOfBoughtEnhancements > 1 ? "s" : ""
				}`;
			} else {
				title += `, with an additional ${increment}g for the previously bought enhancement`;
			}
		}

		this.innerText = `${Math.ceil(cost)}g`;
		this.title = title;
	}
}
customElements.define("fh-cost", FhCost);

customElements.define("fh-character-link-with-spoiler", class extends HTMLElement {
	/** @type {string=} */
	#link;

	constructor() {
		super();

		this.addEventListener("click", this, { capture: true });
	}

	connectedCallback() {
		this.#link = /** @type {HTMLAnchorElement} */ (this.firstElementChild).href;
		/** @type {HTMLAnchorElement} */ (this.firstElementChild).href = "#";
	}

	handleEvent(event) {
		if (this.#link) {
			/** @type {HTMLAnchorElement} */ (this.firstElementChild).href = this.#link;
		}
	}
});
