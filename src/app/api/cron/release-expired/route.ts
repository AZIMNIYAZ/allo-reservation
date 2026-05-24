import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Optional: protect cron route with a secret header
// Vercel Cron sends this automatically if configured in project settings
const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: NextRequest) {
  try {
    // Basic secret check (skip if not configured to allow local/manual testing)
    const authHeader = request.headers.get("Authorization");
    if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Find expired pending reservations
    const expired = await prisma.reservation.findMany({
      where: {
        status: "PENDING",
        expiresAt: { lt: new Date() },
      },
      take: 200, // batch size
    });

    let releasedCount = 0;

    for (const r of expired) {
      try {
        await prisma.$transaction(async (tx) => {
          await tx.$executeRaw`
            UPDATE stocks
            SET reserved_units = GREATEST(reserved_units - ${r.quantity}, 0)
            WHERE product_id = ${r.productId}
              AND warehouse_id = ${r.warehouseId}
          `;
          await tx.reservation.update({
            where: { id: r.id },
            data: { status: "RELEASED" },
          });
        });
        releasedCount++;
      } catch (innerErr) {
        console.error(`[Cron] Failed to release reservation ${r.id}:`, innerErr);
      }
    }

    return NextResponse.json({
      scanned: expired.length,
      released: releasedCount,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[GET /api/cron/release-expired]", error);
    return NextResponse.json(
      { error: "Cron job failed" },
      { status: 500 }
    );
  }
}
