import { describe, expect, it } from "vitest";
import { canCancelOrder, effectiveOrderStatus, showFulfilmentBadge } from "../order-labels";

const o = (status: string, ...subs: [string, string | null][]) => ({ status, subOrders: subs.map(([s, f]) => ({ status: s, fulfillmentStatus: f })) });

describe("effectiveOrderStatus (parent order never leaves PENDING_CONFIRMATION, OJ-14)", () => {
  it("a delivered order reads Delivered, not Awaiting seller, and can't be cancelled", () => {
    const stage = effectiveOrderStatus(o("PENDING_CONFIRMATION", ["CONFIRMED", "DELIVERED"]));
    expect(stage).toBe("DELIVERED");
    expect(canCancelOrder(stage, false)).toBe(false);
  });
  it("follows the seller parts through confirm and freight", () => {
    expect(effectiveOrderStatus(o("PENDING_CONFIRMATION", ["CONFIRMED", "NOT_STARTED"]))).toBe("CONFIRMED");
    expect(effectiveOrderStatus(o("PENDING_CONFIRMATION", ["IN_FULFILLMENT", "PREPARING"]))).toBe("IN_FULFILLMENT");
    expect(effectiveOrderStatus(o("PENDING_CONFIRMATION", ["ACCEPTED", "DELIVERED"]))).toBe("COMPLETED");
  });
  it("any part still waiting keeps the order Awaiting seller; all rejected reads Cancelled", () => {
    expect(effectiveOrderStatus(o("PENDING_CONFIRMATION", ["CONFIRMED", "IN_TRANSIT"], ["PENDING_CONFIRMATION", null]))).toBe("PENDING_CONFIRMATION");
    expect(effectiveOrderStatus(o("PENDING_CONFIRMATION", ["REJECTED", null]))).toBe("CANCELLED");
  });
  it("a parent already cancelled or completed wins", () => {
    expect(effectiveOrderStatus(o("CANCELLED", ["CONFIRMED", "NOT_STARTED"]))).toBe("CANCELLED");
  });
});

describe("showFulfilmentBadge", () => {
  it("hides the second badge when it repeats the status", () => {
    expect(showFulfilmentBadge("DELIVERED", "DELIVERED")).toBe(false);
    expect(showFulfilmentBadge("CONFIRMED", "NOT_STARTED")).toBe(false);
    expect(showFulfilmentBadge("IN_FULFILLMENT", "IN_TRANSIT")).toBe(true);
  });
});
