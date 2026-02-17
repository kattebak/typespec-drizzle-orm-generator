import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DecoratorContext, Model, ModelProperty } from "@typespec/compiler";
import {
  $check,
  $compositeUnique,
  $createdAt,
  $entity,
  $foreignKeyDef,
  $indexDef,
  $junction,
  $maxValue,
  $minValue,
  $pk,
  $primaryKey,
  $references,
  $unique,
  $updatedAt,
  $uuid,
  $visibility,
} from "../../src/decorators.ts";
import { StateKeys } from "../../src/lib.ts";

/**
 * Creates a mock TypeSpec Program-like object with state maps and sets.
 * Simulates the behavior of the real Program without requiring full compilation.
 */
function createMockProgram() {
  const maps = new Map<symbol, Map<unknown, unknown>>();
  const sets = new Map<symbol, Set<unknown>>();

  return {
    stateMap(key: symbol) {
      let map = maps.get(key);
      if (!map) {
        map = new Map();
        maps.set(key, map);
      }
      return map;
    },
    stateSet(key: symbol) {
      let set = sets.get(key);
      if (!set) {
        set = new Set();
        sets.set(key, set);
      }
      return set;
    },
  };
}

function createMockContext(program: ReturnType<typeof createMockProgram>): DecoratorContext {
  return { program } as unknown as DecoratorContext;
}

function mockModel(name: string): Model {
  return { kind: "Model", name } as unknown as Model;
}

function mockProp(name: string): ModelProperty {
  return { kind: "ModelProperty", name } as unknown as ModelProperty;
}

function mockPropWithModel(name: string, model: object): ModelProperty {
  return { kind: "ModelProperty", name, model } as unknown as ModelProperty;
}

