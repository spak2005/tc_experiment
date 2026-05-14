import type { ContractFacts } from "@/lib/contracts/facts";
import type { Milestone, TransactionPhase } from "@/lib/domain/types";
import {
  addDays,
  extendIfWeekendOrHoliday,
  parseDateOnly,
  subtractBusinessDays,
  toDateOnly
} from "@/lib/milestones/date-rules";

type MilestoneDraft = Omit<Milestone, "id" | "transactionId">;

function milestone(input: MilestoneDraft): MilestoneDraft {
  return input;
}

function operationalMetadata(input: {
  ownerRole: string;
  expectedEvidence: string[];
  completionSignals: string[];
  staleAfterDays?: number;
  nextActions: string[];
}) {
  return input;
}

function anchorMilestone(
  key: string,
  title: string,
  phase: TransactionPhase,
  anchor: Date,
  offsetDays: number,
  sourceReference: string,
  riskLevel: Milestone["riskLevel"] = "normal",
  metadata?: Record<string, unknown>
): MilestoneDraft {
  return milestone({
    key,
    title,
    phase,
    dueDate: toDateOnly(extendIfWeekendOrHoliday(addDays(anchor, offsetDays))),
    sourceType: "anchor_offset",
    sourceReference,
    riskLevel,
    metadata
  });
}

