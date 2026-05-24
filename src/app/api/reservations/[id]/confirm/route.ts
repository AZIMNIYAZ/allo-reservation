import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cacheResponse, getCachedResponse, hashBody } from "@/lib/idempotency";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json(
        { error: "Reservation ID is required" },
        { status: 400 }
      );
    }

    const idempotencyKey = request.headers.get("Idempotency-Key")?.trim();
    const body = {}; // confirm has no body
    const bodyHash = hashBody(body);
    const requestPath = `/api/reservations/${id}/confirm`;

    if (idempotencyKey) {
      const cached = await getCachedResponse(idempotencyKey, bodyHash);
      if (cached) {
        return NextResponse.json(cached.body, { status: cached.status });
      }
    }

    const reservation = await prisma.reservation.findUnique({
      where: { id },
      include: { product: true, warehouse: true },
    });

    if (!reservation) {
      if (idempotencyKey) {
        await cacheResponse(
          idempotencyKey,
          "POST",
          requestPath,
          bodyHash,
          404,
          { error: "Reservation not found" },
          10
        );
      }
      return NextResponse.json(
        { error: "Reservation not found" },
        { status: 404 }
      );
    }

    // Resource-level idempotency: already confirmed
    if (reservation.status === "CONFIRMED") {
      const body = {
        id: reservation.id,
        status: reservation.status,
        product: reservation.product,
        warehouse: reservation.warehouse,
        quantity: reservation.quantity,
      };
      if (idempotencyKey) {
        await cacheResponse(
          idempotencyKey,
          "POST",
          requestPath,
          bodyHash,
          200,
          body,
          60
        );
      }
      return NextResponse.json(body, { status: 200 });
    }

    if (reservation.status === "RELEASED") {
      const message = { error: "Reservation already released" };
      if (idempotencyKey) {
        await cacheResponse(
          idempotencyKey,
          "POST",
          requestPath,
          bodyHash,
          400,
          message,
          10
        );
      }
      return NextResponse.json(message, { status: 400 });
    }

    // Expiry check + lazy cleanup
    if (new Date() > reservation.expiresAt) {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`
          UPDATE stocks
          SET reserved_units = GREATEST(reserved_units - ${reservation!.quantity}, 0)
          WHERE product_id = ${reservation!.productId}
            AND warehouse_id = ${reservation!.warehouseId}
        `;
        await tx.reservation.update({
          where: { id: reservation!.id },
          data: { status: "RELEASED" },
        });
      });

      const message = { error: "Reservation expired" };
      if (idempotencyKey) {
        await cacheResponse(
          idempotencyKey,
          "POST",
          requestPath,
          bodyHash,
          410,
          message,
          10
        );
      }
      return NextResponse.json(message, { status: 410 });
    }

    // Confirm: permanently decrement stock
    const updated = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        UPDATE stocks
        SET total_units = total_units - ${reservation.quantity},
            reserved_units = reserved_units - ${reservation.quantity}
        WHERE product_id = ${reservation.productId}
          AND warehouse_id = ${reservation.warehouseId}
      `;
      return tx.reservation.update({
        where: { id: reservation.id },
        data: { status: "CONFIRMED" },
        include: { product: true, warehouse: true },
      });
    });

    const responseBody = {
      id: updated.id,
      status: updated.status,
      product: updated.product,
      warehouse: updated.warehouse,
      quantity: updated.quantity,
    };

    if (idempotencyKey) {
      await cacheResponse(
        idempotencyKey,
        "POST",
        requestPath,
        bodyHash,
        200,
        responseBody,
        60
      );
    }

    return NextResponse.json(responseBody, { status: 200 });
  } catch (error) {
    console.error("[POST /api/reservations/:id/confirm]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
