import Link from "next/link";import Form from "@/components/Form";export const metadata={title:"Sign in"};
export default async function P(props){
  const searchParams=await props.searchParams;
  const next=typeof searchParams?.next==="string"&&/^\/[a-z]/i.test(searchParams.next)?searchParams.next:"/profile"; // same-site paths only
  return(<div className="card mx-auto max-w-md"><h1 className="mb-5 text-2xl font-semibold">Sign in</h1>
  <Form action="signin" submit="Sign in" redirect={next} fields={[{name:"email",label:"Email",type:"email",autoComplete:"email"},{name:"password",label:"Password",type:"password",autoComplete:"current-password",max:128}]}/>
  <p className="mt-5 text-sm text-mist"><Link href="/forgot" className="underline">Forgot password?</Link> · <Link href="/signup" className="underline">Create account</Link></p></div>)}
