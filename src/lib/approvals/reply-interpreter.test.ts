import { describe, expect, it } from "vitest";
import { interpretApprovalReplyFast } from "@/lib/approvals/reply-interpreter";

describe("interpretApprovalReplyFast", () => {
  it("approves obvious send replies", () => {
    expect(interpretApprovalReplyFast("send")?.action).toBe("approve_send");
    expect(interpretApprovalReplyFast("yes go ahead")?.action).toBe("approve_send");
    expect(interpretApprovalReplyFast("looks good")?.action).toBe("approve_send");
  });

  it("rejects obvious hold replies", () => {
    expect(interpretApprovalReplyFast("don't send this yet")?.action).toBe("reject");
    expect(interpretApprovalReplyFast("hold off")?.action).toBe("reject");
  });

  it("distinguishes edit-and-send from edit-and-review", () => {
    expect(
      interpretApprovalReplyFast("Make the closing date May 30, then send.")?.action
    ).toBe("revise_and_send");
    expect(
      interpretApprovalReplyFast("Make the closing date May 30 and let me see it.")?.action
    ).toBe("revise_only");
  });

  it("asks again when the reply is empty after quoted text is removed", () => {
    expect(
      interpretApprovalReplyFast("> I drafted the email below and need your approval.")?.action
    ).toBe("needs_clarification");
  });
});
