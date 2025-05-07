#!/usr/bin/env node
// @ts-check

import {
	copyFile,
	mkdir,
	readdir,
	readFile,
	stat,
	writeFile,
} from "node:fs/promises";
import {env} from "node:process";
import {fileURLToPath} from "node:url";
import {JSDOM} from "jsdom";
import sharp from "sharp";

import {
	dataFolder,
	outputFolder,
	worldhavenDataFolder,
	worldhavenImagesFolder,
} from "./constants.js";
import {
	PlayerCharacter,
	Card,
	Action,
	parsePlayerCharacter,
	Enhancement,
} from "./model.js";

const buildForDeployment = !!env.CI;

const sharedFolder = new URL("_shared/", outputFolder);
await mkdir(sharedFolder, {recursive: true});

/** @type {Map<string, Promise<unknown>>} */
const createdAssets = new Map();

/** @type {Record<Enhancement['ability'] & string, number>} */
const baseCostPerAbility = {
	move: 30,
	jump: 30,
	attack: 50,
	range: 30,
	target: 75,
	shield: 80,
	retaliate: 60,
	pierce: 30,
	heal: 30,
	push: 30,
	pull: 20,
	teleport: 50,

	"summon hp": 40,
	"summon move": 50,
	"summon attack": 100,
	"summon range": 50,
};

const baseCostPositiveConditions = {
	regenerate: 40,
	ward: 75,
	strengthen: 100,
	bless: 75,
};

const baseCostNegativeConditions = {
	wound: 75,
	poison: 50,
	immobilize: 150,
	muddle: 40,
	curse: 150,
};

const elements = ["air", "dark", "earth", "fire", "ice", "light"];

const baseCostOneElement = 100;
const baseCostAnyElement = 150;

const baseCostJump = 60;

/** @param {number} numberOfHexes */
function baseCostAttackHex(numberOfHexes) {
	return Math.ceil(200 / numberOfHexes);
}

const [scriptText, styleText] = await Promise.all([
	readFile(new URL("template/runtime.js", import.meta.url), "utf8"),
	readFile(new URL("template/styles.css", import.meta.url), "utf8"),
]);

/** @type {Map<string, PlayerCharacter>} */
const characters = new Map();

for (const characterFilename of await readdir(dataFolder)) {
	if (!characterFilename.endsWith(".kdl")) {
		continue;
	}

	const characterName = characterFilename.slice(0, -4);
	let characterString;

	try {
		characterString = await readFile(
			new URL(characterFilename, dataFolder),
			"utf8",
		);
	} catch {
		continue;
	}

	characters.set(characterName, parsePlayerCharacter(characterString));

	await mkdir(new URL(`${characterName}/cards/`, outputFolder), {
		recursive: true,
	});
}

const art = new Map(
	/** @type {{expansion: string; name: string; image: string; xws: string;}[]} */ (
		JSON.parse(await readFile(new URL("art.js", worldhavenDataFolder), "utf8"))
	)
		.filter(
			(item) =>
				item.expansion === "Frosthaven" && !item.xws.endsWith("coloricon"),
		)
		.map((item) => [item.name, item.image]),
);

