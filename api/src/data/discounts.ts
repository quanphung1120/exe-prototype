// Hardcoded demo discount codes — seeded into the `discountcodes` collection
// the first time it's read empty (same seed-on-empty pattern as
// `data/venue.ts`'s `INITIAL_VENUES`). Kept here (not inside the feature
// folder) to match that convention: static/deterministic seed data lives in
// `src/data/`, the feature folder holds the schema/service/controller.

export interface InitialDiscountCode {
  code: string
  type: "percent" | "fixed"
  value: number
  maxDiscount?: number
  minOrder?: number
  validUntil?: Date
  description: string
}

export const INITIAL_DISCOUNTS: InitialDiscountCode[] = [
  {
    code: "GIAM10",
    type: "percent",
    value: 10,
    maxDiscount: 50_000,
    description: "Giảm 10% (tối đa 50K)",
  },
  {
    code: "GIAM20",
    type: "percent",
    value: 20,
    maxDiscount: 100_000,
    minOrder: 300_000,
    description: "Giảm 20% cho đơn từ 300K (tối đa 100K)",
  },
  {
    code: "SPORT50K",
    type: "fixed",
    value: 50_000,
    minOrder: 200_000,
    description: "Giảm 50K cho đơn từ 200K",
  },
  {
    code: "HETHAN",
    type: "percent",
    value: 30,
    // Fixed date safely in the past regardless of when this seeds — demos the
    // expired-code error path.
    validUntil: new Date("2026-01-01T00:00:00+07:00"),
    description: "Mã đã hết hạn (demo)",
  },
]
