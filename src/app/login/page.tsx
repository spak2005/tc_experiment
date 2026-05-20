import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { LoginForm } from "@/app/login/login-form";

export default async function LoginPage() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <main className="auth-page">
      <Link className="brand-mark auth-brand" href="/">
        <span className="brand-symbol" aria-hidden="true">
          S
        </span>
        <span>name</span>
      </Link>
      <section className="auth-panel" aria-labelledby="login-title">
        <div className="auth-header">
          <p className="small-kicker">Welcome back</p>
          <h1 id="login-title">Log in</h1>
          <p>Access your Stephanie workspace and transaction files</p>
        </div>
        <LoginForm />
        <p className="auth-switch">
          New here? <Link href="/signup">Hire Stephanie</Link>
        </p>
      </section>
    </main>
  );
}
