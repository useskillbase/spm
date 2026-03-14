import Ajv from "ajv";

const skillSchema = {
  type: "object" as const,
  required: [
    "schema_version",
    "name",
    "version",
    "description",
    "dependencies",
    "author",
    "license",
  ],
  additionalProperties: false,
  properties: {
    schema_version: { type: "integer" as const, minimum: 1 },
    name: {
      type: "string" as const,
      pattern: "^[a-z0-9][a-z0-9-]*$",
    },
    version: {
      type: "string" as const,
      pattern: "^\\d+\\.\\d+\\.\\d+",
    },
    language: { type: "string" as const, enum: ["en"], nullable: true },
    description: { type: "string" as const, minLength: 1 },
    trigger: {
      type: "object" as const,
      nullable: true,
      required: ["description", "tags", "priority"],
      additionalProperties: false,
      properties: {
        description: { type: "string" as const, minLength: 1 },
        tags: { type: "array" as const, items: { type: "string" as const }, minItems: 1 },
        file_patterns: {
          type: "array" as const,
          items: { type: "string" as const },
          nullable: true,
        },
        priority: { type: "integer" as const, minimum: 0, maximum: 100 },
      },
    },
    dependencies: {
      type: "object" as const,
      required: [] as string[],
      additionalProperties: { type: "string" as const },
    },
    compatibility: {
      type: "object" as const,
      nullable: true,
      required: ["min_context_tokens", "requires", "models"],
      additionalProperties: false,
      properties: {
        min_context_tokens: { type: "integer" as const, minimum: 0 },
        requires: { type: "array" as const, items: { type: "string" as const } },
        models: { type: "array" as const, items: { type: "string" as const } },
      },
    },
    entry: { type: "string" as const, minLength: 1, nullable: true },
    compact_entry: { type: "string" as const, nullable: true },
    files: {
      type: "object" as const,
      nullable: true,
      required: [] as string[],
      additionalProperties: false,
      properties: {
        reference: {
          type: "array" as const,
          items: { type: "string" as const },
          nullable: true,
        },
        examples: {
          type: "array" as const,
          items: { type: "string" as const },
          nullable: true,
        },
        assets: {
          type: "array" as const,
          items: { type: "string" as const },
          nullable: true,
        },
        tests: {
          type: "array" as const,
          items: { type: "string" as const },
          nullable: true,
        },
      },
    },
    works_with: {
      type: "array" as const,
      nullable: true,
      items: {
        type: "object" as const,
        required: ["skill", "relationship", "description"],
        additionalProperties: false,
        properties: {
          skill: { type: "string" as const },
          relationship: { type: "string" as const, enum: ["input", "output", "parallel"] },
          description: { type: "string" as const },
        },
      },
    },
    security: {
      type: "object" as const,
      nullable: true,
      required: ["permissions"],
      additionalProperties: false,
      properties: {
        permissions: { type: "array" as const, items: { type: "string" as const } },
        file_scope: {
          type: "array" as const,
          items: { type: "string" as const },
          nullable: true,
        },
        integrity: { type: "string" as const, nullable: true },
      },
    },
    quality: {
      type: "object" as const,
      nullable: true,
      required: ["usage_count", "success_rate", "avg_rating", "confidence"],
      additionalProperties: false,
      properties: {
        usage_count: { type: "integer" as const, minimum: 0 },
        success_rate: { type: "number" as const, minimum: 0, maximum: 1 },
        avg_rating: { type: "number" as const, minimum: 0, maximum: 5 },
        confidence: { type: "number" as const, minimum: 0, maximum: 1 },
      },
    },
    author: { type: "string" as const, minLength: 1 },
    license: { type: "string" as const, minLength: 1 },
    repository: { type: "string" as const, nullable: true },
  },
};

const ajv = new Ajv.default({ allErrors: true });
const validateFn = ajv.compile(skillSchema);

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateSkillManifest(data: unknown): ValidationResult {
  const valid = validateFn(data);
  if (valid) {
    return { valid: true, errors: [] };
  }
  const errors = (validateFn.errors ?? []).map((e: { instancePath?: string; message?: string }) => {
    const path = e.instancePath || "/";
    return `${path}: ${e.message}`;
  });
  return { valid: false, errors };
}
