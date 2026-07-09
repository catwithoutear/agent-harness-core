# Changelog

All notable changes to the glab skill will be documented in this file.

## [1.1.2] - 2026-03-12

### Added
- Documented the reliable pattern for posting inline MR diff notes with `glab api`
  using `--input` and `Content-Type: application/json`

### Fixed
- Warned against `glab api -f position[...]` for MR inline comments because it can
  create a plain `DiscussionNote` instead of a code-anchored `DiffNote`

## [1.1.1] - 2026-03-05

### Fixed
- Fixed `glab mr create` command for linking to issues: changed `glab mr create 123` to `glab mr create --related-issue 123` (or `-i 123`)
- Fixed automation script template to use `--output=json` and correct field name `.iid` instead of `.number`
- Fixed `last_updated` date to match actual update date

### Changed
- Migrated deprecated `glab ci artifact` command to `glab job artifact` (glab 1.88.0+)
- Updated `glab mr list` state filtering documentation: replaced `--state=` with dedicated flags (`--merged/-M`, `--closed/-c`, `--all/-A`)
- Updated `glab mr view` documentation: clarified default terminal output and `--web` flag for browser
- Added `--yes` flag example for `glab mr create` to skip confirmation

### Improved
- Removed duplicate paragraphs in SKILL.md
- Improved troubleshooting suggestions: replaced heavy `find / -name glab` with safer alternatives
- Enhanced `glab api` documentation with `--field` vs `--raw-field` distinction

## [1.1.0] - 2025-03-05

### Added
- Compatibility notes for glab versions 1.80.0+, 1.85.0+, and 1.88.0+
- New commands for glab 1.88.0: `glab auth configure-docker`, `glab auth dpop-gen`, `glab api graphql`
- Added `--output=ndjson` support documentation
- Added troubleshooting guide for common issues

### Changed
- Restructured skill with progressive disclosure pattern
- Separated detailed commands into `references/commands-detailed.md`
- Separated troubleshooting into `references/troubleshooting.md`

## [1.0.0] - 2024-12-01

### Added
- Initial release of glab skill
- Core workflows for MR, Issue, CI/CD, and Repository operations
- Authentication and self-hosted GitLab guidance
- Common patterns and automation examples
