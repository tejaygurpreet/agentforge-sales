import { z } from "zod";

export const signupSchema = z
  .object({
    fullName: z.string().min(1, "Enter your name").max(120, "Name is too long"),
    email: z.string().email("Enter a valid email"),
    password: z
      .string()
      .min(8, "Use at least 8 characters")
      .max(128, "Password is too long"),
    confirmPassword: z.string().min(1, "Confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type SignupFormValues = z.infer<typeof signupSchema>;
