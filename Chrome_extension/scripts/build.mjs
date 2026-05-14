import { cp, mkdir, rm } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const dist = join(root, "dist")

await rm(dist, { recursive: true, force: true })
await mkdir(join(dist, "src"), { recursive: true })

await cp(join(root, "public"), dist, { recursive: true })
await cp(join(root, "src"), join(dist, "src"), { recursive: true })
await cp(join(root, "src", "styles.css"), join(dist, "styles.css"))

console.log("Myro extension built in Chrome_extension/dist")
