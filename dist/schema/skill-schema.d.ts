export interface ValidationResult {
    valid: boolean;
    errors: string[];
}
export declare function validateSkillFrontmatter(data: unknown): ValidationResult;
/** @deprecated Validate legacy skill.json. Use validateSkillFrontmatter for v3. */
export declare function validateSkillManifest(data: unknown): ValidationResult;
//# sourceMappingURL=skill-schema.d.ts.map