export function generateTexasMilestones(facts: ContractFacts): MilestoneDraft[] {
  const effectiveDate = parseDateOnly(facts.effectiveDate?.value);
  const closingDate = parseDateOnly(facts.closingDate?.value);
  const optionPeriodDays =
    typeof facts.optionPeriodDays?.value === "number"
      ? facts.optionPeriodDays.value
      : null;
  const financed = facts.cashOrFinanced?.value === "financed";
  const hoaRequired = facts.hoaRequired?.value === true || facts.hoa?.required?.value === true;
  const sellerDisclosureRequired =
    facts.disclosures?.sellerDisclosureRequired?.value !== false;
  const milestones: MilestoneDraft[] = [];

  if (effectiveDate) {
    milestones.push(
      anchorMilestone(
        "earnest_money_due",
        "Earnest money due",
        "earnest_money_and_option",
        effectiveDate,
        3,
        "Paragraph 5A",
        "urgent",
        operationalMetadata({
          ownerRole: "title",
          expectedEvidence: ["earnest money receipt", "title confirmation"],
          completionSignals: ["title confirms receipt", "receipt attached"],
          staleAfterDays: 1,
          nextActions: ["ask title for receipt", "escalate to agent"]
        })
      )
    );

    milestones.push(
      anchorMilestone(
        "option_fee_due",
        "Option fee due",
        "earnest_money_and_option",
        effectiveDate,
        3,
        "Paragraph 5A",
        "urgent",
        operationalMetadata({
          ownerRole: "seller",
          expectedEvidence: ["option fee receipt", "seller or listing agent confirmation"],
          completionSignals: ["seller confirms receipt", "receipt attached"],
          staleAfterDays: 1,
          nextActions: ["ask listing agent for confirmation", "escalate to agent"]
        })
      )
    );

    if (optionPeriodDays) {
      milestones.push(
        milestone({
          key: "option_period_expires",
          title: "Option period expires at 5:00 PM",
          phase: "inspection_option_period",
          dueDate: toDateOnly(addDays(effectiveDate, optionPeriodDays)),
          sourceType: "anchor_offset",
          sourceReference: "Paragraph 5B",
          riskLevel: "critical",
          metadata: operationalMetadata({
            ownerRole: "agent",
            expectedEvidence: ["agent confirms option decision"],
            completionSignals: ["agent confirms buyer will proceed", "termination/amendment noted"],
            staleAfterDays: 1,
            nextActions: ["remind agent before 5 PM", "escalate as critical"]
          })
        })
      );
    }

    milestones.push(
      anchorMilestone(
        "survey_due",
        "Survey or T-47 due",
        "title_survey_disclosures",
        effectiveDate,
        5,
        "Paragraph 6C",
        "watch",
        operationalMetadata({
          ownerRole: "listing_agent",
          expectedEvidence: ["survey", "T-47", "agent confirmation"],
          completionSignals: ["survey attached", "listing agent confirms not required"],
          staleAfterDays: 2,
          nextActions: ["ask listing agent for survey status", "notify agent if missing"]
        })
      )
    );

    if (sellerDisclosureRequired) {
      milestones.push(
        anchorMilestone(
          "seller_disclosure_due",
          "Seller disclosure due",
          "title_survey_disclosures",
          effectiveDate,
          5,
          "Paragraph 7B",
          "watch",
          operationalMetadata({
            ownerRole: "listing_agent",
            expectedEvidence: ["seller disclosure"],
            completionSignals: ["seller disclosure attached", "agent confirms received"],
            staleAfterDays: 2,
            nextActions: ["ask listing agent for seller disclosure", "notify agent if missing"]
          })
        )
      );
    }

    if (financed) {
      milestones.push(
        anchorMilestone(
          "buyer_approval_due",
          "Buyer financing approval due",
          "financing_appraisal",
          effectiveDate,
          21,
          "Third Party Financing Addendum",
          "urgent",
          operationalMetadata({
            ownerRole: "lender",
            expectedEvidence: ["loan approval status", "conditional approval"],
            completionSignals: ["lender confirms approval", "agent confirms financing status"],
            staleAfterDays: 2,
            nextActions: ["ask lender for status", "escalate to agent"]
          })
        ),
        anchorMilestone(
          "appraisal_status_due",
          "Appraisal status due",
          "financing_appraisal",
          effectiveDate,
          14,
          "Third Party Financing Addendum",
          "watch",
          operationalMetadata({
            ownerRole: "lender",
            expectedEvidence: ["appraisal ordered", "appraisal report", "appraisal status"],
            completionSignals: ["lender confirms appraisal ordered", "appraisal received"],
            staleAfterDays: 2,
            nextActions: ["ask lender for appraisal status", "notify agent of delay"]
          })
        )
      );
    }

    if (hoaRequired) {
      milestones.push(
        anchorMilestone(
          "hoa_resale_certificate_due",
          "HOA resale certificate due",
          "title_survey_disclosures",
          effectiveDate,
          10,
          "HOA Addendum",
          "watch",
          operationalMetadata({
            ownerRole: "hoa",
            expectedEvidence: ["HOA resale certificate", "HOA status certificate"],
            completionSignals: ["certificate attached", "title confirms receipt"],
            staleAfterDays: 2,
            nextActions: ["ask HOA or title for certificate status", "escalate to agent"]
          })
        )
      );
    }
  }

  milestones.push(
    milestone({
      key: "title_commitment_due",
      title: "Title commitment due",
      phase: "title_survey_disclosures",
      sourceType: "derived_event",
      sourceReference: "20 days after title receives contract",
      riskLevel: "watch",
      metadata: operationalMetadata({
        ownerRole: "title",
        expectedEvidence: ["title commitment"],
        completionSignals: ["title commitment attached", "title confirms issued"],
        staleAfterDays: 2,
        nextActions: ["ask title for title commitment status", "escalate to agent"]
      })
    }),
    milestone({
      key: "title_objection_due",
      title: "Title objection deadline",
      phase: "title_survey_disclosures",
      sourceType: "derived_event",
      sourceReference: "Paragraph 6D",
      riskLevel: "urgent",
      metadata: operationalMetadata({
        ownerRole: "agent",
        expectedEvidence: ["agent review decision", "title objection confirmation"],
        completionSignals: ["agent confirms no objections", "objection/amendment noted"],
        staleAfterDays: 1,
        nextActions: ["remind agent to review title", "escalate before deadline"]
      })
    })
  );

  if (closingDate) {
    milestones.push(
      milestone({
        key: "closing_disclosure_due",
        title: "Closing disclosure received",
        phase: "closing_prep",
        dueDate: toDateOnly(subtractBusinessDays(closingDate, 3)),
        sourceType: "derived_event",
        sourceReference: "TRID",
        riskLevel: "urgent",
        metadata: operationalMetadata({
          ownerRole: "lender",
          expectedEvidence: ["Closing Disclosure delivered"],
          completionSignals: ["buyer confirms CD receipt", "lender confirms delivery"],
          staleAfterDays: 1,
          nextActions: ["ask lender if CD has been delivered", "escalate to agent"]
        })
      }),
      milestone({
        key: "final_walkthrough",
        title: "Final walkthrough",
        phase: "closing_prep",
        dueDate: toDateOnly(addDays(closingDate, -1)),
        sourceType: "derived_event",
        sourceReference: "TC convention",
        riskLevel: "watch",
        metadata: operationalMetadata({
          ownerRole: "agent",
          expectedEvidence: ["walkthrough scheduled", "walkthrough completed"],
          completionSignals: ["agent confirms walkthrough complete"],
          staleAfterDays: 1,
          nextActions: ["remind agent to schedule walkthrough"]
        })
      }),
      milestone({
        key: "closing_date",
        title: "Closing date",
        phase: "closing_funding",
        dueDate: toDateOnly(closingDate),
        sourceType: "explicit_date",
        sourceReference: "Paragraph 9A",
        riskLevel: "critical",
        metadata: operationalMetadata({
          ownerRole: "title",
          expectedEvidence: ["signed closing package", "funding confirmation", "recording confirmation"],
          completionSignals: ["title confirms funded", "agent confirms closing complete"],
          staleAfterDays: 1,
          nextActions: ["ask title for funding status", "escalate to agent"]
        })
      }),
      milestone({
        key: "post_closing_docs_due",
        title: "Final ALTA/HUD and commission docs due",
        phase: "post_closing",
        dueDate: toDateOnly(addDays(closingDate, 3)),
        sourceType: "derived_event",
        sourceReference: "Post-closing checklist",
        riskLevel: "normal",
        metadata: operationalMetadata({
          ownerRole: "title",
          expectedEvidence: ["final settlement statement", "commission disbursement"],
          completionSignals: ["final docs attached", "agent confirms file complete"],
          staleAfterDays: 3,
          nextActions: ["ask title for final docs", "remind agent to archive file"]
        })
      })
    );
  }

  return milestones;
}
