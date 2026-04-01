# Installer Repository Guide (dummy-QtInstaller)

This document explains the principal elements of this installer repository, using the `dummy` target as the reference implementation.

## Repository Directory Structure (Quick Map)

Use this as the practical map of where to look first:

```text
dummy-QtInstaller/
|- build.ps1                           # Main build entrypoint
|- ci/                                 # Azure pipeline stages and tasks
|- sub/                                # Application sources code
|  |- cpp/                             # C++/Qt sources built into installer packages
|  |- npm/                             # Web/UI/e2e npm projects
|  \- doc/                             # Application documentation
|- targets/                            # Build targets configuration
|  |- default/                         # Cross-platform default configuration
|  |  |- cfg.ps1                       # Config file
|  |  \- installer/                    # IFW templates and package metadata
|  |- windows/                         # For Windows build host only
|  |  |- default/                      # Default configuration for Windows-host targets
|  |  |  |- cfg.ps1                    # Config file
|  |  |  \- installer/                 # IFW templates and package metadata
|  |  |- dummy/                        # For 'dummy' target 
|  |  |  |- cfg.ps1                    # Config file
|  |  |  \- installer/                 # IFW templates and package metadata
|  |  \- test/                         # For 'test' target (application tests)
|  |     |- cfg.ps1                    # Config file
|  |     \- installer/                 # IFW templates and package metadata 
|  \- linux/                           # For Linux build host only
|     |- default/                      # Default configuration for Windows-host targets
|     |  |- cfg.ps1                    # Config file
|     |  \- installer/                 # IFW templates, package metadata, docker and K8s configs
|     \- dummy/                        # For 'dummy' target  
|        |- cfg.ps1                    # IFW templates, package metadata, docker and K8s configs 
|        \- installer/                 # Linux dummy docker/kubernetes/install assets
|- output/                             # Generated IFW input and final installer artifact
|  |- config/                          # Generated config.xml + script.qs + icons
|  |- packages/                        # Generated package payloads (data/) and metadata (meta/)
|  \- DummyInstaller-1.2.3.exe         # Generated application installer
\- build/                              # CMake/Ninja build trees and temporary staging
```

How to read this structure:
- `sub/` contains source material to be built (C++, npm UI, help docs).
- `targets/` contains packaging rules and templates (what the installer should look like and include).
- `build/` contains compilation artifacts.
- `output/` contains installer-ready content and final packaging outputs.

Where you usually make changes:

- Add/modify product behavior: `targets/<os>/<target>/cfg.ps1`.
- Add installer pages/packages/meta: `targets/<os>/<target>/installer/...`.
- Change shared defaults: `targets/default/cfg.ps1` and `targets/default/installer/...`.
- Change build orchestration logic: `sub/cpp/astra/scripts/build-lib.ps1`.

Where you usually debug:

- Build failures: `build/<Configuration>/...` and script logs.
- Missing package payload: `output/packages/<package-id>/data/...`.
- IFW metadata issues: `output/config/config.xml` and `output/packages/<package-id>/meta/package.xml`.

## 1. Build Entry Point

- Script: `build.ps1`
- Role: thin wrapper that collects CLI parameters and forwards them to `Build-Installer`.

In practice, almost all installer behavior lives in the library script, not in `build.ps1` itself.

## 2. Core Build Orchestrator

- Script: `sub/cpp/astra/scripts/build-lib.ps1`
- Main function: `Build-Installer`

`Build-Installer` is the orchestration layer that executes the full pipeline:

1. Detect OS and resolve `output/` path.
2. Compute application version from git (unless `-SkipSetVersion`).
3. Clear old `output/` content.
4. Load and merge target configuration files.
5. Run builders (NPM, Help, C++/Qt, ...) depending on skip flags.
6. Copy installer templates and render `*.in` files with variables.
7. Add release notes and optional extra DLLs.
8. Build Qt IFW installer (`binarycreator`) on Windows.
9. Optionally sign installer (`signtool`) when certificate arguments are provided.
10. Optionally clean all generated output except final installer file.

## 3. Configuration Layering (How Target Customization Works)

The target configuration is merged in this order:

