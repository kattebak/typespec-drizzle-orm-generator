import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import type { DecoratorApplication, Model, Program } from "@typespec/compiler";
import { createTestHost } from "@typespec/compiler/testing";
import { assemblePackage } from "../assembler.ts";
import * as library from "../index.ts";
import { buildIR } from "../ir/builder.ts";
import { buildRemitIR } from "../ir/remit-builder.ts";
import type { TableDef } from "../ir/types.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * Stands in for `typespec-electrodb-emitter`: the sibling emitter this library
 * shares a project with. Its decorators are declared globally and unqualified,
 * which is what makes a global declaration in this library a collision.
 */
const ELECTRODB = `
using TypeSpec.Reflection;

model AccessPattern {
  index?: string;
  collection?: string;
  pk?: ModelProperty[];
  sk?: ModelProperty[];
}

extern dec entity(target: Model, entity: string, service: string);
extern dec index(target: Model, name: string, accessPattern: AccessPattern);
extern dec label(target: ModelProperty, label: string);
extern dec createdAt(target: ModelProperty, label?: string);
extern dec updatedAt(target: ModelProperty, label?: string);
`;

/**
 * Loads the library's real TypeSpec declarations and its real module exports
 * into a test host, wired to the source module instead of the built one. The
 * whole module goes in, including its `namespace` export — that export is what
 * binds the decorator implementations under `Drizzle`, so substituting a literal
 * here would test the test rather than the library.
 */
async function createHost(): Promise<Awaited<ReturnType<typeof createTestHost>>> {
  const host = await createTestHost();
  const mainTsp = await readFile(resolve(repoRoot, "tsp/main.tsp"), "utf8");

  host.addJsFile("drizzle.js", { ...library });
  host.addTypeSpecFile(
    "drizzle.tsp",
    mainTsp.replace('import "../dist/index.js";', 'import "./drizzle.js";'),
  );

  host.addJsFile("electrodb.js", {
    $entity: () => {},
    $index: () => {},
    $label: () => {},
    $createdAt: () => {},
    $updatedAt: () => {},
  });
  host.addTypeSpecFile("electrodb.tsp", `import "./electrodb.js";\n${ELECTRODB}`);

  return host;
}

function schemaOf(tables: TableDef[]): string {
  const files = assemblePackage(tables, [], {
    packageName: "@test/schema",
    packageVersion: "0.0.0",
    dialect: "sqlite",
    pluralize: false,
    schemaOnly: true,
  });
  const schema = files.get("schema.ts");
  if (!schema) throw new Error("no schema.ts emitted");
  return schema;
}

function modelNamed(program: Program, name: string): Model {
  const model = [...program.checker.getGlobalNamespaceType().namespaces.values()]
    .flatMap((ns) => [...ns.models.values()])
    .find((m) => m.name === name);
  if (!model) throw new Error(`model ${name} not found`);
  return model;
}

/**
 * The GSIs `typespec-electrodb-emitter` would mint: one per `@index` that names
 * a secondary index slot. Reproduced here from the ElectroDB vocabulary rather
 * than by importing that emitter, so this repo can prove `@indexDef` stays out
 * of its output without taking a dependency on it.
 */
function electroDbSecondaryIndexes(model: Model): string[] {
  return model.decorators
    .filter((dec: DecoratorApplication) => dec.definition?.name === "@index")
    .map((dec) => {
      const pattern = dec.args[1]?.value as { properties?: Map<string, { type?: unknown }> };
      const slot = pattern?.properties?.get("index")?.type as { value?: string } | undefined;
      return slot?.value;
    })
    .filter((slot): slot is string => slot !== undefined);
}

describe("@indexDef under the drizzle front-end", () => {
  it("emits a SQL index over the named columns", async () => {
    const host = await createHost();
    host.addTypeSpecFile(
      "main.tsp",
      `
      import "./drizzle.tsp";
      using Drizzle;
      namespace Test;

      @table("Row", "test")
      @primaryKey("rows")
      @indexDef("row_by_account_created", [Row.accountId, Row.createdAt])
      @indexDef("row_by_handle", [Row.handle], true)
      model Row {
        @pk rowId: string;
        accountId: string;
        handle: string;
        createdAt: int64;
      }
      `,
    );
    await host.compile("main.tsp");

    const { tables } = buildIR(host.program);
    const schema = schemaOf(tables);
    assert.match(
      schema,
      /index\("row_by_account_created"\)\.on\(table\.accountId, table\.createdAt\)/,
    );
    assert.match(schema, /uniqueIndex\("row_by_handle"\)\.on\(table\.handle\)/);
  });
});

