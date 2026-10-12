import Form from "@/components/Form";export const metadata={title:"Choose a new password",robots:{index:false}};
export default async function P(props){const s=await props.searchParams;return(<div className="card mx-auto max-w-md"><h1 className="mb-5 text-2xl font-semibold">Choose a new password</h1>
<Form action="/api/flow/reset" submit="Save password" redirect="/signin" hidden={{email:String(s.email||""),token:String(s.token||"")}} fields={[{name:"password",label:"New password (10+ characters)",type:"password",autoComplete:"new-password",max:128}]}/></div>)}
