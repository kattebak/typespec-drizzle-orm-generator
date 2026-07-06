import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pluralize, toCamelCase, toSnakeCase, toTableVariableName } from "./naming.ts";

describe("toSnakeCase", () => {
  it("converts camelCase to snake_case", () => {
    assert.equal(toSnakeCase("authorId"), "author_id");
  });

  it("leaves an all-lowercase word unchanged", () => {
    assert.equal(toSnakeCase("name"), "name");
  });
});

describe("toCamelCase", () => {
  it("converts snake_case to camelCase", () => {
    assert.equal(toCamelCase("author_id"), "authorId");
  });

  it("converts a multi-segment snake_case name", () => {
    assert.equal(toCamelCase("thread_message_id"), "threadMessageId");
  });

  it("leaves a camelCase word unchanged", () => {
    assert.equal(toCamelCase("name"), "name");
  });
});

describe("pluralize", () => {
  it("turns a consonant+y into ies", () => {
    assert.equal(pluralize("story"), "stories");
  });

  it("keeps a vowel+y and appends s", () => {
    assert.equal(pluralize("day"), "days");
  });

  it("appends es after a sibilant ending", () => {
    assert.equal(pluralize("box"), "boxes");
    assert.equal(pluralize("dish"), "dishes");
  });

  it("appends s by default", () => {
    assert.equal(pluralize("book"), "books");
  });
});

describe("toTableVariableName", () => {
  it("lower-cases and pluralizes a PascalCase model name", () => {
    assert.equal(toTableVariableName("BookGenre"), "bookGenres");
  });

  it("keeps the singular form when pluralization is disabled", () => {
    assert.equal(toTableVariableName("BookGenre", false), "bookGenre");
  });
});
