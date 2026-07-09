// FormData.get() types as `FormDataEntryValue | null` (string | File | null),
// so passing it straight to String() lets `no-base-to-string` flag it: a
// File's default toString() is "[object File]". These auth forms only ever
// submit text inputs, so narrow to string explicitly instead.
export function formField(form: FormData, key: string): string {
  const value = form.get(key)
  return typeof value === "string" ? value : ""
}
