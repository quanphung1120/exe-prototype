import "stream-chat"

// stream-chat v9 treats a channel's `name` as a custom field (the base
// `CustomChannelData` is empty), so declare the display name our channels carry
// — mirrors the same augmentation in api/src/features/stream/stream.service.ts.
declare module "stream-chat" {
  interface CustomChannelData {
    name?: string
  }
}
