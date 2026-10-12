import Form from "@/components/Form";export const metadata={title:"Verify email",robots:{index:false}};
export default async function P(props){const s=await props.searchParams;return(<div className="card mx-auto max-w-md"><h1 className="mb-3 text-2xl font-semibold">Verify your email</h1>
<p className="mb-5 text-mist">Confirm to finish setting up your account.</p>
<Form action="/api/flow/verify" submit="Verify email" redirect="/profile" hidden={{email:String(s.email||""),token:String(s.token||"")}} fields={[]}/></div>)}
