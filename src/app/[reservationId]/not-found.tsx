"use client";

import { Button } from "@/components/ui/button";
import { AlertTriangle, ArrowLeft } from "lucide-react";

export default function ReservationNotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-20 text-center">
      <AlertTriangle className="mx-auto h-12 w-12 text-amber-500 mb-4" />
      <h1 className="text-2xl font-bold text-slate-900">Reservation Not Found</h1>
      <p className="mt-2 text-slate-500">
        This reservation may have expired, been released, or the link is incorrect.
      </p>
      <div className="mt-6">
        <Button className="gap-1.5" onClick={() => (window.location.href = "/")}>
          <ArrowLeft className="h-4 w-4" />
          Back to Products
        </Button>
      </div>
    </div>
  );
}
