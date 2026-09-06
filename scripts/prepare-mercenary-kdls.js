#!/usr/bin/env node
// @ts-check
// One-off script to generate skeleton .kdl files for the Mercenary Pack
// characters (Anaphi, Cassandra, Hail, Satha), sourced from
// gloomhaven-card-browser's data/character-abilities/mercenary.json and
// data/characters/mercenary.json. Enhancements are left empty; those get
// filled in by hand afterwards.

import {readFile, writeFile} from "node:fs/promises";
import {format} from "@bgotink/kdl/dessert";

import {dataFolder, gloomhavenCardBrowserDataFolder} from "./constants.js";
import {PlayerCharacter, Card, Action, CharacterMeta, Color} from "./model.js";

/** @type {{id: string; name: string; colour: string}[]} */
const mercCharacters = JSON.parse(
	await readFile(
		new URL("characters/mercenary.json", gloomhavenCardBrowserDataFolder),
		"utf8",
	),
);

/** @type {{name: string; image: string; level: string}[]} */
const mercCards = JSON.parse(
	await readFile(
		new URL(
			"character-abilities/mercenary.json",
			gloomhavenCardBrowserDataFolder,
		),
		"utf8",
	),
);

for (const {id, name, colour} of mercCharacters) {
	const cards = mercCards
		.filter((card) => card.image.includes(`/mercenary/${id}/`))
		.filter((card) => card.level !== "-") // skip the character-back reference card
		.map(
			(card) =>
				new Card(
					NaN,
					card.name,
					/** @type {Card['level']} */ (
						card.level === "X" ? "X" : +card.level
					),
					card.image,
					new Action(),
					new Action(),
				),
		);

	const character = new PlayerCharacter(
		new CharacterMeta("merc", name, undefined, id, new Color(colour)),
		cards,
	);

	const characterFile = new URL(
		`${name.toLowerCase().replaceAll(" ", "-")}.kdl`,
		dataFolder,
	);
	await writeFile(characterFile, format(character));
	console.log(`Wrote ${characterFile}`);
}
