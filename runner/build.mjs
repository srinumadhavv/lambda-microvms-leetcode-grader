// Bundles the runner into ONE file so the image needs no node_modules.
import { build } from "esbuild";

await build({
  entryPoints: ["runner/src/server.ts"],
  outfile: "runner/dist/server.js",
  bundle: true,
  platform: "node",
  target: "node18", // the base image's dnf nodejs is v18
  format: "cjs",
  minify: false,
});
console.log("built runner/dist/server.js");
