import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

const CHECK_WINDOW_MINUTES = 10;

function getLocalDate(now: Date, offsetMinutes: number) {
  return new Date(now.getTime() + offsetMinutes * 60_000);
}

function getLocalMinutes(now: Date, offsetMinutes: number) {
  const d = getLocalDate(now, offsetMinutes);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

function getGameDayKey(now: Date, state: any) {
  const offset = Number(state.timezoneOffsetMinutes || 0);
  const dayStartHour = Number(state.dayStartHour ?? 6);
  const dayStartMin = Number(state.dayStartMin ?? 0);

  const local = getLocalDate(now, offset);
  let y = local.getUTCFullYear();
  let m = local.getUTCMonth();
  let d = local.getUTCDate();

  const currentMinutes = local.getUTCHours() * 60 + local.getUTCMinutes();
  const startMinutes = dayStartHour * 60 + dayStartMin;

  if (currentMinutes < startMinutes) {
    const prev = new Date(Date.UTC(y, m, d) - 24 * 60 * 60 * 1000);
    y = prev.getUTCFullYear();
    m = prev.getUTCMonth();
    d = prev.getUTCDate();
  }

  return new Date(Date.UTC(y, m, d)).toDateString();
}

function isWithinWindow(current: number, target: number) {
  const diff = (current - target + 1440) % 1440;
  return diff >= 0 && diff < CHECK_WINDOW_MINUTES;
}

async function sendTelegramMessage(telegramId: string, text: string) {
  const token = process.env.BOT_TOKEN;
  const appUrl = process.env.APP_URL;

  if (!token) throw new Error("BOT_TOKEN is not set");

  const reply_markup = appUrl
    ? {
        inline_keyboard: [
          [
            {
              text: "Открыть Growth Arc",
              web_app: { url: appUrl },
            },
          ],
        ],
      }
    : undefined;

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: telegramId,
      text,
      reply_markup,
    }),
  });

  const data = await response.json();

  if (!data.ok) {
    throw new Error(data.description || "Telegram sendMessage failed");
  }

  return data;
}

export const checkAndSend = internalAction({
  args: {},
  handler: async (ctx) => {
    const profiles = await ctx.runQuery(internal.state.listProfiles);
    const now = new Date();

    for (const profile of profiles) {
      const state: any = profile.state || {};
      const telegramId = String(profile.telegramId || state.tgUserId || "");

      if (!telegramId) continue;
      if (state.notificationsEnabled === false) continue;

      const offset = Number(state.timezoneOffsetMinutes || 0);
      const dayStartHour = Number(state.dayStartHour ?? 6);
      const dayStartMin = Number(state.dayStartMin ?? 0);

      const currentMinutes = getLocalMinutes(now, offset);
      const startMinutes = dayStartHour * 60 + dayStartMin;
      const warningMinutes = (startMinutes - 60 + 1440) % 1440;
      const gameDayKey = getGameDayKey(now, state);

      const completedToday = state.lastQuestDate === gameDayKey;

      const nextState = { ...state };
      let changed = false;

      if (
        isWithinWindow(currentMinutes, startMinutes) &&
        state.lastDayStartNotification !== gameDayKey
      ) {
        try {
          await sendTelegramMessage(
            telegramId,
            `[СИСТЕМА]\n\n☀️Новый игровой день начался.\n\n Еще один шанс стать сильнее. Выполни хотя бы один квест, чтобы сохранить стрик.`
          );

          nextState.lastDayStartNotification = gameDayKey;
          changed = true;
        } catch (error) {
          nextState.lastNotificationError =
            error instanceof Error ? error.message : "Unknown Telegram error";
          changed = true;
        }
      }

      if (
        isWithinWindow(currentMinutes, warningMinutes) &&
        !completedToday &&
        state.lastStreakWarningNotification !== gameDayKey
      ) {
        try {
          await sendTelegramMessage(
            telegramId,
            `[СИСТЕМА]\n\n‼️Стрик под угрозой.\n\nДо конца игрового дня остался 1 час. Заверши хотя бы один квест, чтобы не потерять серию.`
          );

          nextState.lastStreakWarningNotification = gameDayKey;
          changed = true;
        } catch (error) {
          nextState.lastNotificationError =
            error instanceof Error ? error.message : "Unknown Telegram error";
          changed = true;
        }
      }

      if (changed) {
        await ctx.runMutation(internal.state.saveProfile, {
          telegramId,
          state: nextState,
        });
      }
    }

    return { checked: profiles.length };
  },
});
