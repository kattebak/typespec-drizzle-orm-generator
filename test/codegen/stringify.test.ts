import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RawCode, stringifyObject } from "../../src/codegen/stringify.ts";

describe("stringifyObject", () => {
  // ===========================================
  // Primitives
  // ===========================================

  it("serializes string values", () => {
    const result = stringifyObject({ name: "hello" });
    assert.ok(result.includes('"hello"'));
  });

  it("serializes number values", () => {
    const result = stringifyObject({ count: 42 });
    assert.ok(result.includes("42"));
  });

  it("serializes boolean values", () => {
    const result = stringifyObject({ active: true, deleted: false });
    assert.ok(result.includes("true"));
    assert.ok(result.includes("false"));
  });

  it("serializes null", () => {
    const result = stringifyObject({ value: null });
    assert.ok(result.includes("null"));
  });

  it("serializes undefined", () => {
    const result = stringifyObject({ value: undefined });
    assert.ok(result.includes("undefined"));
  });

  // ===========================================
  // Compound types
  // ===========================================

  it("serializes nested objects", () => {
    const result = stringifyObject({ outer: { inner: 1 } });
    assert.ok(result.includes("outer"));
    assert.ok(result.includes("inner"));
    assert.ok(result.includes("1"));
  });

  it("serializes arrays", () => {
    const result = stringifyObject({ items: [1, "two", true] });
    assert.ok(result.includes("["));
    assert.ok(result.includes("1"));
    assert.ok(result.includes('"two"'));
    assert.ok(result.includes("true"));
  });

  it("serializes empty objects", () => {
    const result = stringifyObject({});
    assert.equal(result, "{}");
  });

  it("serializes empty arrays", () => {
    const result = stringifyObject({ items: [] });
    assert.ok(result.includes("[]"));
  });

  // ===========================================
  // RawCode
  // ===========================================

  it("injects RawCode verbatim", () => {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: testing raw SQL template output
    const result = stringifyObject({ expr: new RawCode("sql`${col} >= 5`") });
    // biome-ignore lint/suspicious/noTemplateCurlyInString: testing raw SQL template output
    assert.ok(result.includes("sql`${col} >= 5`"));
  });

  it("injects RawCode function expressions", () => {
    const result = stringifyObject({ fn: new RawCode("() => Date.now()") });
    assert.ok(result.includes("() => Date.now()"));
  });

  it("injects RawCode with generic type", () => {
    const result = stringifyObject({
      type: new RawCode('CustomAttributeType<string>("any")'),
    });
    assert.ok(result.includes('CustomAttributeType<string>("any")'));
  });

  it("mixes RawCode with regular values", () => {
    const result = stringifyObject({
      name: "test",
      value: 42,
      computed: new RawCode("fn()"),
    });
    assert.ok(result.includes('"test"'));
    assert.ok(result.includes("42"));
    assert.ok(result.includes("fn()"));
  });

  // ===========================================
  // Multiple keys
  // ===========================================

  it("preserves key order", () => {
    const result = stringifyObject({ a: 1, b: 2, c: 3 });
    const aPos = result.indexOf("a:");
    const bPos = result.indexOf("b:");
    const cPos = result.indexOf("c:");
    assert.ok(aPos < bPos);
    assert.ok(bPos < cPos);
  });

  it("handles deeply nested structures", () => {
    const result = stringifyObject({
      level1: { level2: { level3: "deep" } },
    });
    assert.ok(result.includes('"deep"'));
  });
});

describe("RawCode", () => {
  it("stores code string", () => {
    const raw = new RawCode("some.code()");
    assert.equal(raw.code, "some.code()");
  });
});
