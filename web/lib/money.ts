import { formatVndFull } from "@/lib/shared"

/**
 * Exact VND amount for the admin and venue-owner workspaces, e.g. `360.000 VND`
 * (players keep the compact `360K` of `formatVnd`). Built on the hand-rolled
 * `formatVndFull` so server and client renders agree.
 */
export const formatVndText = (vnd: number) =>
  formatVndFull(vnd).replace("₫", " VND")
