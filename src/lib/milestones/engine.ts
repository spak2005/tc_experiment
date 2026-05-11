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

function anchorMilestone(
  key: string,
  title: string,
  phase: TransactionPhase,
  anchor: Date,
  offsetDays: number,
  sourceReference: string,
  riskLevel: Milestone["riskLevel"] = "normal"
): MilestoneDraft {
  return milestone({
    key,
    title,
    phase,
    dueDate: toDateOnly(extendIfWeekendOrHoliday(addDays(anchor, offsetDays))),
    sourceType: "anchor_offset",
    sourceReference,
    riskLevel
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
        "urgent"
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
        "urgent"
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
          riskLevel: "critical"
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
        "watch"
      ),
      anchorMilestone(
        "seller_disclosure_due",
        "Seller disclosure due",
        "title_survey_disclosures",
        effectiveDate,
        5,
        "Paragraph 7B",
        "watch"
      )
    );

    if (financed) {
      milestones.push(
        anchorMilestone(
          "buyer_approval_due",
          "Buyer financing approval due",
          "financing_appraisal",
          effectiveDate,
          21,
          "Third Party Financing Addendum",
          "urgent"
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
      riskLevel: "watch"
    }),
    milestone({
      key: "title_objection_due",
      title: "Title objection deadline",
      phase: "title_survey_disclosures",
      sourceType: "derived_event",
      sourceReference: "Paragraph 6D",
      riskLevel: "urgent"
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
        riskLevel: "urgent"
      }),
      milestone({
        key: "final_walkthrough",
        title: "Final walkthrough",
        phase: "closing_prep",
        dueDate: toDateOnly(addDays(closingDate, -1)),
        sourceType: "derived_event",
        sourceReference: "TC convention",
        riskLevel: "watch"
      }),
      milestone({
        key: "closing_date",
        title: "Closing date",
        phase: "closing_funding",
        dueDate: toDateOnly(closingDate),
        sourceType: "explicit_date",
        sourceReference: "Paragraph 9A",
        riskLevel: "critical"
      }),
      milestone({
        key: "post_closing_docs_due",
        title: "Final ALTA/HUD and commission docs due",
        phase: "post_closing",
        dueDate: toDateOnly(addDays(closingDate, 3)),
        sourceType: "derived_event",
        sourceReference: "Post-closing checklist",
        riskLevel: "normal"
      })
    );
  }

  return milestones;
}
