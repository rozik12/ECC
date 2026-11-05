// Связь с Telegram. Чаты с номером от 900 миллиардов не существуют: для них ответы не отправляются, а возвращаются в ответе функции (для автотестов).
import type { Kb } from "./ui.ts";

export type Out = { op: "send" | "edit" | "doc" | "answer" | "action" | "photo"; chat_id?: number; message_id?: number; text?: string; markup?: unknown; filename?: string; content?: string };
export const TEST_CHAT_MIN = 900_000_000_000;

export class Tg {
  token: string;
  out: Out[] = [];
  constructor(token: string) {
    this.token = token;
  }

  private isTest(chatId?: number) {
    return typeof chatId === "number" && chatId >= TEST_CHAT_MIN;
  }

  private async call(method: string, body: unknown): Promise<{ ok: boolean; description?: string; result?: unknown }> {
    try {
      const r = await fetch(`https://api.telegram.org/bot${this.token}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      return await r.json();
    } catch (e) {
      return { ok: false, description: e instanceof Error ? e.message : "network" };
    }
  }

  async send(chatId: number, text: string, markup?: Kb | unknown) {
    if (this.isTest(chatId)) return void this.out.push({ op: "send", chat_id: chatId, text, markup });
    const r = await this.call("sendMessage", { chat_id: chatId, text: text.slice(0, 4000), parse_mode: "HTML", disable_web_page_preview: true, reply_markup: markup });
    if (!r.ok) console.error("sendMessage failed", r.description);
  }

  /** Картинка по ссылке с подписью. Если Telegram не принял картинку, отправляем обычное сообщение. */
  async photo(chatId: number, url: string, caption: string, markup?: unknown) {
    if (this.isTest(chatId)) return void this.out.push({ op: "photo", chat_id: chatId, text: caption, markup, filename: url });
    const r = await this.call("sendPhoto", { chat_id: chatId, photo: url, caption: caption.slice(0, 1000), parse_mode: "HTML", reply_markup: markup });
    if (!r.ok) {
      console.error("sendPhoto failed", r.description);
      await this.send(chatId, caption, markup);
    }
  }

  /** Заменяет текст и кнопки существующего сообщения. Если не вышло, отправляет новое. */
  async edit(chatId: number, messageId: number, text: string, markup?: Kb) {
    if (this.isTest(chatId)) return void this.out.push({ op: "edit", chat_id: chatId, message_id: messageId, text, markup });
    const r = await this.call("editMessageText", { chat_id: chatId, message_id: messageId, text: text.slice(0, 4000), parse_mode: "HTML", disable_web_page_preview: true, reply_markup: markup });
    if (r.ok || /not modified/i.test(r.description ?? "")) return;
    await this.send(chatId, text, markup);
  }

  async answer(chatId: number, callbackId: string, text?: string) {
    if (this.isTest(chatId)) return void this.out.push({ op: "answer", text });
    await this.call("answerCallbackQuery", { callback_query_id: callbackId, text, show_alert: false });
  }

  async action(chatId: number, action: "typing" | "upload_document") {
    if (this.isTest(chatId)) return void this.out.push({ op: "action", chat_id: chatId, text: action });
    await this.call("sendChatAction", { chat_id: chatId, action });
  }

  async doc(chatId: number, filename: string, content: string, caption: string) {
    if (this.isTest(chatId)) return void this.out.push({ op: "doc", chat_id: chatId, filename, content, text: caption });
    const form = new FormData();
    form.set("chat_id", String(chatId));
    form.set("caption", caption);
    form.set("document", new Blob([content], { type: "text/csv" }), filename);
    try {
      const r = await fetch(`https://api.telegram.org/bot${this.token}/sendDocument`, { method: "POST", body: form });
      if (!r.ok) console.error("sendDocument failed", r.status);
    } catch (e) {
      console.error("sendDocument error", e instanceof Error ? e.message : e);
    }
  }
}
