import {auth} from "./auth";import {connect} from "./db";import User from "@/models/User";
import {NextResponse} from "next/server";
// Always re-reads the user (and role) from the database, so demoted/disabled accounts lose access at once.
export async function currentUser(){
  const s=await auth();if(!s?.user?.id)return null;
  await connect();const u=await User.findById(s.user.id);
  return u&&!u.disabled?u:null;
}
export async function requireRole(role){const u=await currentUser();return u&&(!role||u.role===role)?u:null}
export const json=(d,status=200)=>NextResponse.json(d,{status});
// CSRF defence in depth (cookies are also SameSite=Lax): mutating requests must come from our own origin.
export function sameOrigin(req){const o=req.headers.get("origin");return !!o&&o===new URL(req.url).origin}
