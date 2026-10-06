// Native JSON API client for the Notaeo sidecar. Portable (no WinForms refs).
//
// Contract (matches backend/api/* + frontend/src/api/*):
// - JSON uses snake_case on the wire.
// - Account auth is `Authorization: Bearer <token>`.
// - Desktop loopback guard is `X-Notaeo-Desktop-Token: <per-launch token>`.
// - Base URL is the loopback sidecar root (e.g. http://127.0.0.1:PORT).
using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Notaeo;

public enum ApiErrorKind
{
    Unauthorized,
    Forbidden,
    NotFound,
    RateLimited,
    Validation,
    Server,
    Decoding,
    Network,
}

public sealed class ApiException : Exception
{
    public ApiErrorKind Kind { get; }
    public int StatusCode { get; }
    public int? RetryAfterSeconds { get; }

    public ApiException(ApiErrorKind kind, int statusCode, string message, int? retryAfter = null)
        : base(message)
    {
        Kind = kind;
        StatusCode = statusCode;
        RetryAfterSeconds = retryAfter;
    }
}

public sealed class NotaeoApi
{
    public const string DesktopTokenHeader = "X-Notaeo-Desktop-Token";

    private readonly HttpClient _http;
    private readonly Uri _baseUrl;
    private readonly string _desktopToken;
    private readonly Func<string?> _accountToken;
    private readonly Action<string?>? _onUnauthorized;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        PropertyNameCaseInsensitive = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public NotaeoApi(HttpClient http, Uri baseUrl, string desktopToken, Func<string?>? accountToken = null, Action<string?>? onUnauthorized = null)
    {
        _http = http ?? throw new ArgumentNullException(nameof(http));
        _baseUrl = baseUrl ?? throw new ArgumentNullException(nameof(baseUrl));
        _desktopToken = desktopToken ?? string.Empty;
        _accountToken = accountToken ?? (() => null);
        _onUnauthorized = onUnauthorized;
    }

    public Uri BaseUrl => _baseUrl;

    // ---------- low level ----------

    private HttpRequestMessage BuildRequest(string path, HttpMethod method, IReadOnlyDictionary<string, string>? query = null, HttpContent? content = null)
    {
        return BuildRequest(path, method, _accountToken(), query, content);
    }

    private HttpRequestMessage BuildRequest(string path, HttpMethod method, string? accountToken, IReadOnlyDictionary<string, string>? query = null, HttpContent? content = null)
    {
        var trimmed = path.TrimStart('/');
        var builder = new UriBuilder(new Uri(_baseUrl, trimmed));
        if (query is not null && query.Count > 0)
        {
            var qs = string.Join("&", query.Select(kv =>
                $"{Uri.EscapeDataString(kv.Key)}={Uri.EscapeDataString(kv.Value)}"));
            builder.Query = qs;
        }

        var req = new HttpRequestMessage(method, builder.Uri);
        if (!string.IsNullOrEmpty(_desktopToken))
        {
            req.Headers.TryAddWithoutValidation(DesktopTokenHeader, _desktopToken);
        }

        if (!string.IsNullOrEmpty(accountToken))
        {
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accountToken);
        }

        if (content is not null)
        {
            req.Content = content;
        }

