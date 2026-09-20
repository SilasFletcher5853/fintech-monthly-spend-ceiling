import assert from "node:assert/strict";
import test from "node:test";
import { decideMonthlySpend } from "./spend_gate.ts";

test("declines a payment that crosses the configured monthly ceiling", () => {
  const decision = decideMonthlySpend({
    paymentId: "pay_402",
    merchant: "model-evaluation",
    amountUsd: 18,
    alreadyApprovedUsd: 87,
    monthlyCapUsd: 100,
  });
  assert.equal(decision.kind, "declined");
  assert.equal(decision.remainingUsd, 13);
});
