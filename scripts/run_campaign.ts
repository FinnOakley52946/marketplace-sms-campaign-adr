import { runMarketplaceCampaign } from "../src/marketplace_campaign.js";

const recipient = process.env.CAMPAIGN_RECIPIENT;
if (!recipient) throw new Error("CAMPAIGN_RECIPIENT is required");

const sample = {
  campaignId: "camp-aug-yard-sale",
  sellerAssets: [
    {
      assetId: "asset-bike-1",
      title: "Blue commuter bike",
      sellerPhone: "+15550001001"
    },
    {
      assetId: "asset-desk-2",
      title: "Oak standing desk",
      sellerPhone: "+15550001002"
    }
  ],
  buyerUpdates: [
    {
      buyerId: "buyer-ana",
      buyerPhone: recipient,
      interestedAssetIds: ["asset-bike-1"],
      city: "Austin"
    },
    {
      buyerId: "buyer-lee",
      buyerPhone: recipient,
      interestedAssetIds: ["asset-desk-2"],
      city: "Austin"
    }
  ],
  orderHandoff: [
    {
      orderId: "order-701",
      assetId: "asset-bike-1",
      pickupWindow: "today 5pm-7pm",
      handoffCode: "7314"
    },
    {
      orderId: "order-702",
      assetId: "asset-desk-2",
      pickupWindow: "tomorrow 10am-noon",
      handoffCode: "1882"
    }
  ]
};

const result = await runMarketplaceCampaign(sample);
console.log(JSON.stringify(result, null, 2));
