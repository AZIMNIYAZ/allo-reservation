import { z } from "zod";

export const reserveSchema = z.object({
  productId: z.string().min(1),
  warehouseId: z.string().min(1),
  quantity: z.number().int().min(1).max(10),
});

export type ReserveInput = z.infer<typeof reserveSchema>;
