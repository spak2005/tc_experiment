"use client";

import { useState } from "react";

type SignupState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; tcEmail: string; tcDisplayName: string }
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

    const data = (await response.json()) as {
      tcEmail: string;
      tcDisplayName: string;
    };

    setState({
      status: "success",
      tcEmail: data.tcEmail,
      tcDisplayName: data.tcDisplayName
    });
  }

  if (state.status === "success") {
    return (
      <div className="signup-card">
        <p className="eyebrow">Your TC is ready</p>
        <h2>{state.tcDisplayName}</h2>
        <p className="tc-email">{state.tcEmail}</p>
        <p className="helper">
          Forward the executed contract to this address. Your TC will reply,
          open the file, ask for missing details, and start coordinating.
        </p>
      </div>
    );
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
