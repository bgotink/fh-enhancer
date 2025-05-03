#!/usr/bin/env node
// @ts-check

import {copyFile, readdir, readFile, writeFile} from "node:fs/promises";
import {env} from "node:process";
import {fileURLToPath} from "node:url";
import {JSDOM} from "jsdom";
import sharp from "sharp";

import {
  PlayerCharacter,
  Card,
  Action,
  parsePlayerCharacter,
  Enhancement,
} from "./model.js";

const buildForDeployment = !!env.CI;

const worldhavenFolder = new URL("../third_party/worldhaven/", import.meta.url);
const rootFolder = new URL("../data/", import.meta.url);
const sharedFolder = new URL("_shared/", rootFolder);

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

for (const characterName of await readdir(rootFolder)) {
  let characterString;

  try {
    characterString = await readFile(
      new URL(`${characterName}/character.kdl`, rootFolder),
      "utf8",
    );
  } catch {
    continue;
  }

  characters.set(characterName, parsePlayerCharacter(characterString));
}

const art = new Map(
  /** @type {{expansion: string; name: string; image: string;}[]} */ (
    JSON.parse(await readFile(new URL("data/art.js", worldhavenFolder), "utf8"))
  )
    .filter((item) => item.expansion === "Frosthaven")
    .map((item) => [item.name, item.image]),
);

await Promise.all(
  Array.from(characters, async ([characterName, character]) => {
    const icon = art.get(`${characterName.replaceAll("-", " ")} icon`);

    if (icon == null) {
      throw new Error(`Couldn't find icon for ${characterName}`);
    }

    const image = await readFile(new URL(`images/${icon}`, worldhavenFolder));

    await writeFile(new URL(`${characterName}/icon.png`, rootFolder), image);

    const characterColor = character.meta.color?.rgb ?? "#999";

    for (const [filename, color] of [
      ["icon.png", characterColor],
      ["icon--white.png", "white"],
      ["icon--black.png", "black"],
    ]) {
      await sharp(image)
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
        .toFile(
          fileURLToPath(new URL(`${characterName}/${filename}`, rootFolder)),
        );
    }

      await sharp(image)
        .rotate()
        .resize({
          width: 280,
          height: 280,
          fit: "contain",
          background: "transparent",
        })
        .extend({
          background: "transparent",
          top: 60,
          right: 60,
          bottom: 60,
          left: 60,
        })
        .composite([
          {
            input: Buffer.from(
              `<svg><rect x="0" y="0" width="400" height="400" rx="120" ry="120" fill="${characterColor}"/></svg>`,
            ),
            blend: "dest-atop",
          },
        ])
        .toFile(
          fileURLToPath(new URL(`${characterName}/favicon.png`, rootFolder)),
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

  await writeFile(new URL("index.html", rootFolder), jsdom.serialize());
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
    document.body.append(createCard(card));
  }

  await writeFile(
    new URL(`${characterName}/index.html`, rootFolder),
    jsdom.serialize(),
  );

  /** @param {Card} card */
  function createCard(card) {
    const el = document.createElement("div");
    el.classList.add("card");

    el.appendChild(document.createElement("img")).src = card.imagePath;
    el.appendChild(document.createElement("h3")).textContent = card.name;

    const top = document.createElement("div");
    top.classList.add("action", "top");
    const bottom = document.createElement("div");
    bottom.classList.add("action", "bottom");

    const section = document.createElement("section");
    section.append(el, createAction(card, "top"), createAction(card, "bottom"));

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
    kind.textContent = enhancement.kind;

    const costTable = document.createElement("div");
    costTable.className = "cost-list";

    if (enhancement.kind === "attack hex") {
      const numberOfHexes = /** @type {number} */ (enhancement.numberOfHexes);
      costTable.append(
        createCostComputation(
          `${numberOfHexes} → ${numberOfHexes + 1}`,
          card,
          action,
          enhancement,
          baseCostAttackHex(numberOfHexes),
        ),
      );
    } else {
      const ability = el.appendChild(document.createElement("div"));
      ability.className = `ability ability--${enhancement.ability}`;
      ability.textContent = enhancement.ability ?? "no ability";

      if (enhancement.ability != null) {
        costTable.append(
          createCostComputation(
            "+1",
            card,
            action,
            enhancement,
            baseCostPerAbility[enhancement.ability],
            enhancement.multiple,
          ),
        );

        if (enhancement.ability === "move") {
          costTable.append(
            createCostComputation(
              "add jump",
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
        costTable.append(
          createCostComputation(
            "create one element",
            card,
            action,
            enhancement,
            baseCostOneElement,
          ),
        );
        costTable.append(
          createCostComputation(
            "create any element",
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
              `apply ${name}`,
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
              `apply ${name}`,
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

  /**
   * @param {string} name
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

    const nameEl = line.appendChild(document.createElement("div"));
    nameEl.className = "computation__name";
    nameEl.textContent = name;

    const computation = line.appendChild(document.createElement("fh-cost"));

    computation.setAttribute("base-cost", String(baseCost));
    computation.setAttribute("card-level", String(card.level));

    if (multiple) {
      computation.setAttribute("target-multiple", "");
    }

    if (action.lost && !action.persistent) {
      computation.setAttribute("lost", "");
    }

    if (action.persistent && !enhancement.ability?.startsWith("summon")) {
      computation.setAttribute("persistent", "");
    }

    return line;
  }
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

  header.appendChild(document.createElement("h1")).textContent = title;

  header.appendChild(document.createElement("fh-enhancer")).innerHTML = `
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
}
