/** True when an error string looks like a Zod or structured-JSON parse failure. */
export function isStructuredParseFailure(error: string): boolean {
  const trimmed = error.trim()
  if (trimmed.length === 0) return false

  if (trimmed.includes('AI provider returned non-JSON structured content')) {
    return true
  }

  // Zod v3 multi-issue JSON dump
  if (trimmed.startsWith('[') && trimmed.includes('"code"')) {
    return true
  }

  // Common Zod single-line prefixes
  if (/^(Expected |Invalid |Required |Unrecognized )/.test(trimmed)) {
    return true
  }

  return false
}

/** Map structured-parse failures to a friendly bubble message; pass through others. */
export function friendlyCapabilityError(error: string, friendlyMessage: string): string {
  return isStructuredParseFailure(error) ? friendlyMessage : error
}
