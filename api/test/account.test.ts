import assert from "node:assert/strict"
import { test } from "node:test"

import { resolveAccountType } from "../src/features/account/account.service.js"

void test("no stored choice and no inferred facts stays unset", () => {
  assert.equal(resolveAccountType(null, false, false), null)
})

void test("stored choice alone is respected", () => {
  assert.equal(resolveAccountType("player", false, false), "player")
  assert.equal(resolveAccountType("venue", false, false), "venue")
  assert.equal(resolveAccountType("both", false, false), "both")
})

void test("a completed assessment infers the player role", () => {
  assert.equal(resolveAccountType(null, true, false), "player")
})

void test("an owned venue infers the venue role", () => {
  assert.equal(resolveAccountType(null, false, true), "venue")
})

void test("both inferred facts resolve to both", () => {
  assert.equal(resolveAccountType(null, true, true), "both")
})

void test("a player-only account that provisions a venue becomes both", () => {
  assert.equal(resolveAccountType("player", false, true), "both")
})

void test("a venue-only account that completes the assessment becomes both", () => {
  assert.equal(resolveAccountType("venue", true, false), "both")
})

void test("stored 'both' with no inferred facts stays both", () => {
  assert.equal(resolveAccountType("both", false, false), "both")
})
