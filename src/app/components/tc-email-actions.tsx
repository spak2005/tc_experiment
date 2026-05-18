"use client";

import { useState } from "react";

export function TcEmailActions({ email }: { email: string }) {
  const [copied, setCopied] = useState(false);

  async function copyEmail() {
    await navigator.clipboard.writeText(email);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="tc-actions">
      <button className="utility-button" onClick={copyEmail} type="button">
        {copied ? "Copied" : "Copy Stephanie's email"}
      </button>
      <a className="utility-link" href={`mailto:${email}`}>
        Send Stephanie a file
      </a>
    </div>
  );
}
