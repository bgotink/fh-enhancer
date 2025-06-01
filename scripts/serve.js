#!/usr/bin/env node

import {createReadStream} from "node:fs";
import {stat} from "node:fs/promises";
import {createServer} from "node:http";
import {extname} from "node:path/posix";

const root = new URL("../src/", import.meta.url);

/** @type {Map<string, URL>} */
const urlMap = new Map();
/** @param {string} path */
function resolve(path) {
	let value = urlMap.get(path);
	if (value == null) {
		const originalPath = path;
		if (path === "/") {
			path = "index.html";
		} else if (path.startsWith("/")) {
			path = path.slice(1);
		}

		value = new URL(path, root);
		urlMap.set(originalPath, value);
	}

	return value;
}

const server = createServer((req, res) => {
	const path = resolve(new URL(req.url, "http://localhost:3000").pathname);

	stat(path).then(
		() => {
			res.setHeader(
				"Content-Type",
				{
					".html": "text/html",
					".js": "text/javascript",
					".png": "image/png",
					".css": "text/css",
					".json": "application/json",
				}[extname(path.pathname)] ?? "application/text",
			);
			res.writeHead(200);

			createReadStream(path).pipe(res);
		},
		() => {
			res.writeHead(404);
			res.end();
		},
	);
});

server.listen(3000);
console.log("Listening on http://localhost:3000");
