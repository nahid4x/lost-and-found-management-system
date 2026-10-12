import {profileSchema} from "@/lib/schemas";import {json,sameOrigin,currentUser} from "@/lib/guard";
export async function PATCH(req){
  if(!sameOrigin(req))return json({error:"Forbidden"},403);
  const u=await currentUser();if(!u)return json({error:"Unauthorized"},401);
  const p=profileSchema.safeParse(await req.json().catch(()=>null)); // .strict(): role/email/etc. are rejected
  if(!p.success)return json({error:p.error.issues[0].message},400);
  Object.assign(u,p.data);await u.save();
  return json({ok:true,message:"Profile saved."});
}
