import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  arrayLiteral,
  arrowFn,
  chainCall,
  exportConst,
  fnCall,
  formatCode,
  importDecl,
  objectLiteral,
  quoted,
} from "../../src/codegen/ast-helpers.ts";
import { RawCode } from "../../src/codegen/stringify.ts";

describe("quoted", () => {
  it("wraps a string in double quotes", () => {
    assert.equal(quoted("hello"), '"hello"');
  });
});

describe("fnCall", () => {
  it("generates a no-arg function call", () => {
    assert.equal(fnCall("notNull", []), "notNull()");
  });

  it("generates a single-arg function call", () => {
    assert.equal(fnCall("text", [quoted("name")]), 'text("name")');
  });

  it("generates a multi-arg function call", () => {
    assert.equal(
      fnCall("primaryKey", [quoted("pk"), "table.a", "table.b"]),
      'primaryKey("pk", table.a, table.b)',
    );
  });

  it("generates a call with an object arg", () => {
    const obj = objectLiteral([["length", "256"]]);
    const result = fnCall("varchar", [quoted("name"), obj]);
    assert.ok(result.includes('"name"'));
    assert.ok(result.includes("length"));
    assert.ok(result.includes("256"));
  });
});

describe("chainCall", () => {
  it("chains a single method", () => {
    const result = chainCall('text("name")', [{ method: "notNull" }]);
    assert.equal(result, 'text("name").notNull()');
  });

  it("chains multiple methods", () => {
    const result = chainCall('text("id")', [{ method: "primaryKey" }, { method: "defaultRandom" }]);
    assert.equal(result, 'text("id").primaryKey().defaultRandom()');
  });

  it("chains methods with arguments", () => {
    const result = chainCall('uniqueIndex("idx")', [
      { method: "on", args: ["table.a", "table.b"] },
    ]);
    assert.equal(result, 'uniqueIndex("idx").on(table.a, table.b)');
  });

  it("returns base when no calls", () => {
    const result = chainCall('text("x")', []);
    assert.equal(result, 'text("x")');
  });
});

describe("objectLiteral", () => {
  it("generates an empty object", () => {
    assert.equal(objectLiteral([]), "{}");
  });

  it("generates a single-entry object", () => {
    const result = objectLiteral([["name", 'text("name").notNull()']]);
    assert.ok(result.includes("name: text("));
    assert.ok(result.includes(".notNull()"));
  });

  it("generates a multi-entry object", () => {
    const result = objectLiteral([
      ["a", 'text("a")'],
      ["b", 'integer("b")'],
    ]);
    assert.ok(result.includes("a: text("));
    assert.ok(result.includes("b: integer("));
  });

  it("accepts RawCode values", () => {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: testing raw SQL template output
    const result = objectLiteral([["expr", new RawCode("sql`${col} > 0`")]]);
    // biome-ignore lint/suspicious/noTemplateCurlyInString: testing raw SQL template output
    assert.ok(result.includes("sql`${col} > 0`"));
  });

  it("preserves entry order", () => {
    const result = objectLiteral([
      ["first", "1"],
      ["second", "2"],
      ["third", "3"],
    ]);
    const firstPos = result.indexOf("first");
    const secondPos = result.indexOf("second");
    const thirdPos = result.indexOf("third");
    assert.ok(firstPos < secondPos);
    assert.ok(secondPos < thirdPos);
  });
});

describe("importDecl", () => {
  it("generates a named import", () => {
    assert.equal(
      importDecl(["text", "integer"], "drizzle-orm/pg-core"),
      'import { text, integer } from "drizzle-orm/pg-core";',
    );
  });

  it("generates a type import", () => {
    assert.equal(
      importDecl(["DrizzleClient"], "./types.js", { type: true }),
      'import type { DrizzleClient } from "./types.js";',
    );
  });

  it("generates a namespace import", () => {
    assert.equal(
      importDecl([], "./schema.js", { namespace: "schema" }),
      'import * as schema from "./schema.js";',
    );
  });

  it("generates a type namespace import", () => {
    assert.equal(
      importDecl([], "./schema.js", { type: true, namespace: "schema" }),
      'import type * as schema from "./schema.js";',
    );
  });
});

describe("exportConst", () => {
  it("generates an export const statement", () => {
    assert.equal(exportConst("x", "42"), "export const x = 42;");
  });

  it("generates export with function call value", () => {
    const result = exportConst("authors", 'pgTable("authors", {})');
    assert.equal(result, 'export const authors = pgTable("authors", {});');
  });
});

describe("arrayLiteral", () => {
  it("generates an empty array", () => {
    assert.equal(arrayLiteral([]), "[]");
  });

  it("generates a single-item array", () => {
    assert.equal(arrayLiteral([quoted("a")]), '["a"]');
  });

  it("generates a multi-item array", () => {
    assert.equal(arrayLiteral([quoted("a"), quoted("b"), quoted("c")]), '["a", "b", "c"]');
  });
});

describe("arrowFn", () => {
  it("generates a no-param arrow function", () => {
    assert.equal(arrowFn([], "42"), "() => 42");
  });

  it("generates a single-param arrow function", () => {
    assert.equal(arrowFn(["x"], "x + 1"), "(x) => x + 1");
  });

  it("generates a multi-param arrow function", () => {
    assert.equal(arrowFn(["a", "b"], "a + b"), "(a, b) => a + b");
  });
});

describe("formatCode", () => {
  it("formats valid TypeScript module code", () => {
    const input = 'import { text } from "drizzle-orm/pg-core";\nexport const x = text("a");';
    const result = formatCode(input);
    assert.ok(result.includes("import { text }"));
    assert.ok(result.includes("export const x"));
  });

  it("formats multiline code with consistent style", () => {
    const input = "const a=1;const b=2;";
    const result = formatCode(input);
    assert.ok(result.includes("const a = 1;"));
    assert.ok(result.includes("const b = 2;"));
  });
});
