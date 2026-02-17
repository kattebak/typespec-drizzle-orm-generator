import type { EntityDef, EnumDef } from "../ir/types.ts";
import { mapFieldToColumn } from "./column-mapper.ts";
import { toTableVariableName } from "./naming.ts";

/**
 * Generates the complete schema.ts file content from IR.
 *
 * Produces:
 * - Import declarations (drizzle-orm/pg-core + drizzle-orm + ./types.js)
 * - pgEnum() calls for each enum
 * - pgTable() calls for each entity
 * - Composite primaryKey() for junction tables
 * - .references() for FK fields
 * - CHECK constraints from @minValue/@maxValue and @check
 * - uniqueIndex() for composite unique constraints
 * - index() for performance indexes
 * - foreignKey() for composite foreign keys
 */
export function generateSchema(entities: EntityDef[], enums: EnumDef[]): string {
  const sections: string[] = [];

  sections.push(generateImports(entities, enums));

  for (const enumDef of enums) {
    sections.push(generateEnumDeclaration(enumDef));
  }

  for (const entity of entities) {
    sections.push(generateTableDeclaration(entity));
  }

  return `${sections.join("\n\n")}\n`;
}

function generateImports(entities: EntityDef[], enums: EnumDef[]): string {
  const pgCoreImports = collectPgCoreImports(entities, enums);
  const lines: string[] = [];

  lines.push(
    `import {\n${pgCoreImports.map((i) => `  ${i},`).join("\n")}\n} from "drizzle-orm/pg-core";`,
  );

  // sql import from drizzle-orm (needed for CHECK constraints)
  if (needsSqlImport(entities)) {
    lines.push('import { sql } from "drizzle-orm";');
  }

  if (hasUuidFields(entities)) {
    lines.push('import { base36Uuid } from "./types.js";');
  }

  return lines.join("\n");
}

function needsSqlImport(entities: EntityDef[]): boolean {
  return entities.some((e) =>
    e.fields.some(
      (f) =>
        f.constraints?.minValue !== undefined ||
        f.constraints?.maxValue !== undefined ||
        f.constraints?.check !== undefined,
    ),
  );
}

function collectPgCoreImports(entities: EntityDef[], enums: EnumDef[]): string[] {
  const imports = new Set<string>();

  imports.add("pgTable");

  for (const entity of entities) {
    if (entity.primaryKey.isComposite) {
      imports.add("primaryKey");
    }

    // CHECK constraints need "check"
    if (hasCheckConstraints(entity)) {
      imports.add("check");
    }

    // Composite unique constraints need "uniqueIndex"
    if (entity.uniqueConstraints.length > 0) {
      imports.add("uniqueIndex");
    }

    // Indexes
    for (const idx of entity.indexes) {
      if (idx.unique) {
        imports.add("uniqueIndex");
      } else {
        imports.add("index");
      }
    }

    // Composite foreign keys
    if (entity.foreignKeys.length > 0) {
      imports.add("foreignKey");
    }

    for (const field of entity.fields) {
      if (field.uuid) continue; // uuid uses custom type, not pg-core

      switch (field.type.kind) {
        case "text":
          imports.add("text");
          break;
        case "varchar":
          imports.add("varchar");
          break;
        case "integer":
          imports.add("integer");
          break;
        case "bigint":
          imports.add("bigint");
          break;
        case "real":
          imports.add("real");
          break;
        case "doublePrecision":
          imports.add("doublePrecision");
          break;
        case "boolean":
          imports.add("boolean");
          break;
        case "timestamp":
          imports.add("timestamp");
          break;
        case "uuid":
          // handled by base36Uuid import
          break;
        case "enum":
          // enum types are declared locally
          break;
      }
    }
  }

  if (enums.length > 0) {
    imports.add("pgEnum");
  }

  // Sort for deterministic output
  return [...imports].sort();
}

function hasCheckConstraints(entity: EntityDef): boolean {
  return entity.fields.some(
    (f) =>
      f.constraints?.minValue !== undefined ||
      f.constraints?.maxValue !== undefined ||
      f.constraints?.check !== undefined,
  );
}

function hasUuidFields(entities: EntityDef[]): boolean {
  return entities.some((e) => e.fields.some((f) => f.uuid));
}

