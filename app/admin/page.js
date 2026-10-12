import {redirect} from "next/navigation";import {requireRole} from "@/lib/guard";import User from "@/models/User";
export const metadata={title:"Admin",robots:{index:false}};export const dynamic="force-dynamic";
export default async function P(){
  if(!(await requireRole("admin")))redirect("/profile"); // enforced on the server on every request
  const users=await User.find().sort({createdAt:-1}).limit(100).lean();
  return(<section className="card"><h1 className="mb-4 text-2xl font-semibold">Users</h1><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-mist"><tr><th className="p-2">Name</th><th className="p-2">Email</th><th className="p-2">Role</th><th className="p-2">Verified</th></tr></thead>
  <tbody>{users.map(x=><tr key={String(x._id)} className="border-t border-line"><td className="p-2">{x.name}</td><td className="p-2">{x.email}</td><td className="p-2">{x.role}</td><td className="p-2">{x.emailVerified?"Yes":"No"}</td></tr>)}</tbody></table></div></section>)}
