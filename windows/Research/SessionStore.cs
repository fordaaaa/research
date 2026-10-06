// Account session + API wiring for the native shell. Portable except for the
// default file store + DPAPI protector (Windows-only at runtime; tests inject
// in-memory fakes and never touch AppData or real DPAPI).
using System.Security.Cryptography;
using System.Runtime.Versioning;
using System.Text;
using System.Text.Json;

namespace Notaeo;

internal interface IAccountFileStore
{
    bool Exists();
    string? ReadAllText();
    void WriteAllText(string content);
    void Delete();
    void EnsureDirectory();
}

internal sealed class FileAccountStore : IAccountFileStore
{
    public bool Exists()
    {
        try { return File.Exists(BackendProcess.AccountFilePath()); }
        catch (Exception) { return false; }
    }

    public string? ReadAllText()
    {
        try { return File.ReadAllText(BackendProcess.AccountFilePath()); }
        catch (Exception) { return null; }
    }

    public void WriteAllText(string content)
    {
        var path = BackendProcess.AccountFilePath();
        var dir = Path.GetDirectoryName(path);
        if (!string.IsNullOrEmpty(dir))
        {
            Directory.CreateDirectory(dir);
        }

        File.WriteAllText(path, content);
    }

    public void Delete()
    {
        try
        {
            var path = BackendProcess.AccountFilePath();
            if (File.Exists(path))
            {
                File.Delete(path);
            }
        }
        catch (Exception)
        {
        }
    }

    public void EnsureDirectory()
    {
        try
        {
            var path = BackendProcess.AccountFilePath();
            var dir = Path.GetDirectoryName(path);
            if (!string.IsNullOrEmpty(dir))
            {
                Directory.CreateDirectory(dir);
            }
        }
        catch (Exception)
        {
        }
    }
}

internal interface ITokenProtector
{
    string Protect(string plaintext);
    string? Unprotect(string protectedPayload);
}

[SupportedOSPlatform("windows")]
internal sealed class DpapiTokenProtector : ITokenProtector
{
    public string Protect(string plaintext)
    {
        var bytes = Encoding.UTF8.GetBytes(plaintext ?? string.Empty);
        var enc = ProtectedData.Protect(bytes, null, DataProtectionScope.CurrentUser);
        return Convert.ToBase64String(enc);
    }

    public string? Unprotect(string protectedPayload)
    {
        try
        {
            if (string.IsNullOrEmpty(protectedPayload))
            {
                return null;
            }

            var enc = Convert.FromBase64String(protectedPayload);
            var dec = ProtectedData.Unprotect(enc, null, DataProtectionScope.CurrentUser);
            var s = Encoding.UTF8.GetString(dec);
            return string.IsNullOrEmpty(s) ? null : s;
        }
        catch (Exception)
        {
            return null;
        }
    }
}

internal sealed class SessionStore
{
    private readonly HttpClient _http;
    private readonly IAccountFileStore _store;
    private readonly ITokenProtector _protector;
    private readonly object _stateGate = new();
    private string? _accountToken;
    private string? _userEmail;

    [SupportedOSPlatform("windows")]
    public SessionStore(HttpClient http)
        : this(http, new FileAccountStore(), new DpapiTokenProtector())
    {
    }

    internal SessionStore(HttpClient http, IAccountFileStore store, ITokenProtector protector)
    {
        _http = http ?? throw new ArgumentNullException(nameof(http));
        _store = store ?? throw new ArgumentNullException(nameof(store));
        _protector = protector ?? throw new ArgumentNullException(nameof(protector));
        LoadSavedAccount();
    }

    public Uri? BaseUrl { get; private set; }

    public string DesktopToken { get; private set; } = string.Empty;

    public string? AccountToken { get { lock (_stateGate) return _accountToken; } private set { lock (_stateGate) _accountToken = value; } }

    public string? UserEmail { get { lock (_stateGate) return _userEmail; } private set { lock (_stateGate) _userEmail = value; } }

    public bool IsLoggedIn => !string.IsNullOrEmpty(AccountToken);

    internal event Action? SessionExpired;

    public void ConfigureBackend(Uri baseUrl, string desktopToken)
    {
        BaseUrl = baseUrl;
        DesktopToken = desktopToken ?? string.Empty;
    }

