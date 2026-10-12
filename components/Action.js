"use client";
import {useState} from "react";
export default function Action({url,label}){
  const [m,setM]=useState("");
  return(<span><button className="btn" onClick={async()=>{const r=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"});const j=await r.json().catch(()=>({}));setM(j.message||j.error||"")}}>{label}</button> <span role="status" className="ml-2 text-sm text-mist">{m}</span></span>);
}
