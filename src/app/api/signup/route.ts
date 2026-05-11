import { NextResponse } from "next/server";
import { onboardAgent, signupSchema } from "@/lib/onboarding/service";

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = signupSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid signup payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const result = await onboardAgent(parsed.data);

  return NextResponse.json(result, { status: 201 });
}
