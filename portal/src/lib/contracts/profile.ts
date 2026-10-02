import { z } from "zod";

export const profileUpdateSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? null : value),
    z.string().trim().max(40).nullable(),
  ),
});

export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;
