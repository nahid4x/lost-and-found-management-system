import NextAuth from "next-auth";import Credentials from "next-auth/providers/credentials";import bcrypt from "bcryptjs";
import {connect} from "./db";import User from "@/models/User";import {loginSchema} from "./schemas";import {limit} from "./ratelimit";
const DUMMY="$2a$12$C6UzMDM.H6dfI/f/IKcEeO5JwF7Yb6X5cQ0o9vS0m2Zp8E5lq3m2e"; // equalises timing for unknown emails
export const {handlers,auth,signIn,signOut}=NextAuth({
  session:{strategy:"jwt",maxAge:60*60*24*7},
  pages:{signIn:"/signin"},
  providers:[Credentials({async authorize(c,req){
    const p=loginSchema.safeParse(c);if(!p.success)return null;
    const ip=(req.headers.get("x-forwarded-for")||"unknown").split(",")[0].trim();
    if(!limit(`ip:${ip}`,20,60000)||!limit(`acct:${p.data.email}`,5,60000))return null;
    await connect();const u=await User.findOne({email:p.data.email}).select("+passwordHash");
    const ok=await bcrypt.compare(p.data.password,u?.passwordHash||DUMMY);
    return u&&ok&&!u.disabled?{id:u.id,name:u.name,email:u.email}:null;
  }})],
  callbacks:{jwt({token,user}){if(user)token.id=user.id;return token},session({session,token}){session.user.id=token.id;return session}}
});
