import { createNavigation } from "next-intl/navigation"

import { routing } from "./routing"

// Locale-aware navigation APIs. Use these instead of next/link and
// next/navigation so the active locale is preserved across navigation.
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing)
