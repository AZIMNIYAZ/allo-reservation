import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { reserveSchema } from "@/lib/schemas";
import { cacheResponse, getCachedResponse, hashBody } from "@/lib/idempotency";
import { addMinutes } from "date-fns";

const EXPIRY_MINUTES = 10;

class InsufficientStockError extends Error {
  constructor() {
    super("INSUFFICIENT_STOCK");
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = reserveSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { productId, warehouseId, quantity } = parsed.data;

    const idempotencyKey = request.headers.get("Idempotency-Key")?.trim();
    const bodyHash = hashBody(body);
    const requestPath = "/api/reservations";

    if (idempotencyKey) {
      const existingReservation = await prisma.reservation.findUnique({
        where: { idempotencyKey },
        include: { product: true, warehouse: true },
      });
      if (existingReservation) {
        return NextResponse.json(
          {
            id: existingReservation.id,
            status: existingReservation.status,
            expiresAt: existingReservation.expiresAt,
            product: existingReservation.product,
            warehouse: existingReservation.warehouse,
            quantity: existingReservation.quantity,
            cached: true,
          },
          { status: 200 }
        );
      }

      const cached = await getCachedResponse(idempotencyKey, bodyHash);
      if (cached) {
        return NextResponse.json(cached.body, { status: cached.status });
      }
    }

    let reservation: Record<string, unknown> | null = null;

    try {
      reservation = await prisma.$transaction(async (tx) => {
        const updateResult = await tx.$executeRaw`
          UPDATE stocks
          SET reserved_units = reserved_units + ${quantity}
          WHERE product_id = ${productId}
            AND warehouse_id = ${warehouseId}
            AND (total_units - reserved_units) >= ${quantity}
        `;

        if (Number(updateResult) === 0) {
          throw new InsufficientStockError();
        }

        const created = await tx.reservation.create({
          data: {
            productId,
            warehouseId,
            quantity,
            status: "PENDING",
            expiresAt: addMinutes(new Date(), EXPIRY_MINUTES),
            idempotencyKey: idempotencyKey || null,
          },
          include: { product: true, warehouse: true },
        });

        return created as Record<string, unknown>;
      }, {
        isolationLevel: "Serializable",
      });
    } catch (txError: unknown) {
      if (txError instanceof InsufficientStockError) {
        if (idempotencyKey) {
          await cacheResponse(
            idempotencyKey,
            "POST",
            requestPath,
            bodyHash,
            409,
            { error: "Not enough stock available" },
            10
          );
        }
        return NextResponse.json(
          { error: "Not enough stock available" },
          { status: 409 }
        );
      }
      throw txError;
    }

    if (!reservation) {
      return NextResponse.json(
        { error: "Reservation failed unexpectedly" },
        { status: 500 }
      );
    }

    if (idempotencyKey) {
      await cacheResponse(
        idempotencyKey,
        "POST",
        requestPath,
        bodyHash,
        201,
        {
          id: reservation.id,
          status: reservation.status,
          expiresAt: reservation.expiresAt,
          product: reservation.product,
          warehouse: reservation.warehouse,
          quantity: reservation.quantity,
        },
        60
      );
    }

    return NextResponse.json(
      {
        id: reservation.id,
        status: reservation.status,
        expiresAt: reservation.expiresAt,
        product: reservation.product,
        warehouse: reservation.warehouse,
        quantity: reservation.quantity,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[POST /api/reservations]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
