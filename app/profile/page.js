import {redirect} from "next/navigation";import Link from "next/link";import Form from "@/components/Form";import Action from "@/components/Action";import {currentUser} from "@/lib/guard";
export const metadata={title:"Your profile",robots:{index:false}};export const dynamic="force-dynamic";
export default async function P(){
  const u=await currentUser();if(!u)redirect("/signin?next=/profile");
  return(<div className="grid gap-6 md:grid-cols-2">
    <section className="card md:col-span-2"><div className="flex items-center gap-4">
      {u.avatarUrl?<img src={u.avatarUrl} alt="" referrerPolicy="no-referrer" className="h-16 w-16 rounded-full object-cover"/>:<div className="grid h-16 w-16 place-items-center rounded-full bg-line text-xl">{u.name[0]}</div>}
      <div className="min-w-0"><h1 className="truncate text-2xl font-semibold">{u.name}</h1><p className="truncate text-mist">{u.email} · {u.role}</p></div></div>
      <div className="mt-4 text-sm">{u.emailVerified?<span className="text-teal">Email verified</span>:<><span className="text-amber-300">Email not verified. </span><Action url="/api/flow/resend" label="Resend verification email"/></>}
      {u.role==="admin"&&<Link href="/admin" className="ml-4 underline">Admin</Link>}</div></section>
    <section className="card"><h2 className="mb-4 text-xl font-semibold">Details</h2>
      <Form action="/api/profile" method="PATCH" submit="Save profile" fields={[{name:"name",label:"Name",value:u.name,max:80},{name:"phone",label:"Phone (optional)",value:u.phone,type:"tel",required:false,max:20},{name:"avatarUrl",label:"Avatar link (https, optional)",value:u.avatarUrl,type:"url",required:false,max:500},{name:"bio",label:"About you (optional)",value:u.bio,required:false,max:300}]}/></section>
    <section className="card"><h2 className="mb-4 text-xl font-semibold">Change password</h2>
      <Form action="/api/password" submit="Change password" fields={[{name:"current",label:"Current password",type:"password",autoComplete:"current-password",max:128},{name:"next",label:"New password (10+ characters)",type:"password",autoComplete:"new-password",max:128}]}/></section>
  </div>)}
