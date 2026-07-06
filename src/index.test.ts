import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { EmitContext } from "@typespec/compiler";
import { resolvePath } from "@typespec/compiler";
import { createTestHost } from "@typespec/compiler/testing";
import {
  $createdAt,
  $junction,
  $lib,
  $onEmit,
  $pk,
  $primaryKey,
  $references,
  $table,
  $updatedAt,
  $uuid,
  type EmitterOptions,
} from "./index.ts";

describe("package exports", () => {
  it("exports $lib with correct library name", () => {
    assert.equal($lib.name, "@kattebak/typespec-drizzle-orm-generator");
  });

  it("exports all decorator functions", () => {
    assert.equal(typeof $table, "function");
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

const DRIZZLE_DECORATORS = `
using TypeSpec.Reflection;

extern dec table(target: Model, name: valueof string, service: valueof string);
extern dec primaryKey(target: Model, tableName: valueof string);
extern dec pk(target: ModelProperty);
extern dec uuid(target: ModelProperty, encoding: valueof string, autoGenerate?: valueof boolean);
`;

const DRIZZLE_MODELS = `
import "./drizzle.tsp";

@table("Widget", "test")
@primaryKey("widgets")
model Widget {
  @pk @uuid("base36", true) widgetId: string;
  name: string;
  size?: int32;
}
`;

const REMIT_DECORATORS = `
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

const REMIT_MODELS = `
import "./electrodb.tsp";

@entity("widget", "remit")
@index("Widget", { pk: [Widget.widgetId] })
model Widget {
  widgetId: string;
  name: string;
}
`;

async function drizzleHost() {
  const host = await createTestHost();
  const {
    $pk: pkDec,
    $table: tableDec,
    $primaryKey: pkTableDec,
    $uuid: uuidDec,
  } = await import("./decorators.ts");
  host.addJsFile("drizzle.js", {
    $table: tableDec,
    $primaryKey: pkTableDec,
    $pk: pkDec,
    $uuid: uuidDec,
  });
  host.addTypeSpecFile("drizzle.tsp", `import "./drizzle.js";\n${DRIZZLE_DECORATORS}`);
  host.addTypeSpecFile("main.tsp", DRIZZLE_MODELS);
  await host.compile("main.tsp");
  return host;
}

async function remitHost() {
  const host = await createTestHost();
  host.addJsFile("electrodb.js", { $entity: () => {}, $index: () => {} });
  host.addTypeSpecFile("electrodb.tsp", `import "./electrodb.js";\n${REMIT_DECORATORS}`);
  host.addTypeSpecFile("main.tsp", REMIT_MODELS);
  await host.compile("main.tsp");
  return host;
}

type TestHost = Awaited<ReturnType<typeof createTestHost>>;

async function runEmit(
  host: TestHost,
  options: EmitterOptions,
  outputDir = "/emit-out",
): Promise<Map<string, string>> {
  const context = {
    program: host.program,
    emitterOutputDir: outputDir,
    options,
  } as unknown as EmitContext<EmitterOptions>;

  await $onEmit(context);

  const files = new Map<string, string>();
  for (const [path, content] of host.fs) {
    if (path.startsWith(`${outputDir}/`)) {
      files.set(path.slice(outputDir.length + 1), content as string);
    }
  }
  return files;
}

describe("$onEmit (in-process emit)", () => {
  it("emits the full package for the default drizzle front-end", async () => {
    const host = await drizzleHost();
    const files = await runEmit(host, {});

    for (const name of [
      "package.json",
      "tsconfig.json",
      "types.ts",
      "schema.ts",
      "relations.ts",
      "describe.ts",
      "index.ts",
    ]) {
      assert.ok(files.has(name), `missing ${name}`);
    }

    const schema = files.get("schema.ts");
    assert.ok(schema?.includes("export const widgets = pgTable("));
    assert.ok(schema?.includes('from "drizzle-orm/pg-core"'));

    const pkg = JSON.parse(files.get("package.json") ?? "{}");
    assert.equal(pkg.name, "drizzle-schema");
    assert.equal(pkg.version, "0.0.1");
  });

  it("honours package-name, package-version, dialect, and pluralize options", async () => {
    const host = await drizzleHost();
    const files = await runEmit(host, {
      "package-name": "@acme/schema",
      "package-version": "1.2.3",
      dialect: "sqlite",
      pluralize: false,
    });

    const pkg = JSON.parse(files.get("package.json") ?? "{}");
    assert.equal(pkg.name, "@acme/schema");
    assert.equal(pkg.version, "1.2.3");

    const schema = files.get("schema.ts");
    assert.ok(schema?.includes('from "drizzle-orm/sqlite-core"'));
    assert.ok(schema?.includes("export const widget = sqliteTable("));
  });

  it("omits relations.ts and describe.ts when schema-only is set", async () => {
    const host = await drizzleHost();
    const files = await runEmit(host, { "schema-only": true });

    assert.ok(files.has("schema.ts"));
    assert.ok(!files.has("relations.ts"));
    assert.ok(!files.has("describe.ts"));
  });

  it("routes through the remit front-end when frontend is 'remit'", async () => {
    const host = await remitHost();
    const files = await runEmit(host, { frontend: "remit" });

    const schema = files.get("schema.ts");
    assert.ok(schema?.includes("export const widgets = pgTable("));
    assert.ok(schema?.includes("widgetId"));
  });

  it("drops collection foreign keys when foreign-keys is false (remit)", async () => {
    const host = await remitHost();
    const files = await runEmit(host, { frontend: "remit", "foreign-keys": false });
    assert.ok(files.get("schema.ts")?.includes("pgTable("));
  });

  it("writes nothing when compilerOptions.noEmit is set", async () => {
    const host = await drizzleHost();
    host.program.compilerOptions.noEmit = true;
    const files = await runEmit(host, {}, "/noemit-out");
    assert.equal(files.size, 0);
  });

  it("resolves output paths under the emitter output dir", async () => {
    const host = await drizzleHost();
    await runEmit(host, {}, "/custom-dir");
    assert.ok(host.fs.has(resolvePath("/custom-dir", "schema.ts")));
  });
});
