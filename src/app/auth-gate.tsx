"use client";

import { useState } from "react";
import { requestVerificationCode, verifyVerificationCode } from "@/server/auth-actions";

export function AuthGate() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [requested, setRequested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const result = requested ? await verifyVerificationCode(email, code) : await requestVerificationCode(email);
    if (result.ok) setRequested(true); else setError(result.error);
    setBusy(false);
  }
  return <main className="grid min-h-screen place-items-center bg-[#f2efe7] px-6 text-[#3a352d]">
    <section className="w-full max-w-md rounded-3xl border border-[#e5e1d8] bg-[#fdfcfa] p-8 shadow-xl">
      <p className="font-archive text-xs font-bold uppercase tracking-[.18em] text-[#c16e54]">Memories Wall</p>
      <h1 className="font-serif-custom mt-5 text-4xl">Keep your wall close.</h1>
      <p className="mt-3 text-sm leading-6 text-[#7a7469]">{requested ? "Enter the six-digit code sent to your email. It expires in 10 minutes." : "Continue with your email. We will send a one-time verification code."}</p>
      <form onSubmit={submit} className="mt-7 space-y-4">
        <label className="block text-sm font-medium">Email address<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} disabled={requested || busy} className="mt-2 w-full rounded-xl border border-[#d8d2c7] bg-white px-4 py-3" /></label>
        {requested && <label className="block text-sm font-medium">Verification code<input required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} disabled={busy} className="mt-2 w-full rounded-xl border border-[#d8d2c7] bg-white px-4 py-3 tracking-[.4em]" /></label>}
        {error && <p role="alert" className="text-sm text-[#9c4f4f]">{error}</p>}
        <button disabled={busy} className="w-full rounded-full bg-[#262421] px-5 py-3 font-medium text-[#f4f1ea]">{busy ? "Please wait…" : requested ? "Enter verification code" : "Continue with email"}</button>
      </form>
      <div className="mt-8 border-t border-[#e5e1d8] pt-6">
        <p className="font-archive text-[10px] font-bold uppercase tracking-[.18em] text-[#a49e92]">A quiet preview</p>
        <p className="mt-2 font-serif-custom text-xl italic">“The light was soft, and I noticed it.”</p>
        <p className="mt-1 text-xs text-[#7a7469]">The public showcase is synthetic and read-only. Your personal Wall remains private.</p>
      </div>
      {requested && <button type="button" onClick={() => { setRequested(false); setCode(""); setError(""); }} className="mt-4 text-sm text-[#c16e54] underline">Use a different email</button>}
    </section>
  </main>;
}
