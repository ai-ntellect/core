# Change Log

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/)
and this project adheres to [Semantic Versioning](http://semver.org/).

## [Unreleased]

### Added
- Documentation for new features of v0.12.0.

### Changed

### Fixed

## [0.12.0] - 2026-05-03

### Added
- **Complete Documentation Overhaul**: Rewrote the entire `/docs` folder to move from a "technical manual" to a "product-centric" guide.
- **Strategic Positioning**: Shifted project positioning to "Control Layer for LLM Systems" to emphasize deterministic routing over probabilistic autonomy.
- **Design Patterns Guide**: Added a new set of patterns in `docs/cas-dusages.md` (Task-based, Approval, Reactive, and Zero-Failure).
- **Updated AGENTS.md**: Refined agent instructions to ensure high-signal guidance for future AI contributors.

### Changed
- **README.md**: Redesigned as a high-conversion landing page with a focus on "Production-grade agents that don't lose control."
- **Core Thesis**: Refined the "Classifier-Controller Split" terminology across all documentation.
- **Terminology**: Clarified "Deterministic Routing" to distinguish between controlled retries/loops and uncontrolled probabilistic drift.

### Fixed
- Inconsistencies in versioning across README and documentation.
- Ambiguous phrasing regarding "no loops/retries" to correctly reflect the framework's support for controlled execution.
