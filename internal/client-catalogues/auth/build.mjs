import { copyFile, cp, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const source = process.argv[2] && resolve(process.argv[2]);
const release = process.argv[3] && resolve(process.argv[3]);
if (!source || !release || release === source || release.startsWith(source + "/")) {
  throw new Error("Usage: node build.mjs <existing catalogue export> <new staging directory>");
}

const pages = ["index.html", "catalogues.json", "site.css", "site.js"];
for (const page of pages) {
  if (!(await stat(join(source, page))).isFile()) throw new Error(`Missing catalogue file: ${page}`);
}
const photos = await readdir(join(source, "assets"), { withFileTypes: true });
if (!photos.length || photos.some((file) => !file.isFile() || !/^[A-Za-z0-9_.-]+\.(?:webp|otf|ttf)$/.test(file.name))) {
  throw new Error("Unexpected files in the catalogue assets directory");
}
const { clientLogos = {} } = JSON.parse(await readFile(join(source, "catalogues.json"), "utf8"));
const assetNames = new Set(photos.map((file) => file.name));
for (const slug of Object.values(clientLogos)) {
  if (typeof slug !== "string" || !/^[a-z0-9-]+$/.test(slug) || !assetNames.has(`client-logo-${slug}.webp`)) {
    throw new Error("The catalogue references a client logo missing from the export.");
  }
}

await mkdir(release);
const output = join(release, ".vercel", "output");
const handler = join(output, "functions", "profile.func");
const privateFiles = join(handler, "catalogue");
const here = dirname(fileURLToPath(import.meta.url));
await mkdir(privateFiles, { recursive: true });
for (const page of pages) await copyFile(join(source, page), join(privateFiles, page));
await copyFile(join(here, "../../../public/assets/img/favicon.png"), join(privateFiles, "favicon.png"));
await cp(join(source, "assets"), join(privateFiles, "assets"), { recursive: true });
for (const file of ["server.mjs", "pages.mjs"]) await copyFile(join(here, file), join(handler, file));

await writeFile(join(handler, ".vc-config.json"), JSON.stringify({
  runtime: "nodejs22.x",
  handler: "server.mjs",
  launcherType: "Nodejs",
  supportsResponseStreaming: true
}));
await writeFile(join(output, "config.json"), JSON.stringify({
  version: 3,
  routes: [{ src: "^/.*$", dest: "/profile" }]
}));
console.log(`Packaged ${pages.length + photos.length + 1} catalogue files inside the authenticated function.`);
