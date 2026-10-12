import bcrypt from "bcryptjs";import {z} from "zod";import {connect} from "@/lib/db";import User from "@/models/User";
import {email,password} from "@/lib/schemas";import {limit,ipOf} from "@/lib/ratelimit";import {json,sameOrigin,currentUser} from "@/lib/guard";
import {newToken,hash,base} from "@/lib/tokens";import {sendMail} from "@/lib/mail";import {sendVerification} from "@/lib/verify";
const tok=z.string().regex(/^[a-f0-9]{64}$/);
export async function POST(req,ctx){
  const {action}=await ctx.params;
  if(!sameOrigin(req))return json({error:"Forbidden"},403);
  if(!limit(`flow:${ipOf(req)}`,10,600000))return json({error:"Too many attempts. Try again later."},429);
  const b=await req.json().catch(()=>null);await connect();
  const bad=json({error:"This link is invalid or has expired."},400);
  if(action==="forgot"){
    const p=z.object({email}).safeParse(b);if(!p.success)return json({error:"Enter a valid email."},400);
    const u=await User.findOne({email:p.data.email});
    if(u){const{t,h}=newToken();u.resetHash=h;u.resetExpires=new Date(Date.now()+36e5);await u.save();
      await sendMail(u.email,"Reset your LostLink password",`Reset link (valid 1 hour): ${base()}/reset?email=${encodeURIComponent(u.email)}&token=${t}`)}
    return json({ok:true,message:"If that email has an account, a reset link is on its way."});
  }
  if(action==="reset"){
    const p=z.object({email,token:tok,password}).safeParse(b);if(!p.success)return json({error:p.error.issues[0].message},400);
    const u=await User.findOne({email:p.data.email}).select("+resetHash +resetExpires");
    if(!u||!u.resetHash||u.resetExpires<new Date()||u.resetHash!==hash(p.data.token))return bad;
    u.passwordHash=await bcrypt.hash(p.data.password,12);u.resetHash=u.resetExpires=undefined;await u.save();
    return json({ok:true,message:"Password updated. You can sign in now."});
  }
  if(action==="verify"){
    const p=z.object({email,token:tok}).safeParse(b);if(!p.success)return bad;
    const u=await User.findOne({email:p.data.email}).select("+verifyHash +verifyExpires");
    if(!u||!u.verifyHash||u.verifyExpires<new Date()||u.verifyHash!==hash(p.data.token))return bad;
    u.emailVerified=new Date();u.verifyHash=u.verifyExpires=undefined;await u.save();
    return json({ok:true,message:"Email verified."});
  }
  if(action==="resend"){
    const u=await currentUser();if(!u)return json({error:"Sign in first."},401);
    if(u.emailVerified)return json({ok:true,message:"Already verified."});
    const sent=await sendVerification(u);
    return json(sent?{ok:true,message:"Verification email sent."}:{error:"Email delivery isn't configured yet."},sent?200:503);
  }
  return json({error:"Not found"},404);
}
