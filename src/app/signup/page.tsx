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
        <h1>Bring Stephanie onto your team.</h1>
        <p className="lede">
          Stephanie is your transaction coordinator. Send her an executed
          contract and she will open the file, track deadlines, and keep you
          ahead of surprises.
        </p>
        <p className="helper">
          She is AI-powered, works through email, and asks before external
          messages go out.
        </p>
        <p className="helper">
          Already have an account? <Link href="/login">Log in</Link>
        </p>
      </section>
      <SignupForm />
    </main>
  );
}
