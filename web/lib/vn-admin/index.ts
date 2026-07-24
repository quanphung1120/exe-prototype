import units from "./units.json"

/**
 * Vietnam's post-2025-reform administrative units: 34 provinces/cities, each
 * with its wards/communes (the district layer was dropped in the reform, so
 * this is a two-tier province → ward dataset). Bundled statically so lookups
 * are deterministic for SSR and work offline (see CLAUDE.md on seed/config
 * determinism) — no runtime fetch.
 */

export interface Ward {
  code: string
  name: string
}

export interface Province {
  code: string
  name: string
  wards: Ward[]
}

export const PROVINCES: Province[] = units

export const PROVINCE_OPTIONS: { code: string; name: string }[] =
  PROVINCES.map((p) => ({ code: p.code, name: p.name }))

export function wardsOf(provinceCode: string | undefined): Ward[] {
  if (!provinceCode) return []
  return PROVINCES.find((p) => p.code === provinceCode)?.wards ?? []
}

export function provinceCodeByName(name: string | undefined): string | undefined {
  if (!name) return undefined
  return PROVINCES.find((p) => p.name === name)?.code
}
