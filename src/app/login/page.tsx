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
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">Welcome back</p>
        <h1>Log in to your TC control room.</h1>
        <p className="lede">
          Pick up where Stephanie left off: active files, blockers, approvals,
          and the latest coordination activity.
        </p>
        <p className="helper">
          New here? <Link href="/signup">Create your Stephanie TC</Link>
        </p>
      </section>
      <LoginForm />
    </main>
  );
}
