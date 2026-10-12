import Link from "next/link";export const metadata={title:"Page not found"};
export default function NF(){return(<section><h1 className="text-3xl font-semibold">That page doesn't exist</h1><p className="mt-3 text-mist">The link may be old or mistyped.</p><Link href="/" className="btn mt-6">Back to home</Link></section>)}
