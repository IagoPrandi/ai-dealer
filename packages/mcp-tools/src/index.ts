export interface BoundedToolDefinition {
  name: string;
  description: string;
  allowedOperations: readonly string[];
}
