import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { EmitContext } from "@typespec/compiler";
import { createTestHost } from "@typespec/compiler/testing";
import { getTableConfig, isPgEnum, type PgTable } from "drizzle-orm/pg-core";
import * as library from "../index.ts";
import { $onEmit, type EmitterOptions } from "../index.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const outputRoot = join(repoRoot, ".tmp", "pg-schema");
const tsgo = join(repoRoot, "node_modules", ".bin", "tsgo");

const SOURCE = `
import "./drizzle.tsp";
using Drizzle;
namespace Test;

enum Venue {
  spot: "spot",
  futures: "futures",
}

@table("Product", "test")
@primaryKey("products")
model Product {
  @pk @uuid("base36", true) productId: string;
  name: string;
}

@table("Instrument", "test")
@primaryKey("instruments")
model Instrument {
  @pk @uuid("base36", true) instrumentId: string;
  @uuid("base36") @references(Product.productId) productId: string;
  venue: Venue;
}
`;

type TestHost = Awaited<ReturnType<typeof createTestHost>>;

async function compile(): Promise<TestHost> {
  const host = await createTestHost();
  const mainTsp = await readFile(resolve(repoRoot, "tsp/main.tsp"), "utf8");
  host.addJsFile("drizzle.js", { ...library });
  host.addTypeSpecFile(
    "drizzle.tsp",
    mainTsp.replace('import "../dist/index.js";', 'import "./drizzle.js";'),
  );
  host.addTypeSpecFile("main.tsp", SOURCE);
  await host.compile("main.tsp");
  return host;
}

async function emit(host: TestHost, options: EmitterOptions, name: string): Promise<string> {
  const emitterOutputDir = `/emit-${name}`;
  await $onEmit({
    program: host.program,
    emitterOutputDir,
    options,
  } as unknown as EmitContext<EmitterOptions>);

  const outputDir = join(outputRoot, name);
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });
  for (const [path, content] of host.fs) {
    if (path.startsWith(`${emitterOutputDir}/`) && path.endsWith(".ts")) {
      await writeFile(join(outputDir, path.slice(emitterOutputDir.length + 1)), content);
    }
  }
  await writeFile(join(outputDir, "package.json"), JSON.stringify({ type: "module" }));
  await writeFile(
    join(outputDir, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ESNext",
        module: "NodeNext",
        strict: true,
        noEmit: true,
        skipLibCheck: true,
      },
      include: ["schema.ts", "relations.ts", "types.ts"],
    }),
  );
  return outputDir;
}

after(async () => {
  await rm(outputRoot, { recursive: true, force: true });
});

describe("pg-schema option", () => {
  it("puts every table and enum in the schema, and relations still resolve", async () => {
    const host = await compile();
    const outputDir = await emit(host, { "pg-schema": "markets" }, "markets");
    assert.deepEqual(host.program.diagnostics, []);

    execFileSync(tsgo, ["--project", join(outputDir, "tsconfig.json")], { stdio: "pipe" });

    const schema: Record<string, unknown> = await import(
      pathToFileURL(join(outputDir, "schema.ts")).href
    );
    for (const name of ["products", "instruments"]) {
      assert.equal(getTableConfig(schema[name] as PgTable).schema, "markets");
    }
    assert.ok(isPgEnum(schema.venueEnum));
    assert.equal(schema.venueEnum.schema, "markets");

    const instrumentFk = getTableConfig(schema.instruments as PgTable).foreignKeys[0].reference();
    assert.equal(getTableConfig(instrumentFk.foreignTable).schema, "markets");

    const { relations } = await import(pathToFileURL(join(outputDir, "relations.ts")).href);
    assert.deepEqual(Object.keys(relations.products.relations), ["instruments"]);
    assert.deepEqual(Object.keys(relations.instruments.relations), ["product"]);
  });

  it("reports an error and emits no schema under the sqlite dialect", async () => {
    const host = await compile();
    const outputDir = await emit(host, { dialect: "sqlite", "pg-schema": "markets" }, "sqlite");

    assert.deepEqual(
      host.program.diagnostics.map((d) => [d.code, d.severity]),
      [["@kattebak/typespec-drizzle-orm-generator/pg-schema-requires-pg", "error"]],
    );
    const schema = await readFile(join(outputDir, "schema.ts"), "utf8");
    assert.ok(schema.includes('= sqliteTable("products"'));
    assert.ok(!schema.includes("pgSchema"));
  });

  it("reports an error for the public schema and emits pgTable", async () => {
    const host = await compile();
    const outputDir = await emit(host, { "pg-schema": "public" }, "public");

    assert.deepEqual(
      host.program.diagnostics.map((d) => [d.code, d.severity]),
      [["@kattebak/typespec-drizzle-orm-generator/pg-schema-public", "error"]],
    );
    const schema = await readFile(join(outputDir, "schema.ts"), "utf8");
    assert.ok(schema.includes('= pgTable("products"'));
  });
});
