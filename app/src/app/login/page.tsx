'use client';

import { useState, type FormEvent } from 'react';

type Step = 'password' | 'totp' | 'enroll';

export default function Login() {
  const [step, setStep] = useState<Step>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [qr, setQr] = useState('');
  const [secret, setSecret] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submitPassword(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) throw new Error('bad');
      const data = await res.json();
      if (data.step === 'enroll') { setQr(data.qr); setSecret(data.secret); setStep('enroll'); }
      else setStep('totp');
    } catch {
      setError('Incorrect email or password');
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/auth/totp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) throw new Error('bad');
      window.location.href = '/';
    } catch {
      setError('Invalid code, try again');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-[100dvh] items-center justify-center px-5">
      <div className="card fade-up w-full max-w-sm p-8">
        <div className="mb-6 flex items-center gap-2.5">
          <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden>
            <rect width="32" height="32" rx="9" fill="#ffa950" />
            <rect x="8" y="20" width="4" height="5" rx="2" fill="#fff" fillOpacity={0.4} />
            <rect x="14" y="12" width="4" height="13" rx="2" fill="#fff" fillOpacity={0.7} />
            <rect x="20" y="7" width="4" height="18" rx="2" fill="#fff" />
          </svg>
          <div className="flex flex-col leading-none">
            <span className="head text-base font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Insight</span>
            <span className="-mt-1 ml-[0.5rem] font-[family-name:var(--font-sign)] text-sm italic leading-none text-zinc-400 dark:text-zinc-500">
              by <a href="https://nicolaslecocq.com" target="_blank" rel="noopener noreferrer" className="text-zinc-500 transition-colors hover:text-[#ffa950] dark:text-zinc-400">Nicolas&nbsp;Lecocq</a>
            </span>
          </div>
        </div>

        {step === 'password' && (
          <form onSubmit={submitPassword} className="space-y-3">
            <input type="email" autoComplete="username" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="field" />
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" className="field" />
            <button disabled={busy} className="btn-primary w-full">Continue</button>
          </form>
        )}

        {step === 'enroll' && (
          <div className="space-y-4">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Scan this QR code with Google Authenticator or 1Password, then enter the 6-digit code.</p>
            {qr && <img src={qr} alt="2FA QR" className="mx-auto size-44 rounded-lg bg-white p-2" />}
            <p className="break-all rounded-lg bg-zinc-100 px-3 py-2 text-center text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">{secret}</p>
            <form onSubmit={submitCode} className="space-y-3">
              <CodeInput code={code} setCode={setCode} />
              <button disabled={busy} className="btn-primary w-full">Enable and sign in</button>
            </form>
          </div>
        )}

        {step === 'totp' && (
          <form onSubmit={submitCode} className="space-y-3">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Enter the 6-digit code from your authenticator app.</p>
            <CodeInput code={code} setCode={setCode} />
            <button disabled={busy} className="btn-primary w-full">Sign in</button>
          </form>
        )}

        {error && <p className="mt-4 text-center text-sm text-rose-500">{error}</p>}
      </div>
    </main>
  );
}

function CodeInput({ code, setCode }: { code: string; setCode: (v: string) => void }) {
  return (
    <input
      inputMode="numeric"
      autoFocus
      maxLength={6}
      value={code}
      onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
      placeholder="123456"
      className="field text-center text-lg tracking-[0.3em]"
    />
  );
}
