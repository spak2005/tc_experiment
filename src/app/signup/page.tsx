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
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">Hire Stephanie</p>
        <h1>Create your AI TC account.</h1>
        <p className="lede">
          Sign up, get Stephanie's TC email, and forward an executed contract
          whenever you are ready.
        </p>
        <p className="helper">
          Already have an account? <Link href="/login">Log in</Link>
        </p>
      </section>
      <SignupForm />
    </main>
  );
}
