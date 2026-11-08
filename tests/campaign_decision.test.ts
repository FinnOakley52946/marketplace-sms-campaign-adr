import test from "node:test";
import assert from "node:assert/strict";
import { decideCampaignMessages } from "../src/marketplace_campaign.js";

test("only buyers interested in a handed-off asset receive one SMS with a stable idempotency key", () => {
  const input = {
    campaignId: "camp-1",
    sellerAssets: [
      { assetId: "asset-1", title: "Vintage lamp", sellerPhone: "+15550001000" },
      { assetId: "asset-2", title: "Record player", sellerPhone: "+15550001001" }
    ],
    buyerUpdates: [
      { buyerId: "buyer-a", buyerPhone: "+15550002000", interestedAssetIds: ["asset-1"], city: "Denver" },
      { buyerId: "buyer-b", buyerPhone: "+15550002001", interestedAssetIds: ["asset-2"], city: "Denver" }
    ],
    orderHandoff: [
      { orderId: "order-9", assetId: "asset-1", pickupWindow: "Friday 2pm-4pm", handoffCode: "4411" }
    ]
  };

  const result = decideCampaignMessages(input);

  assert.equal(result.length, 1);
  assert.deepEqual(result[0], {
    buyerId: "buyer-a",
    buyerPhone: "+15550002000",
    assetId: "asset-1",
    message: "Update for Vintage lamp: order order-9 is ready for handoff in Denver. Pickup window Friday 2pm-4pm. Code 4411.",
    idempotencyKey: "camp-1:order-9:buyer-a"
  });
});
