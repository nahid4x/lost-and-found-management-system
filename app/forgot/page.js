import Form from "@/components/Form";export const metadata={title:"Reset password"};
export default function P(){return(<div className="card mx-auto max-w-md"><h1 className="mb-5 text-2xl font-semibold">Reset your password</h1>
<Form action="/api/flow/forgot" submit="Send reset link" fields={[{name:"email",label:"Email",type:"email",autoComplete:"email"}]}/></div>)}