describe("decorator functions", () => {
  // ===========================================
  // @entity
  // ===========================================

  it("$entity stores name and service in entity state map", () => {
    const program = createMockProgram();
    const ctx = createMockContext(program);
    const model = mockModel("Author");

    $entity(ctx, model, "Author", "bookstore");

    const stored = program.stateMap(StateKeys.entity).get(model);
    assert.deepEqual(stored, { name: "Author", service: "bookstore" });
  });

  // ===========================================
  // @primaryKey
  // ===========================================

  it("$primaryKey stores table name in primaryKey state map", () => {
    const program = createMockProgram();
    const ctx = createMockContext(program);
    const model = mockModel("Author");

    $primaryKey(ctx, model, "authors");

    const stored = program.stateMap(StateKeys.primaryKey).get(model);
    assert.deepEqual(stored, { tableName: "authors" });
  });

  // ===========================================
  // @pk
  // ===========================================

  it("$pk adds property to pk state set", () => {
    const program = createMockProgram();
    const ctx = createMockContext(program);
    const prop = mockProp("authorId");

    $pk(ctx, prop);

    assert.ok(program.stateSet(StateKeys.pk).has(prop));
  });

  // ===========================================
  // @references
  // ===========================================

  it("$references stores target property in references state map", () => {
    const program = createMockProgram();
    const ctx = createMockContext(program);
    const sourceProp = mockProp("authorId");
    const targetProp = mockPropWithModel("authorId", {});

    $references(ctx, sourceProp, targetProp);

    const stored = program.stateMap(StateKeys.references).get(sourceProp);
    assert.equal(stored, targetProp);
  });

  // ===========================================
  // @junction
  // ===========================================

  it("$junction adds model to junction state set", () => {
    const program = createMockProgram();
    const ctx = createMockContext(program);
    const model = mockModel("BookGenre");

    $junction(ctx, model);

    assert.ok(program.stateSet(StateKeys.junction).has(model));
  });

  // ===========================================
  // @uuid
  // ===========================================

  it("$uuid stores encoding and autoGenerate in uuid state map", () => {
    const program = createMockProgram();
    const ctx = createMockContext(program);
    const prop = mockProp("authorId");

    $uuid(ctx, prop, "base36", true);

    const stored = program.stateMap(StateKeys.uuid).get(prop);
    assert.deepEqual(stored, { encoding: "base36", autoGenerate: true });
  });

  it("$uuid defaults autoGenerate to false when not provided", () => {
    const program = createMockProgram();
    const ctx = createMockContext(program);
    const prop = mockProp("bookId");

    $uuid(ctx, prop, "base36");

    const stored = program.stateMap(StateKeys.uuid).get(prop);
    assert.deepEqual(stored, { encoding: "base36", autoGenerate: false });
  });

  // ===========================================
  // @createdAt
  // ===========================================

  it("$createdAt adds property to createdAt state set", () => {
    const program = createMockProgram();
    const ctx = createMockContext(program);
    const prop = mockProp("createdAt");

    $createdAt(ctx, prop);

    assert.ok(program.stateSet(StateKeys.createdAt).has(prop));
  });

  // ===========================================
  // @updatedAt
  // ===========================================

  it("$updatedAt adds property to updatedAt state set", () => {
    const program = createMockProgram();
    const ctx = createMockContext(program);
    const prop = mockProp("updatedAt");

    $updatedAt(ctx, prop);

    assert.ok(program.stateSet(StateKeys.updatedAt).has(prop));
  });

  // ===========================================
  // Multiple decorators on same target
  // ===========================================

  it("multiple decorators can be applied to the same property", () => {
    const program = createMockProgram();
    const ctx = createMockContext(program);
    const prop = mockProp("authorId");

    $pk(ctx, prop);
    $uuid(ctx, prop, "base36", true);

    assert.ok(program.stateSet(StateKeys.pk).has(prop));
    assert.deepEqual(program.stateMap(StateKeys.uuid).get(prop), {
      encoding: "base36",
      autoGenerate: true,
    });
  });

  // ===========================================
  // @unique (single column)
  // ===========================================

  it("$unique adds property to unique state set", () => {
    const program = createMockProgram();
    const ctx = createMockContext(program);
    const prop = mockProp("isbn");

    $unique(ctx, prop);

    assert.ok(program.stateSet(StateKeys.unique).has(prop));
  });

  // ===========================================
  // @compositeUnique (model-level)
  // ===========================================

  it("$compositeUnique stores name and columns on model", () => {
    const program = createMockProgram();
    const ctx = createMockContext(program);
    const model = mockModel("Edition");
    const col1 = mockProp("bookId");
    const col2 = mockProp("language");

    $compositeUnique(ctx, model, "edition_book_language_uq", [col1, col2]);

    const stored = program.stateMap(StateKeys.compositeUnique).get(model) as Array<{
      name: string;
      columns: ModelProperty[];
    }>;
    assert.equal(stored.length, 1);
    assert.equal(stored[0].name, "edition_book_language_uq");
    assert.deepEqual(stored[0].columns, [col1, col2]);
  });

  it("$compositeUnique accumulates multiple constraints on same model", () => {
    const program = createMockProgram();
    const ctx = createMockContext(program);
    const model = mockModel("Edition");
    const col1 = mockProp("bookId");
    const col2 = mockProp("language");
    const col3 = mockProp("isbn");

    $compositeUnique(ctx, model, "uq1", [col1, col2]);
    $compositeUnique(ctx, model, "uq2", [col1, col3]);

    const stored = program.stateMap(StateKeys.compositeUnique).get(model) as Array<{
      name: string;
      columns: ModelProperty[];
    }>;
    assert.equal(stored.length, 2);
    assert.equal(stored[0].name, "uq1");
    assert.equal(stored[1].name, "uq2");
  });

  // ===========================================
  // @check
  // ===========================================

  it("$check stores expression in check state map", () => {
    const program = createMockProgram();
    const ctx = createMockContext(program);
    const prop = mockProp("rating");

    $check(ctx, prop, "rating >= 1 AND rating <= 5");

    const stored = program.stateMap(StateKeys.check).get(prop);
    assert.equal(stored, "rating >= 1 AND rating <= 5");
  });

  // ===========================================
  // @indexDef
  // ===========================================

  it("$indexDef stores index definition on model", () => {
    const program = createMockProgram();
    const ctx = createMockContext(program);
    const model = mockModel("Book");
    const col1 = mockProp("authorId");
    const col2 = mockProp("publicationYear");

    $indexDef(ctx, model, "books_author_pub_idx", [col1, col2]);

    const stored = program.stateMap(StateKeys.indexDef).get(model) as Array<{
      name: string;
      columns: ModelProperty[];
      unique: boolean;
    }>;
    assert.equal(stored.length, 1);
    assert.equal(stored[0].name, "books_author_pub_idx");
    assert.deepEqual(stored[0].columns, [col1, col2]);
    assert.equal(stored[0].unique, false);
  });

  it("$indexDef stores unique index when unique=true", () => {
    const program = createMockProgram();
    const ctx = createMockContext(program);
    const model = mockModel("Book");
    const col = mockProp("isbn");

    $indexDef(ctx, model, "books_isbn_idx", [col], true);

    const stored = program.stateMap(StateKeys.indexDef).get(model) as Array<{
      name: string;
      columns: ModelProperty[];
      unique: boolean;
    }>;
    assert.equal(stored[0].unique, true);
  });

  it("$indexDef accumulates multiple indexes on same model", () => {
    const program = createMockProgram();
    const ctx = createMockContext(program);
    const model = mockModel("Book");
    const col1 = mockProp("authorId");
    const col2 = mockProp("title");

    $indexDef(ctx, model, "idx1", [col1]);
    $indexDef(ctx, model, "idx2", [col2]);

    const stored = program.stateMap(StateKeys.indexDef).get(model) as Array<{
      name: string;
      columns: ModelProperty[];
      unique: boolean;
    }>;
    assert.equal(stored.length, 2);
  });

  // ===========================================
  // @foreignKeyDef
  // ===========================================

  it("$foreignKeyDef stores composite FK definition on model", () => {
    const program = createMockProgram();
    const ctx = createMockContext(program);
    const model = mockModel("OrderLine");
    const localCol1 = mockProp("orderId");
    const localCol2 = mockProp("productId");
    const foreignCol1 = mockProp("id");
    const foreignCol2 = mockProp("sku");

    $foreignKeyDef(
      ctx,
      model,
      "fk_order_product",
      [localCol1, localCol2],
      [foreignCol1, foreignCol2],
    );

    const stored = program.stateMap(StateKeys.foreignKeyDef).get(model) as Array<{
      name: string;
      columns: ModelProperty[];
      foreignColumns: ModelProperty[];
    }>;
    assert.equal(stored.length, 1);
    assert.equal(stored[0].name, "fk_order_product");
    assert.deepEqual(stored[0].columns, [localCol1, localCol2]);
    assert.deepEqual(stored[0].foreignColumns, [foreignCol1, foreignCol2]);
  });

  // ===========================================
  // @minValue / @maxValue
  // ===========================================

  it("$minValue stores numeric value in minValue state map", () => {
    const program = createMockProgram();
    const ctx = createMockContext(program);
    const prop = mockProp("rating");

    $minValue(ctx, prop, 1);

    const stored = program.stateMap(StateKeys.minValue).get(prop);
    assert.equal(stored, 1);
  });

  it("$maxValue stores numeric value in maxValue state map", () => {
    const program = createMockProgram();
    const ctx = createMockContext(program);
    const prop = mockProp("rating");

    $maxValue(ctx, prop, 5);

    const stored = program.stateMap(StateKeys.maxValue).get(prop);
    assert.equal(stored, 5);
  });

  it("$minValue and $maxValue can be combined on same property", () => {
    const program = createMockProgram();
    const ctx = createMockContext(program);
    const prop = mockProp("rating");

    $minValue(ctx, prop, 1);
    $maxValue(ctx, prop, 5);

    assert.equal(program.stateMap(StateKeys.minValue).get(prop), 1);
    assert.equal(program.stateMap(StateKeys.maxValue).get(prop), 5);
  });

  // ===========================================
  // @visibility
  // ===========================================

  it("$visibility stores value in visibility state map", () => {
    const program = createMockProgram();
    const ctx = createMockContext(program);
    const prop = mockProp("createdAt");

    $visibility(ctx, prop, "read");

    const stored = program.stateMap(StateKeys.visibility).get(prop);
    assert.equal(stored, "read");
  });
});
