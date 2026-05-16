import { NextResponse } from "next/server";
import {
  assertEmailNotOnboarded,
  onboardAgent,
  signupSchema
} from "@/lib/onboarding/service";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = signupSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid signup payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    await assertEmailNotOnboarded(parsed.data.email);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Account already exists" },
      { status: 409 }
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: {
        name: parsed.data.name
      }
    }
  });

  if (error || !data.user) {
    return NextResponse.json(
      { error: error?.message ?? "Could not create Supabase account" },
      { status: 400 }
    );
  }

  if (!data.session) {
    return NextResponse.json(
      {
        error:
          "Signup created an auth user but did not create a session. Disable Supabase email confirmation for instant onboarding."
      },
      { status: 409 }
    );
  }

  const result = await onboardAgent({
    authUserId: data.user.id,
    name: parsed.data.name,
    email: parsed.data.email,
    phone: parsed.data.phone,
    brokerage: parsed.data.brokerage,
    market: parsed.data.market
  });

  return NextResponse.json(result, { status: 201 });
}