describe("@indexDef under the remit front-end", () => {
  it("emits a SQL index alongside the indexes derived from @index", async () => {
    const host = await createHost();
    host.addTypeSpecFile(
      "main.tsp",
      `
      import "./drizzle.tsp";
      import "./electrodb.tsp";
      namespace Test;

      @entity("threadMessage", "remit")
      @index("ThreadMessage", { pk: [ThreadMessage.threadMessageId] })
      @index("byDate", { index: "lsi1", pk: [ThreadMessage.accountConfigId], sk: [ThreadMessage.sentDate] })
      @Drizzle.indexDef(
        "tm_by_mailbox_category_date",
        [
          ThreadMessage.accountConfigId,
          ThreadMessage.mailboxId,
          ThreadMessage.category,
          ThreadMessage.sentDate
        ]
      )
      model ThreadMessage {
        threadMessageId: string;
        accountConfigId: string;
        mailboxId: string;
        category: string;
        sentDate: int64;
      }
      `,
    );
    await host.compile("main.tsp");

    const { tables } = buildRemitIR(host.program);
    const index = tables[0].indexes.find((i) => i.name === "tm_by_mailbox_category_date");
    assert.ok(index, "@indexDef was not emitted by the remit front-end");
    assert.deepEqual(index.columns, ["accountConfigId", "mailboxId", "category", "sentDate"]);
    assert.equal(index.unique, false);

    assert.match(
      schemaOf(tables),
      /index\("tm_by_mailbox_category_date"\)\.on\(table\.accountConfigId, table\.mailboxId, table\.category, table\.sentDate\)/,
    );
  });

  it("mints no ElectroDB secondary index for an @indexDef", async () => {
    const host = await createHost();
    host.addTypeSpecFile(
      "main.tsp",
      `
      import "./drizzle.tsp";
      import "./electrodb.tsp";
      namespace Test;

      @entity("threadMessage", "remit")
      @index("ThreadMessage", { pk: [ThreadMessage.threadMessageId] })
      @index("byDate", { index: "lsi1", pk: [ThreadMessage.accountConfigId], sk: [ThreadMessage.sentDate] })
      @Drizzle.indexDef("tm_by_category", [ThreadMessage.accountConfigId, ThreadMessage.category])
      model ThreadMessage {
        threadMessageId: string;
        accountConfigId: string;
        category: string;
        sentDate: int64;
      }
      `,
    );
    await host.compile("main.tsp");

    const model = modelNamed(host.program, "ThreadMessage");
    assert.deepEqual(electroDbSecondaryIndexes(model), ["lsi1"]);

    const { tables } = buildRemitIR(host.program);
    assert.ok(tables[0].indexes.some((i) => i.name === "tm_by_category"));
  });
});

describe("@indexDef diagnostics", () => {
  it("reports an @indexDef the front-end generates no table for", async () => {
    const host = await createHost();
    host.addTypeSpecFile(
      "main.tsp",
      `
      import "./drizzle.tsp";
      using Drizzle;
      namespace Test;

      @indexDef("orphan_idx", [Orphan.name])
      model Orphan {
        name: string;
      }
      `,
    );
    await host.compile("main.tsp");

    buildIR(host.program);
    const codes = host.program.diagnostics.map((d) => d.code);
    assert.deepEqual(codes, ["@kattebak/typespec-drizzle-orm-generator/index-def-dropped"]);
  });

  it("reports an @indexDef column that is not a property of the model", async () => {
    const host = await createHost();
    host.addTypeSpecFile(
      "main.tsp",
      `
      import "./drizzle.tsp";
      using Drizzle;
      namespace Test;

      @table("Other", "test")
      @primaryKey("others")
      model Other {
        @pk otherId: string;
        sku: string;
      }

      @table("Row", "test")
      @primaryKey("rows")
      @indexDef("row_by_sku", [Other.sku])
      model Row {
        @pk rowId: string;
      }
      `,
    );
    await host.compile("main.tsp");

    buildIR(host.program);
    const codes = host.program.diagnostics.map((d) => d.code);
    assert.deepEqual(codes, ["@kattebak/typespec-drizzle-orm-generator/index-def-unknown-column"]);
  });
});

