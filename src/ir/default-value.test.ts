import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import type { ModelProperty } from "@typespec/compiler";
import { createTestHost } from "@typespec/compiler/testing";
import { readDefaultValue } from "./default-value.ts";
import type { DefaultValue } from "./types.ts";

/**
 * Defaults are read off compiled TypeSpec, not hand-built fixtures: every shape
 * here is a `Value` from the compiler's own checker, so a compiler change to how
 * a default is represented fails these instead of silently dropping the default
 * from the generated schema.
 */
describe("readDefaultValue over compiled TypeSpec", () => {
  let defaults: Map<string, DefaultValue | undefined>;

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
    assert.equal(defaults.get("text"), "plain");
    assert.equal(defaults.get("escaped"), "\\Seen");
  });

  it("reads a numeric default as a number", () => {
    assert.equal(defaults.get("count"), 3);
  });

  it("falls back to bigint for a numeric default no double can hold", () => {
    assert.equal(defaults.get("big"), 9007199254740993n);
  });

  it("reads a boolean default", () => {
    assert.equal(defaults.get("flag"), true);
  });

  it("reads an enum member default as its stored value", () => {
    assert.equal(defaults.get("category"), "uncategorized");
  });

  it("falls back to the member name for a valueless enum member", () => {
    assert.equal(defaults.get("bare"), "First");
  });

  it("reads an empty array default", () => {
    assert.deepEqual(defaults.get("flags"), []);
  });

  it("has no default for a non-empty array, which no column default expresses", () => {
    assert.equal(defaults.get("preset"), undefined);
  });

  it("has no default for a property without one", () => {
    assert.equal(defaults.get("plain"), undefined);
  });
});
