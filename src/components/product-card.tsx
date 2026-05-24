"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, ShoppingCart, MapPin } from "lucide-react";

interface StockItem {
  id: string;
  warehouse: { id: string; name: string; location: string | null };
  totalUnits: number;
  reservedUnits: number;
  available: number;
}

interface ProductCardProps {
  product: {
    id: string;
    name: string;
    description: string | null;
    sku: string;
    image: string | null;
    price: number;
    stocks: StockItem[];
  };
}

export function ProductCard({ product }: ProductCardProps) {
  const router = useRouter();
  const [loadingWarehouseId, setLoadingWarehouseId] = useState<string | null>(null);

  const formatPrice = (p: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(p / 100);
  };

  const handleReserve = async (warehouseId: string) => {
    setLoadingWarehouseId(warehouseId);
    try {
      // Generate a fresh idempotency key per attempt
      const idempotencyKey = crypto.randomUUID();
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          productId: product.id,
          warehouseId,
          quantity: 1,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 409) {
        toast.error(data.error || "Not enough stock available", {
          description: "Someone else may have grabbed the last unit just now.",
        });
        return;
      }

      if (!res.ok) {
        toast.error(data.error || "Failed to reserve");
        return;
      }

      toast.success("Reserved! Redirecting to checkout…");
      router.push(`/${data.id}`);
    } catch (err) {
      console.error(err);
      toast.error("Network error. Please try again.");
    } finally {
      setLoadingWarehouseId(null);
    }
  };

  return (
    <Card className="overflow-hidden transition-shadow hover:shadow-lg border-slate-200 bg-white">
      <div className="relative aspect-square bg-slate-100">
        {product.image ? (
          <Image
            src={product.image}
            alt={product.name}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-slate-300">
            No Image
          </div>
        )}
      </div>

      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold text-lg leading-tight">{product.name}</h3>
            <p className="text-xs text-slate-500 font-mono mt-0.5">{product.sku}</p>
          </div>
          <div className="font-bold text-indigo-600 text-lg shrink-0">
            {formatPrice(product.price)}
          </div>
        </div>
        {product.description && (
          <p className="text-sm text-slate-500 line-clamp-2">{product.description}</p>
        )}
      </CardHeader>

      <CardContent className="pt-0">
        <div className="space-y-2">
          {product.stocks.map((stock) => {
            const isLow = stock.available > 0 && stock.available <= 3;
            const isOut = stock.available <= 0;

            return (
              <div
                key={stock.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-sm font-medium text-slate-700 truncate">
                    <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{stock.warehouse.name}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    {isOut ? (
                      <Badge variant="secondary" className="bg-red-50 text-red-600 border-red-100">
                        Out of Stock
                      </Badge>
                    ) : isLow ? (
                      <Badge variant="secondary" className="bg-amber-50 text-amber-700 border-amber-100">
                        Only {stock.available} left
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 border-emerald-100">
                        {stock.available} available
                      </Badge>
                    )}
                  </div>
                </div>

                <Button
                  size="sm"
                  className="shrink-0 gap-1.5"
                  disabled={isOut || loadingWarehouseId === stock.warehouse.id}
                  onClick={() => handleReserve(stock.warehouse.id)}
                >
                  {loadingWarehouseId === stock.warehouse.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ShoppingCart className="h-4 w-4" />
                  )}
                  Reserve
                </Button>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
