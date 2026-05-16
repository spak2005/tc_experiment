import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { findUserByAuthUserId } from "@/lib/db/repositories";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid login payload" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error || !data.user) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const user = await findUserByAuthUserId(data.user.id);

  if (!user) {
    await supabase.auth.signOut();
    return NextResponse.json({ error: "Onboarding is incomplete" }, { status: 403 });
  }

  return NextResponse.json({ ok: true });
}
