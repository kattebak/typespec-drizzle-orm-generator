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
import type { DialectConfig } from "./dialect.js";
import { toTableVariableName } from "./naming.js";

export function generateSchema(
  tables: TableDef[],
  enums: EnumDef[],
  dialect: DialectConfig,
  shouldPluralize = true,
): string {
  const sections: string[] = [];

  sections.push(generateImports(tables, enums, dialect));

  if (dialect.enumFn) {
    for (const enumDef of enums) {
      sections.push(generateEnumDeclaration(enumDef, dialect.enumFn));
    }
  }

  for (const table of tables) {
    sections.push(generateTableDeclaration(table, dialect, shouldPluralize));
  }

  return `${sections.join("\n\n")}\n`;
}

function generateImports(tables: TableDef[], enums: EnumDef[], dialect: DialectConfig): string {
  const coreImports = collectCoreImports(tables, enums, dialect);
  const lines: string[] = [];

  lines.push(formatCode(importDecl(coreImports, dialect.coreModule)));

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

function collectCoreImports(
  tables: TableDef[],
  enums: EnumDef[],
  dialect: DialectConfig,
): string[] {
  const imports = new Set<string>();

  imports.add(dialect.tableFn);

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

      for (const imp of collectFieldImports(field, dialect)) {
        imports.add(imp);
      }
    }
  }

  if (enums.length > 0 && dialect.enumFn) {
    imports.add(dialect.enumFn);
  }

  return [...imports].sort();
}

function collectFieldImports(field: FieldDef, dialect: DialectConfig): string[] {
  if (dialect.dialect === "sqlite") {
    switch (field.type.kind) {
      case "text":
      case "varchar":
      case "enum":
        return ["text"];
      case "integer":
      case "bigint":
      case "boolean":
      case "timestamp":
        return ["integer"];
      case "real":
      case "doublePrecision":
        return ["real"];
      case "uuid":
        return [];
    }
  }

  switch (field.type.kind) {
    case "text":
      return ["text"];
    case "varchar":
      return ["varchar"];
    case "integer":
      return ["integer"];
    case "bigint":
      return ["bigint"];
    case "real":
      return ["real"];
    case "doublePrecision":
      return ["doublePrecision"];
    case "boolean":
      return ["boolean"];
    case "timestamp":
      return ["timestamp"];
    case "uuid":
    case "enum":
      return [];
  }
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

function generateEnumDeclaration(enumDef: EnumDef, enumFn: string): string {
  const values = enumDef.values.map((v) => `  ${quoted(v)},`).join("\n");
  return exportConst(
    enumDef.name,
    `${fnCall(enumFn, [quoted(enumDef.sqlName), `[\n${values}\n]`])}`,
  );
}

function generateTableDeclaration(
  table: TableDef,
  dialect: DialectConfig,
  shouldPluralize: boolean,
): string {
  const varName = toTableVariableName(table.name, shouldPluralize);
  const columns = generateColumns(table, dialect, shouldPluralize);
  const extras = generateTableExtras(table, shouldPluralize);

  if (extras.length > 0) {
    return generateTableWithExtras(table, varName, columns, extras, dialect);
  }

  return exportConst(varName, fnCall(dialect.tableFn, [quoted(table.tableName), columns]));
}

function generateTableWithExtras(
  table: TableDef,
  varName: string,
  columns: string,
  extras: string[],
  dialect: DialectConfig,
): string {
  return [
    `export const ${varName} = ${dialect.tableFn}(`,
    `  ${quoted(table.tableName)},`,
    `${columns
      .split("\n")
      .map((line) => `  ${line}`)
      .join("\n")},`,
    `  ${arrowFn(["table"], `[\n${extras.join(",\n")},\n  ]`)},`,
    `);`,
  ].join("\n");
}

function generateColumns(
  table: TableDef,
  dialect: DialectConfig,
  shouldPluralize: boolean,
): string {
  const lines = table.fields.map(
    (field) => `  ${field.name}: ${mapFieldToColumn(field, table, dialect, shouldPluralize)},`,
  );
  return `{\n${lines.join("\n")}\n}`;
}

function generateTableExtras(table: TableDef, shouldPluralize: boolean): string[] {
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
    const foreignVar = toTableVariableName(fk.foreignTable, shouldPluralize);
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