await Promise.all(
	Array.from(characters, async ([characterName, character]) => {
		const icon = art.get(`${characterName.replaceAll("-", " ")} icon`);

		if (icon == null) {
			throw new Error(`Couldn't find icon for ${characterName}`);
		}

		const image = await readFile(new URL(icon, worldhavenImagesFolder));

		const characterColor = character.meta.color?.rgb ?? "#999";

		for (const [filename, color] of [
			["icon.png", characterColor],
			["icon--white.png", "white"],
			["icon--black.png", "black"],
		]) {
			makeAsset(`${characterName}/${filename}`, (url) =>
				sharp(image)
					.rotate()
					.resize({
						width: 280,
						height: 280,
						fit: "contain",
						background: "transparent",
					})
					.composite([
						{
							input: Buffer.from(
								`<svg><rect x="0" y="0" width="280" height="280" fill="${color}"/></svg>`,
							),
							blend: "in",
						},
					])
					.toFile(fileURLToPath(url)),
			);
		}

		makeAsset(`${characterName}/favicon.png`, (url) =>
			sharp(image)
				.rotate()
				.resize({
					width: 70,
					height: 70,
					fit: "contain",
					background: "transparent",
				})
				.extend({
					background: "transparent",
					top: 15,
					right: 15,
					bottom: 15,
					left: 15,
				})
				.composite([
					{
						input: Buffer.from(
							`<svg><rect x="0" y="0" width="100" height="100" fill="${characterColor}"/></svg>`,
						),
						blend: "dest-atop",
					},
				])
				.toFile(fileURLToPath(url)),
		);
	}),
);

{
	const jsdom = await JSDOM.fromFile(
		fileURLToPath(new URL("template/index.html", import.meta.url)),
	);
	const {document} = jsdom.window;

	installScriptAndStyle(document);
	addHeader(document, null, "Frosthaven Enhancer");

	await writeFile(new URL("index.html", outputFolder), jsdom.serialize());
}

