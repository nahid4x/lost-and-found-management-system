import {newToken,base} from "./tokens";import {sendMail} from "./mail";
export async function sendVerification(u){
  const{t,h}=newToken();u.verifyHash=h;u.verifyExpires=new Date(Date.now()+864e5);await u.save();
  return sendMail(u.email,"Verify your LostLink email",`Verify your email: ${base()}/verify?email=${encodeURIComponent(u.email)}&token=${t}\nThis link expires in 24 hours.`);
}
