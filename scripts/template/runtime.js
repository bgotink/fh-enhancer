// @ts-check

const reEnhancerType = /\|enhancer-type=(fh|gh2)\|/;
const reShowAllCharacters = /\|show-all-characters\|/;
const reFhEnhancerLevel = /\|enhancer-level=(\d)\|/;
const reFhEnhancerTemporary = /\|temporary\|/;
const reGh2EnhancerDiscount = /\|discount=(\d+)\|/;

class FhEnhancerSettings extends HTMLElement {
	#type = /** @type {"fh" | "gh2" | undefined} */ (
		reEnhancerType.exec(window.name)?.[1]
	);

	#level = +(reFhEnhancerLevel.exec(window.name)?.[1] ?? 1);
	#temporary = reFhEnhancerTemporary.test(window.name);

	#discount = +(reGh2EnhancerDiscount.exec(window.name)?.[1] ?? 0);

	#showAllCharacters = reShowAllCharacters.test(window.name);

	get type() {
		return (
			this.#type ??
			(document.documentElement.classList.contains("character-gh2") ?
				"gh2"
			:	"fh")
		);
	}

	get level() {
		return this.type === "gh2" ? 1 : this.#level;
	}

	get temporary() {
		return this.#temporary;
	}

	get discount() {
		return this.type === "gh2" ? this.#discount : 0;
	}

	connectedCallback() {
		this.addEventListener("change", this);
		this.addEventListener("click", this);

		this.classList.add(`type-${this.type}`);
		document.documentElement.classList.toggle(
			"show-all-characters",
			this.#showAllCharacters,
		);

		const levelStr = String(this.#level);
		for (const input of this.querySelectorAll("input")) {
			switch (input.name) {
				case "all-games":
					input.checked = this.#showAllCharacters;
					break;
				case "discount":
					input.valueAsNumber = this.#discount;
					break;
				case "enhancer-level":
					input.checked = input.value === levelStr;
					break;
				case "enhancer-type":
					input.checked = input.value === (this.#type ?? "");
					break;
				case "temporary":
					input.checked = this.#temporary;
					break;
			}
		}
	}

	/** @param {Event} event */
	handleEvent(event) {
		if (event.type !== "change") {
			return;
		}

		event.stopPropagation();

		switch (/** @type {HTMLInputElement} */ (event.target).name) {
			case "all-games":
				this.#showAllCharacters = /** @type {HTMLInputElement} */ (
					event.target
				).checked;
				this.#storeValue(
					reShowAllCharacters,
					this.#showAllCharacters ? "|show-all-characters|" : "",
				);

				// no need to recompute, instead we'll update a class
				document.documentElement.classList.toggle(
					"show-all-characters",
					this.#showAllCharacters,
				);
				return;
			case "discount":
				this.#discount = /** @type {HTMLInputElement} */ (
					event.target
				).valueAsNumber;
				this.#storeValue(reGh2EnhancerDiscount, `|discount=${this.#discount}|`);
				break;
			case "enhancer-level":
				this.#level = +(/** @type {HTMLInputElement} */ (event.target).value);
				this.#storeValue(reFhEnhancerLevel, `|enhancer-level=${this.#level}|`);
				break;
			case "enhancer-type":
				this.classList.remove(`type-${this.type}`);
				this.#type =
					/** @type {this['type']} */ (
						/** @type {HTMLInputElement} */ (event.target).value
					) || undefined;
				this.classList.add(`type-${this.type}`);
				this.#storeValue(
					reEnhancerType,
					this.#type ? `|enhancer-type=${this.#type}|` : "",
				);
				break;
			case "temporary":
				this.#temporary = /** @type {HTMLInputElement} */ (
					event.target
				).checked;
				this.#storeValue(
					reFhEnhancerTemporary,
					this.#temporary ? "|temporary|" : "",
				);
				break;
		}

		this.#recompute();
	}

	/**
	 * @param {RegExp} match
	 * @param {string} value
	 */
	#storeValue(match, value) {
		if (match.test(window.name)) {
			window.name = window.name.replace(match, value);
		} else {
			window.name += value;
		}
	}

	#recompute() {
		for (const el of /** @type {NodeListOf<FhCost>} */ (
			document.querySelectorAll("fh-cost")
		)) {
			el.recompute();
		}
	}
}
customElements.define("fh-enhancer-settings", FhEnhancerSettings);

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
	/** @type {FhEnhancerSettings?} */
	#enhancer = null;
	/** @type {FhAction?} */
	#action = null;
	/** @type {FhEnhancement?} */
	#enhancement = null;

	connectedCallback() {
		this.#enhancer = document.querySelector("fh-enhancer-settings");
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
		const temporaryEnhancement = this.#enhancer?.temporary ?? false;
		const discount = this.#enhancer?.discount ?? 0;

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

		if (temporaryEnhancement) {
			let reduction = 0;
			if (numberOfBoughtEnhancements) {
				reduction = 20;
			}
			reduction += Math.ceil((cost - reduction) * 0.2);
			cost -= reduction;
			title += `, reduced by ${reduction}g since it's temporary`;
		}

		if (discount > 0) {
			cost -= discount;
			title += `, discounted by ${discount}g as configured in the enhancer`;
		}

		this.innerText = `${Math.max(0, Math.ceil(cost))}g`;
		this.title = title;
	}
}
customElements.define("fh-cost", FhCost);

customElements.define(
	"fh-character-link-with-spoiler",
	class extends HTMLElement {
		/** @type {string=} */
		#link;

		constructor() {
			super();

			this.addEventListener("click", this, {capture: true});
		}

		connectedCallback() {
			this.#link = /** @type {HTMLAnchorElement} */ (
				this.firstElementChild
			).href;
			/** @type {HTMLAnchorElement} */ (this.firstElementChild).href = "#";
		}

		handleEvent(event) {
			if (this.#link) {
				/** @type {HTMLAnchorElement} */ (this.firstElementChild).href =
					this.#link;
			}
		}
	},
);
