import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import type { EmitContext } from "@typespec/compiler";
import { createTestHost } from "@typespec/compiler/testing";
import { $pk, $primaryKey, $table, $uuid } from "../decorators.ts";
import { $onEmit, type EmitterOptions } from "../index.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const outputRoot = join(repoRoot, ".tmp", "native-uuid");

const DRIZZLE_DECORATORS = `
using TypeSpec.Reflection;

extern dec table(target: Model, name: valueof string, service: valueof string);
extern dec primaryKey(target: Model, tableName: valueof string);
extern dec pk(target: ModelProperty);
extern dec uuid(target: ModelProperty, encoding?: valueof string, autoGenerate?: valueof boolean);
`;

const ELECTRODB_DECORATORS = `
using TypeSpec.Reflection;

model AccessPattern {
  index?: string;
  collection?: string;
  pk?: ModelProperty[];
  sk?: ModelProperty[];
}

extern dec entity(target: Model, entity: valueof string, service: valueof string);
extern dec index(target: Model, name: valueof string, accessPattern: AccessPattern);
extern dec uuid(target: ModelProperty, encoding?: valueof string, autoGenerate?: valueof boolean);
`;

function drizzleModels(decorators: string): string {
  return `
import "./drizzle.tsp";

@table("Key", "endur")
@primaryKey("keys")
model Key {
  @pk ${decorators} keyId: string;
  label: string;
}
`;
}

function remitModels(decorators: string): string {
  return `
import "./electrodb.tsp";

@entity("key", "endur")
@index("Key", { pk: [Key.keyId] })
model Key {
  ${decorators} keyId: string;
  label: string;
}
`;
}

async function emit(frontend: "drizzle" | "remit", decorators: string): Promise<string> {
  const host = await createTestHost();

  if (frontend === "drizzle") {
    host.addJsFile("drizzle.js", { $table, $primaryKey, $pk, $uuid });
    host.addTypeSpecFile("drizzle.tsp", `import "./drizzle.js";\n${DRIZZLE_DECORATORS}`);
    host.addTypeSpecFile("main.tsp", drizzleModels(decorators));
  } else {
    host.addJsFile("electrodb.js", { $entity: () => {}, $index: () => {}, $uuid });
    host.addTypeSpecFile("electrodb.tsp", `import "./electrodb.js";\n${ELECTRODB_DECORATORS}`);
    host.addTypeSpecFile("main.tsp", remitModels(decorators));
  }

  await host.compile("main.tsp");

  const options: EmitterOptions = { frontend, "schema-only": true };
  await $onEmit({
    program: host.program,
    emitterOutputDir: "/out",
    options,
  } as unknown as EmitContext<EmitterOptions>);

  const schema = host.fs.get("/out/schema.ts");
  assert.ok(typeof schema === "string", "no schema.ts emitted");
  return schema;
}

after(async () => {
  await rm(outputRoot, { recursive: true, force: true });
});

for (const frontend of ["drizzle", "remit"] as const) {
  describe(`@uuid("rfc4122") on the ${frontend} front-end`, () => {
    it("emits a native pg uuid column with the pg-core import and no codec", async () => {
      const schema = await emit(frontend, '@uuid("rfc4122")');

      assert.match(schema, /^import \{ pgTable, text, uuid \} from "drizzle-orm\/pg-core";$/m);
      assert.ok(schema.includes('keyId: uuid("key_id").primaryKey(),'));
      assert.ok(!schema.includes("./types.js"));
      assert.ok(!schema.includes("$defaultFn"));
      assert.ok(!schema.includes("defaultRandom"));
    });

    it("leaves a model without the decorator on a text column", async () => {
      const schema = await emit(frontend, "");

      assert.match(schema, /^import \{ pgTable, text \} from "drizzle-orm\/pg-core";$/m);
      assert.ok(schema.includes('keyId: text("key_id").primaryKey(),'));
      assert.ok(!schema.includes("uuid"));
    });
  });
}

describe("DDL for a native uuid column", () => {
  it("declares the column as uuid", async () => {
    const schema = await emit("drizzle", '@uuid("rfc4122")');
    await mkdir(outputRoot, { recursive: true });
    const schemaPath = join(outputRoot, "schema.ts");
    await writeFile(schemaPath, schema);

    const ddl = execFileSync(
      "npx",
      ["drizzle-kit", "export", "--dialect", "postgresql", "--schema", schemaPath],
      { cwd: repoRoot, encoding: "utf8" },
    );

    assert.match(ddl, /"key_id" uuid PRIMARY KEY/);
    assert.match(ddl, /"label" text NOT NULL/);
  });
});