1. `targets/default/cfg.ps1`
2. `targets/<os>/default/cfg.ps1` (if present)
3. `targets/<os>/<target>/cfg.ps1`

Here, `<os>` means the operating system where the build is executed (`windows` on Windows build agents, `linux` on Linux build agents). It does not mean the final runtime OS of the installed application.

For this repo and `-Target dummy` on Windows:

- `targets/default/cfg.ps1` defines:
  - `appid = 'dummy'`
  - `installerName = 'DummyInstaller'`
  - NPM projects and packaging rules
- `targets/windows/dummy/cfg.ps1` adds help builder configuration.

This layering is the main extension mechanism: shared defaults at top, OS-specific overrides in the middle, target-specific overrides at the end.

### cfg.ps1 reference (what it contains)

Each `cfg.ps1` file must return a PowerShell hashtable (`@{ ... }`). The merged result is read by `Build-Installer` and used to configure the entire build.

Common top-level keys:

- `appid`
  - Logical application id used in template substitution (for example installer target directory names).
  - If omitted, the `-Target` value is used.

- `installerName`
  - Base file name for generated installer (version is appended later).
  - If omitted, defaults to `<Target>Installer`.

- `templateVars`
  - Hashtable of extra template variables injected into `*.in` files under `targets/**/installer`.
  - Merged with default variables: `APP_ID`, `APP_VERSION`, `TARGET_ID`.

- `builders`
  - Hashtable that enables/configures build domains.
  - Supported sections used by current scripts:
    - `npm`: NPM/UI packaging configuration.
    - `cpp`: C++/Qt build configuration.
    - `help`: online help deployment settings.

`builders.npm` (typical keys):

- `projects`: project map, usually keyed by project folder name under `sub/npm`.
- Project-level options seen in this repo include:
  - `buildCommand` (custom `npm run <command>`)
  - `category` and `order` (grouping/order in build)
  - `packTo` (where packed tgz is placed)

`builders.cpp` (typical use):

- Often an empty hashtable (`@{}`) to enable Qt/C++ build with defaults.
- Can carry overrides merged into `QtBuilder` parameters.

`builders.help` (typical keys):

- `dir`: relative path to help content source.

Dummy example from this repository:

- `targets/default/cfg.ps1`
  - defines `appid = 'dummy'`
  - defines `installerName = 'DummyInstaller'`
  - enables `builders.npm` and `builders.cpp`
- `targets/windows/dummy/cfg.ps1`
  - adds `builders.help.dir = 'sub\\doc\\docs\\help'`

Practical rule of thumb:

- Put cross-target defaults in `targets/default/cfg.ps1`.
- Put OS specifics in `targets/<os>/default/cfg.ps1`.
- Put product/edition specifics in `targets/<os>/<target>/cfg.ps1`.

### cfg.ps1 example code

Minimal base target config (`targets/default/cfg.ps1`):

```powershell
@{
  appid = 'dummy'
  installerName = 'DummyInstaller'

  templateVars = @{
    PRODUCT_NAME = 'Astra Dummy'
  }

  builders = @{
    npm = @{
      projects = @{
        telescope = @{ buildCommand = 'build' }
      }
    }
    cpp = @{}
  }
}
```

Windows target override (`targets/windows/dummy/cfg.ps1`):

```powershell
@{
  templateVars = @{
    PRODUCT_FLAVOR = 'Windows Dummy'
  }

  builders = @{
    help = @{
      dir = 'sub\doc\docs\help'
    }
  }
}
```

How merge behaves (same key path):

```text
Base    : builders.npm.projects.telescope.buildCommand = build
Override: builders.npm.projects.telescope.buildCommand = build:prod
Result  : builders.npm.projects.telescope.buildCommand = build:prod
```

How merge behaves (new key path):

```text
Base    : builders.cpp = @{}
Override: builders.help.dir = sub\doc\docs\help
Result  : builders.cpp is kept, builders.help is added
```

## 4. Builders and Their Inputs

### NPM Builder

- Script: `sub/cpp/astra/scripts/build-lib-npm.ps1`
- Class: `NpmBuilder`
- Source root: `sub/npm/`
- Typical output destination: `output/packages/<package-id>/data`

