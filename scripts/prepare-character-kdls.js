#!/usr/bin/env node
// @ts-check

import {readFile, writeFile} from "node:fs/promises";
import {format} from "@bgotink/kdl/dessert";

import {dataFolder, worldhavenDataFolder} from "./constants.js";
import {
	PlayerCharacter,
	Card,
	Action,
	parsePlayerCharacter,
	CharacterMeta,
} from "./model.js";

/**
 * @type {{name: string; level: string; expansion: string; image: string; "character-xws": string; cardno: string}[]}
 */
const allAbilityCardList = JSON.parse(
	await readFile(
		new URL("character-ability-cards.js", worldhavenDataFolder),
		"utf8",
	),
);

/** @type {Record<string, PlayerCharacter>} */
const abilitiesPerCharacter = {};

const seenCardNumbers = new Set();
for (const card of allAbilityCardList) {
	if (
		card.expansion !== "Frosthaven" ||
		card.level === "-" ||
		seenCardNumbers.has(card.cardno)
	) {
		continue;
	}
	seenCardNumbers.add(card.cardno);

	let characterName = card["character-xws"];
	// typo in the data file?
	if (characterName === "deminate") {
		characterName = "geminate";
	}

	const character = (abilitiesPerCharacter[characterName] ??=
		new PlayerCharacter(new CharacterMeta(characterName)));

	const level =
		card.level === "X" ?
			card.level
		:	/** @type {Card['level']} */ (+card.level);

	character.cards.push(
		new Card(
			+card.cardno,
			card.name,
			level,
			card.image,
			new Action(),
			new Action(),
		),
	);
}

await Promise.all(
	Object.entries(abilitiesPerCharacter).map(async ([name, character]) => {
		const characterFolder = new URL(
			`${name.replaceAll(" ", "-")}/`,
			dataFolder,
		);

		character.cards.sort((a, b) => a.number - b.number);

		try {
			const existingCharacter = parsePlayerCharacter(
				await readFile(new URL("character.kdl", characterFolder), "utf8"),
			);
			merge(existingCharacter, character);
			character = existingCharacter;
		} catch {
			// ignore
		}

		await writeFile(
			new URL("character.kdl", characterFolder),
			format(character),
		);
	}),
);

/**
 * @param {PlayerCharacter} target
 * @param {PlayerCharacter} source
 */
function merge(target, source) {
	const targetCardsByNumber = new Map(
		target.cards.map((card) => [card.number, card]),
	);

	target.cards = source.cards.map((card) => {
		const targetCard = targetCardsByNumber.get(card.number);
		if (targetCard == null) {
			return card;
		}

		targetCard.imagePath = card.imagePath;
		targetCard.level = card.level;
		targetCard.name = card.name;

		return targetCard;
	});
}
