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
  sendTcEmailOnce,
  STEPHANIE_TC_DISPLAY_NAME
} from "@/lib/agentmail/service";

export const signupSchema = z.object({
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
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

function fullName(firstName: string, lastName: string) {
  return `${firstName} ${lastName}`;
}

function stephanieWelcomeEmail(firstName: string) {
  return `Hi ${firstName}, I'm Stephanie, your transaction coordinator.

Forward me an executed contract when you're ready. I will open the file, pull out the key dates and parties, build the deadline timeline, request missing items, and flag anything that needs your attention.

I work through this inbox, so you can assign me a file by forwarding it here. I'm software-powered, which lets me monitor files continuously, and you stay in control of approvals before external messages go out.

Looking forward to working with you.

Best,
Stephanie`;
}

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
      name: fullName(parsed.firstName, parsed.lastName),
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
  await sendTcEmailOnce({
    idempotencyKey: `welcome:${user.id}`,
    inboxId: inbox.inboxId,
    to: [parsed.email],
    subject: "Stephanie is ready for her first file",
    text: stephanieWelcomeEmail(parsed.firstName),
    labels: ["welcome"]
  });

  return {
    userId: user.id,
    tcProfileId: tcProfile.id,
    tcEmail: tcProfile.inbox_address,
    tcDisplayName: STEPHANIE_TC_DISPLAY_NAME
  };
}
