import * as esbuild from "esbuild";
import { createRequire } from "module";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

function copyCodiconsAssets() {
  const codiconsPkgJson = require.resolve("@vscode/codicons/package.json");
  const codiconsDistDir = path.join(path.dirname(codiconsPkgJson), "dist");

  const destDir = path.join(__dirname, "dist", "codicons");
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  for (const file of ["codicon.css", "codicon.ttf"]) {
    fs.copyFileSync(path.join(codiconsDistDir, file), path.join(destDir, file));
    console.log(`Copied ${file} → dist/codicons/`);
  }
}

const ctx = await esbuild.context({
  entryPoints: ["src/extension.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  external: ["vscode"],
  sourcemap: true,
  minify: production,
  logLevel: "info",
  outfile: "dist/extension.js"
});

copyCodiconsAssets();

if (watch) {
  await ctx.watch();
  console.log("Watching for changes...");
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
