import Link from "next/link";
import { redirect } from "next/navigation";
import { SignupForm } from "@/app/signup-form";
import { getCurrentUser } from "@/lib/auth/current-user";

export default async function SignupPage() {
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
      </Link>
      <section className="auth-panel" aria-labelledby="signup-title">
        <div className="auth-header">
          <p className="small-kicker">Hire Stephanie</p>
          <h1 id="signup-title">Set up Stephanie</h1>
          <p>Create your account and Stephanie will be ready for your first contract</p>
        </div>
        <SignupForm />
        <p className="auth-switch">
          Already have an account? <Link href="/login">Log in</Link>
        </p>
      </section>
    </main>
  );
}
