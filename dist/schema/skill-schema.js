import Ajv from "ajv";
const skillSchema = {
    type: "object",
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
        schema_version: { type: "integer", minimum: 1 },
        name: {
            type: "string",
            pattern: "^[a-z0-9][a-z0-9-]*$",
        },
        version: {
            type: "string",
            pattern: "^\\d+\\.\\d+\\.\\d+",
        },
        language: { type: "string", enum: ["en"], nullable: true },
        description: { type: "string", minLength: 1 },
        trigger: {
            type: "object",
            nullable: true,
            required: ["description", "tags", "priority"],
            additionalProperties: false,
            properties: {
                description: { type: "string", minLength: 1 },
                tags: { type: "array", items: { type: "string" }, minItems: 1 },
                file_patterns: {
                    type: "array",
                    items: { type: "string" },
                    nullable: true,
                },
                priority: { type: "integer", minimum: 0, maximum: 100 },
            },
        },
        dependencies: {
            type: "object",
            required: [],
            additionalProperties: { type: "string" },
        },
        compatibility: {
            type: "object",
            nullable: true,
            required: ["min_context_tokens", "requires", "models"],
            additionalProperties: false,
            properties: {
                min_context_tokens: { type: "integer", minimum: 0 },
                requires: { type: "array", items: { type: "string" } },
                models: { type: "array", items: { type: "string" } },
            },
        },
        entry: { type: "string", minLength: 1, nullable: true },
        compact_entry: { type: "string", nullable: true },
        files: {
            type: "object",
            nullable: true,
            required: [],
            additionalProperties: false,
            properties: {
                reference: {
                    type: "array",
                    items: { type: "string" },
                    nullable: true,
                },
                examples: {
                    type: "array",
                    items: { type: "string" },
                    nullable: true,
                },
                assets: {
                    type: "array",
                    items: { type: "string" },
                    nullable: true,
                },
                tests: {
                    type: "array",
                    items: { type: "string" },
                    nullable: true,
                },
            },
        },
        works_with: {
            type: "array",
            nullable: true,
            items: {
                type: "object",
                required: ["skill", "relationship", "description"],
                additionalProperties: false,
                properties: {
                    skill: { type: "string" },
                    relationship: { type: "string", enum: ["input", "output", "parallel"] },
                    description: { type: "string" },
                },
            },
        },
        security: {
            type: "object",
            nullable: true,
            required: ["permissions"],
            additionalProperties: false,
            properties: {
                permissions: { type: "array", items: { type: "string" } },
                file_scope: {
                    type: "array",
                    items: { type: "string" },
                    nullable: true,
                },
                integrity: { type: "string", nullable: true },
            },
        },
        quality: {
            type: "object",
            nullable: true,
            required: ["usage_count", "success_rate", "avg_rating", "confidence"],
            additionalProperties: false,
            properties: {
                usage_count: { type: "integer", minimum: 0 },
                success_rate: { type: "number", minimum: 0, maximum: 1 },
                avg_rating: { type: "number", minimum: 0, maximum: 5 },
                confidence: { type: "number", minimum: 0, maximum: 1 },
            },
        },
        author: { type: "string", minLength: 1 },
        license: { type: "string", minLength: 1 },
        repository: { type: "string", nullable: true },
    },
};
const ajv = new Ajv.default({ allErrors: true });
const validateFn = ajv.compile(skillSchema);
export function validateSkillManifest(data) {
    const valid = validateFn(data);
    if (valid) {
        return { valid: true, errors: [] };
    }
    const errors = (validateFn.errors ?? []).map((e) => {
        const path = e.instancePath || "/";
        return `${path}: ${e.message}`;
    });
    return { valid: false, errors };
}
//# sourceMappingURL=skill-schema.js.map