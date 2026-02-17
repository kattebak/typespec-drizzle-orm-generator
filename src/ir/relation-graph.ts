import { toTableVariableName } from "../generators/naming.ts";
import type { TableDef } from "./types.ts";

/** A one-to-one or many-to-one relation (FK holder side) */
export interface OneRelation {
  kind: "one";
  name: string;
  fromTable: string;
  fromField: string;
  toTable: string;
  toField: string;
  optional: boolean;
}

/** A one-to-many reverse relation */
export interface ManyRelation {
  kind: "many";
  name: string;
  table: string;
}

/** A many-to-many through junction relation */
export interface ManyThroughRelation {
  kind: "many-through";
  name: string;
  fromTable: string;
  fromField: string;
  toTable: string;
  toField: string;
  junction: {
    table: string;
    fromField: string;
    toField: string;
  };
}

export type Relation = OneRelation | ManyRelation | ManyThroughRelation;

/** Complete relation graph: table name -> its relations */
export type RelationGraph = Map<string, Relation[]>;

/** Strip "Id" suffix from a field name to derive a one-relation name */
export function deriveOneRelationName(fieldName: string): string {
  if (fieldName.endsWith("Id")) {
    return fieldName.slice(0, -2);
  }
  return fieldName;
}

/**
 * Builds a bidirectional relation graph from table definitions.
 *
 * Algorithm (from RFC "Relation Derivation Algorithm"):
 * 1. For each table, collect @references fields → OneRelation + ManyRelation (reverse)
 * 2. For each @junction table, create ManyThroughRelation on both sides
 * 3. Return Map<tableName, Relation[]>
 */
export function buildRelationGraph(tables: TableDef[]): RelationGraph {
  const graph: RelationGraph = new Map();

  for (const table of tables) {
    graph.set(table.name, []);
  }

  // Step 1: Process @references fields
  for (const table of tables) {
    for (const field of table.fields) {
      if (!field.references) continue;

      const ref = field.references;

      // "one" relation on the FK holder side
      graph.get(table.name)?.push({
        kind: "one",
        name: deriveOneRelationName(field.name),
        fromTable: table.name,
        fromField: field.name,
        toTable: ref.tableName,
        toField: ref.fieldName,
        optional: field.nullable,
      });

      // "many" reverse on the target side — skip if FK holder is a junction
      // (junction FKs produce many-through instead of many reverses)
      if (!table.isJunction) {
        graph.get(ref.tableName)?.push({
          kind: "many",
          name: toTableVariableName(table.name),
          table: table.name,
        });
      }
    }
  }

  // Step 2: Process @junction tables → many-through on both sides
  for (const table of tables) {
    if (!table.isJunction) continue;

    const refFields = table.fields.filter((f) => f.references);
    if (refFields.length !== 2) continue;

    const [fieldA, fieldB] = refFields;
    // Safe: filtered to only fields with references above
    const refA = fieldA.references;
    const refB = fieldB.references;
    if (!refA || !refB) continue;

    // Side A gets many-through to Side B
    graph.get(refA.tableName)?.push({
      kind: "many-through",
      name: toTableVariableName(refB.tableName),
      fromTable: refA.tableName,
      fromField: refA.fieldName,
      toTable: refB.tableName,
      toField: refB.fieldName,
      junction: {
        table: table.name,
        fromField: fieldA.name,
        toField: fieldB.name,
      },
    });

    // Side B gets many-through to Side A
    graph.get(refB.tableName)?.push({
      kind: "many-through",
      name: toTableVariableName(refA.tableName),
      fromTable: refB.tableName,
      fromField: refB.fieldName,
      toTable: refA.tableName,
      toField: refA.fieldName,
      junction: {
        table: table.name,
        fromField: fieldB.name,
        toField: fieldA.name,
      },
    });
  }

  return graph;
}
