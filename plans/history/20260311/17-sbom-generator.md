# Plan: SBOM Generator (Software Bill of Materials)

## Problem

US Executive Order 14028 requires SBOMs for government software procurement.
Enterprise security teams increasingly demand them. No Dart/Flutter tool
generates a standards-compliant SBOM. Developers manually assemble dependency
lists for audits — or skip it entirely.

## Goal

One command generates a CycloneDX JSON document listing all dependencies with
versions, licenses, publishers, vulnerability status, and package URLs.
Saropa already has all the data — this is a new export format.

## Why CycloneDX

CycloneDX is the OWASP standard, widely supported by security toolchains
(Snyk, Dependency-Track, OWASP Dependency-Check, GitHub). It has a simpler
spec than SPDX for dependency-focused SBOMs. The JSON format is machine-
readable and validatable against the official schema.

## CycloneDX Structure

```json
{
  "bomFormat": "CycloneDX",
  "specVersion": "1.5",
  "serialNumber": "urn:uuid:<generated>",
  "version": 1,
  "metadata": {
    "timestamp": "2026-03-11T14:00:00Z",
    "component": {
      "type": "application",
      "name": "<project-name>",
      "version": "<project-version>"
    },
    "tools": [{
      "vendor": "Saropa",
      "name": "Package Vibrancy",
      "version": "<extension-version>"
    }]
  },
  "components": [
    {
      "type": "library",
      "name": "http",
      "version": "1.2.0",
      "purl": "pkg:pub/http@1.2.0",
      "licenses": [{ "license": { "id": "BSD-3-Clause" } }],
      "publisher": "dart.dev",
      "properties": [
        { "name": "vibrancy:score", "value": "92" },
        { "name": "vibrancy:category", "value": "vibrant" }
      ]
    }
  ],
  "vulnerabilities": [
    {
      "id": "GHSA-xxxx-yyyy",
      "source": { "name": "OSV", "url": "https://osv.dev" },
      "ratings": [{ "severity": "medium", "score": 5.3 }],
      "affects": [{
        "ref": "pkg:pub/vulnerable_pkg@1.0.0"
      }]
    }
  ]
}
```

## How It Works

### Step 1: Collect Data

From existing scan results, gather per package:
- Name, version (from `PackageDependency`)
- License (from `PubDevPackageInfo` — requires license plan #3, or falls
  back to `null`)
- Publisher (from `PubDevPackageInfo`)
- Vulnerabilities (from Vulnerability Radar plan #03, or empty array)
- Vibrancy score and category (custom properties)

### Step 2: Build PURL

Package URLs follow the PURL spec: `pkg:pub/<name>@<version>`

### Step 3: Read Project Metadata

From `pubspec.yaml`:
- Project name
- Project version

### Step 4: Generate UUID

Use `crypto.randomUUID()` for the serial number.

### Step 5: Write File

Output to `report/YYYY-MM-DD_HH-mm-ss_sbom.cdx.json` alongside existing
report exports.

## Validation

The generated SBOM should validate against the CycloneDX 1.5 JSON schema.
Include a dev-dependency on `@cyclonedx/cyclonedx-library` or validate via
the public schema URL during tests.

## Changes

### New File: `src/services/sbom-generator.ts`

- `generateSbom(results, projectMeta): CycloneDxBom` — builds the
  structured object
- `writeSbom(bom, outputDir): Promise<string>` — writes to file,
  returns path

### New File: `src/scoring/purl-builder.ts`

- `buildPurl(name, version): string` — `pkg:pub/<name>@<version>`
- Pure function, trivial but isolated for testability

### New Types in `src/types.ts`

```typescript
interface SbomMetadata {
  readonly projectName: string;
  readonly projectVersion: string;
  readonly extensionVersion: string;
  readonly timestamp: string;
}
```

### Modified: `src/extension-activation.ts`

- Register new command `saropaPackageVibrancy.exportSbom`

### Modified: `src/services/report-exporter.ts`

- Add SBOM as a third export format alongside JSON and Markdown
- Or: keep SBOM as a separate command since it serves a different audience

### Modified: `package.json`

- Add command: `saropaPackageVibrancy.exportSbom` / "Saropa: Export SBOM
  (CycloneDX)"

### Tests

- `src/test/services/sbom-generator.test.ts` — valid CycloneDX structure:
  required fields present, PURL format correct, components match scan
  results, vulnerabilities section (when available), empty results
- `src/test/scoring/purl-builder.test.ts` — format: simple name, scoped
  name, version with pre-release

## Out of Scope

- SPDX format (CycloneDX only for v1)
- Transitive dependency inclusion (direct deps only, matching scan scope)
- Uploading SBOM to a registry (Dependency-Track, etc.)
- Signing the SBOM document
