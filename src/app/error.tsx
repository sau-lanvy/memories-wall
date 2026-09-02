"use client";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="grid min-h-screen place-items-center bg-[#13140d] p-6 text-center text-[#e4e3d7]"><div><p className="font-archive text-xs uppercase tracking-widest text-[#b56e6e]">Wall unavailable</p><h1 className="font-editorial mt-3 text-4xl">The archive is taking a moment.</h1><p className="mt-3 max-w-md text-sm text-[#a8a79b]">Your work is kept locally in this demo. Try loading the wall again.</p><button type="button" onClick={reset} className="mt-6 rounded-lg bg-[#e9c349] px-5 py-3 font-semibold text-[#3c2f00]">Try again</button></div></main>;
}
