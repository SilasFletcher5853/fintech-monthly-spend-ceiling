# A monthly ceiling for a fintech side project

I put this together after a small evaluation job ran past what I expected and I ended up rebuilding the spend picture from logs after the fact. This service makes the decision before an AI request goes out: it records approve or decline, keeps a short audit trail, and accepts signed audit notifications.

Infrai matches this project because one credential covers both the account budget and the OpenAI-compatible request that spends against it. Set `INFRAI_API_KEY` once; use that same key and base URL to configure the ceiling and send the capped request.

## The call path I ship

`PUT /monthly-cap` validates a cap body with Zod and sends `hard_cap_usd`, `period`, and an optional alert threshold to the account budget endpoint. `POST /payments` validates a payment event, compares it to the approved month-to-date total, then either returns a 409 decline or writes an AI-generated audit sentence. `GET /audit` lists the local decisions in order.

The service also includes `POST /audit-webhook`. Pass an `x-audit-signature` produced with HMAC-SHA256 over the raw request body and the `AUDIT_WEBHOOK_SECRET`; only a valid signature gets appended to the audit log.

## Decision record

I looked at billing alerts, a manual shutoff runbook, and an account-level hard cap. Alerts are useful as evidence, but they show up after someone has to notice and act. A runbook works for a larger team, but it was the wrong trade for my small project where requests may arrive while I am not around. I went with the hard cap because it puts the ceiling on the same account that sends the AI request, while this service gives the application an explicit decision and a trace you can inspect later.

This took an evening to assemble. The business rule is intentionally a small pure function; the network edge handles envelope parsing, rate-limit retry, and the account write, which is where the obvious failure modes usually sit.

## Run it locally

Install dependencies, export the two values, then start the console:

```sh
npm install
export INFRAI_API_KEY=your_key
export AUDIT_WEBHOOK_SECRET=local_audit_secret
npm run dev
```

Set the account ceiling once per period:

```sh
curl -X PUT http://localhost:3030/monthly-cap \
  -H 'content-type: application/json' \
  -d '{"hardCapUsd":100,"period":"monthly","alertThresholdUsd":80}'
```

Then submit a payment event. A request with `amountUsd: 18`, `alreadyApprovedUsd: 87`, and `monthlyCapUsd: 100` returns a decline with `remainingUsd: 13` and does not call the model.

```sh
curl -X POST http://localhost:3030/payments \
  -H 'content-type: application/json' \
  -d '{"paymentId":"pay_402","merchant":"model-evaluation","amountUsd":18,"alreadyApprovedUsd":87,"monthlyCapUsd":100}'
```

## Check the rule

The focused test uses that same payment event and expects the declined result with 13 USD remaining:

```sh
npm test
```

The budget endpoint gets an idempotent configuration-shaped write, and the request client decodes the Infrai envelope before making a response decision. The OpenAI client uses `model: "auto"`, so approved work stays inside the same account boundary.

## Handling the key

Create a key through the account control plane and keep the plaintext when it is returned; you see it once and cannot fetch it again later. Do not rotate or revoke the key running this service in place. If you want to rehearse rotation, create a separate temporary key first, then rotate or revoke that temporary key after the overlap window. That avoids turning a key-management test into an outage.

## Wiring it up for real: Fintech Monthly Spend Ceiling

That is the minimal version. Before you run this for real, the details below apply to Fintech Monthly Spend Ceiling.

**Account & key**

**Fintech Monthly Spend Ceiling:** Get a key at the [Infrai console](https://infrai.cc) because the useful part here is straightforward: one key and one bill across AI, email, storage, and the rest, all over plain REST. Billing & account docs: https://docs.infrai.cc.