import { SignupForm } from "@/app/signup-form";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";

export default async function Home() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">Meet Stephanie</p>
        <h1>Hire Stephanie as your transaction coordinator.</h1>
        <p className="lede">
          Forward her an executed contract. She opens the file, tracks
          deadlines, requests missing items, and flags what needs your
          attention.
        </p>
        <p className="helper">
          Stephanie is AI-powered, and you stay in control of approvals.
        </p>
        <p className="helper">
          Already have an account? <Link href="/login">Log in</Link>
        </p>
      </section>
      <SignupForm />
    </main>
  );
}
