import { toTableVariableName } from "../generators/naming.ts";
import type { EntityDef } from "./types.ts";

/** A one-to-one or many-to-one relation (FK holder side) */
export interface OneRelation {
  kind: "one";
  name: string;
  fromEntity: string;
  fromField: string;
  toEntity: string;
  toField: string;
  optional: boolean;
}

/** A one-to-many reverse relation */
export interface ManyRelation {
  kind: "many";
  name: string;
  entity: string;
}

/** A many-to-many through junction relation */
export interface ManyThroughRelation {
  kind: "many-through";
  name: string;
  fromEntity: string;
  fromField: string;
  toEntity: string;
  toField: string;
  junction: {
    entity: string;
    fromField: string;
    toField: string;
  };
}

export type Relation = OneRelation | ManyRelation | ManyThroughRelation;

/** Complete relation graph: entity name -> its relations */
export type RelationGraph = Map<string, Relation[]>;

/** Strip "Id" suffix from a field name to derive a one-relation name */
export function deriveOneRelationName(fieldName: string): string {
  if (fieldName.endsWith("Id")) {
    return fieldName.slice(0, -2);
  }
  return fieldName;
}

/**
 * Builds a bidirectional relation graph from entity definitions.
 *
 * Algorithm (from RFC "Relation Derivation Algorithm"):
 * 1. For each entity, collect @references fields → OneRelation + ManyRelation (reverse)
 * 2. For each @junction entity, create ManyThroughRelation on both sides
 * 3. Return Map<entityName, Relation[]>
 */
export function buildRelationGraph(entities: EntityDef[]): RelationGraph {
  const graph: RelationGraph = new Map();

  for (const entity of entities) {
    graph.set(entity.name, []);
  }

  // Step 1: Process @references fields
  for (const entity of entities) {
    for (const field of entity.fields) {
      if (!field.references) continue;

      const ref = field.references;

      // "one" relation on the FK holder side
      graph.get(entity.name)?.push({
        kind: "one",
        name: deriveOneRelationName(field.name),
        fromEntity: entity.name,
        fromField: field.name,
        toEntity: ref.entityName,
        toField: ref.fieldName,
        optional: field.nullable,
      });

      // "many" reverse on the target side — skip if FK holder is a junction
      // (junction FKs produce many-through instead of many reverses)
      if (!entity.isJunction) {
        graph.get(ref.entityName)?.push({
          kind: "many",
          name: toTableVariableName(entity.name),
          entity: entity.name,
        });
      }
    }
  }

  // Step 2: Process @junction entities → many-through on both sides
  for (const entity of entities) {
    if (!entity.isJunction) continue;

    const refFields = entity.fields.filter((f) => f.references);
    if (refFields.length !== 2) continue;

    const [fieldA, fieldB] = refFields;
    // Safe: filtered to only fields with references above
    const refA = fieldA.references;
    const refB = fieldB.references;
    if (!refA || !refB) continue;

    // Side A gets many-through to Side B
    graph.get(refA.entityName)?.push({
      kind: "many-through",
      name: toTableVariableName(refB.entityName),
      fromEntity: refA.entityName,
      fromField: refA.fieldName,
      toEntity: refB.entityName,
      toField: refB.fieldName,
      junction: {
        entity: entity.name,
        fromField: fieldA.name,
        toField: fieldB.name,
      },
    });

    // Side B gets many-through to Side A
    graph.get(refB.entityName)?.push({
      kind: "many-through",
      name: toTableVariableName(refA.entityName),
      fromEntity: refB.entityName,
      fromField: refB.fieldName,
      toEntity: refA.entityName,
      toField: refA.fieldName,
      junction: {
        entity: entity.name,
        fromField: fieldB.name,
        toField: fieldA.name,
      },
    });
  }

  return graph;
}
