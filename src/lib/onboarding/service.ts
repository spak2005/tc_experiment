import { z } from "zod";
import {
  createTcProfile,
  createUser,
  findTcProfileByUser,
  findUserByAuthUserId,
  findUserByEmail
} from "@/lib/db/repositories";
import {
  provisionTcInbox,
  STEPHANIE_TC_DISPLAY_NAME
} from "@/lib/agentmail/service";

export const signupSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  phone: z.string().optional(),
  brokerage: z.string().optional(),
  market: z.literal("TX").default("TX")
});

export type SignupInput = z.infer<typeof signupSchema>;

export const onboardingSchema = signupSchema.omit({ password: true }).extend({
  authUserId: z.string().uuid()
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;

export async function assertEmailNotOnboarded(email: string) {
  const existing = await findUserByEmail(email);

  if (existing) {
    throw new Error("A realtor account already exists for this email.");
  }
}

export async function onboardAgent(input: OnboardingInput) {
  const parsed = onboardingSchema.parse(input);
  let user = await findUserByAuthUserId(parsed.authUserId);

  if (!user) {
    user = await createUser({
      authUserId: parsed.authUserId,
      name: parsed.name,
      email: parsed.email,
      phone: parsed.phone,
      brokerage: parsed.brokerage,
      market: parsed.market
    });
  }

  const existingProfile = await findTcProfileByUser(user.id);

  if (existingProfile) {
    return {
      userId: user.id,
      tcProfileId: existingProfile.id,
      tcEmail: existingProfile.inbox_address,
      tcDisplayName: existingProfile.display_name
    };
  }

  const inbox = await provisionTcInbox({ userId: user.id });
  const tcProfile = await createTcProfile({
    userId: user.id,
    displayName: STEPHANIE_TC_DISPLAY_NAME,
    inboxAddress: inbox.emailAddress,
    agentMailPodId: undefined,
    agentMailInboxId: inbox.inboxId,
    escalationEmail: parsed.email
  });

  return {
    userId: user.id,
    tcProfileId: tcProfile.id,
    tcEmail: tcProfile.inbox_address,
    tcDisplayName: STEPHANIE_TC_DISPLAY_NAME
  };
}
