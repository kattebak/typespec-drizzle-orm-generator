import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  $createdAt,
  $entity,
  $junction,
  $lib,
  $onEmit,
  $pk,
  $primaryKey,
  $references,
  $updatedAt,
  $uuid,
} from "../src/index.ts";

describe("package exports", () => {
  it("exports $lib with correct library name", () => {
    assert.equal($lib.name, "@kattebak/typespec-drizzle-orm-generator");
  });

  it("exports all decorator functions", () => {
    assert.equal(typeof $entity, "function");
    assert.equal(typeof $primaryKey, "function");
    assert.equal(typeof $pk, "function");
    assert.equal(typeof $references, "function");
    assert.equal(typeof $junction, "function");
    assert.equal(typeof $uuid, "function");
    assert.equal(typeof $createdAt, "function");
    assert.equal(typeof $updatedAt, "function");
  });

  it("exports $onEmit function", () => {
    assert.equal(typeof $onEmit, "function");
  });
});
