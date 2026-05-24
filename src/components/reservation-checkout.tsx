"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  ArrowLeft,
  ShoppingBag,
} from "lucide-react";
import confetti from "canvas-confetti";
import { differenceInSeconds } from "date-fns";

interface ReservationCheckoutProps {
  reservation: {
    id: string;
    status: string;
    quantity: number;
    expiresAt: string;
    product: {
      id: string;
      name: string;
      description: string | null;
      image: string | null;
      price: number;
      sku: string;
    };
    warehouse: {
      id: string;
      name: string;
      location: string | null;
    };
    isExpired: boolean;
    isReleased: boolean;
    isConfirmed: boolean;
  };
}

function formatTime(totalSeconds: number) {
  if (totalSeconds <= 0) return "00:00";
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function ReservationCheckout({ reservation: initial }: ReservationCheckoutProps) {
  const router = useRouter();
  const [status, setStatus] = useState(initial.status);
  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.max(0, differenceInSeconds(new Date(initial.expiresAt), new Date()))
  );
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const isExpired = secondsLeft <= 0 || initial.isExpired;
  const isFinal = status === "CONFIRMED" || status === "RELEASED" || isExpired;

  useEffect(() => {
    if (isFinal) return;
    const interval = setInterval(() => {
      const remaining = Math.max(0, differenceInSeconds(new Date(initial.expiresAt), new Date()));
      setSecondsLeft(remaining);
      if (remaining === 0) {
        clearInterval(interval);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [initial.expiresAt, isFinal]);

  const formatPrice = (p: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(p / 100);

  const triggerConfetti = useCallback(() => {
    const end = Date.now() + 800;
    const frame = () => {
      confetti({
        particleCount: 3,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.6 },
        colors: ["#4f46e5", "#10b981", "#f59e0b"],
      });
      confetti({
        particleCount: 3,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.6 },
        colors: ["#4f46e5", "#10b981", "#f59e0b"],
      });
      if (Date.now() < end) requestAnimationFrame(frame);
    };
    frame();
  }, []);

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      const idempotencyKey = crypto.randomUUID();
      const res = await fetch(`/api/reservations/${initial.id}/confirm`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
      });
      const data = await res.json().catch(() => ({}));

      if (res.status === 410) {
        toast.error(data.error || "Reservation expired", {
          description: "The hold timed out. Please go back and reserve again.",
        });
        setSecondsLeft(0);
        return;
      }

      if (!res.ok) {
        toast.error(data.error || "Failed to confirm purchase");
        return;
      }

      setStatus("CONFIRMED");
      triggerConfetti();
      toast.success("Purchase confirmed!", {
        description: "Your order has been placed successfully.",
      });
    } catch (err) {
      console.error(err);
      toast.error("Network error. Please try again.");
    } finally {
      setConfirming(false);
    }
  };

  const handleCancel = async () => {
    setCancelling(true);
    try {
      const idempotencyKey = crypto.randomUUID();
      const res = await fetch(`/api/reservations/${initial.id}/release`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast.error(data.error || "Failed to cancel reservation");
        return;
      }

      setStatus("RELEASED");
      toast.success("Reservation cancelled", {
        description: "Inventory has been released for other shoppers.",
      });
    } catch (err) {
      console.error(err);
      toast.error("Network error. Please try again.");
    } finally {
      setCancelling(false);
    }
  };

  const timerColor =
    secondsLeft > 300
      ? "text-emerald-600"
      : secondsLeft > 60
      ? "text-amber-600"
      : "text-red-600";

  const timerBg =
    secondsLeft > 300
      ? "bg-emerald-50 border-emerald-100"
      : secondsLeft > 60
      ? "bg-amber-50 border-amber-100"
      : "bg-red-50 border-red-100";

  return (
    <div className="space-y-6">
      <Button variant="ghost" className="gap-1.5 pl-0 text-slate-600" onClick={() => router.push("/")}>
        <ArrowLeft className="h-4 w-4" />
        Back to products
      </Button>

      <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col md:flex-row">
          <div className="relative h-48 w-full md:h-auto md:w-1/3 bg-slate-100 shrink-0">
            {initial.product.image ? (
              <Image
                src={initial.product.image}
                alt={initial.product.name}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 33vw"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-slate-300">
                No Image
              </div>
            )}
          </div>

          <div className="flex-1 p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="text-xl font-bold text-slate-900">{initial.product.name}</h1>
                <p className="text-sm text-slate-500 mt-0.5">{initial.product.sku}</p>
              </div>
              <div className="text-right">
                <div className="text-xl font-bold text-indigo-600">
                  {formatPrice(initial.product.price)}
                </div>
                <div className="text-xs text-slate-400">Qty: {initial.quantity}</div>
              </div>
            </div>

            {initial.product.description && (
              <p className="mt-3 text-sm text-slate-600 leading-relaxed">
                {initial.product.description}
              </p>
            )}

            <div className="mt-4 flex items-center gap-2 text-sm text-slate-600">
              <ShoppingBag className="h-4 w-4 text-slate-400" />
              Fulfilled by{" "}
              <span className="font-medium text-slate-900">{initial.warehouse.name}</span>
              {initial.warehouse.location && (
                <span className="text-slate-400">· {initial.warehouse.location}</span>
              )}
            </div>
          </div>
        </div>

        <CardHeader className="border-t bg-slate-50/50 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <Clock className="h-4 w-4 text-slate-500" />
              Reservation Status
            </div>
            <Badge
              variant="secondary"
              className={
                status === "CONFIRMED"
                  ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                  : status === "RELEASED" || isExpired
                  ? "bg-slate-100 text-slate-600 border-slate-200"
                  : "bg-indigo-50 text-indigo-700 border-indigo-100"
              }
            >
              {status === "CONFIRMED"
                ? "Confirmed"
                : status === "RELEASED"
                ? "Released"
                : isExpired
                ? "Expired"
                : "Pending"}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="px-6 py-6">
          {status === "PENDING" && !isExpired && (
            <div className={`rounded-xl border p-5 text-center ${timerBg}`}>
              <div className={`text-4xl font-mono font-bold tracking-widest ${timerColor}`}>
                {formatTime(secondsLeft)}
              </div>
              <p className="mt-1 text-xs font-medium uppercase tracking-wider opacity-70">
                Time remaining to complete purchase
              </p>
            </div>
          )}

          {status === "CONFIRMED" && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-center">
              <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600 mb-2" />
              <p className="font-semibold text-emerald-800">Purchase Confirmed</p>
              <p className="text-sm text-emerald-600 mt-1">
                Your reservation has been converted to a permanent order.
              </p>
            </div>
          )}

          {(status === "RELEASED" || isExpired) && status !== "CONFIRMED" && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-center">
              <XCircle className="mx-auto h-8 w-8 text-slate-400 mb-2" />
              <p className="font-semibold text-slate-700">
                {status === "RELEASED" ? "Reservation Cancelled" : "Reservation Expired"}
              </p>
              <p className="text-sm text-slate-500 mt-1">
                {status === "RELEASED"
                  ? "You cancelled this reservation. Stock is now available to others."
                  : "The 10-minute hold timed out. Please reserve again if you're still interested."}
              </p>
              <Button className="mt-4" onClick={() => router.push("/")}>
                Browse Products
              </Button>
            </div>
          )}

          {status === "PENDING" && !isExpired && (
            <div className="mt-6 grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                className="w-full"
                disabled={cancelling || confirming}
                onClick={handleCancel}
              >
                {cancelling ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <XCircle className="h-4 w-4 mr-1.5" />}
                Cancel
              </Button>
              <Button
                className="w-full gap-1.5 bg-indigo-600 hover:bg-indigo-700"
                disabled={cancelling || confirming}
                onClick={handleConfirm}
              >
                {confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Confirm Purchase
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {status === "PENDING" && !isExpired && secondsLeft <= 60 && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" />
          <div>
            <p className="font-semibold">Hurry — reservation expiring soon</p>
            <p className="opacity-80 mt-0.5">
              If the timer runs out, your hold will be released and the item may sell to another
              customer.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
