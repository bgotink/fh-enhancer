#!/usr/bin/env node
// @ts-check

import {copyFile, mkdir, readFile, writeFile} from 'node:fs/promises';
import {format} from '@bgotink/kdl/dessert';
import { posix } from 'node:path';

import {PlayerCharacter, Card, Action, parsePlayerCharacter} from "./model.js";

const rootFolder = new URL("../third_party/worldhaven/", import.meta.url);
const targetFolder = new URL("../data/", import.meta.url);

/**
 * @type {{name: string; level: string; expansion: string; image: string; "character-xws": string; cardno: string}[]}
 */
const allAbilityCardList = JSON.parse(
	await readFile(new URL("data/character-ability-cards.js", rootFolder), 'utf8'),
);

/** @type {Record<string, PlayerCharacter>} */
const abilitiesPerCharacter = {};

const seenCardNumbers = new Set();
for (const card of allAbilityCardList) {
	if (card.expansion !== "Frosthaven" || card.level === "-" || seenCardNumbers.has(card.cardno)) {
		continue;
	}
	seenCardNumbers.add(card.cardno);

	const character = abilitiesPerCharacter[card['character-xws']] ??= new PlayerCharacter;

	const level = card.level === 'X' ? card.level : /** @type {Card['level']} */ (+card.level);

	character.cards.push(
		new Card(
			+card.cardno,
			card.name,
			level,
			card.image,
			new Action(),
			new Action()
		),
	);
}

await Promise.all(
	Object.entries(abilitiesPerCharacter).map(async ([name, character]) => {
		const characterFolder = new URL(`${name}/`, targetFolder);
		const imagesFolder = new URL('images/', characterFolder);

		await mkdir(imagesFolder, { recursive: true });

		await Promise.all(
			character.cards.map(async card => {
				const filename = posix.basename(card.imagePath)
				await copyFile(new URL('images/' + card.imagePath, rootFolder), new URL(filename, imagesFolder));

				card.imagePath = `images/${filename}`;
			})
		);

		character.cards.sort((a, b) => a.number - b.number);

		try {
			const existingCharacter = parsePlayerCharacter(await readFile(new URL('character.kdl', characterFolder), 'utf8'));
			merge(existingCharacter, character);
			character = existingCharacter;
		} catch {
			// ignore
		}

		// character.cards.sort((a, b) => {
		// 	if (a.level !== b.level) {
		// 		return (a.level === 'X' ? 1.5 : a.level) - (b.level === 'X' ? 1.5 : b.level);
		// 	}

		// 	return a.name.localeCompare(b.name);
		// })

		await writeFile(new URL('character.kdl', characterFolder), format(character));
	}),
);

/**
 * @param {PlayerCharacter} target
 * @param {PlayerCharacter} source
 */
function merge(target, source) {
	const targetCardsByNumber = new Map(target.cards.map(card => [card.number, card]));

	target.cards = source.cards.map(card => {
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
