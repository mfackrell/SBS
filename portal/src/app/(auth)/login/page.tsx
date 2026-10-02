import Link from "next/link";
import { signIn } from "./actions";

type LoginPageProps = {
  searchParams: Promise<{ error?: string }>;
};

const errors: Record<string, string> = {
  "invalid-input": "Enter a valid email address and password.",
  "invalid-credentials": "We could not sign you in with those credentials.",
  "not-authorized": "Your account is not active for this portal.",
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const errorMessage = params.error ? errors[params.error] : null;

  return (
    <main className="auth-shell">
      <section className="auth-panel" aria-labelledby="login-title">
        <div className="auth-panel__inner">
          <Link className="portal-brand" href="/login" aria-label="Strategic Business Services client portal">
            <span className="portal-brand__mark" aria-hidden="true">SBS</span>
            <span className="portal-brand__name">Strategic Business Services</span>
          </Link>

          <h1 id="login-title">Client portal</h1>
          <p className="auth-panel__lede">
            Sign in to your secure Strategic Business Services workspace.
          </p>

          {errorMessage ? <p className="form-error" role="alert">{errorMessage}</p> : null}

          <form className="login-form" action={signIn}>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" name="email" type="email" autoComplete="email" required />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input id="password" name="password" type="password" autoComplete="current-password" required />
            </div>
            <button className="button" type="submit">Sign in</button>
          </form>

          <p className="auth-note">
            Access is invite-only. There is no public registration. If you were expecting access and cannot sign in, contact Strategic Business Services.
          </p>
        </div>
      </section>

      <aside className="auth-context" aria-label="Portal access information">
        <div className="auth-context__inner">
          <p className="auth-context__eyebrow">Secure client workspace</p>
          <h2>One place for the work behind your monthly close.</h2>
          <p>
            The portal will provide document requests, messages, proposal handling, close status, and billing references without moving payment collection into the portal.
          </p>
        </div>
      </aside>
    </main>
  );
}
