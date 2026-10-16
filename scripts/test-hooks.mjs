// Lets `node --test` run the TypeScript sources directly (Node ≥ 22.18 strips
// types natively): resolves the "@/…" path alias and extensionless relative
// imports the way the Next.js bundler does.
import { register } from "node:module";

register("./test-resolve.mjs", import.meta.url);
