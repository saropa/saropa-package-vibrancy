# Plan: Private Registry Authentication

## Problem

Teams using private Pub servers (e.g., self-hosted `pub_server`, Cloudsmith,
Artifactory) cannot use the extension because it queries pub.dev exclusively.
The extension fails silently or shows "not found" for private packages.

Similar extensions support URL-based authentication for private registries, storing
credentials securely in VS Code's SecretStorage.

## Goal

1. Support custom Pub registry URLs per package or globally
2. Securely store authentication tokens
3. Query private registries alongside pub.dev
4. Provide commands to add/remove authentication

## How It Works

### Registry Resolution

For each package, determine the registry URL:

1. Check if `pubspec.yaml` has a `hosted` URL:
   ```yaml
   dependencies:
     my_private_pkg:
       hosted:
         url: https://pub.example.com
       version: ^1.0.0
   ```

2. Check if user has configured a registry override:
   ```json
   "saropaPackageVibrancy.registries": {
     "https://pub.example.com": {
       "token": "secret stored in SecretStorage"
     }
   }
   ```

3. Default to `https://pub.dev`

### Authentication Flow

1. User runs "Add Registry Authentication" command
2. Quick input prompts for registry URL
3. Quick input prompts for token (secure input, not shown)
4. Token stored in VS Code SecretStorage
5. Extension reads token when querying that registry

### API Requests

When fetching package data:
```typescript
const url = getRegistryUrl(packageName);
const token = await getRegistryToken(url);

const response = await fetch(`${url}/api/packages/${packageName}`, {
  headers: token ? { 'Authorization': `Bearer ${token}` } : {}
});
```

## Configuration

### Registry URL Mapping

```json
{
  "saropaPackageVibrancy.registries": {
    "type": "object",
    "default": {},
    "description": "Registry configuration for private Pub servers. Tokens stored securely in VS Code Secret Storage.",
    "additionalProperties": {
      "type": "object",
      "properties": {
        "name": { "type": "string", "description": "Display name for this registry" },
        "packages": {
          "type": "array",
          "items": { "type": "string" },
          "description": "Package names hosted on this registry (empty = auto-detect from pubspec)"
        }
      }
    }
  }
}
```

Example:
```json
{
  "saropaPackageVibrancy.registries": {
    "https://pub.internal.company.com": {
      "name": "Internal Pub",
      "packages": ["internal_utils", "company_design_system"]
    }
  }
}
```

### Credential Storage

Tokens are NOT stored in settings (security risk). They are stored in
VS Code's SecretStorage API under keys like:
```
saropaPackageVibrancy.registry.https://pub.internal.company.com
```

## UI: Commands

| Command | Title |
|---------|-------|
| `saropaPackageVibrancy.addRegistryAuth` | Saropa: Add Registry Authentication |
| `saropaPackageVibrancy.removeRegistryAuth` | Saropa: Remove Registry Authentication |
| `saropaPackageVibrancy.listRegistries` | Saropa: List Configured Registries |

### Add Registry Flow

1. Command: "Add Registry Authentication"
2. Input box: "Registry URL" → `https://pub.internal.company.com`
3. Input box: "Display name (optional)" → `Internal Pub`
4. Input box: "Authentication token" → (password input, not visible)
5. Confirmation: "✓ Added authentication for Internal Pub"

### Remove Registry Flow

1. Command: "Remove Registry Authentication"
2. Quick pick: Select from configured registries
3. Confirmation: "Remove authentication for Internal Pub?"
4. Result: "✓ Removed authentication for Internal Pub"

### List Registries Flow

1. Command: "List Configured Registries"
2. Quick pick shows all registries with auth status:
   ```
   ┌─────────────────────────────────────────┐
   │ Configured Registries                    │
   ├─────────────────────────────────────────┤
   │ 🔒 Internal Pub (pub.internal.com)      │
   │ 🔒 Artifactory (artifactory.company.com) │
   │ 🌐 pub.dev (default, no auth)            │
   └─────────────────────────────────────────┘
   ```

## Changes

### New File: `src/services/registry-service.ts`

```typescript
interface RegistryConfig {
  readonly url: string;
  readonly name: string;
  readonly packages: string[];
}

export class RegistryService implements Disposable {
  constructor(
    private readonly context: ExtensionContext,
    private readonly secretStorage: SecretStorage
  );
  
  async getRegistryForPackage(packageName: string, pubspecPath: string): Promise<string>;
  async getToken(registryUrl: string): Promise<string | null>;
  async setToken(registryUrl: string, token: string): Promise<void>;
  async removeToken(registryUrl: string): Promise<void>;
  async listRegistries(): Promise<RegistryConfig[]>;
}
```

### New File: `src/providers/registry-commands.ts`

- `addRegistryAuth` command handler
- `removeRegistryAuth` command handler
- `listRegistries` command handler

### Modified: `src/services/pub-dev-api.ts`

- Accept `RegistryService` dependency
- Use registry URL from service instead of hardcoded pub.dev
- Include auth token in requests when available

### Modified: `src/extension-activation.ts`

- Create `RegistryService` instance
- Register registry commands
- Pass service to API clients

### Modified: `package.json`

```json
{
  "contributes": {
    "commands": [
      {
        "command": "saropaPackageVibrancy.addRegistryAuth",
        "title": "Saropa: Add Registry Authentication",
        "icon": "$(key)"
      },
      {
        "command": "saropaPackageVibrancy.removeRegistryAuth",
        "title": "Saropa: Remove Registry Authentication"
      },
      {
        "command": "saropaPackageVibrancy.listRegistries",
        "title": "Saropa: List Configured Registries"
      }
    ],
    "configuration": {
      "properties": {
        "saropaPackageVibrancy.registries": {
          "type": "object",
          "default": {},
          "description": "Registry configuration for private Pub servers"
        }
      }
    }
  }
}
```

### Tests

- `src/test/services/registry-service.test.ts`:
  - Resolves registry from pubspec hosted URL
  - Falls back to pub.dev
  - Stores token in SecretStorage
  - Retrieves token for requests
  - Handles missing tokens gracefully

- `src/test/providers/registry-commands.test.ts`:
  - Add registry flow
  - Remove registry flow
  - List registries

## Security Considerations

1. **Tokens never in settings.json**: Only stored in SecretStorage
2. **Tokens never logged**: Redact in all logging
3. **HTTPS enforced**: Reject non-HTTPS registry URLs
4. **Token scope**: User should create read-only tokens
5. **No token sharing**: Per-workspace or global, never synced

## Pub Server Compatibility

Tested with:
- [pub_server](https://github.com/nicklockwood/pub_server) (self-hosted)
- Cloudsmith
- Artifactory (Dart support)
- JFrog

API compatibility: All should implement the pub.dev API spec at
`/api/packages/{name}`.

## Out of Scope

- OAuth flows (only static tokens)
- Certificate pinning
- Registry package search (only known packages from pubspec)
- Publishing to private registries
- Registry health checks
