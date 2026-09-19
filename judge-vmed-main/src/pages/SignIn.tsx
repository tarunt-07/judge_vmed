import { useAuth, useClerk, useSession, useSignIn } from '@clerk/react';
import { ArrowRight, KeyRound, Mail, ShieldCheck } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Button, ErrorBanner, Field, Loading } from '../components/ui';

const CLERK_LOAD_TIMEOUT_MS = 15000;

export function AuthGate({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const { session } = useSession();
  const { signOut } = useClerk();
  const [stalled, setStalled] = useState(false);
  useEffect(() => {
    if (isLoaded) return;
    const timer = window.setTimeout(() => setStalled(true), CLERK_LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [isLoaded]);
  if (!isLoaded)
    return stalled ? (
      <div className="boot-screen">
        <img src="/vmedithon-shorten.png" alt="" />
        <h1>VMEDITHON Judging</h1>
        <p role="alert">Sign-in is not responding. Check your connection and try again.</p>
        <button className="button secondary" onClick={() => window.location.reload()}>
          Try again
        </button>
      </div>
    ) : (
      <div className="boot-screen">
        <img src="/vmedithon-shorten.png" alt="" />
        <h1>VMEDITHON Judging</h1>
        <Loading />
      </div>
    );
  // A pending session task (e.g. a required password reset) cannot be completed
  // in this console; rendering Clerk's hosted flow would send the browser to the
  // accounts portal. Judges get a password reset from an admin instead.
  if (session?.currentTask)
    return (
      <div className="boot-screen">
        <img src="/vmedithon-shorten.png" alt="" />
        <h1>VMEDITHON Judging</h1>
        <p role="alert">
          Your account needs one more step that this console cannot complete. Ask an admin to check
          your account, then sign in again.
        </p>
        <button className="button secondary" onClick={() => void signOut()}>
          Sign out
        </button>
      </div>
    );
  return isSignedIn ? children : <LoginPage />;
}
function LoginPage() {
  const { signIn, fetchStatus } = useSignIn();
  const [role, setRole] = useState<'admin' | 'judge'>('admin');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [factor, setFactor] = useState('totp');
  const busy = pending || fetchStatus === 'fetching';
  const mfa = signIn.status === 'needs_second_factor' || signIn.status === 'needs_client_trust';
  async function resetRole(next: 'admin' | 'judge') {
    try {
      await signIn.reset();
    } catch {
      // Ignore stale reset results and continue with a fresh form.
    }
    setRole(next);
    setIdentifier('');
    setPassword('');
    setCode('');
    setOtpSent(false);
    setFactor('totp');
    setError('');
  }
  async function backToIdentifier() {
    try {
      await signIn.reset();
    } catch {
      // Ignore stale reset results and continue with a fresh form.
    }
    setOtpSent(false);
    setCode('');
    setError('');
  }
  async function finish() {
    if (signIn.status === 'complete') {
      // No navigate: finalizing activates the session and AuthGate renders the
      // workspace without a hard page reload.
      const result = await signIn.finalize();
      if (result.error) throw new Error(result.error.message);
    } else if (
      !['needs_second_factor', 'needs_client_trust', 'needs_first_factor'].includes(signIn.status || '')
    ) {
      setError('Your account needs another sign-in step. Ask an admin to check the Clerk account settings.');
    }
  }
  async function submit() {
    setPending(true);
    setError('');
    try {
      if (mfa) {
        const result =
          factor === 'backup'
            ? await signIn.mfa.verifyBackupCode({ code })
            : factor === 'email'
              ? await signIn.mfa.verifyEmailCode({ code })
              : await signIn.mfa.verifyTOTP({ code });
        if (result.error) throw new Error(result.error.message);
        await finish();
      } else if (role === 'admin') {
        // Admins sign in with an email one-time code, never a password.
        const result = otpSent
          ? await signIn.emailCode.verifyCode({ code })
          : await signIn.emailCode.sendCode({ emailAddress: identifier.trim() });
        if (result.error) throw new Error(result.error.message);
        if (!otpSent) setOtpSent(true);
        else await finish();
      } else {
        const result = await signIn.password({ identifier, password });
        if (result.error) throw new Error(result.error.message);
        await finish();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in. Try again.');
    } finally {
      setPending(false);
    }
  }
  async function resendCode() {
    setPending(true);
    setError('');
    try {
      const result = await signIn.emailCode.sendCode();
      if (result.error) throw new Error(result.error.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resend the code. Try again.');
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="login-page">
      <aside className="login-story">
        <div className="login-brand">
          <img src="/logo.png" alt="VMEDITHON Version 3.0" />
        </div>
        <div>
          <span className="eyebrow">THE JUDGING CONSOLE</span>
          <h1>
            Great ideas.
            <br />
            Fair decisions.
          </h1>
          <p>One place to score every team, keep every round moving, and find the next big idea.</p>
          <div className="login-grid-art" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
        </div>
        <small>Built for the people making VMEDITHON happen.</small>
      </aside>
      <main className="login-main">
        <div className="login-form">
          <span className="login-lock">
            <ShieldCheck size={28} />
          </span>
          <h2>Welcome to the console.</h2>
          <p>Sign in to your judging workspace.</p>
          <div className="login-tabs">
            <button
              type="button"
              disabled={busy}
              className={role === 'admin' ? 'selected' : ''}
              onClick={() => role !== 'admin' && void resetRole('admin')}
            >
              <Mail size={16} />
              Admin
            </button>
            <button
              type="button"
              disabled={busy}
              className={role === 'judge' ? 'selected' : ''}
              onClick={() => role !== 'judge' && void resetRole('judge')}
            >
              <KeyRound size={16} />
              Judge
            </button>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!busy) void submit();
            }}
          >
            {mfa ? (
              <>
                <Field label="Verification method">
                  <select
                    value={factor}
                    onChange={(e) => {
                      setFactor(e.target.value);
                      setCode('');
                    }}
                  >
                    <option value="totp">Authenticator app</option>
                    <option value="backup">Backup code</option>
                    {signIn.supportedSecondFactors?.some((f) => f.strategy === 'email_code') && (
                      <option value="email">Email code</option>
                    )}
                  </select>
                </Field>
                {factor === 'email' && (
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() => {
                      void signIn.mfa.sendEmailCode().then((r) => {
                        if (r.error) setError(r.error.message);
                      });
                    }}
                  >
                    Send verification email
                  </Button>
                )}
                <Field label="Verification code">
                  <input
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    autoComplete="one-time-code"
                  />
                </Field>
              </>
            ) : role === 'admin' && otpSent ? (
              <>
                <p className="login-otp-note">
                  We sent a sign-in code to <strong>{identifier}</strong>.
                </p>
                <Field label="Verification code">
                  <input
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    placeholder="6-digit code"
                  />
                </Field>
                <div className="login-otp-actions">
                  <Button variant="ghost" disabled={busy} onClick={() => void resendCode()}>
                    Resend code
                  </Button>
                  <Button variant="ghost" disabled={busy} onClick={() => void backToIdentifier()}>
                    Use a different email
                  </Button>
                </div>
              </>
            ) : (
              <>
                <Field label={role === 'admin' ? 'Email address' : 'Username'}>
                  <input
                    required
                    type={role === 'admin' ? 'email' : 'text'}
                    autoComplete="username"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder={role === 'admin' ? 'you@example.com' : 'Your judge username'}
                    pattern={role === 'judge' ? '[a-zA-Z0-9_-]{4,64}' : undefined}
                  />
                </Field>
                {role === 'judge' && (
                  <Field label="Password">
                    <input
                      required
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      placeholder="Your password"
                    />
                  </Field>
                )}
              </>
            )}
            <ErrorBanner message={error} />
            <Button type="submit" className="login-submit" icon={ArrowRight} busy={busy}>
              {mfa || (role === 'admin' && otpSent)
                ? 'Verify & sign in'
                : role === 'admin'
                  ? 'Email me a code'
                  : 'Sign in'}
            </Button>
          </form>
          <p className="login-help">
            {role === 'admin'
              ? 'Admins sign in with their email and a one-time code.'
              : 'Use the username and password created by your admin.'}
            <br />
            Need access? Contact the event admin.
          </p>
          <div className="login-secure">
            <ShieldCheck size={14} />
            Secure sign-in with Clerk
          </div>
        </div>
      </main>
    </div>
  );
}
