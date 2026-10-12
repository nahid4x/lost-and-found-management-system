import crypto from "crypto";
export const newToken=()=>{const t=crypto.randomBytes(32).toString("hex");return{t,h:hash(t)}};
export const hash=t=>crypto.createHash("sha256").update(t).digest("hex");
export const base=()=>process.env.AUTH_URL||"http://localhost:3000";
