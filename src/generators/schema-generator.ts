import {
  arrayLiteral,
  arrowFn,
  exportConst,
  fnCall,
  formatCode,
  importDecl,
  objectLiteral,
  quoted,
} from "../codegen/index.js";
import type { EnumDef, FieldDef, TableDef } from "../ir/types.js";
import { mapFieldToColumn } from "./column-mapper.js";
import { toTableVariableName } from "./naming.js";

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

  lines.push(formatCode(importDecl(pgCoreImports, "drizzle-orm/pg-core")));

  if (needsSqlImport(tables)) {
    lines.push(importDecl(["sql"], "drizzle-orm"));
  }

  if (hasUuidFields(tables)) {
    lines.push(importDecl(["base36Uuid"], "./types.js"));
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

    if (hasCheckConstraints(table)) {
      imports.add("check");
    }

    if (table.uniqueConstraints.length > 0) {
      imports.add("uniqueIndex");
    }

    for (const idx of table.indexes) {
      if (idx.unique) {
        imports.add("uniqueIndex");
      } else {
        imports.add("index");
      }
    }

    if (table.foreignKeys.length > 0) {
      imports.add("foreignKey");
    }

    for (const field of table.fields) {
      if (field.uuid) continue;

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
        case "enum":
          break;
      }
    }
  }

  if (enums.length > 0) {
    imports.add("pgEnum");
  }

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
  const values = enumDef.values.map((v) => `  ${quoted(v)},`).join("\n");
  return exportConst(
    enumDef.name,
    `${fnCall("pgEnum", [quoted(enumDef.sqlName), `[\n${values}\n]`])}`,
  );
}

function generateTableDeclaration(table: TableDef): string {
  const varName = toTableVariableName(table.name);
  const columns = generateColumns(table);
  const extras = generateTableExtras(table);

  if (extras.length > 0) {
    return generateTableWithExtras(table, varName, columns, extras);
  }

  return exportConst(varName, fnCall("pgTable", [quoted(table.tableName), columns]));
}

function generateTableWithExtras(
  table: TableDef,
  varName: string,
  columns: string,
  extras: string[],
): string {
  return [
    `export const ${varName} = pgTable(`,
    `  ${quoted(table.tableName)},`,
    `${columns
      .split("\n")
      .map((line) => `  ${line}`)
      .join("\n")},`,
    `  ${arrowFn(["table"], `[\n${extras.join(",\n")},\n  ]`)},`,
    `);`,
  ].join("\n");
}

function generateColumns(table: TableDef): string {
  const lines = table.fields.map((field) => `  ${field.name}: ${mapFieldToColumn(field, table)},`);
  return `{\n${lines.join("\n")}\n}`;
}

function generateTableExtras(table: TableDef): string[] {
  const extras: string[] = [];

  if (table.primaryKey.isComposite) {
    const pkColumns = table.primaryKey.columns.map((col) => `table.${col}`);
    const pkObj = objectLiteral(
      [
        ["name", quoted(`${table.tableName}_pk`)],
        ["columns", arrayLiteral(pkColumns)],
      ],
      { concise: true },
    );
    extras.push(`    ${fnCall("primaryKey", [pkObj])}`);
  }

  for (const field of table.fields) {
    if (field.constraints?.minValue !== undefined || field.constraints?.maxValue !== undefined) {
      extras.push(generateRangeCheck(table, field));
    }
    if (field.constraints?.check) {
      extras.push(generateFieldCheck(table, field));
    }
  }

  for (const uq of table.uniqueConstraints) {
    const cols = uq.columns.map((c) => `table.${c}`);
    extras.push(`    ${fnCall("uniqueIndex", [quoted(uq.name)])}.on(${cols.join(", ")})`);
  }

  for (const idx of table.indexes) {
    const cols = idx.columns.map((c) => `table.${c}`);
    const idxFn = idx.unique ? "uniqueIndex" : "index";
    extras.push(`    ${fnCall(idxFn, [quoted(idx.name)])}.on(${cols.join(", ")})`);
  }

  for (const fk of table.foreignKeys) {
    const localCols = fk.columns.map((c) => `table.${c}`);
    const foreignVar = toTableVariableName(fk.foreignTable);
    const foreignCols = fk.foreignColumns.map((c) => `${foreignVar}.${c}`);
    const fkObj = objectLiteral(
      [
        ["name", quoted(fk.name)],
        ["columns", arrayLiteral(localCols)],
        ["foreignColumns", arrayLiteral(foreignCols)],
      ],
      { concise: true },
    );
    extras.push(`    ${fnCall("foreignKey", [fkObj])}`);
  }

  return extras;
}

function generateRangeCheck(table: TableDef, field: FieldDef): string {
  const conditions: string[] = [];

  if (field.constraints?.minValue !== undefined) {
    conditions.push(`\${table.${field.name}} >= ${field.constraints.minValue}`);
  }
  if (field.constraints?.maxValue !== undefined) {
    conditions.push(`\${table.${field.name}} <= ${field.constraints.maxValue}`);
  }

  const expr = conditions.join(" AND ");
  const checkName = `${table.tableName}_${field.columnName}_check`;

  return `    ${fnCall("check", [quoted(checkName), `sql\`${expr}\``])}`;
}

function generateFieldCheck(table: TableDef, field: FieldDef): string {
  const checkName = `${table.tableName}_${field.columnName}_check`;
  const expr = field.constraints?.check ?? "";

  return `    ${fnCall("check", [quoted(checkName), `sql\`${expr}\``])}`;
}
