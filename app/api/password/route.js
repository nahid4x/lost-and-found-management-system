import bcrypt from "bcryptjs";import User from "@/models/User";import {passwordChangeSchema} from "@/lib/schemas";import {limit} from "@/lib/ratelimit";
import {json,sameOrigin,currentUser} from "@/lib/guard";
export async function POST(req){
  if(!sameOrigin(req))return json({error:"Forbidden"},403);
  const u=await currentUser();if(!u)return json({error:"Unauthorized"},401);
  if(!limit(`pw:${u.id}`,5,600000))return json({error:"Too many attempts. Try again later."},429);
  const p=passwordChangeSchema.safeParse(await req.json().catch(()=>null));
  if(!p.success)return json({error:p.error.issues[0].message},400);
  const full=await User.findById(u.id).select("+passwordHash");
  if(!(await bcrypt.compare(p.data.current,full.passwordHash)))return json({error:"Current password is incorrect."},400);
  full.passwordHash=await bcrypt.hash(p.data.next,12);await full.save();
  return json({ok:true,message:"Password changed."});
}
