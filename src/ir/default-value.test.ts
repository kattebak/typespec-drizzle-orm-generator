import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import type { ModelProperty } from "@typespec/compiler";
import { createTestHost } from "@typespec/compiler/testing";
import type { DefaultRead } from "./default-value.ts";
import { readDefaultValue } from "./default-value.ts";

/**
 * Defaults are read off compiled TypeSpec, not hand-built fixtures: every shape
 * here is a `Value` from the compiler's own checker, so a compiler change to how
 * a default is represented fails these instead of silently dropping the default
 * from the generated schema.
 */
describe("readDefaultValue over compiled TypeSpec", () => {
  let defaults: Map<string, DefaultRead>;

  before(async () => {
    const host = await createTestHost();
    host.addTypeSpecFile(
      "main.tsp",
      `
      namespace Test;

      enum Category {
        Uncategorized: "uncategorized",
        Newsletter: "newsletter",
      }

      enum Bare {
        First,
      }

      model Row {
        text: string = "plain";
        escaped: string = "\\\\Seen";
        count: int32 = 3;
        big: int64 = 9007199254740993;
        flag: boolean = true;
        category: Category = Category.Uncategorized;
        bare: Bare = Bare.First;
        flags: string[] = #[];
        preset: string[] = #["a"];
        categories: Category[] = #[Category.Newsletter, Category.Uncategorized];
        mixed: (int32 | boolean)[] = #[1, true];
        nested: string[][] = #[#["x"], #[]];
        huge: int64[] = #[9007199254740993];
        records: {}[] = #[#{}];
        plain: string;
      }
      `,
    );
    await host.compile("main.tsp");

    const row = [...host.program.checker.getGlobalNamespaceType().namespaces.values()]
      .flatMap((ns) => [...ns.models.values()])
      .find((model) => model.name === "Row");
    if (!row) throw new Error("model Row not found");

    defaults = new Map(
      [...row.properties].map(([name, prop]: [string, ModelProperty]) => [
        name,
        readDefaultValue(prop),
      ]),
    );
  });

  it("reads a string default", () => {
    assert.deepEqual(defaults.get("text"), { kind: "value", value: "plain" });
    assert.deepEqual(defaults.get("escaped"), { kind: "value", value: "\\Seen" });
  });

  it("reads a numeric default as a number", () => {
    assert.deepEqual(defaults.get("count"), { kind: "value", value: 3 });
  });

  it("falls back to bigint for a numeric default no double can hold", () => {
    assert.deepEqual(defaults.get("big"), { kind: "value", value: 9007199254740993n });
  });

  it("reads a boolean default", () => {
    assert.deepEqual(defaults.get("flag"), { kind: "value", value: true });
  });

  it("reads an enum member default as its stored value", () => {
    assert.deepEqual(defaults.get("category"), { kind: "value", value: "uncategorized" });
  });

  it("falls back to the member name for a valueless enum member", () => {
    assert.deepEqual(defaults.get("bare"), { kind: "value", value: "First" });
  });

  it("reads an empty array default", () => {
    assert.deepEqual(defaults.get("flags"), { kind: "value", value: [] });
  });

  it("reads a non-empty array default", () => {
    assert.deepEqual(defaults.get("preset"), { kind: "value", value: ["a"] });
  });

  it("reads an array of enum members as their stored values", () => {
    assert.deepEqual(defaults.get("categories"), {
      kind: "value",
      value: ["newsletter", "uncategorized"],
    });
  });

  it("reads numeric, boolean and nested array elements", () => {
    assert.deepEqual(defaults.get("mixed"), { kind: "value", value: [1, true] });
    assert.deepEqual(defaults.get("nested"), { kind: "value", value: [["x"], []] });
  });

  it("flags an array element JSON cannot hold exactly", () => {
    assert.equal(defaults.get("huge")?.kind, "unrepresentable");
  });

  it("flags an array element with no literal form", () => {
    assert.deepEqual(defaults.get("records"), {
      kind: "unrepresentable",
      element: "an object",
    });
  });

  it("has no default for a property without one", () => {
    assert.deepEqual(defaults.get("plain"), { kind: "none" });
  });
});