What it does:

- Resolves per-project configuration.
- Optionally computes version/hash and writes `version.ts` from template.
- Runs `npm i` or `npm ci`, optional Kendo activation, then build command.
- Copies built artifacts (`dist`) into installer package payload.
- Can download/upload cached artifacts in Azure pipeline mode.

### C++/Qt Builder

- Script: `sub/cpp/astra/scripts/build-lib-qt.ps1`
- Class: `QtBuilder`
- Source root: `sub/cpp/`
- Build root: `build/<Configuration>`
- Package payload destination: `output/packages/<package-id>/data`

What it does:

- Discovers Qt/CMake projects under `sub/cpp`.
- Applies dependency-aware project build ordering.
- Configures and builds with CMake + Ninja.
- Installs selected components into staging.
- Packs/uses cached artifacts when available.
- Deploys Qt runtime (Windows) into dedicated package.

### Help Builder

- Configured under `builders.help.dir`.
- For dummy Windows target, points to `sub/doc/docs/help`.
- Deployed into `output/packages/com.horiba.astra.help/data/help`.

## 5. Installer Templates and Package Metadata

Installer resources are copied from `targets/**/installer` into `output/`.

Important conventions:

- Files ending with `.in` are template files.
- Template placeholders use `@NAME@` syntax.
- Rendering is performed by `Write-TemplateFile` / `Copy-TemplateDir`.

Default template variables:

- `APP_ID`
- `APP_VERSION`
- `TARGET_ID`

Example:

- `targets/default/installer/config/config.xml.in`
  - `<Version>@APP_VERSION@</Version>`
  - `TargetDir` includes `astra-@APP_ID@`
- Rendered result is written to `output/config/config.xml`.

## 6. Qt Installer Framework Structure

Generated installer root in `output/` follows Qt IFW layout:

- `output/config/`
  - `config.xml`
  - `script.qs`
  - branding assets (icons/logo)
- `output/packages/<package-id>/`
  - `meta/package.xml`
  - `meta/installscript.qs` (optional)
  - `data/...` (payload)

`script.qs` is used for installer GUI/runtime behavior (for example target directory handling and previous installation detection).

## 7. Packaging, Signing, and Cleanup

When building on Windows and `-SkipInstaller` is not set:

1. Incomplete packages are removed.
2. `binarycreator` packs installer from `output/config` and `output/packages`.
3. Optional code signing runs if `-SignCertFile` and password are provided.

Cleanup behavior:

- By default, most files under `output/` are deleted after packaging, keeping final installer artifact.
- Use `-SkipCleanup` to preserve all intermediate output for diagnostics.

## 8. CI/CD Integration

Main pipeline stage:

- `ci/stages/create_installer.yml`

Key CI behavior:

- Downloads Qt Installer Framework tools.
- Authenticates NPM feeds.
- Downloads Telerik license and signing certificate.
- Calls `build.ps1` with target, configuration, and extra DLL path.
- Publishes `output/` as pipeline artifact.

## 9. Common Local Build Commands

PowerShell examples:

```powershell
# Standard release build for dummy target
pwsh ./build.ps1 -Target dummy -Configuration Release

# Keep intermediate output for troubleshooting
pwsh ./build.ps1 -Target dummy -Configuration Release -SkipCleanup

# Build only templates/packages, skip final installer pack
pwsh ./build.ps1 -Target dummy -SkipInstaller

# Skip UI and Help, build Qt + installer only
pwsh ./build.ps1 -Target dummy -SkipUI -SkipHelp
```

## 10. Mental Model Summary

Think of this repository in 4 layers:

1. Entry point (`build.ps1`) that forwards parameters.
2. Orchestrator (`Build-Installer`) that sequences the full process.
3. Target config layering (`targets/.../cfg.ps1`) that selects behavior.
4. Builders + templates that generate `output/config` and `output/packages`, then produce installer executable.

For new targets, the most important files to create or override are:

- `targets/<os>/<target>/cfg.ps1`
- `targets/<os>/<target>/installer/...` (or reuse `targets/default/installer/...`)
