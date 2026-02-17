import "./lib.js";

using TypeSpec.Reflection;

namespace DrizzleEmitter;

extern dec entity(target: Model, name: valueof string, service: valueof string);
extern dec primaryKey(target: Model, tableName: valueof string);
extern dec pk(target: ModelProperty);
extern dec references(target: ModelProperty, ref: ModelProperty);
extern dec junction(target: Model);
extern dec uuid(target: ModelProperty, encoding: valueof string, autoGenerate?: valueof boolean);
extern dec createdAt(target: ModelProperty);
extern dec updatedAt(target: ModelProperty);
extern dec unique(target: ModelProperty);
extern dec compositeUnique(target: Model, name: valueof string, columns: ModelProperty[]);
extern dec check(target: ModelProperty, expression: valueof string);
extern dec indexDef(target: Model, name: valueof string, columns: ModelProperty[], unique?: valueof boolean);
extern dec foreignKeyDef(target: Model, name: valueof string, columns: ModelProperty[], foreignColumns: ModelProperty[]);
extern dec minValue(target: ModelProperty, value: valueof int32);
extern dec maxValue(target: ModelProperty, value: valueof int32);
extern dec visibility(target: ModelProperty, value: valueof string);
