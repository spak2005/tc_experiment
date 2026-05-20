"use client";

import { useState } from "react";

type SignupState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string };

export function SignupForm() {
  const [state, setState] = useState<SignupState>({ status: "idle" });

  async function submit(formData: FormData) {
    setState({ status: "loading" });

    const response = await fetch("/api/signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        firstName: formData.get("firstName"),
        lastName: formData.get("lastName"),
        email: formData.get("email"),
        password: formData.get("password"),
        phone: formData.get("phone") || undefined,
        brokerage: formData.get("brokerage") || undefined,
        market: "TX"
      })
    });

    if (!response.ok) {
      setState({
        status: "error",
        message: "We could not finish setting up Stephanie. Please try again."
      });
      return;
    }

    window.location.href = "/dashboard";
  }

  return (
    <form action={submit} className="auth-card auth-form">
      <label>
        First name
        <input autoComplete="given-name" name="firstName" required placeholder="Maria" />
      </label>
      <label>
        Last name
        <input autoComplete="family-name" name="lastName" required placeholder="Johnson" />
      </label>
      <label>
        Email
        <input
          autoComplete="email"
          name="email"
          required
          type="email"
          placeholder="maria@example.com"
        />
      </label>
      <label>
        Password
        <input autoComplete="new-password" name="password" required minLength={8} type="password" />
      </label>
      <label>
        Phone
        <input autoComplete="tel" name="phone" placeholder="(512) 555-0100" />
      </label>
      <label>
        Brokerage
        <input name="brokerage" placeholder="Compass Austin" />
      </label>
      <button disabled={state.status === "loading"} type="submit">
        {state.status === "loading" ? "Setting up Stephanie..." : "Hire Stephanie"}
      </button>
      <p className="auth-note">Stephanie will email you after setup</p>
      {state.status === "error" ? <p className="error">{state.message}</p> : null}
    </form>
  );
}
