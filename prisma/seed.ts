import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Clean slate
  await prisma.reservation.deleteMany();
  await prisma.stock.deleteMany();
  await prisma.product.deleteMany();
  await prisma.warehouse.deleteMany();
  await prisma.idempotencyCache.deleteMany();

  const warehouses = await prisma.warehouse.createManyAndReturn({
    data: [
      { name: "Mumbai Fulfillment Center", location: "Bhiwandi, MH" },
      { name: "Delhi Fulfillment Center", location: "Gurgaon, HR" },
      { name: "Bangalore Fulfillment Center", location: "Whitefield, KA" },
    ],
  });

  const products = await prisma.product.createManyAndReturn({
    data: [
      {
        name: "Sony WH-1000XM5",
        description: "Industry-leading noise cancelling wireless headphones.",
        sku: "SONY-XM5-BLK",
        image: "https://images.unsplash.com/photo-1618366712010-f4ae9c647dcb?w=400&h=400&fit=crop",
        price: 29900,
      },
      {
        name: "Apple iPhone 15 Pro",
        description: "Titanium design. A17 Pro chip. Action button.",
        sku: "APL-IP15PRO-NAT",
        image: "https://images.unsplash.com/photo-1696446701796-da61225697cc?w=400&h=400&fit=crop",
        price: 134900,
      },
      {
        name: "Nike Air Max 90",
        description: "Iconic silhouette with visible Air cushioning.",
        sku: "NK-AM90-WHT",
        image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&h=400&fit=crop",
        price: 10995,
      },
      {
        name: "Kindle Paperwhite",
        description: "6.8\" display with adjustable warm light.",
        sku: "AMZ-KPW-16GB",
        image: "https://images.unsplash.com/photo-1592496001020-d31bd830651f?w=400&h=400&fit=crop",
        price: 13999,
      },
    ],
  });

  // Stock levels: intentionally low in some warehouses to trigger race conditions
  const stockData = [
    // Sony XM5
    { productId: products[0].id, warehouseId: warehouses[0].id, totalUnits: 5, reservedUnits: 0 },
    { productId: products[0].id, warehouseId: warehouses[1].id, totalUnits: 2, reservedUnits: 0 }, // scarce
    { productId: products[0].id, warehouseId: warehouses[2].id, totalUnits: 8, reservedUnits: 0 },

    // iPhone 15 Pro
    { productId: products[1].id, warehouseId: warehouses[0].id, totalUnits: 1, reservedUnits: 0 }, // very scarce
    { productId: products[1].id, warehouseId: warehouses[1].id, totalUnits: 4, reservedUnits: 0 },
    { productId: products[1].id, warehouseId: warehouses[2].id, totalUnits: 3, reservedUnits: 0 },

    // Nike Air Max
    { productId: products[2].id, warehouseId: warehouses[0].id, totalUnits: 12, reservedUnits: 0 },
    { productId: products[2].id, warehouseId: warehouses[1].id, totalUnits: 0, reservedUnits: 0 }, // out of stock
    { productId: products[2].id, warehouseId: warehouses[2].id, totalUnits: 7, reservedUnits: 0 },

    // Kindle
    { productId: products[3].id, warehouseId: warehouses[0].id, totalUnits: 20, reservedUnits: 0 },
    { productId: products[3].id, warehouseId: warehouses[1].id, totalUnits: 15, reservedUnits: 0 },
    { productId: products[3].id, warehouseId: warehouses[2].id, totalUnits: 10, reservedUnits: 0 },
  ];

  await prisma.stock.createMany({ data: stockData });

  console.log("Seeded:", {
    warehouses: warehouses.length,
    products: products.length,
    stocks: stockData.length,
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
