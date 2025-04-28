// @ts-check

import {getLocation, InvalidKdlError, parse} from '@bgotink/kdl';
import {deserialize, format, KdlDeserializeError} from '@bgotink/kdl/dessert';

/** @import {DeserializationContext, DocumentSerializationContext, SerializationContext} from "@bgotink/kdl/dessert"; */

const kinds = new Set([
	'square',
	'circle',
	'diamond',
	'diamond+',
	'attack hex',
]);

/**
 * @param {string} kind
 * @returns {kind is Enhancement['kind']}
 */
function isValidKind(kind) {
	return kinds.has(kind);
}

const abilities = new Set([
	'move' , 'jump' , 'attack' , 'range' , 'target' , 'shield' , 'retaliate' , 'pierce' , 'heal' , 'push' , 'pull' , 'teleport' , 'summon hp' , 'summon move' , 'summon attack' , 'summon range', null
]);

/**
 * @param {string?} ability
 * @returns {ability is Enhancement['ability']}
 */
function isValidAbility(ability) {
	return abilities.has(ability);
}

export class Enhancement {
	/**
	 * @type {'square' | 'circle' | 'diamond' | 'diamond+' | 'attack hex'}
   */
	kind;

	/**
	 * @type {'move' | 'jump' | 'attack' | 'range' | 'target' | 'shield' | 'retaliate' | 'pierce' | 'heal' | 'push' | 'pull' | 'teleport' | 'summon hp' | 'summon move' | 'summon attack' | 'summon range'| null}
   */
	ability;

	/** @type {number=} */
	numberOfHexes;

	/** @type {boolean=} */
	multiple;

	/** @type {DeserializationContext=} */
	#ctx;

	/** @param {DeserializationContext} ctx */
	static deserialize(ctx) {
		const kind = ctx.property.required("kind", "string");
		if (!isValidKind(kind)) {
			throw new Error(`Invalid kind: ${kind}`);
		}

		let ability = null;
		let numberOfHexes = undefined;

		if (kind !== 'attack hex') {
			ability = ctx.property.required("ability", "string", "null");
			if (!isValidAbility(ability)) {
				throw new Error(`Invalid ability: ${ability}`);
			}
		} else {
			numberOfHexes = ctx.property.required("number-of-hexes", "number");
		}

		const multiple = ctx.property("multiple", "boolean");

		const enhancement = new Enhancement(kind, ability, numberOfHexes, multiple);
		enhancement.#ctx = ctx;
		return enhancement;
	}

	/**
	* @param {Enhancement["kind"]} kind
	* @param {Enhancement["ability"]} ability
	* @param {Enhancement["numberOfHexes"]} numberOfHexes
	* @param {Enhancement["multiple"]} multiple
	*/
	constructor(kind, ability, numberOfHexes, multiple) {
		this.kind = kind;
		this.ability = ability;
		this.numberOfHexes = numberOfHexes;
		this.multiple = multiple;
	}

	/** @param {SerializationContext} ctx */
	serialize(ctx) {
		ctx.source(this.#ctx);

		ctx.property("kind", this.kind);
		if (this.kind !== 'attack hex') {
			ctx.property("ability", this.ability);
		} else {
			ctx.property("number-of-hexes", /** @type {number} */ (this.numberOfHexes));
		}

		if (this.multiple != null) {
			ctx.property("multiple", this.multiple);
		}
	}
}

export class Action {
	/** @type {Enhancement[]?} */
	enhancements;

	/** @type {boolean=} */
	lost;
	/** @type {boolean=} */
	persistent;

	/** @type {DeserializationContext=} */
	#ctx;

	/** @param {DeserializationContext} ctx */
	static deserialize(ctx) {
		const lost = ctx.property("lost", "boolean");
		const persistent = ctx.property("persistent", "boolean");

		const enhancements = ctx.children("enhancement", Enhancement);

		const action = new Action(enhancements, lost, persistent);
		action.#ctx = ctx;
		return action;
	}

	/**
	 * @param {Action["enhancements"]=} enhancements
	 * @param {Action["lost"]=} lost
	 * @param {Action["persistent"]=} persistent
	 */
	constructor(enhancements = [], lost, persistent) {
		this.enhancements = enhancements;
		this.lost = lost;
		this.persistent = persistent;
	}

