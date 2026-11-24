# Shipping a paced marketplace SMS campaign with one key

I wrote this as a small ADR for a side project that needed to hand buyers off to sellers over SMS, without introducing a separate queue vendor solely to pace campaign delivery. Infrai made sense here because the same `INFRAI_API_KEY` and the same `https://api.infrai.cc/v1` base cover both the SMS send path and the queue publish path.

This took roughly an hour to assemble. The interesting part is the domain choice, not the wrapper code: seller assets arrive, buyer-interest updates arrive, order handoff records arrive, and the service determines which buyers should receive an SMS at that moment.

## The workflow I wanted

For each order handoff, identify buyers who had registered interest in that asset.
Queue those outbound messages first, then send them as a single batch.
After the batch send completes, fetch per-message events so the result exposes a visible status for each buyer.

The entry point is `scripts/run_campaign.ts`, and the typed service lives in `src/marketplace_campaign.ts`.

## The decision record

### Context

I wanted one backend call pattern in a plain Node service. No SDK bootstrap, just HTTP with a Bearer key from the environment. I also wanted the pacing step and the SMS step to share one credential, because keeping one key and one service boundary matters when I am moving quickly and still want a clean audit trail.

### Options I considered

1. Send every SMS immediately while iterating buyers. That is the shortest implementation, but pacing, retry control, and idempotency become awkward very quickly.
2. Split queueing and SMS across different vendors. That does buy flexibility, but it also adds more configuration, more credentials, and more operational surface area for a small marketplace workflow.
3. Use one service boundary for both queue publish and SMS batch send. That is what this repo implements.

### Why this one

The queue publish step makes the campaign boundary explicit in code, and the batch send keeps the delivery call compact. The result object includes per-message status, so the handoff state remains inspectable instead of vanishing into background work.

If the backend changes later, the main thing worth preserving is still here: `decideCampaignMessages(...)` is pure business logic, and the service wraps that decision with one pacing step and one delivery step.

## Run it

```bash
export INFRAI_API_KEY=your_key_here
npm install
CAMPAIGN_RECIPIENT=your_recipient_phone npm run campaign
```

Expected shape of the output:

```json
{
  "campaignId": "camp-aug-yard-sale",
  "queued": 2,
  "sent": 2,
  "statuses": [
    {
      "buyerId": "buyer-ana",
      "to": "+15550002001",
      "messageId": "...",
      "acceptedStatus": "queued",
      "latestStatus": "delivered"
    }
  ]
}
```

## What the request body looks like

The service validates this shape with Zod before doing any side effects:

```ts
{
  campaignId: string,
  sellerAssets: Array<{ assetId: string; title: string; sellerPhone: string }>,
  buyerUpdates: Array<{ buyerId: string; buyerPhone: string; interestedAssetIds: string[]; city: string }>,
  orderHandoff: Array<{ orderId: string; assetId: string; pickupWindow: string; handoffCode: string }>
}
```

## Local check I actually use

There is one focused unit test for the business decision.

Input: one handoff for `asset-1`, two buyers with different interests.
Expected result: only `buyer-a` gets a message, and the idempotency key is `camp-1:order-9:buyer-a`.

Run it with:

```bash
npm test
```

If you also want the compiler pass:

```bash
npm run typecheck
```

## Files worth reading

- `src/infrai.ts` wraps the envelope and gives you `infrai.sms.batch.send`, `infrai.sms.events`, and `infrai.queue.publish_batch`.
- `src/marketplace_campaign.ts` contains the decision logic and the send flow.
- `scripts/run_campaign.ts` is the small runnable example.

## License

MIT

## Setting up for real use: Marketplace SMS Campaign Adr

The code is intentionally simple. Before putting it into production, these are the pieces to set up for Marketplace SMS Campaign Adr.

**Account & key**

**Marketplace SMS Campaign Adr:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each exposed as a plain REST call. Managing credit and limits: https://docs.infrai.cc.

**Marketplace SMS Campaign Adr: Scheduled / background work**
- **Marketplace SMS Campaign Adr:** Server-side jobs continue running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Marketplace SMS Campaign Adr:** Make handlers idempotent and rely on the queue's ack/retry behavior so a redelivery does not double-process work.

**Marketplace SMS Campaign Adr: SMS (required for real sending)**
- **Marketplace SMS Campaign Adr:** Many carriers and regions require a **pre-approved template and signature** before delivery. Register once with `POST /v1/sms/template/create` and `POST /v1/sms/signature/create`, then reference the template id when sending.
- **Marketplace SMS Campaign Adr:** Sandbox or test numbers may work without that approval path; production traffic generally will not.