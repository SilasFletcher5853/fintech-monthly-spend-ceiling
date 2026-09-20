export type PaymentEvent = {
  paymentId: string;
  merchant: string;
  amountUsd: number;
  alreadyApprovedUsd: number;
  monthlyCapUsd: number;
};

export type SpendDecision =
  | { kind: "approved"; remainingUsd: number; auditNote: string }
  | { kind: "declined"; remainingUsd: number; auditNote: string };

export function decideMonthlySpend(event: PaymentEvent): SpendDecision {
  const remainingUsd = Math.max(0, event.monthlyCapUsd - event.alreadyApprovedUsd);
  if (event.amountUsd > remainingUsd) {
    return {
      kind: "declined",
      remainingUsd,
      auditNote: `Declined ${event.paymentId}: ${event.merchant} would exceed the monthly ceiling.`,
    };
  }
  return {
    kind: "approved",
    remainingUsd: Number((remainingUsd - event.amountUsd).toFixed(2)),
    auditNote: `Approved ${event.paymentId}: ${event.merchant} remains inside the monthly ceiling.`,
  };
}
