import { ProductCard } from "@/components/product-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { Package, Zap } from "lucide-react";

export const dynamic = "force-dynamic";

async function ProductList() {
  const products = await prisma.product.findMany({
    include: {
      stocks: {
        include: { warehouse: true },
        orderBy: { warehouse: { name: "asc" } },
      },
    },
    orderBy: { name: "asc" },
  });

  if (products.length === 0) {
    return (
      <div className="text-center py-20 text-slate-500">
        <Package className="mx-auto h-10 w-10 mb-3 text-slate-300" />
        <p className="text-lg font-medium">No products found</p>
        <p className="text-sm">Run <code className="bg-slate-100 px-1 py-0.5 rounded">npm run db:seed</code> to seed data.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={{
            ...product,
            stocks: product.stocks.map((s) => ({
              ...s,
              available: Math.max(0, s.totalUnits - s.reservedUnits),
            })),
          }}
        />
      ))}
    </div>
  );
}

function ProductSkeleton() {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-slate-200 bg-white p-0 overflow-hidden">
          <Skeleton className="aspect-square rounded-none" />
          <div className="p-4 space-y-3">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-20 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Product Catalog</h1>
          <p className="text-slate-500 mt-1 text-sm">
            Reserve inventory from the nearest warehouse. Stock updates in real time.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 border border-indigo-100">
          <Zap className="h-3.5 w-3.5" />
          Atomic reservations under concurrency
        </div>
      </div>

      <Suspense fallback={<ProductSkeleton />}>
        <ProductList />
      </Suspense>
    </div>
  );
}
