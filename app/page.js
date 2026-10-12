import Link from "next/link";
export default function Home(){return(<section className="max-w-2xl"><h1 className="text-3xl font-semibold leading-tight sm:text-5xl">Get lost things back to the people who lost them.</h1>
<p className="mt-5 text-lg text-mist">Create an account to get started. Reporting lost and found items is coming next.</p>
<div className="mt-8 flex flex-wrap gap-3"><Link href="/signup" className="btn">Create account</Link><Link href="/signin" className="rounded-lg border border-line px-4 py-2.5">Sign in</Link></div></section>)}
