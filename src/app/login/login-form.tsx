"use client";

import { useState } from "react";

type LoginState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string };

export function LoginForm() {
  const [state, setState] = useState<LoginState>({ status: "idle" });

  async function submit(formData: FormData) {
    setState({ status: "loading" });

    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: formData.get("email"),
        password: formData.get("password")
      })
    });

    if (!response.ok) {
      setState({
        status: "error",
        message: "That email and password did not match. Please try again."
      });
      return;
    }

    window.location.href = "/dashboard";
  }

  return (
    <form action={submit} className="auth-card auth-form">
      <label>
        Email
        <input autoComplete="email" name="email" required type="email" placeholder="maria@example.com" />
      </label>
      <label>
        Password
        <input autoComplete="current-password" name="password" required type="password" />
      </label>
      <button disabled={state.status === "loading"} type="submit">
        {state.status === "loading" ? "Logging in..." : "Log in"}
      </button>
      {state.status === "error" ? <p className="error">{state.message}</p> : null}
    </form>
  );
}
