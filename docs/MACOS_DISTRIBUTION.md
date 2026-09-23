# macOS distribution status

`sh scripts/build_macos_app.sh` produces an arm64 `Notaeo.app` in
`macos/build/Build/Products/Release/`. It bundles the local FastAPI sidecar
and web assets, checks the sidecar architecture, and verifies an ad-hoc
signature. This build is suitable for local development and manual testing.

An ad-hoc signature does not make the app notarized or ready for general
download. A future public release needs a Developer ID certificate, hardened
runtime, notarization, and a delivery format such as a DMG or ZIP. The Apple
Developer Program cost is deferred until App Store or public distribution
work begins; none of those steps is required for the free local build.

Before distribution, verify a clean-machine install, app launch, authenticated
exports through the native save panel, sidecar shutdown, and that user data
is created under Application Support rather than inside the app bundle.