for (const [characterName, character] of characters) {
	const jsdom = new JSDOM(`<!doctype html><html lang=en></html>`);
	const {document} = jsdom.window;

	const prettyName = character.meta.name;
	if (character.meta.color) {
		document.documentElement.style.setProperty(
			"--color",
			character.meta.color.rgb,
		);
	}

	document.head.appendChild(document.createElement("title")).textContent =
		prettyName;
	const favicon = document.head.appendChild(document.createElement("link"));
	favicon.rel = "icon";
	favicon.href = `favicon.png`;

	installScriptAndStyle(document);
	addHeader(document, characterName, character.meta.name);

	for (const card of character.cards) {
		makeAsset(
			`${characterName}/cards/${card.name.replaceAll(" ", "-")}.jpg`,
			async (url) =>
				sharp(await readFile(new URL(card.imagePath, worldhavenImagesFolder)))
					.jpeg({quality: 75, mozjpeg: buildForDeployment})
					.toFile(fileURLToPath(url)),
		);

		document.body.append(createCard(card));
	}

	await writeFile(
		new URL(`${characterName}/index.html`, outputFolder),
		jsdom.serialize(),
	);

	await mkdir(new URL(`${characterName}/cards/`, outputFolder), {
		recursive: true,
	});

	/** @param {Card} card */
	function createCard(card) {
		const cardContainer = document.createElement("div");
		cardContainer.classList.add("card");

		const cardImage = cardContainer.appendChild(document.createElement("img"));
		cardImage.src = `cards/${card.name.replaceAll(" ", "-")}.jpg`;
		cardImage.loading = "lazy";
		cardImage.alt = "card";

		const cardTitle = cardContainer.appendChild(document.createElement("h3"));
		cardTitle.textContent = card.name;
		cardTitle.id = card.name.replaceAll(" ", "-").toLowerCase();

		const cardLink = cardContainer.appendChild(document.createElement("a"));
		cardLink.href = `#${cardTitle.id}`;
		const cardLinkImage = cardLink.appendChild(document.createElement("img"));
		copySharedIcon("link", "" + art.get("linked icon"));
		cardLinkImage.src = "../_shared/link.png";
		cardLinkImage.alt = `link to card "${card.name}"`;

		const top = document.createElement("div");
		top.classList.add("action", "top");
		const bottom = document.createElement("div");
		bottom.classList.add("action", "bottom");

		const section = document.createElement("section");
		section.append(
			cardContainer,
			createAction(card, "top"),
			createAction(card, "bottom"),
		);

		return section;
	}

	/**
	 * @param {Card} card
	 * @param {"top" | "bottom"} where
	 */
	function createAction(card, where) {
		const el = document.createElement("fh-action");
		el.className = `action--${where}`;

		const {lost, persistent, enhancements} = card[where] ?? {};

		el.classList.toggle("lost", lost ?? false);
		el.classList.toggle("persistent", persistent ?? false);

		for (const enhancement of enhancements ?? []) {
			el.append(
				createEnhancement(
					card,
					/** @type {Action} */ (card[where]),
					enhancement,
				),
			);
		}

		return el;
	}

	/**
	 * @param {Card} card
	 * @param {Action} action
	 * @param {Enhancement} enhancement
	 */
	function createEnhancement(card, action, enhancement) {
		const el = document.createElement("fh-enhancement");

		const kind = el.appendChild(document.createElement("div"));
		kind.className = `kind kind--${enhancement.kind}`;
		kind.append(createEnhancementKind(enhancement.kind));

		const costTable = document.createElement("div");
		costTable.className = "cost-list";

		if (enhancement.kind === "hex") {
			const numberOfHexes = /** @type {number} */ (enhancement.numberOfHexes);
			costTable.append(
				createCostComputation(
					createEnhancementSticker(
						"hex attack",
						"add hex to attack",
						`${numberOfHexes} → ${numberOfHexes + 1}`,
					),
					card,
					action,
					enhancement,
					baseCostAttackHex(numberOfHexes),
				),
			);
		} else {
			const ability = el.appendChild(document.createElement("div"));
			ability.className = `ability ability--${enhancement.ability}`;
			ability.append(createAbility(enhancement.ability));

			if (enhancement.ability != null) {
				costTable.append(
					createCostComputation(
						createEnhancementSticker("plus one", "plus one"),
						card,
						action,
						enhancement,
						baseCostPerAbility[enhancement.ability],
						enhancement.multiple && enhancement.ability !== "target",
					),
				);

				if (enhancement.ability === "move") {
					costTable.append(
						createCostComputation(
							createEnhancementSticker("jump", "add jump"),
							card,
							action,
							enhancement,
							baseCostJump,
							enhancement.multiple,
						),
					);
				}
			}

			if (enhancement.kind !== "square") {
				const elementContainer = document.createElement("div");
				elementContainer.className = "element-list";

				for (const element of elements) {
					elementContainer.appendChild(createEnhancementSticker(element, `create ${element}`));
				}

				costTable.append(
					createCostComputation(
						elementContainer,
						card,
						action,
						enhancement,
						baseCostOneElement,
					),
				);

				costTable.append(
					createCostComputation(
						createEnhancementSticker("wild", "create any element"),
						card,
						action,
						enhancement,
						baseCostAnyElement,
					),
				);
			}

			if (enhancement.kind === "diamond") {
				for (const [name, cost] of Object.entries(baseCostNegativeConditions)) {
					costTable.append(
						createCostComputation(
							createEnhancementSticker(name, `apply ${name}`),
							card,
							action,
							enhancement,
							cost,
							enhancement.multiple,
						),
					);
				}
			} else if (enhancement.kind === "diamond+") {
				for (const [name, cost] of Object.entries(baseCostPositiveConditions)) {
					costTable.append(
						createCostComputation(
							createEnhancementSticker(name, `apply ${name}`),
							card,
							action,
							enhancement,
							cost,
							enhancement.multiple,
						),
					);
				}
			}
		}

		el.appendChild(costTable);
		return el;
	}

	/** @param {Enhancement["kind"]} kind */
	function createEnhancementKind(kind) {
		const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		svg.classList.add("enhancement-kind");
		svg.setAttribute("viewBox", "0 0 24 24");

		switch (kind) {
			case "square":
				svg.innerHTML = `<rect x="6" y="6" width="12" height="12" stroke="currentColor"/>`;
				break;
			case "circle":
				svg.innerHTML = `<circle cx="12" cy="12" r="6" stroke="currentColor" />`;
				break;
			case "diamond":
				svg.innerHTML = `<rect x="-6" y="-6" width="12" height="12" stroke="currentColor" transform="rotate(45) translate(12, 12)" transform-origin="center"/>`;
				break;
			case "diamond+":
				svg.innerHTML =
					`<rect x="-6" y="-6" width="12" height="12" stroke="currentColor" transform="rotate(45) translate(12, 12)" transform-origin="center"/>` +
					`<line stroke="currentColor" x1="12" y1="9" x2="12" y2="15" />` +
					`<line stroke="currentColor" x1="9" y1="12" x2="15" y2="12" />`;
				break;
			case "hex":
				svg.innerHTML = `<path stroke="currentColor" d="M12 19.1603L18.2009 15.5802L18.2009 8.41988L12 4.83975L5.79898 8.41988L5.79898 15.5801L12 19.1603Z" />`;
		}

		svg.insertBefore(
			document.createElementNS("http://www.w3.org/2000/svg", "title"),
			svg.firstChild,
		).textContent = kind;

		return svg;
	}

	/**
	 * @param {Enhancement["ability"]} name
	 * @returns {Node}
	 */
	function createAbility(name) {
		if (!name) {
			return document.createTextNode("blank");
		}

		let imageName;
		if (name === "jump") {
			// We mapped jump to move so we could skip the "add jump" enhancement,
			// but we want to show the move icon
			imageName = "move";
		} else if (name.startsWith("summon ")) {
			imageName = name.slice("summon ".length);
		} else {
			imageName = name;
		}

		if (imageName !== "hp") {
			const imagePath = art.get(`${imageName} icon`);
			if (!imagePath) {
				throw new Error(
					`Failed to find asset for sticker ${JSON.stringify(imageName)}`,
				);
			}

			copySharedIcon(imageName, imagePath);
		} else {
			makeAsset(`_shared/hp.png`, async (url) =>
				sharp(
					await readFile(
						new URL("" + art.get("heal icon"), worldhavenImagesFolder),
					),
				)
					.resize({height: 60})
					.composite([
						{
							input: Buffer.from(
								`<svg width="40" height="60"><circle cx="20" cy="40" r="20" fill="#221e1f"/></svg>`,
							),
							blend: "over",
						},
					])
					.toFile(fileURLToPath(url)),
			);
		}

		const el = document.createElement("img");
		el.className = "ability-icon";
		el.src = `../_shared/${imageName}.png`;
		el.alt = name;
		el.title = name;

		return el;
	}

	/**
	 * @param {string} name
	 * @param {string} alt
	 * @param {string=} extra
	 * @returns {HTMLElement}
	 */
	function createEnhancementSticker(name, alt, extra) {
		const imageName = name.replaceAll(" ", "-");
		const imagePath = art.get(`${name} sticker`);
		if (!imagePath) {
			throw new Error(
				`Failed to find asset for sticker ${JSON.stringify(name)}`,
			);
		}

		copySharedIcon(imageName, imagePath);

		const el = document.createElement("img");
		el.className = "enhancement-sticker";
		el.src = `../_shared/${imageName}.png`;
		el.alt = alt;
		el.title = alt;

		if (!extra) {
			return el;
		}

		const wrapper = document.createElement("div");
		wrapper.append(el, ` ${extra}`);
		return wrapper;
	}

	/**
	 * @param {Element} name
	 * @param {Card} card
	 * @param {Action} action
	 * @param {Enhancement} enhancement
	 * @param {number} baseCost
	 * @param {boolean=} multiple
	 */
	function createCostComputation(
		name,
		card,
		action,
		enhancement,
		baseCost,
		multiple = false,
	) {
		const line = document.createElement("div");
		line.className = "computation";

		line.appendChild(name);

		const computation = line.appendChild(document.createElement("fh-cost"));

		computation.setAttribute("base-cost", String(baseCost));
		computation.setAttribute("card-level", String(card.level));

		if (multiple) {
			computation.setAttribute("target-multiple", "");
		}

		if (action.lost && !action.persistent) {
			computation.setAttribute("lost", "");
		}

		if (
			(enhancement.persistent ?? action.persistent) &&
			!enhancement.ability?.startsWith("summon")
		) {
			computation.setAttribute("persistent", "");
		}

		return line;
	}
}

