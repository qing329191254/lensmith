import { copyFileSync, existsSync, mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const srcDir = join(root, "node_modules", "@ffmpeg", "core", "dist", "esm")
const destDir = join(root, "public", "ffmpeg")
const jsSrc = join(srcDir, "ffmpeg-core.js")
const wasmSrc = join(srcDir, "ffmpeg-core.wasm")

if (!existsSync(jsSrc) || !existsSync(wasmSrc)) {
  // postinstall may run before deps are fully linked in some install orders
  console.warn("[copy-ffmpeg] @ffmpeg/core not ready - skip (dev/build will copy)")
  process.exit(0)
}

mkdirSync(destDir, { recursive: true })
copyFileSync(jsSrc, join(destDir, "ffmpeg-core.js"))
copyFileSync(wasmSrc, join(destDir, "ffmpeg-core.wasm"))
console.log("[copy-ffmpeg] ready → public/ffmpeg")
