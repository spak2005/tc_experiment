import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { findUserByAuthUserId } from "@/lib/db/repositories";

export interface CurrentUser {
  id: string;
  authUserId: string;
  email: string;
  name: string;
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims?.sub) {
    return null;
  }

  const user = await findUserByAuthUserId(data.claims.sub);

  if (!user) {
    return null;
  }

  return {
    id: user.id,
    authUserId: user.auth_user_id,
    email: user.email,
    name: user.name
  };
}

export async function requireCurrentUser() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}
