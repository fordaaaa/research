import Foundation

/// Filename and navigation policy shared by the WebKit delegates.
enum DownloadHandler {
    static let maxFilenameLength = 255

    /// Returns a filesystem-safe filename. Never returns a path, an empty
    /// string, `.`/`..`, a leading-dot name, or a name over 255 UTF-8 bytes.
    /// Falls back to a sanitized `fallback` (ultimately `"download"`).
    static func sanitizedExportFilename(_ proposed: String?, fallback: String) -> String {
        let safeFallback = sanitizeComponent(fallback) ?? "download"
        guard let cleaned = sanitizeComponent(proposed), !cleaned.isEmpty else {
            return safeFallback
        }
        return cleaned
    }

    /// True only for remote http(s) URLs, which the shell opens in the
    /// default browser. Loopback, blob:, data:, file:, and about: URLs
    /// must never open externally (blob:/data: are bridged, loopback stays
    /// in-app to preserve the `desktop_token` -> cookie auth flow).
    static func shouldOpenExternally(url: URL) -> Bool {
        guard let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https" else {
            return false
        }
        guard let host = url.host?.lowercased() else { return false }
        return !isLoopbackHost(host)
    }

    /// True only for loopback http(s) navigations (the bundled sidecar).
    /// Preserves auth behavior: any path/query on 127.0.0.1 (including
    /// `?desktop_token=...`) stays in-app; everything else is cancelled here
    /// and handled via the browser handoff or the download bridge.
    static func shouldAllowNavigation(url: URL) -> Bool {
        guard let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https" else {
            return false
        }
        guard let host = url.host?.lowercased(), isLoopbackHost(host) else { return false }
        return true
    }

    // MARK: - Private

    private static func isLoopbackHost(_ host: String) -> Bool {
        host == "127.0.0.1" || host == "localhost" || host == "::1" || host == "[::1]"
    }

    private static func sanitizeComponent(_ name: String?) -> String? {
        guard var value = name?.trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty else {
            return nil
        }
        // Strip any directory portion (handles both / and \ separators).
        let separators = CharacterSet(charactersIn: "/\\")
        if value.rangeOfCharacter(from: separators) != nil {
            let pieces = value.components(separatedBy: separators).filter { !$0.isEmpty }
            guard let last = pieces.last else { return nil }
            value = last.trimmingCharacters(in: .whitespacesAndNewlines)
            if value.isEmpty { return nil }
        }
        if value == "." || value == ".." { return nil }
        // Drop controls + characters unsafe on macOS/Windows/shells.
        var forbidden = CharacterSet(charactersIn: ":/\\*?\"<>|")
        forbidden.formUnion(.controlCharacters)
        forbidden.insert(charactersIn: "\u{7F}")
        value = value.components(separatedBy: forbidden).joined()
        value = value.trimmingCharacters(in: .whitespacesAndNewlines)
        if value.isEmpty || value == "." || value == ".." { return nil }
        // Avoid hidden dotfiles from server/probed names.
        if value.hasPrefix(".") {
            value = "_" + value
        }
        // Truncate to filesystem-safe length, preserving the extension.
        if value.utf8.count > maxFilenameLength {
            let ns = value as NSString
            let ext = ns.pathExtension
            if !ext.isEmpty, ext.utf8.count <= 16 {
                let baseBudget = maxFilenameLength - ext.utf8.count - 1
                var base = prefixFitting(ns.deletingPathExtension, maxBytes: baseBudget)
                base = base.trimmingCharacters(in: .whitespacesAndNewlines)
                if base.isEmpty { base = "download" }
                value = base + "." + ext
            } else {
                value = prefixFitting(value, maxBytes: maxFilenameLength)
            }
        }
        return value.isEmpty ? nil : value
    }

    private static func prefixFitting(_ value: String, maxBytes: Int) -> String {
        var result = ""
        var bytes = 0
        for character in value {
            let next = String(character).utf8.count
            if bytes + next > maxBytes { break }
            result.append(character)
            bytes += next
        }
        return result
    }
}
