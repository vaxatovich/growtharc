import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

export const getProfile = internalQuery({
  args: {
    telegramId: v.string(),
  },
  handler: async (ctx, args) => {
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_telegramId", (q) => q.eq("telegramId", args.telegramId))
      .unique();

    return profile?.state ?? null;
  },
});

export const saveProfile = internalMutation({
  args: {
    telegramId: v.string(),
    state: v.any(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("profiles")
      .withIndex("by_telegramId", (q) => q.eq("telegramId", args.telegramId))
      .unique();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        state: args.state,
        updatedAt: now,
      });

      return { ok: true, updated: true };
    }

    await ctx.db.insert("profiles", {
      telegramId: args.telegramId,
      state: args.state,
      updatedAt: now,
    });

    return { ok: true, created: true };
  },
export const listProfiles = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("profiles").collect();
  },
});
