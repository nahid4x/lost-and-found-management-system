import bcrypt from "bcryptjs";import {connect} from "@/lib/db";import User from "@/models/User";
import {registerSchema} from "@/lib/schemas";import {limit,ipOf} from "@/lib/ratelimit";import {json,sameOrigin} from "@/lib/guard";import {sendVerification} from "@/lib/verify";
export async function POST(req){
  if(!sameOrigin(req))return json({error:"Forbidden"},403);
  if(!limit(`reg:${ipOf(req)}`,5,3600000))return json({error:"Too many attempts. Try again later."},429);
  const p=registerSchema.safeParse(await req.json().catch(()=>null));
  if(!p.success)return json({error:p.error.issues[0].message},400);
  await connect();
  if(!(await User.exists({email:p.data.email}))){ // role is never taken from the client
    const u=await User.create({name:p.data.name,email:p.data.email,passwordHash:await bcrypt.hash(p.data.password,12)});
    await sendVerification(u);
  }
  // Same response either way, so the form can't be used to discover which emails have accounts.
  return json({ok:true,message:"Account created. Check your email to verify it, then sign in."});
}
