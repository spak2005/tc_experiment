import { z } from "zod";
import { withTransaction } from "@/lib/db/client";
import { createTcProfile, createTeam, createUser } from "@/lib/db/repositories";
import { provisionTcInbox } from "@/lib/agentmail/service";

export const signupSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional(),
  brokerage: z.string().optional(),
  market: z.literal("TX").default("TX")
});

export type SignupInput = z.infer<typeof signupSchema>;

function makeTcDisplayName(agentName: string): string {
  const firstName = agentName.trim().split(/\s+/)[0] || "Agent";
  return `${firstName}'s TC`;
}

export async function onboardAgent(input: SignupInput) {
  const parsed = signupSchema.parse(input);

  const teamAndUser = await withTransaction(async (client) => {
    const team = await createTeam(
      {
        name: `${parsed.name}'s Team`,
        market: parsed.market,
        brokerage: parsed.brokerage
      },
      client
    );

    const user = await createUser(
      {
        teamId: team.id,
        name: parsed.name,
        email: parsed.email,
        phone: parsed.phone
      },
      client
    );

    return { team, user };
  });

  const tcDisplayName = makeTcDisplayName(parsed.name);
  const inbox = await provisionTcInbox({
    teamId: teamAndUser.team.id,
    agentName: parsed.name,
    displayName: tcDisplayName
  });

  const tcProfile = await createTcProfile({
    teamId: teamAndUser.team.id,
    displayName: tcDisplayName,
    inboxAddress: inbox.emailAddress,
    agentMailPodId: undefined,
    agentMailInboxId: inbox.inboxId,
    escalationEmail: parsed.email
  });

  return {
    teamId: teamAndUser.team.id,
    userId: teamAndUser.user.id,
    tcProfileId: tcProfile.id,
    tcEmail: tcProfile.inbox_address,
    tcDisplayName
  };
}
