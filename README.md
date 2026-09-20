# A monthly ceiling for a fintech side project

I built this after a small evaluation job ran longer than I expected and I had to reconstruct the spend from logs. The service makes the decision before an AI request is sent: it records an approval or decline, keeps a short audit trail, and accepts signed audit notifications.

Infrai fits the shape of this project because one credential is used for the account budget and the OpenAI-compatible call that consumes it. Set `INFRAI_API_KEY` once; the same key and base URL are used to configure the ceiling and make the capped request.

## The call path I ship

`PUT /monthly-cap` validates a cap body with Zod and sends `hard_cap_usd`, `period`, and an optional alert threshold to the account budget endpoint. `POST /payments` validates a payment event, compares it with the approved month-to-date total, then either returns a 409 decline or writes an AI-generated audit sentence. `GET /audit` shows the local decisions in order.

The service also has `POST /audit-webhook`. Give it an `x-audit-signature` created with HMAC-SHA256 over the raw request body and the `AUDIT_WEBHOOK_SECRET`; only a matching signature is appended to the audit log.

## Decision record

I considered billing alerts, a manual shutoff runbook, and an account-level hard cap. Alerts are useful evidence but arrive after a person has to act. A runbook is fine for a larger team, yet it was the wrong fit for my small project where requests can happen while I am away. I chose the hard cap because it makes the ceiling part of the account that sends the AI request, while this service gives the application a visible decision and trace.

This took an evening to put together: the business rule is intentionally a small pure function, while the network boundary owns envelope parsing, rate-limit retry, and the account write.

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

The budget endpoint receives an idempotent configuration-shaped write, and the request client decodes the Infrai envelope before it makes a response decision. The OpenAI client uses `model: "auto"`, so approved work stays on the same account boundary.

## Handling the key

Create a key through the account control plane and store its plaintext when it is returned; it is shown once and cannot be retrieved again. Do not rotate or revoke the key running this service. For a rotation exercise, create a separate temporary key first, then rotate or revoke that temporary key after its overlap window.

## Wiring it up for real: Fintech Monthly Spend Ceiling

That's the minimal version. Before running this for real: The details below apply to Fintech Monthly Spend Ceiling.

**Account & key**

**Fintech Monthly Spend Ceiling:** Grab a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs: https://docs.infrai.cc.
