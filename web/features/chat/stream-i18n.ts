import { Streami18n } from "stream-chat-react"

// stream-chat-react ships no Vietnamese translation, so its prebuilt UI would
// silently fall back to English on the `vi` locale. We register a small dict for
// the strings actually visible in our chat surface (ChannelList / Channel /
// MessageInput). Unlisted keys fall back to English — harmless, just untranslated.
// Keys are the English source strings (i18next natural-language keys).
const viTranslations: Record<string, string> = {
  Send: "Gửi",
  "Type your message": "Nhập tin nhắn",
  Search: "Tìm kiếm",
  "Searching...": "Đang tìm...",
  "Nothing yet...": "Chưa có gì...",
  "Connection failure, reconnecting now...":
    "Mất kết nối, đang kết nối lại...",
  "Error connecting to chat, refresh the page to try again.":
    "Lỗi kết nối trò chuyện, hãy tải lại trang để thử lại.",
  "You have no channels currently": "Bạn chưa có cuộc trò chuyện nào",
  "Error loading messages for this channel...":
    "Lỗi tải tin nhắn cho cuộc trò chuyện này...",
  Chats: "Trò chuyện",
  "Message deleted": "Tin nhắn đã xóa",
  "Message failed to send": "Gửi tin nhắn thất bại",
  Edited: "Đã chỉnh sửa",
  Delete: "Xóa",
  "React to message": "Bày tỏ cảm xúc",
  "Unread messages": "Tin nhắn chưa đọc",
  "Error loading channels": "Lỗi tải danh sách trò chuyện",
  "{{ user }} is typing...": "{{ user }} đang nhập...",
  "{{ users }} and more are typing...":
    "{{ users }} và những người khác đang nhập...",
  online: "trực tuyến",
  "{{ commaSeparatedUsers }} and {{ moreCount }} more": "{{ commaSeparatedUsers }} và {{ moreCount }} người khác",
  "{{ commaSeparatedUsers }}, and {{ lastUser }}": "{{ commaSeparatedUsers }} và {{ lastUser }}",
  "🏙 Attachment...": "🏙 Tệp đính kèm...",
  "New Messages!": "Tin nhắn mới!",
}

// One Streami18n per language, built lazily and cached at module scope so we
// don't re-create the i18next instance on every render.
const cache = new Map<string, Streami18n>()

/** The Streami18n instance for a next-intl locale (`vi` localized, else English). */
export function getStreami18n(locale: string): Streami18n {
  const language = locale === "vi" ? "vi" : "en"
  const cached = cache.get(language)
  if (cached) return cached

  const instance = new Streami18n({ language })
  if (language === "vi") {
    // The dict is intentionally partial; i18next merges it over the defaults.
    instance.registerTranslation(
      "vi",
      viTranslations as Parameters<Streami18n["registerTranslation"]>[1]
    )
  }
  cache.set(language, instance)
  return instance
}
