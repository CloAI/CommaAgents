import { z } from "zod";

const PACKAGE_NAME_PATTERN = /^@[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/;
const ARTIFACT_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export const HubPersonSchema = z
  .object({
    name: z.string().min(1),
    email: z.string().email().optional(),
    url: z.string().url().optional(),
  })
  .strict();

export const HubEnvironmentVariableSchema = z
  .object({
    description: z.string().optional(),
    required: z.boolean().optional(),
    default: z.string().optional(),
    example: z.string().optional(),
  })
  .strict();

export const HubPermissionsSchema = z
  .object({
    network: z.boolean().optional(),
    filesystem: z.boolean().optional(),
    shell: z.boolean().optional(),
    executesCode: z.boolean().optional(),
  })
  .strict();

export const ProjectArtifactEntrySchema = z
  .object({
    path: z.string().min(1),
    expose: z.boolean().optional(),
    description: z.string().optional(),
  })
  .strict();

const ArtifactMapSchema = z.record(
  z.string().regex(ARTIFACT_NAME_PATTERN),
  ProjectArtifactEntrySchema,
);

export const CommaProjectManifestSchema = z
  .object({
    name: z.string().regex(PACKAGE_NAME_PATTERN),
    version: z
      .string()
      .regex(SEMVER_PATTERN, "Expected semantic version x.y.z"),
    description: z.string().optional(),
    license: z.string().optional(),
    author: HubPersonSchema.optional(),
    contributors: z.array(HubPersonSchema).optional(),
    keywords: z.array(z.string()).optional(),
    strategies: ArtifactMapSchema.optional(),
    agents: ArtifactMapSchema.optional(),
    flows: ArtifactMapSchema.optional(),
    tools: ArtifactMapSchema.optional(),
    entry: z.string().min(1).optional(),
    dependencies: z.record(z.string(), z.string()).optional(),
    environment: z
      .record(
        z.string().regex(/^[A-Z_][A-Z0-9_]*$/),
        HubEnvironmentVariableSchema,
      )
      .optional(),
    permissions: HubPermissionsSchema.optional(),
    links: z
      .object({
        homepage: z.string().url().optional(),
        repository: z.string().url().optional(),
        docs: z.string().url().optional(),
        issues: z.string().url().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const HubRegistryArtifactSchema = z
  .object({
    id: z.string().regex(ARTIFACT_NAME_PATTERN),
    ref: z.string().min(1),
    path: z.string().min(1),
    description: z.string().optional(),
  })
  .strict();

const RegistryArtifactListSchema = z.array(HubRegistryArtifactSchema);

export const HubPackageSchema = z
  .object({
    name: z.string().regex(PACKAGE_NAME_PATTERN),
    version: z.string().regex(SEMVER_PATTERN),
    description: z.string().optional(),
    license: z.string().optional(),
    path: z.string().min(1),
    author: HubPersonSchema.optional(),
    contributors: z.array(HubPersonSchema).optional(),
    keywords: z.array(z.string()).optional(),
    exports: z
      .object({
        strategies: RegistryArtifactListSchema,
        agents: RegistryArtifactListSchema,
        flows: RegistryArtifactListSchema,
        tools: RegistryArtifactListSchema,
      })
      .strict(),
    environment: z.record(HubEnvironmentVariableSchema).optional(),
    permissions: HubPermissionsSchema.optional(),
    links: z
      .object({
        homepage: z.string().url().optional(),
        repository: z.string().url().optional(),
        docs: z.string().url().optional(),
        issues: z.string().url().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const HubRegistrySchema = z
  .object({
    version: z.literal(1),
    packages: z.array(HubPackageSchema),
  })
  .strict();
