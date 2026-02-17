import type { EnumDef, TableDef } from "../ir/types.ts";
import { mapFieldToColumn } from "./column-mapper.ts";
import { toTableVariableName } from "./naming.ts";

/**
 * Generates the complete schema.ts file content from IR.
 *
 * Produces:
 * - Import declarations (drizzle-orm/pg-core + drizzle-orm + ./types.js)
 * - pgEnum() calls for each enum
 * - pgTable() calls for each table
 * - Composite primaryKey() for junction tables
 * - .references() for FK fields
 * - CHECK constraints from @minValue/@maxValue and @check
 * - uniqueIndex() for composite unique constraints
 * - index() for performance indexes
 * - foreignKey() for composite foreign keys
 */
export function generateSchema(tables: TableDef[], enums: EnumDef[]): string {
  const sections: string[] = [];

  sections.push(generateImports(tables, enums));

  for (const enumDef of enums) {
    sections.push(generateEnumDeclaration(enumDef));
  }

  for (const table of tables) {
    sections.push(generateTableDeclaration(table));
  }

  return `${sections.join("\n\n")}\n`;
}

function generateImports(tables: TableDef[], enums: EnumDef[]): string {
  const pgCoreImports = collectPgCoreImports(tables, enums);
  const lines: string[] = [];

  lines.push(
    `import {\n${pgCoreImports.map((i) => `  ${i},`).join("\n")}\n} from "drizzle-orm/pg-core";`,
  );

  // sql import from drizzle-orm (needed for CHECK constraints)
  if (needsSqlImport(tables)) {
    lines.push('import { sql } from "drizzle-orm";');
  }

  if (hasUuidFields(tables)) {
    lines.push('import { base36Uuid } from "./types.js";');
  }

  return lines.join("\n");
}

function needsSqlImport(tables: TableDef[]): boolean {
  return tables.some((t) =>
    t.fields.some(
      (f) =>
        f.constraints?.minValue !== undefined ||
        f.constraints?.maxValue !== undefined ||
        f.constraints?.check !== undefined,
    ),
  );
}

function collectPgCoreImports(tables: TableDef[], enums: EnumDef[]): string[] {
  const imports = new Set<string>();

  imports.add("pgTable");

  for (const table of tables) {
    if (table.primaryKey.isComposite) {
      imports.add("primaryKey");
    }

    // CHECK constraints need "check"
    if (hasCheckConstraints(table)) {
      imports.add("check");
    }

    // Composite unique constraints need "uniqueIndex"
    if (table.uniqueConstraints.length > 0) {
      imports.add("uniqueIndex");
    }

    // Indexes
    for (const idx of table.indexes) {
      if (idx.unique) {
        imports.add("uniqueIndex");
      } else {
        imports.add("index");
      }
    }

    // Composite foreign keys
    if (table.foreignKeys.length > 0) {
      imports.add("foreignKey");
    }

    for (const field of table.fields) {
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

function hasCheckConstraints(table: TableDef): boolean {
  return table.fields.some(
    (f) =>
      f.constraints?.minValue !== undefined ||
      f.constraints?.maxValue !== undefined ||
      f.constraints?.check !== undefined,
  );
}

function hasUuidFields(tables: TableDef[]): boolean {
  return tables.some((t) => t.fields.some((f) => f.uuid));
}

function generateEnumDeclaration(enumDef: EnumDef): string {
  const values = enumDef.values.map((v) => `  "${v}",`).join("\n");
  return `export const ${enumDef.name} = pgEnum("${enumDef.sqlName}", [\n${values}\n]);`;
}

function generateTableDeclaration(table: TableDef): string {
  const varName = toTableVariableName(table.name);
  const columns = generateColumns(table);
  const extras = generateTableExtras(table);

  if (extras.length > 0) {
    return generateTableWithExtras(table, varName, columns, extras);
  }

  return `export const ${varName} = pgTable("${table.tableName}", {\n${columns}\n});`;
}

function generateColumns(table: TableDef): string {
  const lines: string[] = [];

  for (const field of table.fields) {
    const columnCode = mapFieldToColumn(field, table);
    lines.push(`  ${field.name}: ${columnCode},`);
  }

  return lines.join("\n");
}

/**
 * Collects all table-level extras: composite PK, CHECK constraints,
 * unique indexes, indexes, and composite foreign keys.
 */
function generateTableExtras(table: TableDef): string[] {
  const extras: string[] = [];

  // Composite PK
  if (table.primaryKey.isComposite) {
    const pkColumns = table.primaryKey.columns.map((col) => `table.${col}`).join(", ");
    const pkName = `${table.tableName}_pk`;
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
  for (const field of table.fields) {
    if (field.constraints?.minValue !== undefined || field.constraints?.maxValue !== undefined) {
      extras.push(generateRangeCheck(table, field));
    }
    if (field.constraints?.check) {
      extras.push(generateFieldCheck(table, field));
    }
  }

  // Composite unique constraints
  for (const uq of table.uniqueConstraints) {
    const cols = uq.columns.map((c) => `table.${c}`).join(", ");
    extras.push(`    uniqueIndex("${uq.name}").on(${cols})`);
  }

  // Indexes
  for (const idx of table.indexes) {
    const cols = idx.columns.map((c) => `table.${c}`).join(", ");
    if (idx.unique) {
      extras.push(`    uniqueIndex("${idx.name}").on(${cols})`);
    } else {
      extras.push(`    index("${idx.name}").on(${cols})`);
    }
  }

  // Composite foreign keys
  for (const fk of table.foreignKeys) {
    const localCols = fk.columns.map((c) => `table.${c}`).join(", ");
    const foreignVar = toTableVariableName(fk.foreignTable);
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

function generateRangeCheck(table: TableDef, field: import("../ir/types.ts").FieldDef): string {
  const conditions: string[] = [];

  if (field.constraints?.minValue !== undefined) {
    conditions.push(`\${table.${field.name}} >= ${field.constraints.minValue}`);
  }
  if (field.constraints?.maxValue !== undefined) {
    conditions.push(`\${table.${field.name}} <= ${field.constraints.maxValue}`);
  }

  const expr = conditions.join(" AND ");
  const checkName = `${table.tableName}_${field.columnName}_check`;

  return `    check("${checkName}", sql\`${expr}\`)`;
}

function generateFieldCheck(table: TableDef, field: import("../ir/types.ts").FieldDef): string {
  const checkName = `${table.tableName}_${field.columnName}_check`;
  const expr = field.constraints?.check ?? "";

  return `    check("${checkName}", sql\`${expr}\`)`;
}

function generateTableWithExtras(
  table: TableDef,
  varName: string,
  columns: string,
  extras: string[],
): string {
  return [
    `export const ${varName} = pgTable(`,
    `  "${table.tableName}",`,
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
