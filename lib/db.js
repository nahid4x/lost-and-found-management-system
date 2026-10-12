import dns from "node:dns";
if (process.env.NODE_ENV !== "production") dns.setServers(["1.1.1.1", "8.8.8.8"]);
import mongoose from "mongoose";
const g=globalThis;g._m??={c:null,p:null};
export async function connect(){
  if(!process.env.MONGODB_URI) throw new Error("MONGODB_URI is not set");
  if(g._m.c) return g._m.c;
  g._m.p??=mongoose.connect(process.env.MONGODB_URI,{bufferCommands:false,serverSelectionTimeoutMS:8000});
  return (g._m.c=await g._m.p);
}
const m = process.env.MONGODB_URI.match(/\/\/([^:]+):([^@]*)@/);
console.log("DB user:", m?.[1], "| password length:", m?.[2]?.length);