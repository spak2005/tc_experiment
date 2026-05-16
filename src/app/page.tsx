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
        <p className="eyebrow">Autonomous transaction coordination</p>
        <h1>Hire Stephanie to coordinate your files.</h1>
        <p className="lede">
          Sign up, get Stephanie's TC email, forward the executed contract, and
          she opens the file, maps the timeline, coordinates parties, and
          escalates deadline risk.
        </p>
        <p className="helper">
          Already have an account? <Link href="/login">Log in</Link>
        </p>
      </section>
      <SignupForm />
    </main>
  );
}
