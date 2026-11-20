import React, { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { CheckCircle2, MailCheck, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export function AuthPage() {
  const {
    user,
    isVerified,
    signIn,
    signInWithGoogle,
    signUp,
    resendVerification,
    refreshUser,
    signOut,
  } = useAuth();
  const location = useLocation();
  const redirectTo = (location.state as { from?: string } | null)?.from || '/';

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [displayName, setDisplayName] = useState('');
  const [campus, setCampus] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (user && isVerified) {
    return <Navigate to={redirectTo} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setSubmitting(true);
    try {
      if (mode === 'signin') {
        await signIn(email, password);
      } else {
        await signUp({ displayName, campus, email, password });
        setNotice('Account created. Check your inbox and click the verification link.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCheckVerified = async () => {
    setError('');
    setNotice('');
    setSubmitting(true);
    try {
      const ok = await refreshUser();
      if (!ok) {
        setNotice('Email is not verified yet. Open the link sent to your inbox, then check again.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to refresh verification status.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    setError('');
    setNotice('');
    setSubmitting(true);
    try {
      await resendVerification();
      setNotice('Verification email sent. Check your inbox and spam folder.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to resend verification email.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setNotice('');
    setSubmitting(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed.');
    } finally {
      setSubmitting(false);
    }
  };

  if (user && !isVerified) {
    return (
      <main className="max-w-md mx-auto px-4 py-12">
        <section className="bg-white border border-stone-200 rounded-xl p-6 space-y-5">
          <div className="w-11 h-11 rounded-lg bg-emerald-50 text-emerald-900 flex items-center justify-center">
            <MailCheck className="w-5 h-5" aria-hidden="true" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-bold text-zinc-900">Verify your email</h1>
            <p className="text-sm text-zinc-600 leading-relaxed">
              We sent a verification link to <span className="font-medium text-zinc-900">{user.email}</span>.
              Marketplace access stays locked until your email is verified.
            </p>
          </div>

          {error && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="text-sm text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              {notice}
            </p>
          )}

          <div className="space-y-2.5">
            <button
              type="button"
              disabled={submitting}
              onClick={handleCheckVerified}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-emerald-900 rounded-lg hover:bg-emerald-950 disabled:opacity-50 transition-colors"
            >
              <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
              {submitting ? 'Checking...' : "I've verified my email"}
            </button>

            <button
              type="button"
              disabled={submitting}
              onClick={handleResend}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-zinc-800 bg-stone-100 rounded-lg hover:bg-stone-200 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className="w-4 h-4" aria-hidden="true" />
              Resend verification email
            </button>

            <button
              type="button"
              onClick={() => void signOut()}
              className="w-full px-4 py-2 text-xs font-medium text-zinc-600 hover:text-zinc-900 transition-colors"
            >
              Use a different account
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="max-w-md mx-auto px-4 py-10 sm:py-14">
      <section className="bg-white border border-stone-200 rounded-xl p-6 space-y-6">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
            {mode === 'signin' ? 'Sign in to Campus Market' : 'Create your account'}
          </h1>
          <p className="text-sm text-zinc-600">
            Verify any valid email address to browse, post listings, and trade safely on campus.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-1 p-1 bg-stone-100 rounded-lg" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'signin'}
            onClick={() => {
              setMode('signin');
              setError('');
              setNotice('');
            }}
            className={`py-2 text-xs font-medium rounded-md transition-colors ${
              mode === 'signin' ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'signup'}
            onClick={() => {
              setMode('signup');
              setError('');
              setNotice('');
            }}
            className={`py-2 text-xs font-medium rounded-md transition-colors ${
              mode === 'signup' ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            Create Account
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && (
            <>
              <div>
                <label htmlFor="auth-name" className="block text-sm font-medium text-zinc-900 mb-1">
                  Full Name
                </label>
                <input
                  id="auth-name"
                  type="text"
                  required
                  minLength={2}
                  maxLength={60}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Kwame Boateng"
                  className="w-full px-3 py-2.5 text-sm bg-white border border-stone-300 rounded-lg focus:outline-none focus:border-emerald-900"
                />
              </div>

              <div>
                <label htmlFor="auth-campus" className="block text-sm font-medium text-zinc-900 mb-1">
                  Hall or Campus Area (optional)
                </label>
                <input
                  id="auth-campus"
                  type="text"
                  maxLength={40}
                  value={campus}
                  onChange={(e) => setCampus(e.target.value)}
                  placeholder="e.g. Legon Hall"
                  className="w-full px-3 py-2.5 text-sm bg-white border border-stone-300 rounded-lg focus:outline-none focus:border-emerald-900"
                />
              </div>
            </>
          )}

          <div>
            <label htmlFor="auth-email" className="block text-sm font-medium text-zinc-900 mb-1">
              Email Address
            </label>
            <input
              id="auth-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-3 py-2.5 text-sm bg-white border border-stone-300 rounded-lg focus:outline-none focus:border-emerald-900"
            />
            <p className="mt-1 text-xs text-zinc-600 leading-relaxed">
              Gmail, Yahoo, Outlook, and university emails are all welcome. Academic emails
              (.edu, .edu.gh) automatically earn a Verified Student badge.
            </p>
          </div>

          <div>
            <label htmlFor="auth-password" className="block text-sm font-medium text-zinc-900 mb-1">
              Password
            </label>
            <input
              id="auth-password"
              type="password"
              required
              minLength={8}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 8 characters"
              className="w-full px-3 py-2.5 text-sm bg-white border border-stone-300 rounded-lg focus:outline-none focus:border-emerald-900"
            />
          </div>

          {error && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="text-sm text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              {notice}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 px-4 text-sm font-medium text-white bg-emerald-900 hover:bg-emerald-950 rounded-lg disabled:opacity-50 transition-colors"
          >
            {submitting
              ? mode === 'signin'
                ? 'Signing in...'
                : 'Creating account...'
              : mode === 'signin'
                ? 'Sign In'
                : 'Create Account'}
          </button>
        </form>

        <div className="relative flex items-center py-1">
          <div className="flex-grow border-t border-stone-200" />
          <span className="shrink mx-3 text-xs text-zinc-500">or</span>
          <div className="flex-grow border-t border-stone-200" />
        </div>

        <button
          type="button"
          disabled={submitting}
          onClick={handleGoogleSignIn}
          className="w-full inline-flex items-center justify-center gap-2.5 py-2.5 px-4 text-sm font-medium text-zinc-900 bg-white border border-stone-300 hover:bg-stone-50 rounded-lg disabled:opacity-50 transition-colors"
        >
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
            />
            <path
              fill="#34A853"
              d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
            />
            <path
              fill="#FBBC05"
              d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
            />
            <path
              fill="#EA4335"
              d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
            />
          </svg>
          Continue with Google
        </button>
      </section>
    </main>
  );
}
