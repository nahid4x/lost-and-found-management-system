import Link from "next/link";import Form from "@/components/Form";export const metadata={title:"Create account"};
export default function P(){return(<div className="card mx-auto max-w-md"><h1 className="mb-5 text-2xl font-semibold">Create your account</h1>
<Form action="/api/register" submit="Create account" fields={[{name:"name",label:"Name",autoComplete:"name",max:80},{name:"email",label:"Email",type:"email",autoComplete:"email"},{name:"password",label:"Password (10+ characters)",type:"password",autoComplete:"new-password",max:128}]}/>
<p className="mt-5 text-sm text-mist">Already registered? <Link href="/signin" className="underline">Sign in</Link></p></div>)}