await Promise.all(createdAssets.values());

/**
 * @param {string} assetName
 * @param {string} assetPath
 */
function copySharedIcon(assetName, assetPath) {
	makeAsset(`_shared/${assetName}.png`, async (url) =>
		sharp(await readFile(new URL(assetPath, worldhavenImagesFolder)))
			.resize({height: 60})
			.toFile(fileURLToPath(url)),
	);
}

/**
 * @param {Document} document
 * @param {string | null} characterName
 * @param {string} title
 */
function addHeader(document, characterName, title) {
	const header = document.body.insertBefore(
		document.createElement("header"),
		document.body.firstChild,
	);

	const characterList = header
		.appendChild(document.createElement("nav"))
		.appendChild(document.createElement("ul"));
	characterList.className = "character-list";

	for (const [otherCharacterName, otherCharacter] of characters) {
		const isActive = otherCharacterName === characterName;

		let anchor = characterList
			.appendChild(document.createElement("li"))
			.appendChild(document.createElement("a"));
		anchor.classList.add("character");
		anchor.classList.toggle("character--active", isActive);

		anchor.style.setProperty(
			"--color",
			otherCharacter.meta.color?.rgb ?? "#999",
		);

		anchor.href = `${characterName ? "../" : ""}${otherCharacterName}/${buildForDeployment ? "" : "index.html"}`;

		if (!isActive) {
			const icon = anchor.appendChild(document.createElement("img"));
			icon.src = `${characterName ? "../" : ""}${otherCharacterName}/icon.png`;
			icon.alt = otherCharacter.meta.name;
			icon.title = otherCharacter.meta.name;
		} else {
			const iconContainer = anchor.appendChild(
				document.createElement("picture"),
			);

			const altIcon = iconContainer.appendChild(
				document.createElement("source"),
			);
			altIcon.srcset = `${characterName ? "../" : ""}${otherCharacterName}/icon--black.png`;
			altIcon.media = "(prefers-color-scheme: dark)";

			const icon = iconContainer.appendChild(document.createElement("img"));
			icon.src = `${characterName ? "../" : ""}${otherCharacterName}/icon--white.png`;
			icon.alt = otherCharacter.meta.name;
			icon.title = otherCharacter.meta.name;
		}
	}

	const titleContainer = header.appendChild(document.createElement("div"));
	titleContainer.className = "header__title";

	titleContainer.appendChild(document.createElement("h1")).textContent = title;

	titleContainer.appendChild(document.createElement("fh-enhancer")).innerHTML =
		`
		  <h2 id=enhancer>Enhancer Level</h2>
		  <label><input type=radio name=enhancer value=1 checked></input>1</label>
		  <label><input type=radio name=enhancer value=2></input>2</label>
		  <label><input type=radio name=enhancer value=3></input>3</label>
		  <label><input type=radio name=enhancer value=4></input>4</label>
	  `;
}

/** @param {Document} document */
function installScriptAndStyle(document) {
	const style = document.head.appendChild(document.createElement("style"));
	style.textContent = styleText;

	const script = document.head.appendChild(document.createElement("script"));
	script.type = "module";
	script.textContent = scriptText;

	const meta = document.head.appendChild(document.createElement("meta"));
	meta.name = "viewport";
	meta.content = "width=device-width, initial-scale=1";
}

/**
 * @param {string} assetName
 * @param {(url: URL) => Promise<unknown>} create
 */
function makeAsset(assetName, create) {
	if (!createdAssets.has(assetName)) {
		const assetUrl = new URL(assetName, outputFolder);
		createdAssets.set(
			assetName,
			stat(assetUrl).catch(() => create(assetUrl)),
		);
	}
}
