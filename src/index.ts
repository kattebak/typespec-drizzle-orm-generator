import type { EmitContext } from "@typespec/compiler";
import { emitFile, resolvePath } from "@typespec/compiler";
import { assemblePackage } from "./assembler.js";
import type { Dialect } from "./generators/dialect.js";
import { buildIR } from "./ir/builder.js";
import { buildRemitIR } from "./ir/remit-builder.js";

export {
  $check,
  $columnVisibility,
  $compositeUnique,
  $createdAt,
  $foreignKeyDef,
  $indexDef,
  $junction,
  $maxValue,
  $minValue,
  $pk,
  $primaryKey,
  $references,
  $table,
  $unique,
  $updatedAt,
  $uuid,
} from "./decorators.js";
export { $lib } from "./lib.js";

export interface EmitterOptions {
  "package-name"?: string;
  "package-version"?: string;
  dialect?: Dialect;
  pluralize?: boolean;
  /**
   * Selects the front-end that reads the TypeSpec vocabulary.
   * - "drizzle" (default): this library's own `@table`/`@pk`/`@references` decorators.
   * - "remit": the ElectroDB vocabulary (`@entity`/`@index`) via `buildRemitIR`.
   */
  frontend?: "drizzle" | "remit";
  /**
   * When true, emit only the table schema (`schema.ts` + `types.ts`) and omit
   * `relations.ts` / `describe.ts`. The relations and describe helpers use the
   * Drizzle v2 relational API (`defineRelations`, `PgAsyncDatabase`); schema-only
   * output stays compatible with Drizzle v1 consumers that manage relations
   * themselves. Defaults to false.
   */
  "schema-only"?: boolean;
  /**
   * How enum-typed properties become columns.
   * - "native" (default): a Postgres `pgEnum` (a `CREATE TYPE` + typed column).
   * - "text": a plain `text` column. Use when the target stores enums as strings
   *   (e.g. matching a DynamoDB single-table port) and you want no `ALTER TYPE`
   *   migrations. Currently honoured by the `remit` front-end.
   */
  "enum-mode"?: "native" | "text";
  /**
   * Emit foreign-key `references()` clauses. Defaults to true. Set false when the
   * consumer manages referential integrity and delete cascades itself (so a
   * database-level `ON DELETE CASCADE` would fight the application). In the remit
   * front-end this drops the collection-derived foreign keys.
   */
  "foreign-keys"?: boolean;
}

export async function $onEmit(context: EmitContext<EmitterOptions>): Promise<void> {
  if (context.program.compilerOptions.noEmit) return;

  const enumAsText = context.options["enum-mode"] === "text";
  const foreignKeys = context.options["foreign-keys"] ?? true;
  const { tables, enums } =
    context.options.frontend === "remit"
      ? buildRemitIR(context.program, { enumAsText, foreignKeys })
      : buildIR(context.program);

  const config = {
    packageName: context.options["package-name"] ?? "drizzle-schema",
    packageVersion: context.options["package-version"] ?? "0.0.1",
    dialect: context.options.dialect ?? "pg",
    pluralize: context.options.pluralize ?? true,
    schemaOnly: context.options["schema-only"] ?? false,
  };

  const files = assemblePackage(tables, enums, config);

  for (const [filename, content] of files) {
    await emitFile(context.program, {
      path: resolvePath(context.emitterOutputDir, filename),
      content,
    });
  }
}