    public NotaeoApi? MakeApi()
    {
        if (BaseUrl is null || string.IsNullOrEmpty(DesktopToken))
        {
            return null;
        }

        var token = AccountToken;
        return new NotaeoApi(_http, BaseUrl, DesktopToken, () => token, OnUnauthorized);
    }

    private void OnUnauthorized(string? attemptedAccount)
    {
        // Clear only the matching stale token: a fresh login that raced the
        // 401 must survive. Never touches passwords/keys and never logs them.
        if (string.IsNullOrEmpty(attemptedAccount))
        {
            return;
        }

        TryExpireToken(attemptedAccount);
    }

    internal bool ClearAccountIfMatching(string? token)
    {
        if (string.IsNullOrEmpty(token)) return false;
        lock (_stateGate)
        {
            if (!string.Equals(AccountToken, token, StringComparison.Ordinal)) return false;
            ClearAccount();
            return true;
        }
    }

    internal bool TryExpireToken(string? failedToken)
    {
        if (!ClearAccountIfMatching(failedToken)) return false;
        try { SessionExpired?.Invoke(); } catch (Exception) { }
        return true;
    }

    public void ApplyLogin(string token, string email)
    {
        lock (_stateGate)
        {
            AccountToken = token;
            UserEmail = email;
            SaveAccount();
        }
    }

    public void ClearAccount()
    {
        lock (_stateGate)
        {
            AccountToken = null;
            UserEmail = null;
            try { _store.Delete(); } catch (Exception) { }
        }
    }

    private void LoadSavedAccount()
    {
        string? json;
        try
        {
            if (!_store.Exists())
            {
                return;
            }

            json = _store.ReadAllText();
            if (string.IsNullOrEmpty(json))
            {
                return;
            }
        }
        catch (Exception)
        {
            return;
        }

        string? email = null;
        string? protectedToken = null;
        string? legacyToken = null;
        var hasLegacyTokenField = false;
        try
        {
            using var doc = JsonDocument.Parse(json!);
            if (doc.RootElement.ValueKind != JsonValueKind.Object)
            {
                return;
            }

            if (doc.RootElement.TryGetProperty("email", out var e) && e.ValueKind == JsonValueKind.String)
            {
                email = e.GetString();
            }

            if (doc.RootElement.TryGetProperty("token_protected", out var p) && p.ValueKind == JsonValueKind.String)
            {
                protectedToken = p.GetString();
            }

            if (doc.RootElement.TryGetProperty("token", out var t) && t.ValueKind == JsonValueKind.String)
            {
                hasLegacyTokenField = true;
                legacyToken = t.GetString();
            }
        }
        catch (Exception)
        {
            return;
        }

        if (!string.IsNullOrEmpty(protectedToken))
        {
            string? clear = null;
            try { clear = _protector.Unprotect(protectedToken!); } catch (Exception) { clear = null; }
            if (!string.IsNullOrEmpty(clear))
            {
                AccountToken = clear;
                UserEmail = email;
                // Drop any legacy plaintext field that may sit beside the protected value.
                if (hasLegacyTokenField)
                {
                    SaveAccount();
                }

                return;
            }
        }

        if (!string.IsNullOrEmpty(legacyToken))
        {
            // Legacy plaintext migration: adopt the token in memory, then
            // immediately rewrite the file in protected form so no plaintext
            // token remains on disk. Email is preserved.
            AccountToken = legacyToken;
            UserEmail = email;
            try { SaveAccount(); } catch (Exception) { }
        }
        else if (!string.IsNullOrEmpty(email))
        {
            UserEmail = email;
        }
    }

    private void SaveAccount()
    {
        try
        {
            if (string.IsNullOrEmpty(AccountToken))
            {
                try { _store.Delete(); } catch (Exception) { }
                return;
            }

            string protectedToken;
            try
            {
                protectedToken = _protector.Protect(AccountToken!);
            }
            catch (Exception)
            {
                try { _store.Delete(); } catch (Exception) { }
                return;
            }

            // Never persist plaintext tokens, passwords, or keys.
            var json = JsonSerializer.Serialize(new { token_protected = protectedToken, email = UserEmail ?? string.Empty });
            _store.EnsureDirectory();
            _store.WriteAllText(json);
        }
        catch (Exception)
        {
            try { _store.Delete(); } catch (Exception) { }
        }
    }
}
