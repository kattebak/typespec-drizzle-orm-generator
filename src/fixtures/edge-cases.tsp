import "@kattebak/typespec-drizzle-orm-generator";

namespace EdgeCases;

enum OrderStatus {
  pending: "pending",
  shipped: "shipped",
  canceled: "canceled",
}

@table("Account", "edge")
@primaryKey("accounts")
model Account {
  @pk
  @uuid("base36", true)
  accountId: string;

  @unique
  handle: string;

  @columnVisibility("read")
  displayName?: string;

  @createdAt
  createdAt: utcDateTime;

  @updatedAt
  updatedAt: utcDateTime;
}

@table("Order", "edge")
@primaryKey("orders")
@indexDef("idx_orders_account_created", [Order.accountId, Order.createdAt])
model Order {
  @pk
  @uuid("base36", true)
  orderId: string;

  @uuid("base36")
  @references(Account.accountId)
  accountId: string;

  status: OrderStatus;

  @global.minValue(1)
  @global.maxValue(5)
  rating?: int32;

  @check("total_cents > 0")
  totalCents: int32;

  @createdAt
  createdAt: utcDateTime;

  @updatedAt
  updatedAt: utcDateTime;
}

@table("Product", "edge")
@primaryKey("products")
@indexDef("idx_products_sku", [Product.sku], true)
model Product {
  @pk
  @uuid("base36", true)
  productId: string;

  sku: string;
  name: string;
}

@table("OrderLine", "edge")
@primaryKey("order_lines")
@compositeUnique("uq_order_sku", [OrderLine.orderId, OrderLine.sku])
model OrderLine {
  @pk
  @uuid("base36")
  @references(Order.orderId)
  orderId: string;

  @pk
  lineNumber: int32;

  sku: string;
  quantity: int32;

  @uuid("base36")
  @references(Product.productId)
  productId?: string;
}

@table("Tag", "edge")
@primaryKey("tags")
model Tag {
  @pk
  @uuid("base36", true)
  tagId: string;

  name: string;
}

@table("OrderTag", "edge")
@junction
@primaryKey("order_tags")
model OrderTag {
  @pk
  @uuid("base36")
  @references(Order.orderId)
  orderId: string;

  @pk
  @uuid("base36")
  @references(Tag.tagId)
  tagId: string;
}

@table("Shipment", "edge")
@primaryKey("shipments")
@foreignKeyDef(
  "fk_shipment_line",
  [Shipment.orderId, Shipment.lineNumber],
  [OrderLine.orderId, OrderLine.lineNumber]
)
model Shipment {
  @pk
  @uuid("base36", true)
  shipmentId: string;

  @uuid("base36")
  @references(Order.orderId)
  orderId: string;

  lineNumber: int32;
  carrier?: string;
}
