import {z} from "zod";
export const email=z.string().trim().toLowerCase().email().max(254);
export const password=z.string().min(10,"Use at least 10 characters").max(128);
export const loginSchema=z.object({email,password:z.string().min(1).max(128)});
export const registerSchema=z.object({name:z.string().trim().min(1).max(80),email,password});
export const profileSchema=z.object({
  name:z.string().trim().min(1).max(80),
  phone:z.string().trim().regex(/^$|^\+?[0-9 ()-]{7,20}$/,"Enter a valid phone number"),
  avatarUrl:z.string().trim().max(500).refine(v=>v===""||/^https:\/\/[^\s]+$/.test(v),"Avatar must be an https link"),
  bio:z.string().trim().max(300)}).strict();
export const passwordChangeSchema=z.object({current:z.string().min(1).max(128),next:password}).strict();
