import Ajv from "ajv";

/**
 * JSON Schema for SOUL.md YAML frontmatter (v3).
 * Only validates top-level and skillbase block structure.
 * OpenClaw-compatible fields are at root level.
 */
const soulFrontmatterSchema = {
  type: "object" as const,
  required: ["name", "version", "author", "license", "description"],
  additionalProperties: true, // OpenClaw may add unknown fields
  properties: {
    name: {
      type: "string" as const,
      pattern: "^[a-z0-9][a-z0-9-]*$",
    },
    version: {
      type: "string" as const,
      pattern: "^\\d+\\.\\d+\\.\\d+",
    },
    description: { type: "string" as const, minLength: 1 },
    author: { type: "string" as const, minLength: 1 },
    license: { type: "string" as const, minLength: 1 },
    skillbase: {
      type: "object" as const,
      nullable: true,
      additionalProperties: true,
      properties: {
        schema_version: { type: "integer" as const, minimum: 1 },
        trigger: {
          type: "object" as const,
          nullable: true,
          required: ["description", "tags", "priority"],
          properties: {
            description: { type: "string" as const, minLength: 1 },
            tags: { type: "array" as const, items: { type: "string" as const }, minItems: 1 },
            priority: { type: "integer" as const, minimum: 0, maximum: 100 },
          },
        },
        skills: {
          type: "object" as const,
          nullable: true,
          additionalProperties: { type: "string" as const },
        },
        settings: {
          type: "object" as const,
          nullable: true,
          properties: {
            temperature: { type: "number" as const, minimum: 0, maximum: 2 },
            top_p: { type: "number" as const, minimum: 0, maximum: 1 },
          },
        },
      },
    },
  },
};

/**
 * JSON Schema for legacy .person.json (v1/v2). Used by migration.
 */
const legacyPersonaSchema = {
  type: "object" as const,
  required: [
    "schema_version",
    "name",
    "version",
    "description",
    "author",
    "license",
    "character",
  ],
  properties: {
    schema_version: { type: "integer" as const, minimum: 1 },
    name: { type: "string" as const },
    version: { type: "string" as const },
    description: { type: "string" as const },
    author: { type: "string" as const },
    license: { type: "string" as const },
    skills: { type: "object" as const },
    character: {
      type: "object" as const,
      required: ["role"],
      properties: {
        role: { type: "string" as const },
        tone: { type: "string" as const },
        guidelines: { type: "array" as const },
        instructions: { type: "string" as const },
      },
    },
    settings: { type: "object" as const },
  },
};

const ajv = new Ajv.default({ allErrors: true });
const validateSoul = ajv.compile(soulFrontmatterSchema);
const validateLegacy = ajv.compile(legacyPersonaSchema);

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateSoulFrontmatter(data: unknown): ValidationResult {
  const valid = validateSoul(data);
  if (valid) {
    return { valid: true, errors: [] };
  }
  const errors = (validateSoul.errors ?? []).map(
    (e: { instancePath?: string; message?: string }) => {
      const path = e.instancePath || "/";
      return `${path}: ${e.message}`;
    },
  );
  return { valid: false, errors };
}

/** @deprecated Validate legacy .person.json. Use validateSoulFrontmatter for v3. */
export function validatePersonaManifest(data: unknown): ValidationResult {
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
