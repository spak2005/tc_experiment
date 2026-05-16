"use client";

export function LogoutButton() {
  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <button className="utility-button" onClick={logout} type="button">
      Log out
    </button>
  );
}
