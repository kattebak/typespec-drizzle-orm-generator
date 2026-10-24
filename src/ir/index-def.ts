import type { Model, ModelProperty } from "@typespec/compiler";
import { $lib, StateKeys } from "../lib.js";
import type { IndexDef, ProgramStateAccess } from "./types.js";
import { isVisibilityCopy } from "./visibility-copy.js";

interface IndexMeta {
  name: string;
  columns: ModelProperty[];
  unique: boolean;
  where?: string;
}

/**
 * Reads the `@indexDef` state for one model into IR indexes.
 *
 * `@indexDef` is the SQL-only index declaration: it lives in this library's own
 * state key, so a sibling emitter reading `@index` (the ElectroDB vocabulary the
 * remit front-end also consumes) never sees it and mints no secondary index of
 * its own. Both front-ends must therefore read it from here — a front-end that
 * derives indexes only from the vocabulary it shares with another emitter makes
 * the decorator inert.
 *
 * Index names are taken verbatim: the author named the index, and the migration
 * history is keyed on that name.
 */
export function readIndexDefs(program: ProgramStateAccess, model: Model): IndexDef[] {
  const defs = program.stateMap(StateKeys.indexDef).get(model) as IndexMeta[] | undefined;
  if (!defs) return [];

  return defs.map((def) => ({
    name: def.name,
    columns: toModelProperties(def.columns).map((column) =>
      resolveColumn(program, model, def.name, column),
    ),
    unique: def.unique ?? false,
    ...(def.where === undefined ? {} : { where: def.where }),
  }));
}

/**
 * Reports every `@indexDef` that no front-end claimed. An index silently
 * dropped because its model produced no table is the failure mode `@indexDef`
 * is most prone to, and it is invisible in the generated output.
 */
export function reportUnclaimedIndexDefs(program: ProgramStateAccess, claimed: Set<Model>): void {
  for (const [target, defs] of program.stateMap(StateKeys.indexDef)) {
    const model = target as Model;
    if (claimed.has(model) || isVisibilityCopy(model)) continue;
    for (const def of defs as IndexMeta[]) {
      program.reportDiagnostic(
        $lib.createDiagnostic({
          code: "index-def-dropped",
          target: model,
          format: { index: def.name, model: model.name },
        }),
      );
    }
  }
}

function resolveColumn(
  program: ProgramStateAccess,
  model: Model,
  index: string,
  column: ModelProperty,
): string {
  if (!model.properties.has(column.name)) {
    program.reportDiagnostic(
      $lib.createDiagnostic({
        code: "index-def-unknown-column",
        target: column,
        format: { index, column: column.name, model: model.name },
      }),
    );
  }
  return column.name;
}

/**
 * Normalizes a `ModelProperty[]` decorator argument.
 *
 * Passed as a plain array when a decorator is invoked directly (unit tests), and
 * as a marshalled tuple value (`{ values: ModelProperty[] }`) when the emitter
 * runs against compiled TypeSpec.
 */
export function toModelProperties(columns: unknown): ModelProperty[] {
  if (Array.isArray(columns)) return columns as ModelProperty[];
  if (columns && typeof columns === "object" && "values" in columns) {
    return (columns as { values: ModelProperty[] }).values;
  }
  throw new Error("Expected a ModelProperty[] or tuple value for decorator columns");
}
