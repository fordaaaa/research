// Pure RESEARCH_READY parsing + launch-URL building. No WinForms refs
// so the portable net10 test project can run anywhere.
// Reuses backend/desktop.py: the sidecar prints "RESEARCH_READY http://127.0.0.1:<port>"
// from an ephemeral loopback bind; this unit validates that announcement as
// loopback http ONLY before the token is ever attached.
using System.Security.Cryptography;

namespace Notaeo;

internal static class DesktopStartup
{
    internal const string ReadyPrefix = "RESEARCH_READY ";

    internal static bool IsLoopbackHost(string? host)
    {
        if (string.IsNullOrWhiteSpace(host))
        {
            return false;
        }

        var normalized = host.Trim().ToLowerInvariant();
        if (normalized.StartsWith("[") && normalized.EndsWith("]"))
        {
            normalized = normalized[1..^1];
        }

        return normalized == "127.0.0.1"
            || normalized == "localhost"
            || normalized == "::1";
    }

    internal static bool TryParseReadyUrl(string? line, out Uri? url)
    {
        url = null;
        if (string.IsNullOrWhiteSpace(line))
        {
            return false;
        }

        var trimmed = line.Trim().TrimEnd('\r');
        if (!trimmed.StartsWith(ReadyPrefix, StringComparison.Ordinal))
        {
            return false;
        }

        var raw = trimmed[ReadyPrefix.Length..].Trim();
        if (!Uri.TryCreate(raw, UriKind.Absolute, out var candidate))
        {
            return false;
        }

        if (!string.Equals(candidate.Scheme, Uri.UriSchemeHttp, StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        if (!IsLoopbackHost(candidate.Host))
        {
            return false;
        }

        if (candidate.IsDefaultPort || candidate.Port <= 0 ||
            !string.IsNullOrEmpty(candidate.UserInfo) || !string.IsNullOrEmpty(candidate.Query) ||
            !string.IsNullOrEmpty(candidate.Fragment) || candidate.AbsolutePath != "/")
        {
            return false;
        }

        url = candidate;
        return true;
    }

    // Scan a captured stdout buffer for the first valid READY announcement.
    // Robust to extra log lines before/after and CRLF line endings.
    internal static bool TryFindReadyUrl(string? output, out Uri? url)
    {
        url = null;
        if (string.IsNullOrEmpty(output))
        {
            return false;
        }

        var lines = output.Split('\n');
        foreach (var line in lines)
        {
            if (TryParseReadyUrl(line, out var candidate))
            {
                url = candidate;
                return true;
            }
        }

        return false;
    }

    // Attach the per-launch token only after the READY URL validated as
    // loopback http. Callers must pass an already-validated ready URL.
    // Native API clients send the token as X-Notaeo-Desktop-Token; this helper
    // remains for the legacy query-token exchange path and for tests.
    internal static string BuildLaunchUrl(Uri ready, string token)
    {
        ArgumentNullException.ThrowIfNull(ready);
        if (string.IsNullOrEmpty(token))
        {
            throw new ArgumentException("Desktop token must not be empty.", nameof(token));
        }

        var builder = new UriBuilder(ready)
        {
            Query = $"desktop_token={Uri.EscapeDataString(token)}",
        };
        return builder.Uri.AbsoluteUri;
    }

    internal static string GetOrigin(Uri url)
    {
        ArgumentNullException.ThrowIfNull(url);
        return url.GetLeftPart(UriPartial.Authority);
    }

    internal static string CreateLaunchToken()
    {
        // Unpredictable per launch: 128-bit GUID plus 256-bit RNG, hex-encoded.
        var random = RandomNumberGenerator.GetBytes(32);
        return Guid.NewGuid().ToString("N") + Convert.ToHexString(random).ToLowerInvariant();
    }
}
