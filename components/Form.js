"use client";
import {useState} from "react";import {signIn} from "next-auth/react";
// fields: [{name,label,type,value,autoComplete,max}]  action: URL, or "signin"
export default function Form({fields,action,method="POST",submit,redirect,hidden={}}){
  const [msg,setMsg]=useState(null),[busy,setBusy]=useState(false);
  async function onSubmit(e){
    e.preventDefault();setBusy(true);setMsg(null);
    const d={...hidden,...Object.fromEntries(new FormData(e.target))};
    try{
      if(action==="signin"){
        const r=await signIn("credentials",{...d,redirect:false});
        if(r?.error)setMsg({err:"Incorrect email or password, or too many attempts. Wait a minute and retry."});else window.location.href=redirect||"/profile";
      }else{
        const r=await fetch(action,{method,headers:{"Content-Type":"application/json"},body:JSON.stringify(d)});
        const j=await r.json().catch(()=>({}));
        if(!r.ok)setMsg({err:j.error||"Something went wrong. Try again."});
        else{setMsg({ok:j.message||"Done."});if(redirect)setTimeout(()=>window.location.href=redirect,1200)}
      }
    }catch{setMsg({err:"Network problem. Check your connection and retry."})}
    setBusy(false);
  }
  return(<form onSubmit={onSubmit} className="space-y-4">
    {fields.map(f=>(<div key={f.name}><label htmlFor={f.name} className="mb-1 block text-sm text-mist">{f.label}</label>
      <input id={f.name} name={f.name} type={f.type||"text"} defaultValue={f.value||""} autoComplete={f.autoComplete} maxLength={f.max||254} required={f.required!==false} className="input"/></div>))}
    <div role="status" aria-live="polite">{msg?.ok&&<p className="text-teal">{msg.ok}</p>}{msg?.err&&<p className="text-red-400">{msg.err}</p>}</div>
    <button className="btn w-full sm:w-auto" disabled={busy}>{busy?"Working…":submit}</button>
  </form>);
}
