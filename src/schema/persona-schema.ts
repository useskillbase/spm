import Ajv from "ajv";

const personaSchema = {
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
    description: { type: "string" as const, minLength: 1 },
    author: { type: "string" as const, minLength: 1 },
    license: { type: "string" as const, minLength: 1 },
    skills: {
      type: "object" as const,
      nullable: true,
      required: [] as string[],
      additionalProperties: { type: "string" as const },
    },
    character: {
      type: "object" as const,
      required: ["role"],
      additionalProperties: false,
      properties: {
        role: { type: "string" as const, minLength: 1 },
        tone: { type: "string" as const, nullable: true },
        guidelines: {
          type: "array" as const,
          items: { type: "string" as const },
          nullable: true,
        },
        instructions: { type: "string" as const, nullable: true },
      },
    },
    settings: {
      type: "object" as const,
      nullable: true,
      additionalProperties: false,
      properties: {
        temperature: { type: "number" as const, minimum: 0, maximum: 2 },
        top_p: { type: "number" as const, minimum: 0, maximum: 1 },
      },
    },
  },
};

const ajv = new Ajv.default({ allErrors: true });
const validateFn = ajv.compile(personaSchema);

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validatePersonaManifest(data: unknown): ValidationResult {
  const valid = validateFn(data);
  if (valid) {
    return { valid: true, errors: [] };
  }
  const errors = (validateFn.errors ?? []).map(
    (e: { instancePath?: string; message?: string }) => {
      const path = e.instancePath || "/";
      return `${path}: ${e.message}`;
    },
  );
  return { valid: false, errors };
}
