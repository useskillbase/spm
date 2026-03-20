import Ajv from "ajv";

/**
 * JSON Schema for SKILL.md YAML frontmatter (v3).
 */
const skillFrontmatterSchema = {
  type: "object" as const,
  required: [
    "schema_version",
    "name",
    "version",
    "description",
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
      nullable: true,
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
    docs: {
      type: "object" as const,
      nullable: true,
      additionalProperties: false,
      properties: {
        sources: {
          type: "array" as const,
          items: {
            type: "object" as const,
            required: ["type", "url"],
            additionalProperties: false,
            properties: {
              type: { type: "string" as const, enum: ["url", "llms-txt", "github"] },
              url: { type: "string" as const, minLength: 1 },
              scope: { type: "string" as const, enum: ["crawl", "page", "sitemap"], nullable: true },
              depth: { type: "integer" as const, minimum: 0, maximum: 5, nullable: true },
              include: { type: "array" as const, items: { type: "string" as const }, nullable: true },
              exclude: { type: "array" as const, items: { type: "string" as const }, nullable: true },
              label: { type: "string" as const, nullable: true },
            },
          },
        },
        delivery: { type: "string" as const, enum: ["local", "remote", "auto"], nullable: true },
        priority_pages: {
          type: "array" as const,
          items: { type: "string" as const },
          nullable: true,
        },
      },
    },
    author: { type: "string" as const, minLength: 1 },
    license: { type: "string" as const, minLength: 1 },
    repository: { type: "string" as const, nullable: true },
  },
};

/**
 * JSON Schema for legacy skill.json (v1/v2). Used by migration.
 */
const legacySkillSchema = {
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
  properties: {
    schema_version: { type: "integer" as const, minimum: 1 },
    name: { type: "string" as const },
    version: { type: "string" as const },
    description: { type: "string" as const },
    dependencies: { type: "object" as const },
    author: { type: "string" as const },
    license: { type: "string" as const },
    entry: { type: "string" as const },
    compact_entry: { type: "string" as const },
    trigger: { type: "object" as const },
    language: { type: "string" as const },
    compatibility: { type: "object" as const },
    files: { type: "object" as const },
    works_with: { type: "array" as const },
    security: { type: "object" as const },
    quality: { type: "object" as const },
    repository: { type: "string" as const },
    docs: { type: "object" as const },
  },
};

const ajv = new Ajv.default({ allErrors: true });
const validateFrontmatter = ajv.compile(skillFrontmatterSchema);
const validateLegacy = ajv.compile(legacySkillSchema);

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateSkillFrontmatter(data: unknown): ValidationResult {
  const valid = validateFrontmatter(data);
  if (valid) {
    return { valid: true, errors: [] };
  }
  const errors = (validateFrontmatter.errors ?? []).map(
    (e: { instancePath?: string; message?: string }) => {
      const path = e.instancePath || "/";
      return `${path}: ${e.message}`;
    },
  );
  return { valid: false, errors };
}

/** @deprecated Validate legacy skill.json. Use validateSkillFrontmatter for v3. */
export function validateSkillManifest(data: unknown): ValidationResult {
  const valid = validateLegacy(data);
  if (valid) {
    return { valid: true, errors: [] };
  }
  const errors = (validateLegacy.errors ?? []).map(
    (e: { instancePath?: string; message?: string }) => {
      const path = e.instancePath || "/";
      return `${path}: ${e.message}`;
    },
  );
  return { valid: false, errors };
}
