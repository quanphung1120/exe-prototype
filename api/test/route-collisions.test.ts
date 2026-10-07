import assert from "node:assert/strict"
import { readdirSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"
import { pathToFileURL } from "node:url"

import "reflect-metadata"

import { RequestMethod } from "@nestjs/common"
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants.js"

/**
 * Two controllers answering the same method + path is silent in Nest: the
 * module registered first wins and the other route is unreachable. A legacy
 * `@Controller()` once shadowed `GET /api/notifications` and `GET /api/rooms`
 * this way, serving stale demo data instead of the real feeds.
 */
void test("no two controller routes share a method and path", async () => {
  const featuresDir = join(import.meta.dirname, "../src/features")
  const files = readdirSync(featuresDir, { recursive: true })
    .map(String)
    .filter((f) => f.endsWith(".controller.ts"))

  const owners = new Map<string, string>()
  const collisions: string[] = []
  const norm = (p: unknown) =>
    (typeof p === "string" ? p : "").split("/").filter(Boolean).join("/")

  for (const file of files) {
    const mod = (await import(
      pathToFileURL(join(featuresDir, file)).href
    )) as Record<string, unknown>
    for (const [name, ctrl] of Object.entries(mod)) {
      if (typeof ctrl !== "function") continue
      const base: unknown = Reflect.getMetadata(PATH_METADATA, ctrl)
      if (base === undefined) continue
      const proto = (ctrl as { prototype: object }).prototype
      for (const key of Object.getOwnPropertyNames(proto)) {
        const handler = (proto as Record<string, unknown>)[key]
        if (typeof handler !== "function") continue
        const method: unknown = Reflect.getMetadata(METHOD_METADATA, handler)
        if (method === undefined) continue
        const path = Reflect.getMetadata(PATH_METADATA, handler) as unknown
        const route = `${RequestMethod[method as number]} /${[norm(base), norm(path)].filter(Boolean).join("/")}`
        const owner = `${name}.${key}`
        const prior = owners.get(route)
        if (prior) collisions.push(`${route}: ${prior} vs ${owner}`)
        else owners.set(route, owner)
      }
    }
  }

  assert.ok(owners.size > 0, "no controller routes were discovered")
  assert.deepEqual(collisions, [])
})
