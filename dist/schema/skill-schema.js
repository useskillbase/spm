import Ajv from "ajv";
/**
 * JSON Schema for SKILL.md YAML frontmatter (v3).
 */
const skillFrontmatterSchema = {
    type: "object",
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
            nullable: true,
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
        docs: {
            type: "object",
            nullable: true,
            additionalProperties: false,
            properties: {
                sources: {
                    type: "array",
                    items: {
                        type: "object",
                        required: ["type", "url"],
                        additionalProperties: false,
                        properties: {
                            type: { type: "string", enum: ["url", "llms-txt", "github"] },
                            url: { type: "string", minLength: 1 },
                            scope: { type: "string", enum: ["crawl", "page", "sitemap"], nullable: true },
                            depth: { type: "integer", minimum: 0, maximum: 5, nullable: true },
                            include: { type: "array", items: { type: "string" }, nullable: true },
                            exclude: { type: "array", items: { type: "string" }, nullable: true },
                            label: { type: "string", nullable: true },
                        },
                    },
                },
                delivery: { type: "string", enum: ["local", "remote", "auto"], nullable: true },
                priority_pages: {
                    type: "array",
                    items: { type: "string" },
                    nullable: true,
                },
            },
        },
        author: { type: "string", minLength: 1 },
        license: { type: "string", minLength: 1 },
        repository: { type: "string", nullable: true },
    },
};
/**
 * JSON Schema for legacy skill.json (v1/v2). Used by migration.
 */
const legacySkillSchema = {
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
    properties: {
        schema_version: { type: "integer", minimum: 1 },
        name: { type: "string" },
        version: { type: "string" },
        description: { type: "string" },
        dependencies: { type: "object" },
        author: { type: "string" },
        license: { type: "string" },
        entry: { type: "string" },
        compact_entry: { type: "string" },
        trigger: { type: "object" },
        language: { type: "string" },
        compatibility: { type: "object" },
        files: { type: "object" },
        works_with: { type: "array" },
        security: { type: "object" },
        quality: { type: "object" },
        repository: { type: "string" },
        docs: { type: "object" },
    },
};
const ajv = new Ajv.default({ allErrors: true });
const validateFrontmatter = ajv.compile(skillFrontmatterSchema);
const validateLegacy = ajv.compile(legacySkillSchema);
export function validateSkillFrontmatter(data) {
    const valid = validateFrontmatter(data);
    if (valid) {
        return { valid: true, errors: [] };
    }
    const errors = (validateFrontmatter.errors ?? []).map((e) => {
        const path = e.instancePath || "/";
        return `${path}: ${e.message}`;
    });
    return { valid: false, errors };
}
/** @deprecated Validate legacy skill.json. Use validateSkillFrontmatter for v3. */
export function validateSkillManifest(data) {
    const valid = validateLegacy(data);
    if (valid) {
        return { valid: true, errors: [] };
    }
    const errors = (validateLegacy.errors ?? []).map((e) => {
        const path = e.instancePath || "/";
        return `${path}: ${e.message}`;
    });
    return { valid: false, errors };
}
//# sourceMappingURL=skill-schema.js.map