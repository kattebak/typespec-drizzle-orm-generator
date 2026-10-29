import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

type Dialect = "pg" | "sqlite";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const fixturePath = resolve(repoRoot, "src/fixtures/edge-cases.tsp");
const emitterName = "@kattebak/typespec-drizzle-orm-generator";
const kitDialects: Record<Dialect, string> = { pg: "postgresql", sqlite: "sqlite" };

async function exportDdl(dialect: Dialect, pgSchema?: string): Promise<string> {
  const outputName = pgSchema === undefined ? dialect : `${dialect}-${pgSchema}`;
  const outputDir = resolve(repoRoot, ".ddl-output", outputName);
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });
  execFileSync("npm", ["run", "build"], { cwd: repoRoot, stdio: "pipe" });
  execFileSync(
    "npx",
    [
      "tsp",
      "compile",
      fixturePath,
      "--emit",
      emitterName,
      "--option",
      `${emitterName}.emitter-output-dir={cwd}/.ddl-output/${outputName}`,
      "--option",
      `${emitterName}.package-name=@ddl/${dialect}`,
      "--option",
      `${emitterName}.package-version=0.0.0`,
      "--option",
      `${emitterName}.dialect=${dialect}`,
      "--option",
      `${emitterName}.pluralize=true`,
      ...(pgSchema === undefined ? [] : ["--option", `${emitterName}.pg-schema=${pgSchema}`]),
    ],
    { cwd: repoRoot, stdio: "pipe" },
  );
  return execFileSync(
    "npx",
    [
      "drizzle-kit",
      "export",
      "--dialect",
      kitDialects[dialect],
      "--schema",
      join(outputDir, "schema.ts"),
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
}

describe("drizzle-kit export over the generated schema", () => {
  for (const dialect of ["pg", "sqlite"] as const) {
    it(`prints tables, a partial index and an array default for ${dialect}`, async () => {
      const ddl = await exportDdl(dialect);
      assert.match(ddl, /CREATE TABLE/);
      assert.match(ddl, /CREATE INDEX [`"]idx_orders_open[`"] ON .*WHERE .*total_cents > 0/);
      assert.match(ddl, /[`"]tags[`"] .*DEFAULT '\[\]'/);
    });
  }
});

describe("drizzle-kit export with pg-schema", () => {
  it("creates the schema and puts every table and enum in it", async () => {
    const ddl = await exportDdl("pg", "edge");
    assert.match(ddl, /CREATE SCHEMA "edge";/);
    assert.match(ddl, /CREATE TYPE "edge"\."order_status" AS ENUM/);
    assert.match(ddl, /CREATE TABLE "edge"\."orders"/);
    assert.doesNotMatch(ddl, /CREATE TABLE "(?!edge")/);
    assert.match(ddl, /REFERENCES "edge"\."accounts"/);
  });
});
