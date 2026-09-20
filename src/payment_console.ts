import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { z } from "zod";
import { InfraiGateway, InfraiRequestError } from "./infrai_gateway.ts";
import { decideMonthlySpend } from "./spend_gate.ts";

const paymentBody = z.object({
  paymentId: z.string().min(1),
  merchant: z.string().min(1),
  amountUsd: z.number().positive(),
  alreadyApprovedUsd: z.number().nonnegative(),
  monthlyCapUsd: z.number().positive(),
});

const capBody = z.object({
  hardCapUsd: z.number().positive(),
  period: z.string().min(1),
  alertThresholdUsd: z.number().positive().optional(),
});

const auditLog: string[] = [];

async function readJson(request: import("node:http").IncomingMessage): Promise<unknown> {
  let text = "";
  for await (const chunk of request) text += chunk;
  return JSON.parse(text);
}

function webhookIsSigned(rawBody: string, signature: string | undefined): boolean {
  const secret = process.env.AUDIT_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return expected.length === signature.length && timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

const gateway = new InfraiGateway();
const server = createServer(async (request, response) => {
  try {
    if (request.method === "PUT" && request.url === "/monthly-cap") {
      const input = capBody.parse(await readJson(request));
      await gateway.setMonthlyHardCap(input.hardCapUsd, input.period, input.alertThresholdUsd);
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ status: "monthly hard cap recorded" }));
      return;
    }
    if (request.method === "POST" && request.url === "/payments") {
      const event = paymentBody.parse(await readJson(request));
      const decision = decideMonthlySpend(event);
      auditLog.push(decision.auditNote);
      if (decision.kind === "declined") {
        response.writeHead(409, { "Content-Type": "application/json" });
        response.end(JSON.stringify(decision));
        return;
      }
      const aiNote = await gateway.describePaymentForAudit(event.merchant, event.amountUsd);
      auditLog.push(aiNote);
      response.writeHead(201, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ...decision, aiNote }));
      return;
    }
    if (request.method === "GET" && request.url === "/audit") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ entries: auditLog }));
      return;
    }
    if (request.method === "POST" && request.url === "/audit-webhook") {
      let rawBody = "";
      for await (const chunk of request) rawBody += chunk;
      const signature = request.headers["x-audit-signature"];
      if (!webhookIsSigned(rawBody, Array.isArray(signature) ? signature[0] : signature)) {
        response.writeHead(401).end();
        return;
      }
      auditLog.push(`Verified webhook: ${rawBody}`);
      response.writeHead(202).end();
      return;
    }
    response.writeHead(404).end();
  } catch (error) {
    const status = error instanceof InfraiRequestError ? error.status : error instanceof z.ZodError ? 400 : 500;
    response.writeHead(status, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ message: error instanceof Error ? error.message : "Unexpected request failure" }));
  }
});

server.listen(3030, () => console.log("Payment console listening on http://localhost:3030"));
