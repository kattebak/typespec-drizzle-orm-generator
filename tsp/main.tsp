import "../dist/index.js";

using TypeSpec.Reflection;

/**
 * Decorators of the Drizzle ORM generator.
 *
 * Namespaced, not global: `@createdAt`, `@updatedAt`, `@minValue` and `@maxValue`
 * are names other libraries and the TypeSpec standard library also declare, and a
 * global declaration makes every reference in a project that loads both ambiguous.
 * Reference these as `@Drizzle.table`, or bring them into scope for a file with
 * `using Drizzle;` when nothing else in that file declares the same names.
 */
namespace Drizzle;

extern dec table(target: Model, name: valueof string, service: valueof string);
extern dec primaryKey(target: Model, tableName: valueof string);
extern dec pk(target: ModelProperty);
extern dec references(
  target: ModelProperty,
  ref: ModelProperty,
  onDelete?: valueof "CASCADE" | "RESTRICT"
);
extern dec junction(target: Model);
/**
 * Marks a column as a UUID the application reads and writes as a 25-character
 * base36 string. `encoding` picks the stored form: `canonical` (the default,
 * 36-character hyphenated), `base36` (the 25-character string as written), or
 * `raw` (16 bytes).
 */
extern dec uuid(
  target: ModelProperty,
  encoding?: valueof "base36" | "canonical" | "raw",
  autoGenerate?: valueof boolean
);
extern dec createdAt(target: ModelProperty);
extern dec updatedAt(target: ModelProperty);
extern dec unique(target: ModelProperty);
extern dec compositeUnique(target: Model, name: valueof string, columns: ModelProperty[]);
extern dec check(target: ModelProperty, expression: valueof string);

/**
 * Declares an index that exists in SQL only.
 *
 * Unlike a vocabulary shared with another emitter (`@index` in the ElectroDB
 * vocabulary the remit front-end reads), `@indexDef` is read by this generator
 * alone, so it never becomes a secondary index in another emitter's output. Both
 * front-ends emit it. The name is used verbatim.
 */
extern dec indexDef(target: Model, name: valueof string, columns: ModelProperty[], unique?: valueof boolean);
extern dec foreignKeyDef(target: Model, name: valueof string, columns: ModelProperty[], foreignColumns: ModelProperty[]);
extern dec minValue(target: ModelProperty, value: valueof int32);
extern dec maxValue(target: ModelProperty, value: valueof int32);
extern dec columnVisibility(target: ModelProperty, value: valueof string);
