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
        name: formData.get("name"),
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
        message: "We could not create your TC inbox. Please try again."
      });
      return;
    }

    window.location.href = "/dashboard";
  }

  return (
    <form action={submit} className="signup-card">
      <label>
        Name
        <input name="name" required placeholder="Maria Johnson" />
      </label>
      <label>
        Email
        <input name="email" required type="email" placeholder="maria@example.com" />
      </label>
      <label>
        Password
        <input name="password" required minLength={8} type="password" />
      </label>
      <label>
        Phone
        <input name="phone" placeholder="(512) 555-0100" />
      </label>
      <label>
        Brokerage
        <input name="brokerage" placeholder="Compass Austin" />
      </label>
      <button disabled={state.status === "loading"} type="submit">
        {state.status === "loading" ? "Creating TC..." : "Get my TC email"}
      </button>
      {state.status === "error" ? <p className="error">{state.message}</p> : null}
    </form>
  );
}
