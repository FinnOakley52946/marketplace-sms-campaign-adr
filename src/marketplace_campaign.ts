import { z } from "zod";
import { infrai } from "./infrai.js";

const sellerAssetSchema = z.object({
  assetId: z.string().min(1),
  title: z.string().min(1),
  sellerPhone: z.string().min(1)
});

const buyerUpdateSchema = z.object({
  buyerId: z.string().min(1),
  buyerPhone: z.string().min(1),
  interestedAssetIds: z.array(z.string().min(1)).min(1),
  city: z.string().min(1)
});

const orderHandoffSchema = z.object({
  orderId: z.string().min(1),
  assetId: z.string().min(1),
  pickupWindow: z.string().min(1),
  handoffCode: z.string().min(1)
});

export const marketplaceCampaignRequestSchema = z.object({
  campaignId: z.string().min(1),
  sellerAssets: z.array(sellerAssetSchema).min(1),
  buyerUpdates: z.array(buyerUpdateSchema).min(1),
  orderHandoff: z.array(orderHandoffSchema).min(1)
});

export type MarketplaceCampaignRequest = z.infer<typeof marketplaceCampaignRequestSchema>;

export type CampaignDecision = {
  buyerId: string;
  buyerPhone: string;
  assetId: string;
  message: string;
  idempotencyKey: string;
};

export function decideCampaignMessages(input: MarketplaceCampaignRequest): CampaignDecision[] {
  const parsed = marketplaceCampaignRequestSchema.parse(input);
  const assets = new Map(parsed.sellerAssets.map((asset) => [asset.assetId, asset]));
  const sent = new Set<string>();
  const decisions: CampaignDecision[] = [];

  for (const handoff of parsed.orderHandoff) {
    const asset = assets.get(handoff.assetId);
    if (!asset) continue;

    for (const buyer of parsed.buyerUpdates) {
      const interested = buyer.interestedAssetIds.includes(handoff.assetId);
      if (!interested) continue;

      const dedupe = `${buyer.buyerId}:${handoff.orderId}`;
      if (sent.has(dedupe)) continue;
      sent.add(dedupe);

      decisions.push({
        buyerId: buyer.buyerId,
        buyerPhone: buyer.buyerPhone,
        assetId: handoff.assetId,
        message: `Update for ${asset.title}: order ${handoff.orderId} is ready for handoff in ${buyer.city}. Pickup window ${handoff.pickupWindow}. Code ${handoff.handoffCode}.`,
        idempotencyKey: `${parsed.campaignId}:${handoff.orderId}:${buyer.buyerId}`
      });
    }
  }

  return decisions;
}

export async function paceCampaign(input: MarketplaceCampaignRequest) {
  const decisions = decideCampaignMessages(input);
  if (decisions.length === 0) {
    return { queued: 0, messages: [] as CampaignDecision[] };
  }

  await infrai.queue.publish_batch({
    queue: input.campaignId,
    messages: decisions.map((decision) => ({
      payload: JSON.stringify({
        campaignId: input.campaignId,
        buyerId: decision.buyerId,
        buyerPhone: decision.buyerPhone,
        assetId: decision.assetId,
        message: decision.message,
        idempotencyKey: decision.idempotencyKey
      }),
      idempotency_key: decision.idempotencyKey
    }))
  });

  return { queued: decisions.length, messages: decisions };
}

export type CampaignSendResult = {
  campaignId: string;
  queued: number;
  sent: number;
  statuses: Array<{
    buyerId: string;
    to: string;
    messageId: string;
    acceptedStatus: string;
    latestStatus: string;
  }>;
};

export async function runMarketplaceCampaign(input: MarketplaceCampaignRequest): Promise<CampaignSendResult> {
  const paced = await paceCampaign(input);

  if (paced.messages.length === 0) {
    return {
      campaignId: input.campaignId,
      queued: 0,
      sent: 0,
      statuses: []
    };
  }

  const sendResponse = await infrai.sms.batch.send({
    messages: paced.messages.map((decision) => ({
      to: decision.buyerPhone,
      message: decision.message,
      idempotency_key: decision.idempotencyKey
    }))
  });

  const statuses = [] as CampaignSendResult["statuses"];

  for (let i = 0; i < sendResponse.data.results.length; i += 1) {
    const result = sendResponse.data.results[i];
    const decision = paced.messages[i];
    const events = await infrai.sms.events(result.message_id);
    const latestStatus = events.data.events.at(-1)?.status ?? result.status;

    statuses.push({
      buyerId: decision.buyerId,
      to: result.to,
      messageId: result.message_id,
      acceptedStatus: result.status,
      latestStatus
    });
  }

  return {
    campaignId: input.campaignId,
    queued: paced.queued,
    sent: statuses.length,
    statuses
  };
}
