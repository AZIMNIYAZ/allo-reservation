import { ReservationCheckout } from "@/components/reservation-checkout";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ reservationId: string }>;
}

export default async function ReservationPage({ params }: PageProps) {
  const { reservationId } = await params;

  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    include: {
      product: true,
      warehouse: true,
    },
  });

  if (!reservation) {
    notFound();
  }

  const isExpired = new Date() > reservation.expiresAt;
  const isReleased = reservation.status === "RELEASED";
  const isConfirmed = reservation.status === "CONFIRMED";

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <ReservationCheckout
        reservation={{
          id: reservation.id,
          status: reservation.status,
          quantity: reservation.quantity,
          expiresAt: reservation.expiresAt.toISOString(),
          product: {
            id: reservation.product.id,
            name: reservation.product.name,
            description: reservation.product.description,
            image: reservation.product.image,
            price: reservation.product.price,
            sku: reservation.product.sku,
          },
          warehouse: {
            id: reservation.warehouse.id,
            name: reservation.warehouse.name,
            location: reservation.warehouse.location,
          },
          isExpired,
          isReleased,
          isConfirmed,
        }}
      />
    </div>
  );
}