describe("decorator namespacing", () => {
  it("compiles clean alongside a sibling emitter declaring the same names globally", async () => {
    const host = await createHost();
    host.addTypeSpecFile(
      "main.tsp",
      `
      import "./drizzle.tsp";
      import "./electrodb.tsp";
      namespace Test;

      @entity("row", "remit")
      @index("Row", { pk: [Row.rowId] })
      @Drizzle.indexDef("row_by_score", [Row.score])
      model Row {
        rowId: string;

        @minValue(0)
        @maxValue(10)
        score: int32;

        @createdAt createdAt: int64;
        @updatedAt updatedAt: int64;
      }
      `,
    );

    // `host.compile` asserts the compilation is diagnostic-free. Declaring
    // `@createdAt`, `@updatedAt`, `@minValue` and `@maxValue` in the global
    // namespace makes every reference here ambiguous instead.
    await host.compile("main.tsp");

    const { tables } = buildRemitIR(host.program);
    assert.ok(tables[0].indexes.some((i) => i.name === "row_by_score"));
  });
});

describe("visibility templates", () => {
  it("emits one table per @table model when Create<T> and Update<T> copy it", async () => {
    const host = await createHost();
    host.addTypeSpecFile(
      "main.tsp",
      `
      import "./drizzle.tsp";
      using Drizzle;
      namespace Test;

      @table("Row", "test")
      @primaryKey("rows")
      @indexDef("row_by_account_name", [Row.accountId, Row.name], true)
      model Row {
        @pk @visibility(Lifecycle.Read) rowId: string;
        @visibility(Lifecycle.Read) accountId: string;
        name: string;
      }

      model CreateRowInput is Create<Row>;
      model UpdateRowInput is Update<Row>;
      `,
    );
    await host.compile("main.tsp");

    const { tables } = buildIR(host.program);
    assert.deepEqual(
      tables.map((t) => t.name),
      ["Row"],
    );
    assert.deepEqual(host.program.diagnostics, []);
    assert.match(
      schemaOf(tables),
      /uniqueIndex\("row_by_account_name"\)\.on\(table\.accountId, table\.name\)/,
    );
  });

  it("emits one table per @entity model when Create<T> copies it", async () => {
    const host = await createHost();
    host.addTypeSpecFile(
      "main.tsp",
      `
      import "./drizzle.tsp";
      import "./electrodb.tsp";
      namespace Test;

      @entity("mailbox", "remit")
      @index("Mailbox", { pk: [Mailbox.mailboxId] })
      @Drizzle.indexDef("mailbox_by_account_full_path", [Mailbox.accountId, Mailbox.fullPath], true)
      model Mailbox {
        @visibility(Lifecycle.Read) mailboxId: string;
        @visibility(Lifecycle.Read) accountId: string;
        @visibility(Lifecycle.Create, Lifecycle.Read) fullPath: string;
      }

      @entity("lock", "remit")
      @index("Lock", { pk: [Lock.lockId] })
      model Lock {
        @visibility(Lifecycle.Read) lockId: string;
      }

      model CreateMailboxInput is Create<Mailbox>;
      model CreateLockInput is Create<Lock>;
      `,
    );
    await host.compile("main.tsp");

    const { tables } = buildRemitIR(host.program);
    assert.deepEqual(
      tables.map((t) => t.name),
      ["Mailbox", "Lock"],
    );
    assert.deepEqual(host.program.diagnostics, []);
    assert.match(
      schemaOf(tables),
      /uniqueIndex\("mailbox_by_account_full_path"\)\.on\(table\.accountId, table\.fullPath\)/,
    );
  });
});
