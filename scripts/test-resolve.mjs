import { existsSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src");
const extensions = [".ts", ".tsx", ".mjs", ".js"];

function candidate(base) {
  if (existsSync(base) && statSync(base).isFile()) return base;
  for (const ext of extensions) {
    if (existsSync(base + ext)) return base + ext;
  }
  for (const ext of extensions) {
    const index = path.join(base, "index" + ext);
    if (existsSync(index)) return index;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  let base = null;
  if (specifier.startsWith("@/")) {
    base = path.join(srcRoot, specifier.slice(2));
  } else if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:")) {
    base = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
  }
  if (base) {
    const found = candidate(base);
    if (found) return nextResolve(pathToFileURL(found).href, context);
  }
  return nextResolve(specifier, context);
}
