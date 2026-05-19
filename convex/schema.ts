import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  profiles: defineTable({
    telegramId: v.string(),
    state: v.any(),
    updatedAt: v.number(),
  }).index("by_telegramId", ["telegramId"]),
});