function generateEnumDeclaration(enumDef: EnumDef): string {
  const values = enumDef.values.map((v) => `  "${v}",`).join("\n");
  return `export const ${enumDef.name} = pgEnum("${enumDef.sqlName}", [\n${values}\n]);`;
}

function generateTableDeclaration(entity: EntityDef): string {
  const varName = toTableVariableName(entity.name);
  const columns = generateColumns(entity);
  const extras = generateTableExtras(entity);

  if (extras.length > 0) {
    return generateTableWithExtras(entity, varName, columns, extras);
  }

  return `export const ${varName} = pgTable("${entity.tableName}", {\n${columns}\n});`;
}

function generateColumns(entity: EntityDef): string {
  const lines: string[] = [];

  for (const field of entity.fields) {
    const columnCode = mapFieldToColumn(field, entity);
    lines.push(`  ${field.name}: ${columnCode},`);
  }

  return lines.join("\n");
}

/**
 * Collects all table-level extras: composite PK, CHECK constraints,
 * unique indexes, indexes, and composite foreign keys.
 */
function generateTableExtras(entity: EntityDef): string[] {
  const extras: string[] = [];

  // Composite PK
  if (entity.primaryKey.isComposite) {
    const pkColumns = entity.primaryKey.columns.map((col) => `table.${col}`).join(", ");
    const pkName = `${entity.tableName}_pk`;
    extras.push(
      [
        `    primaryKey({`,
        `      name: "${pkName}",`,
        `      columns: [${pkColumns}],`,
        `    })`,
      ].join("\n"),
    );
  }

  // CHECK constraints from @minValue/@maxValue
  for (const field of entity.fields) {
    if (field.constraints?.minValue !== undefined || field.constraints?.maxValue !== undefined) {
      extras.push(generateRangeCheck(entity, field));
    }
    if (field.constraints?.check) {
      extras.push(generateFieldCheck(entity, field));
    }
  }

  // Composite unique constraints
  for (const uq of entity.uniqueConstraints) {
    const cols = uq.columns.map((c) => `table.${c}`).join(", ");
    extras.push(`    uniqueIndex("${uq.name}").on(${cols})`);
  }

  // Indexes
  for (const idx of entity.indexes) {
    const cols = idx.columns.map((c) => `table.${c}`).join(", ");
    if (idx.unique) {
      extras.push(`    uniqueIndex("${idx.name}").on(${cols})`);
    } else {
      extras.push(`    index("${idx.name}").on(${cols})`);
    }
  }

  // Composite foreign keys
  for (const fk of entity.foreignKeys) {
    const localCols = fk.columns.map((c) => `table.${c}`).join(", ");
    const foreignVar = toTableVariableName(fk.foreignEntity);
    const foreignCols = fk.foreignColumns.map((c) => `${foreignVar}.${c}`).join(", ");
    extras.push(
      [
        `    foreignKey({`,
        `      name: "${fk.name}",`,
        `      columns: [${localCols}],`,
        `      foreignColumns: [${foreignCols}],`,
        `    })`,
      ].join("\n"),
    );
  }

  return extras;
}

function generateRangeCheck(entity: EntityDef, field: import("../ir/types.ts").FieldDef): string {
  const conditions: string[] = [];

  if (field.constraints?.minValue !== undefined) {
    conditions.push(`\${table.${field.name}} >= ${field.constraints.minValue}`);
  }
  if (field.constraints?.maxValue !== undefined) {
    conditions.push(`\${table.${field.name}} <= ${field.constraints.maxValue}`);
  }

  const expr = conditions.join(" AND ");
  const checkName = `${entity.tableName}_${field.columnName}_check`;

  return `    check("${checkName}", sql\`${expr}\`)`;
}

function generateFieldCheck(entity: EntityDef, field: import("../ir/types.ts").FieldDef): string {
  const checkName = `${entity.tableName}_${field.columnName}_check`;
  const expr = field.constraints?.check ?? "";

  return `    check("${checkName}", sql\`${expr}\`)`;
}

function generateTableWithExtras(
  entity: EntityDef,
  varName: string,
  columns: string,
  extras: string[],
): string {
  return [
    `export const ${varName} = pgTable(`,
    `  "${entity.tableName}",`,
    `  {`,
    columns
      .split("\n")
      .map((line) => `  ${line}`)
      .join("\n"),
    `  },`,
    `  (table) => [`,
    `${extras.join(",\n")},`,
    `  ],`,
    `);`,
  ].join("\n");
}
