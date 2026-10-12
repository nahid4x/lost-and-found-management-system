"use client";
import {signOut} from "next-auth/react";
export default function SignOut(){return <button className="rounded-lg border border-line px-3 py-2 text-sm" onClick={()=>signOut({callbackUrl:"/"})}>Sign out</button>}
