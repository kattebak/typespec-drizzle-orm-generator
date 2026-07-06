/** UUID encoding options for @uuid decorator */
export type UuidEncoding = "base36" | "canonical" | "raw";

/** Resolved column type after applying all decorators */
export type FieldType =
  | { kind: "text" }
  | { kind: "varchar"; length: number }
  | { kind: "integer" }
  | { kind: "bigint" }
  | { kind: "real" }
  | { kind: "doublePrecision" }
  | { kind: "boolean" }
  | { kind: "timestamp" }
  | { kind: "jsonb" }
  | { kind: "uuid"; encoding: UuidEncoding }
  | { kind: "enum"; enumName: string; values: string[] };

/** ON DELETE / ON UPDATE referential action for a foreign key */
export type ReferentialAction = "cascade" | "restrict" | "no action" | "set null" | "set default";

/** Column-level field definition extracted from a TypeSpec model property */
export interface FieldDef {
  name: string;
  columnName: string;
  type: FieldType;
  nullable: boolean;
  uuid?: {
    encoding: UuidEncoding;
    autoGenerate: boolean;
  };
  references?: {
    tableName: string;
    fieldName: string;
    onDelete?: ReferentialAction;
  };
  createdAt: boolean;
  updatedAt: boolean;
  visibility?: "read";
  defaultValue?: unknown;
  constraints?: {
    minValue?: number;
    maxValue?: number;
    check?: string;
    unique?: boolean;
  };
}

/** Primary key definition from @primaryKey decorator */
export interface PrimaryKeyDef {
  tableName: string;
  columns: string[];
  isComposite: boolean;
}

/** Foreign key constraint from @foreignKey decorator */
export interface ForeignKeyDef {
  name: string;
  columns: string[];
  foreignTable: string;
  foreignColumns: string[];
}

/** Index definition from @index decorator */
export interface IndexDef {
  name: string;
  columns: string[];
  unique: boolean;
}

/** Composite unique constraint from @unique({ name, columns }) */
export interface UniqueConstraintDef {
  name: string;
  columns: string[];
}

/** Full table definition extracted from a TypeSpec model */
export interface TableDef {
  name: string;
  service: string;
  tableName: string;
  primaryKey: PrimaryKeyDef;
  fields: FieldDef[];
  foreignKeys: ForeignKeyDef[];
  isJunction: boolean;
  indexes: IndexDef[];
  uniqueConstraints: UniqueConstraintDef[];
}

/** Enum definition extracted from a TypeSpec enum */
export interface EnumDef {
  name: string;
  sqlName: string;
  values: string[];
}