        return req;
    }

    private static StringContent JsonBody<T>(T value)
    {
        var json = JsonSerializer.Serialize(value, JsonOptions);
        return new StringContent(json, Encoding.UTF8, "application/json");
    }

    private async Task<(byte[] Body, int Status, int? RetryAfter)> SendRawAsync(
        string path, HttpMethod method,
        IReadOnlyDictionary<string, string>? query = null,
        HttpContent? content = null,
        CancellationToken ct = default)
    {
        var attemptedAccount = _accountToken();
        HttpResponseMessage resp;
        try
        {
            using var req = BuildRequest(path, method, attemptedAccount, query, content);
            resp = await _http.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, ct).ConfigureAwait(false);
        }
        catch (HttpRequestException ex)
        {
            throw new ApiException(ApiErrorKind.Network, 0, $"network error: {ex.Message}");
        }
        catch (TaskCanceledException ex) when (!ct.IsCancellationRequested)
        {
            throw new ApiException(ApiErrorKind.Network, 0, $"request timed out: {ex.Message}");
        }
        catch (TaskCanceledException)
        {
            throw new ApiException(ApiErrorKind.Network, 0, "request cancelled");
        }

        using (resp)
        {
            int? retryAfter = null;
            if (resp.Headers.TryGetValues("Retry-After", out var values))
            {
                var raw = values.FirstOrDefault()?.Trim();
                if (int.TryParse(raw, out var secs))
                {
                    retryAfter = secs;
                }
            }

            var body = resp.Content is null
                ? Array.Empty<byte>()
                : await resp.Content.ReadAsByteArrayAsync(ct).ConfigureAwait(false);
            var status = (int)resp.StatusCode;
            if (status is >= 200 and <= 299)
            {
                return (body, status, retryAfter);
            }

            if (status == 401)
            {
                NotifyUnauthorized(attemptedAccount);
            }

            throw MapError(status, body, retryAfter);
        }
    }

    private void NotifyUnauthorized(string? attemptedAccount)
    {
        var cb = _onUnauthorized;
        if (cb is null)
        {
            return;
        }

        try
        {
            cb(attemptedAccount);
        }
        catch (Exception)
        {
        }
    }

    internal static ApiException MapError(int status, byte[] body, int? retryAfter)
    {
        var detail = DetailMessage(body) ?? ReasonPhrase(status);
        return status switch
        {
            401 => new ApiException(ApiErrorKind.Unauthorized, status, string.IsNullOrEmpty(detail) ? "login required" : detail),
            403 => new ApiException(ApiErrorKind.Forbidden, status, string.IsNullOrEmpty(detail) ? "desktop session required" : detail),
            404 => new ApiException(ApiErrorKind.NotFound, status, string.IsNullOrEmpty(detail) ? "not found" : detail),
            429 => new ApiException(ApiErrorKind.RateLimited, status,
                retryAfter.HasValue ? $"Too many attempts — try again in {retryAfter.Value}s" : "Too many attempts — try again shortly",
                retryAfter),
            400 or 409 or 422 => new ApiException(ApiErrorKind.Validation, status, string.IsNullOrEmpty(detail) ? $"request failed ({status})" : detail),
            _ => new ApiException(ApiErrorKind.Server, status, string.IsNullOrEmpty(detail) ? $"request failed ({status})" : detail),
        };
    }

    private static string ReasonPhrase(int status) => status switch
    {
        400 => "bad request",
        401 => "login required",
        403 => "desktop session required",
        404 => "not found",
        409 => "conflict",
        422 => "validation failed",
        429 => "too many attempts",
        _ => $"request failed ({status})",
    };

    internal static string? DetailMessage(byte[] body)
    {
        if (body is null || body.Length == 0)
        {
            return null;
        }

        try
        {
            using var doc = JsonDocument.Parse(body);
            if (doc.RootElement.ValueKind != JsonValueKind.Object)
            {
                return null;
            }

            if (!doc.RootElement.TryGetProperty("detail", out var detail))
            {
                return null;
            }

            if (detail.ValueKind == JsonValueKind.String)
            {
                var s = detail.GetString();
                return string.IsNullOrEmpty(s) ? null : s;
            }

            if (detail.ValueKind == JsonValueKind.Array)
            {
                var msgs = new List<string>();
                foreach (var item in detail.EnumerateArray())
                {
                    if (item.ValueKind == JsonValueKind.Object
                        && item.TryGetProperty("msg", out var msg)
                        && msg.ValueKind == JsonValueKind.String)
                    {
                        var m = msg.GetString();
                        if (!string.IsNullOrEmpty(m))
                        {
                            msgs.Add(m);
                        }
                    }
                }

                return msgs.Count > 0 ? string.Join("; ", msgs) : null;
            }

            return null;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static T Decode<T>(byte[] body)
    {
        try
        {
            var text = Encoding.UTF8.GetString(body);
            if (string.IsNullOrWhiteSpace(text))
            {
                throw new ApiException(ApiErrorKind.Decoding, 200, "could not read server response: empty body");
            }

            var value = JsonSerializer.Deserialize<T>(text, JsonOptions);
            if (value is null)
            {
                throw new ApiException(ApiErrorKind.Decoding, 200, "could not read server response: null");
            }

            return value;
        }
        catch (JsonException ex)
        {
            throw new ApiException(ApiErrorKind.Decoding, 200, $"could not read server response: {ex.Message}");
        }
    }

    // ---------- auth (POST /api/auth/*, GET /api/auth/me) ----------

    public async Task<RegisterOutcome> RegisterAsync(string email, string password, CancellationToken ct = default)
    {
        var (body, status, _) = await SendRawAsync(
            "api/auth/register", HttpMethod.Post,
            content: JsonBody(new { email, password }), ct: ct).ConfigureAwait(false);
        if (status == 201)
        {
            return new RegisterOutcome.Authed(Decode<AuthResponse>(body));
        }

        // 200 {registered:false, detail} — anti-enumeration duplicate.
        try
        {
            using var doc = JsonDocument.Parse(Encoding.UTF8.GetString(body));
            if (doc.RootElement.ValueKind == JsonValueKind.Object
                && doc.RootElement.TryGetProperty("registered", out var reg)
                && reg.ValueKind == JsonValueKind.False)
            {
                var detail = doc.RootElement.TryGetProperty("detail", out var d) && d.ValueKind == JsonValueKind.String
                    ? d.GetString() ?? "An account with this email may already exist — try logging in instead."
                    : "An account with this email may already exist — try logging in instead.";
                return new RegisterOutcome.Duplicate(detail);
            }
        }
        catch (JsonException)
        {
        }

        throw new ApiException(ApiErrorKind.Validation, status, DetailMessage(body) ?? "registration failed");
    }

    public async Task<AuthResponse> LoginAsync(string email, string password, CancellationToken ct = default)
    {
        var (body, _, _) = await SendRawAsync(
            "api/auth/login", HttpMethod.Post,
            content: JsonBody(new { email, password }), ct: ct).ConfigureAwait(false);
        return Decode<AuthResponse>(body);
    }

    public async Task LogoutAsync(CancellationToken ct = default)
    {
        await SendRawAsync("api/auth/logout", HttpMethod.Post, ct: ct).ConfigureAwait(false);
    }

    public async Task<UserPublic> MeAsync(CancellationToken ct = default)
    {
        var (body, _, _) = await SendRawAsync("api/auth/me", HttpMethod.Get, ct: ct).ConfigureAwait(false);
        return Decode<UserPublic>(body);
    }

    // ---------- notebooks ----------

    public async Task<List<Notebook>> ListNotebooksAsync(CancellationToken ct = default)
    {
        var (body, _, _) = await SendRawAsync("api/notebooks", HttpMethod.Get, ct: ct).ConfigureAwait(false);
        return Decode<List<Notebook>>(body);
    }

    public async Task<Notebook> CreateNotebookAsync(string name, CancellationToken ct = default)
    {
        var (body, _, _) = await SendRawAsync(
            "api/notebooks", HttpMethod.Post,
            content: JsonBody(new { name }), ct: ct).ConfigureAwait(false);
        return Decode<Notebook>(body);
    }

    public async Task<byte[]> ExportNotebookAsync(string notebookId, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(notebookId))
        {
            throw new ArgumentException("Notebook id must not be empty.", nameof(notebookId));
        }

        // Authenticated raw ZIP bytes: credentials stay in headers, never in the URL.
        var (body, _, _) = await SendRawAsync(
            $"api/notebooks/{notebookId}/export", HttpMethod.Get, ct: ct).ConfigureAwait(false);
        return body;
    }

    // ---------- sources ----------

    public async Task<List<SourceSummary>> ListSourcesAsync(string notebookId, CancellationToken ct = default)
    {
        var (body, _, _) = await SendRawAsync($"api/notebooks/{notebookId}/sources", HttpMethod.Get, ct: ct).ConfigureAwait(false);
        return Decode<List<SourceSummary>>(body);
    }

    public async Task<SourceDetail> GetSourceAsync(string id, CancellationToken ct = default)
    {
        var (body, _, _) = await SendRawAsync($"api/sources/{id}", HttpMethod.Get, ct: ct).ConfigureAwait(false);
        return Decode<SourceDetail>(body);
    }

    public async Task<SourceChunksPage> GetSourceChunksAsync(string id, int offset = 0, int limit = 50, CancellationToken ct = default)
    {
        var (body, _, _) = await SendRawAsync(
            $"api/sources/{id}/chunks", HttpMethod.Get,
            query: new Dictionary<string, string> { ["offset"] = offset.ToString(), ["limit"] = limit.ToString() },
            ct: ct).ConfigureAwait(false);
        return Decode<SourceChunksPage>(body);
    }

    public async Task<PasteResult> PasteSourceAsync(string notebookId, string title, string text, bool force = false, CancellationToken ct = default)
    {
        var (body, status, _) = await SendRawAsync(
            $"api/notebooks/{notebookId}/sources/text", HttpMethod.Post,
            content: JsonBody(new { title, text, force }), ct: ct).ConfigureAwait(false);
        if (status == 201)
        {
            SourceSummary? summary = null;
            try { summary = Decode<SourceSummary>(body); } catch (ApiException) { }
            return new PasteResult(true, null, summary);
        }

        // 200 warn-before-save: {saved:false, duplicate_of:{id,title}}
        var (saved, dup) = ParseDuplicate(body);
        return new PasteResult(saved, dup, null);
    }

    public async Task<PasteResult> AddUrlSourceAsync(string notebookId, string url, bool force = false, CancellationToken ct = default)
    {
        var (body, status, _) = await SendRawAsync(
            $"api/notebooks/{notebookId}/sources/url", HttpMethod.Post,
            content: JsonBody(new { url, force }), ct: ct).ConfigureAwait(false);
        if (status == 201)
        {
            SourceSummary? summary = null;
            try { summary = Decode<SourceSummary>(body); } catch (ApiException) { }
            return new PasteResult(true, null, summary);
        }

        var (saved, dup) = ParseDuplicate(body);
        return new PasteResult(saved, dup, null);
    }

    private static (bool Saved, DuplicateRef? Dup) ParseDuplicate(byte[] body)
    {
        try
        {
            using var doc = JsonDocument.Parse(Encoding.UTF8.GetString(body));
            if (doc.RootElement.ValueKind != JsonValueKind.Object)
            {
                return (false, null);
            }

            var saved = doc.RootElement.TryGetProperty("saved", out var s) && s.ValueKind == JsonValueKind.True;
            DuplicateRef? dup = null;
            if (doc.RootElement.TryGetProperty("duplicate_of", out var d) && d.ValueKind == JsonValueKind.Object)
            {
                dup = ParseDupRef(d);
            }
            else if (doc.RootElement.TryGetProperty("duplicateOf", out var d2) && d2.ValueKind == JsonValueKind.Object)
            {
                dup = ParseDupRef(d2);
            }

            return (saved, dup);
        }
        catch (JsonException)
        {
            return (false, null);
        }
    }

    private static DuplicateRef? ParseDupRef(JsonElement el)
    {
        if (el.TryGetProperty("id", out var id) && el.TryGetProperty("title", out var title)
            && id.ValueKind == JsonValueKind.String && title.ValueKind == JsonValueKind.String)
        {
            var i = id.GetString();
            var t = title.GetString();
            if (!string.IsNullOrEmpty(i) && t is not null)
            {
                return new DuplicateRef(i, t);
            }
        }

        return null;
    }

    public async Task<UploadResult> UploadFilesAsync(
        string notebookId,
        IReadOnlyList<(string Filename, byte[] Data, string Mime)> files,
        CancellationToken ct = default)
    {
        using var form = new MultipartFormDataContent();
        foreach (var f in files)
        {
            var part = new ByteArrayContent(f.Data);
            part.Headers.ContentType = new MediaTypeHeaderValue(f.Mime);
            form.Add(part, "files", f.Filename);
        }

        var (body, _, _) = await SendRawAsync($"api/notebooks/{notebookId}/sources", HttpMethod.Post, content: form, ct: ct).ConfigureAwait(false);
        return Decode<UploadResult>(body);
    }

    // ---------- coach ----------

    public async Task<CoachState> GetCoachStateAsync(string notebookId, CancellationToken ct = default)
    {
        var (body, _, _) = await SendRawAsync($"api/notebooks/{notebookId}/coach", HttpMethod.Get, ct: ct).ConfigureAwait(false);
        return Decode<CoachState>(body);
    }

    public async Task<ExamGoal> SaveExamGoalAsync(string notebookId, ExamGoal goal, CancellationToken ct = default)
    {
        var (body, _, _) = await SendRawAsync(
            $"api/notebooks/{notebookId}/coach/goal", HttpMethod.Put,
            content: JsonBody(goal), ct: ct).ConfigureAwait(false);
        return Decode<ExamGoal>(body);
    }

    public async Task<CoachSession> BuildCoachSessionAsync(string notebookId, bool useAi, CancellationToken ct = default)
    {
        var (body, _, _) = await SendRawAsync(
            $"api/notebooks/{notebookId}/coach/sessions", HttpMethod.Post,
            content: JsonBody(new { use_ai = useAi }), ct: ct).ConfigureAwait(false);
        return Decode<CoachSession>(body);
    }

    public async Task<CoachSession> StartCoachSessionAsync(string notebookId, string sessionId, IReadOnlyList<string> taskIds, CancellationToken ct = default)
    {
        var (body, _, _) = await SendRawAsync(
            $"api/notebooks/{notebookId}/coach/sessions/{sessionId}/start", HttpMethod.Post,
            content: JsonBody(new { task_ids = taskIds }), ct: ct).ConfigureAwait(false);
        return Decode<CoachSession>(body);
    }

    public async Task<CoachSession> RecordCoachAttemptAsync(
        string notebookId, string sessionId, string taskId, string rating, string response,
        CancellationToken ct = default)
    {
        var (body, _, _) = await SendRawAsync(
            $"api/notebooks/{notebookId}/coach/sessions/{sessionId}/attempts", HttpMethod.Post,
            content: JsonBody(new { task_id = taskId, rating, response }), ct: ct).ConfigureAwait(false);
        return Decode<CoachSession>(body);
    }

    public async Task<CoachSession> FinishCoachSessionAsync(string notebookId, string sessionId, CancellationToken ct = default)
    {
        var (body, _, _) = await SendRawAsync(
            $"api/notebooks/{notebookId}/coach/sessions/{sessionId}/finish", HttpMethod.Post,
            content: JsonBody(new { }), ct: ct).ConfigureAwait(false);
        return Decode<CoachSession>(body);
    }

    public async Task<CoachExplanation> ExplainCoachTaskAsync(
        string notebookId, string sessionId, string taskId, bool useAi, CancellationToken ct = default)
    {
        var (body, _, _) = await SendRawAsync(
            $"api/notebooks/{notebookId}/coach/sessions/{sessionId}/tasks/{taskId}/explain", HttpMethod.Post,
            content: JsonBody(new { use_ai = useAi }), ct: ct).ConfigureAwait(false);
        return Decode<CoachExplanation>(body);
    }

    // ---------- AI settings ----------

    public async Task<AISettings> GetAISettingsAsync(CancellationToken ct = default)
    {
        var (body, _, _) = await SendRawAsync("api/settings/ai", HttpMethod.Get, ct: ct).ConfigureAwait(false);
        return Decode<AISettings>(body);
    }

    public async Task<AISettings> SaveAISettingsAsync(string provider, string apiKey, string model, CancellationToken ct = default)
    {
        var (body, _, _) = await SendRawAsync(
            "api/settings/ai", HttpMethod.Put,
            content: JsonBody(new { provider, api_key = apiKey, model }), ct: ct).ConfigureAwait(false);
        return Decode<AISettings>(body);
    }

    public async Task ClearAISettingsAsync(CancellationToken ct = default)
    {
        await SendRawAsync("api/settings/ai", HttpMethod.Delete, ct: ct).ConfigureAwait(false);
    }
}
