export class MemoryNotFoundError extends Error { readonly code = "NOT_FOUND" as const; }
export class MemoryPermissionError extends Error { readonly code = "FORBIDDEN" as const; }
export class MemoryValidationError extends Error { readonly code = "INVALID" as const; }