	/** @param {SerializationContext} ctx */
	serialize(ctx) {
		ctx.source(this.#ctx);

		if (this.lost != null) {
			ctx.property("lost", this.lost);
		}

		if (this.persistent != null) {
			ctx.property("persistent", this.persistent);
		}

		for (const enhancement of this.enhancements ?? []) {
			ctx.child("enhancement", enhancement);
		}
	}
}

/**
 *
 * @param {string | number} level
 * @returns {level is Card['level']}
 */
function isValidLevel(level) {
	if (typeof level === 'string') {
		return level === 'X';
	} else {
		return level >= 1 && level <= 9;
	}
}

export class Card {
	/** @type {number} */
	number;

	/** @type {string} */
	name;

	/** @type {1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 'X'} */
	level;

	/** @type {string} */
	imagePath;

	/** @type {Action=} */
	top;

	/** @type {Action=} */
	bottom;

	/** @type {DeserializationContext=} */
	#ctx;

	/** @param {DeserializationContext} ctx */
	static deserialize(ctx) {
		const number = ctx.argument.required("number");
		const name = ctx.argument.required("string");
		const level = ctx.property.required("level", "number", "string");
		if (!isValidLevel(level)) {
			throw new Error(`Invalid level: ${level}`);
		}
		const imagePath = ctx.property.required("image-path", "string");

		const top = ctx.child("top", Action);
		const bottom = ctx.child("bottom", Action);

		const card = new Card(number, name, level, imagePath, top, bottom);
		card.#ctx = ctx;
		return card;
	}

	/**
	 * @param {Card['number']} number
	 * @param {Card['name']} name
	 * @param {Card['level']} level
	 * @param {Card['imagePath']} imagePath
	 * @param {Card['top']=} top
	 * @param {Card['bottom']=} bottom
   */
	constructor(number, name, level, imagePath, top, bottom) {
		this.number = number;
		this.name = name;
		this.level = level;
		this.imagePath = imagePath;
		this.top = top;
		this.bottom = bottom;
	}

	/** @param {SerializationContext} ctx */
	serialize(ctx) {
		ctx.source(this.#ctx);

		ctx.argument(this.number);
		ctx.argument(this.name);

		ctx.property("level", this.level);
		ctx.property("image-path", this.imagePath);

		if (this.top) {
			ctx.child("top", this.top);
		}
		if (this.bottom) {
			ctx.child("bottom", this.bottom);
		}
	}
}

export class PlayerCharacter {
	cards;

	/** @type {DeserializationContext=} */
	#ctx;

	/** @param {DeserializationContext} ctx */
	static deserialize(ctx) {
		const cards = ctx.children("card", Card);

		const character = new PlayerCharacter(cards);
		character.#ctx = ctx;
		return character;
	}

	/** @param {Card[]=} cards */
	constructor(cards = []) {
		this.cards = cards;
	}

	/** @param {DocumentSerializationContext} ctx */
	serialize(ctx) {
		ctx.source(this.#ctx);

		for (const card of this.cards) {
			ctx.child("card", card);
		}
	}
}

/** @param {string} text */
export function parsePlayerCharacter(text) {
	let document;
	try {
		document = parse(text, {storeLocations: true});
	} catch (e) {
		if (!(e instanceof InvalidKdlError)) {
			throw e;
		}

		console.error("Invalid KDL file:");
		for (const err of e.flat()) {
			let message = `- ${err.message}`;

			if (err.start) {
				message += ` at ${err.start.line}:${err.start.column}`;

				if (err.end && err.end.offset !== err.start.offset) {
					if (err.end.line === err.start.line) {
						message += `-${err.end.column}`;
					} else {
						message += `-${err.end.line}:${err.end.column}`;
					}
				}
			}

			console.log(message);
		}

		throw new Error("Invalid KDL file");
	}

	try {
		return deserialize(document, PlayerCharacter);
	} catch (e) {
		if (!(e instanceof KdlDeserializeError)) {
			throw e;
		}

		console.log("Invalid character file:");

		let message = e.message;
		const location = getLocation(e.location);
		if (location) {
			message += ` at ${location.start.line}:${location.start.column}`;

			if (location.end && location.end.offset !== location.start.offset) {
				if (location.end.line === location.start.line) {
					message += `-${location.end.column}`;
				} else {
					message += `-${location.end.line}:${location.end.column}`;
				}
			}
		}

		console.log(message);
		throw new Error("Invalid character file");
	}
}

/** @param {PlayerCharacter} pc */
export function stringifyPlayerCharacter(pc) {
	return format(pc);
}
