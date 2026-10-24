import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { createTestHost } from "@typespec/compiler/testing";
import { assemblePackage } from "../assembler.ts";
import * as library from "../index.ts";
import { buildIR } from "../ir/builder.ts";
import { buildRemitIR } from "../ir/remit-builder.ts";
import type { TableDef } from "../ir/types.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

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
`;

async function compile(main: string): Promise<Awaited<ReturnType<typeof createTestHost>>> {
  const host = await createTestHost();
  const mainTsp = await readFile(resolve(repoRoot, "tsp/main.tsp"), "utf8");
  host.addJsFile("drizzle.js", { ...library });
  host.addTypeSpecFile(
    "drizzle.tsp",
    mainTsp.replace('import "../dist/index.js";', 'import "./drizzle.js";'),
  );
  host.addJsFile("electrodb.js", { $entity: () => {}, $index: () => {} });
  host.addTypeSpecFile("electrodb.tsp", `import "./electrodb.js";\n${ELECTRODB}`);
  host.addTypeSpecFile("main.tsp", main);
  await host.compile("main.tsp");
  return host;
}

function sqliteSchemaOf(tables: TableDef[]): string {
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

const TYPED_BLOB = 'blob("payload", { mode: "buffer" }).$type<Uint8Array>().notNull()';

describe("bytes columns on SQLite", () => {
  it("emits a Uint8Array blob for bytes under the drizzle front-end", async () => {
    const host = await compile(`
      import "./drizzle.tsp";
      using Drizzle;
      namespace Test;

      @table("Attachment", "test")
      @primaryKey("attachments")
      model Attachment {
        @pk attachmentId: string;
        payload: bytes;
        preview?: bytes;
      }
    `);
    const schema = sqliteSchemaOf(buildIR(host.program).tables);
    assert.ok(schema.includes(TYPED_BLOB), schema);
    assert.ok(schema.includes('nullableBlob("preview")'), schema);
  });

  it("emits a Uint8Array blob for bytes under the remit front-end", async () => {
    const host = await compile(`
      import "./electrodb.tsp";
      namespace Test;

      @entity("attachment", "remit")
      @index("Attachment", { pk: [Attachment.attachmentId] })
      model Attachment {
        attachmentId: string;
        payload: bytes;
        preview?: bytes;
      }
    `);
    const schema = sqliteSchemaOf(buildRemitIR(host.program).tables);
    assert.ok(schema.includes(TYPED_BLOB), schema);
    assert.ok(schema.includes('nullableBlob("preview")'), schema);
  });
});
