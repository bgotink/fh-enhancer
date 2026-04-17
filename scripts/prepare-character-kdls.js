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
 * @type {{name: string; level: string; expansion: string; image: string; "character-xws": string; assetno: string}[]}
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
		card.expansion !== "frosthaven" ||
		card.level === "#" ||
		seenCardNumbers.has(card.assetno)
	) {
		continue;
	}
	seenCardNumbers.add(card.assetno);

	const characterName = card["character-xws"];
	const character = (abilitiesPerCharacter[characterName] ??=
		new PlayerCharacter(new CharacterMeta("frosthaven", characterName)));

	const level =
		card.level === "x" ?
			"X"
		:	/** @type {Card['level']} */ (+card.level);

	character.cards.push(
		new Card(
			parseInt(card.assetno, 10),
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
		const characterFile = new URL(
			`${name.replaceAll(" ", "-")}.kdl`,
			dataFolder,
		);

		character.cards.sort((a, b) => a.number - b.number);

		try {
			const existingCharacter = parsePlayerCharacter(
				await readFile(characterFile, "utf8"),
			);
			merge(existingCharacter, character);
			character = existingCharacter;
		} catch {
			// ignore
		}

		await writeFile(characterFile, format(character));
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
