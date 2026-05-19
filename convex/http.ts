import { httpAction } from "./_generated/server";
import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";

const http = httpRouter();

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Telegram-Init-Data",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function hex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacSha256(key: ArrayBuffer | Uint8Array | string, message: string) {
  const encoder = new TextEncoder();

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    typeof key === "string" ? encoder.encode(key) : key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  return crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message));
}

async function validateTelegramInitData(initData: string) {
  const botToken = process.env.BOT_TOKEN;

  if (!botToken) {
    throw new Error("BOT_TOKEN is not set in Convex environment variables");
  }

  if (!initData) {
    throw new Error("No Telegram initData");
  }

  const params = new URLSearchParams(initData);
  const hashFromTelegram = params.get("hash");

  if (!hashFromTelegram) {
    throw new Error("No hash in Telegram initData");
  }

  params.delete("hash");

  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = await hmacSha256("WebAppData", botToken);
  const calculatedHash = hex(await hmacSha256(secretKey, dataCheckString));

  if (calculatedHash !== hashFromTelegram) {
    throw new Error("Invalid Telegram initData");
  }

  const userRaw = params.get("user");

  if (!userRaw) {
    throw new Error("No Telegram user in initData");
  }

  const user = JSON.parse(userRaw);

  return {
    telegramId: String(user.id),
    user,
  };
}

http.route({
  path: "/state",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }),
});

http.route({
  path: "/state",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const initData = request.headers.get("X-Telegram-Init-Data") || "";
      const { telegramId } = await validateTelegramInitData(initData);

      const state = await ctx.runQuery(internal.state.getProfile, {
        telegramId,
      });

      return json({ state });
    } catch (error) {
      return json(
        {
          error: error instanceof Error ? error.message : "Unknown error",
        },
        401
      );
    }
  }),
});

http.route({
  path: "/state",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const initData = request.headers.get("X-Telegram-Init-Data") || "";
      const { telegramId } = await validateTelegramInitData(initData);

      const body = await request.json();
      const state = body?.state;

      if (!state || typeof state !== "object") {
        return json({ error: "Invalid state" }, 400);
      }

      const cleanState = {
        ...state,
        tgUserId: telegramId,
      };

      await ctx.runMutation(internal.state.saveProfile, {
        telegramId,
        state: cleanState,
      });

      return json({ ok: true });
    } catch (error) {
      return json(
        {
          error: error instanceof Error ? error.message : "Unknown error",
        },
        401
      );
    }
  }),
});

export default http;
