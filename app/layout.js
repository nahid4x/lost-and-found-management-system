import "./globals.css";import Link from "next/link";import {auth} from "@/lib/auth";import SignOut from "@/components/SignOut";
export const metadata={metadataBase:new URL(process.env.AUTH_URL||"http://localhost:3000"),title:{default:"LostLink — find and return lost belongings",template:"%s · LostLink"},description:"LostLink helps people report, find and safely return lost belongings without sharing private contact details."};
export const viewport={width:"device-width",initialScale:1};
export default async function RootLayout({children}){
  const s=await auth();
  const links=s?.user?[["/profile","Profile"]]:[["/signin","Sign in"],["/signup","Create account"]];
  return(<html lang="en"><body className="flex min-h-screen flex-col">
    <header className="border-b border-line"><nav className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3" aria-label="Main">
      <Link href="/" className="text-lg font-semibold text-teal">LostLink</Link>
      <div className="hidden items-center gap-5 sm:flex">{links.map(([h,l])=><Link key={h} href={h} className="hover:text-teal">{l}</Link>)}{s?.user&&<SignOut/>}</div>
      <details className="relative sm:hidden"><summary className="cursor-pointer list-none rounded-lg border border-line px-3 py-2">Menu</summary>
        <div className="absolute right-0 z-10 mt-2 flex w-48 flex-col gap-3 rounded-xl border border-line bg-panel p-4">{links.map(([h,l])=><Link key={h} href={h}>{l}</Link>)}{s?.user&&<SignOut/>}</div></details>
    </nav></header>
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:py-12">{children}</main>
    <footer className="border-t border-line px-4 py-6 text-center text-sm text-mist">© {new Date().getFullYear()} LostLink. <Link href="/signin" className="underline">Sign in</Link></footer>
  </body></html>);
}
