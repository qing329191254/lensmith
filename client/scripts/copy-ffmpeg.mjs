import { copyFileSync, mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const srcDir = join(root, "node_modules", "@ffmpeg", "core", "dist", "esm")
const destDir = join(root, "public", "ffmpeg")

mkdirSync(destDir, { recursive: true })
copyFileSync(join(srcDir, "ffmpeg-core.js"), join(destDir, "ffmpeg-core.js"))
copyFileSync(join(srcDir, "ffmpeg-core.wasm"), join(destDir, "ffmpeg-core.wasm"))
console.log("[copy-ffmpeg] ready → public/ffmpeg")
