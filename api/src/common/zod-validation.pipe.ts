import { BadRequestException, type PipeTransform } from "@nestjs/common"
import type { ZodType, infer as ZodInfer } from "zod"

/**
 * Validate a handler param (query/param/body) against a zod schema, throwing
 * `BadRequestException` on a miss so the central exception filter renders the
 * same `{ error }` shape as every other failure. Reuses the app's existing zod
 * schemas verbatim — applied per-param as `@Query(new ZodValidationPipe(schema))`.
 */
export class ZodValidationPipe<T extends ZodType> implements PipeTransform {
  constructor(private readonly schema: T) {}

  transform(value: unknown): ZodInfer<T> {
    const result = this.schema.safeParse(value)
    if (!result.success) {
      const detail = result.error.issues
        .map((issue) => {
          const path = issue.path.join(".")
          return path ? `${path}: ${issue.message}` : issue.message
        })
        .join("; ")
      throw new BadRequestException(detail || "Invalid input")
    }
    return result.data
  }
}
