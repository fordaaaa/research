using System.Net;
using System.Text;
using System.Text.Json;
using Notaeo;
using Xunit;

namespace Notaeo.Tests;

// HttpMessageHandler fakes exercising the actual NotaeoApi request pipeline:
// headers, snake_case bodies, status → ApiException mapping, and payloads.
internal sealed class FakeHandler : HttpMessageHandler
{
    private readonly Func<HttpRequestMessage, HttpResponseMessage> _handler;

    internal FakeHandler(Func<HttpRequestMessage, HttpResponseMessage> handler)
    {
        _handler = handler;
    }

    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        return Task.FromResult(_handler(request));
    }
}

internal static class Fake
{
    internal static readonly Uri Base = new("http://127.0.0.1:9/");

    internal static NotaeoApi Api(
        Func<HttpRequestMessage, HttpResponseMessage> handler,
        string? accountToken = "acct-1",
        string desktopToken = "desk-per-launch")
    {
        var http = new HttpClient(new FakeHandler(handler));
        var token = accountToken;
        return new NotaeoApi(http, Base, desktopToken, () => token);
    }

    internal static HttpResponseMessage Json(string body, HttpStatusCode status, Dictionary<string, string>? headers = null)
    {
        var resp = new HttpResponseMessage(status)
        {
            Content = new StringContent(body, Encoding.UTF8, "application/json"),
        };
        if (headers is not null)
        {
            foreach (var kv in headers)
            {
                resp.Headers.TryAddWithoutValidation(kv.Key, kv.Value);
            }
        }

        return resp;
    }

    internal static async Task<JsonDocument> BodyJson(HttpRequestMessage req)
    {
        var text = req.Content is null ? "{}" : await req.Content.ReadAsStringAsync();
        return JsonDocument.Parse(string.IsNullOrWhiteSpace(text) ? "{}" : text);
    }
}

public sealed class ApiClientTests
{
    [Fact]
    public async Task ExportKeepsCredentialsInHeadersAndReturnsArchiveBytes()
    {
        var api = Fake.Api(request =>
        {
            Assert.Equal("/api/notebooks/course/export", request.RequestUri!.AbsolutePath);
            Assert.Equal(string.Empty, request.RequestUri.Query);
            Assert.Equal("Bearer acct-1", request.Headers.Authorization!.ToString());
            return new HttpResponseMessage(HttpStatusCode.OK) { Content = new ByteArrayContent([80, 75, 3, 4]) };
        });
        Assert.Equal(new byte[] { 80, 75, 3, 4 }, await api.ExportNotebookAsync("course"));
    }

    [Fact]
    public async Task LoginSendsDesktopTokenAndDecodesAuth()
    {
        string? auth = null;
        string? desk = null;
        string? email = null;
        var api = Fake.Api(req =>
        {
            auth = req.Headers.Authorization?.ToString();
            desk = req.Headers.TryGetValues(NotaeoApi.DesktopTokenHeader, out var v) ? v.FirstOrDefault() : null;
            var text = req.Content!.ReadAsStringAsync().Result;
            using var doc = JsonDocument.Parse(text);
            email = doc.RootElement.GetProperty("email").GetString();
            return Fake.Json("{\"user\":{\"id\":\"u1\",\"email\":\"a@b.c\"},\"token\":\"tok-123\"}", HttpStatusCode.Created);
        }, accountToken: null);

        var res = await api.LoginAsync("a@b.c", "secret123");
        Assert.Equal("tok-123", res.Token);
        Assert.Equal("a@b.c", res.User.Email);
        Assert.Equal("desk-per-launch", desk);
        Assert.Equal("a@b.c", email);
        // No bearer on the login call itself (no session yet).
        Assert.Null(auth);
    }

    [Fact]
    public async Task AuthedRequestCarriesBearerAndDesktopToken()
    {
        string? auth = null;
        string? desk = null;
        var api = Fake.Api(req =>
        {
            auth = req.Headers.Authorization?.ToString();
            desk = req.Headers.TryGetValues(NotaeoApi.DesktopTokenHeader, out var v) ? v.FirstOrDefault() : null;
            return Fake.Json("[]", HttpStatusCode.OK);
        });

        await api.ListNotebooksAsync();
        Assert.Equal("Bearer acct-1", auth);
        Assert.Equal("desk-per-launch", desk);
    }

    [Fact]
    public async Task UnauthorizedMapsToLoginRequired()
    {
        var api = Fake.Api(_ => Fake.Json("{\"detail\":\"login required\"}", HttpStatusCode.Unauthorized));
        var ex = await Assert.ThrowsAsync<ApiException>(() => api.ListNotebooksAsync());
        Assert.Equal(ApiErrorKind.Unauthorized, ex.Kind);
        Assert.Equal("login required", ex.Message);
    }

    [Fact]
    public async Task ForbiddenMapsToDesktopSession()
    {
        var api = Fake.Api(_ => Fake.Json("{\"detail\":\"desktop session required\"}", HttpStatusCode.Forbidden));
        var ex = await Assert.ThrowsAsync<ApiException>(() => api.ListNotebooksAsync());
        Assert.Equal(ApiErrorKind.Forbidden, ex.Kind);
        Assert.Equal("desktop session required", ex.Message);
    }

    [Fact]
    public async Task NotFoundMaps()
    {
        var api = Fake.Api(_ => Fake.Json("{\"detail\":\"notebook not found\"}", HttpStatusCode.NotFound));
        var ex = await Assert.ThrowsAsync<ApiException>(() => api.GetSourceAsync("abcdef123456"));
        Assert.Equal(ApiErrorKind.NotFound, ex.Kind);
        Assert.Equal("notebook not found", ex.Message);
    }

    [Fact]
    public async Task ValidationJoinsPydanticMsgs()
    {
        var api = Fake.Api(_ => Fake.Json(
            "{\"detail\":[{\"loc\":[\"body\"],\"msg\":\"name must not be blank\",\"type\":\"value_error\"}]}",
            HttpStatusCode.UnprocessableEntity));
        var ex = await Assert.ThrowsAsync<ApiException>(() => api.CreateNotebookAsync(""));
        Assert.Equal(ApiErrorKind.Validation, ex.Kind);
        Assert.Contains("name must not be blank", ex.Message);
    }

    [Fact]
    public async Task RateLimitedCarriesRetryAfter()
    {
        var api = Fake.Api(_ => Fake.Json("", HttpStatusCode.TooManyRequests,
            new Dictionary<string, string> { ["Retry-After"] = "7" }));
        var ex = await Assert.ThrowsAsync<ApiException>(() => api.ListNotebooksAsync());
        Assert.Equal(ApiErrorKind.RateLimited, ex.Kind);
        Assert.Equal(7, ex.RetryAfterSeconds);
    }

    [Fact]
    public async Task RegisterDuplicateDoesNotAuth()
    {
        var api = Fake.Api(_ => Fake.Json(
            "{\"registered\":false,\"detail\":\"An account with this email may already exist — try logging in instead.\"}",
            HttpStatusCode.OK), accountToken: null);
        var out_ = await api.RegisterAsync("dup@x.y", "password123");
        var dup = Assert.IsType<RegisterOutcome.Duplicate>(out_);
        Assert.Contains("already exist", dup.Detail);
    }

    [Fact]
    public async Task SaveGoalEncodesSnakeCase()
    {
        string? body = null;
        var api = Fake.Api(req =>
        {
            body = req.Content!.ReadAsStringAsync().Result;
            return Fake.Json(
                "{\"title\":\"Biology 101\",\"exam_date\":\"2026-11-01\",\"daily_minutes\":25,\"focus_topics\":[\"cells\"]}",
                HttpStatusCode.OK);
        });

        var goal = new ExamGoal("Biology 101", "2026-11-01", 25, ["cells"]);
        var saved = await api.SaveExamGoalAsync("abcdef123456", goal);
        Assert.Equal("2026-11-01", saved.ExamDate);
        Assert.NotNull(body);
        using var doc = JsonDocument.Parse(body!);
        Assert.Equal("2026-11-01", doc.RootElement.GetProperty("exam_date").GetString());
        Assert.Equal(25, doc.RootElement.GetProperty("daily_minutes").GetInt32());
        Assert.Equal("cells", doc.RootElement.GetProperty("focus_topics")[0].GetString());
    }

    [Fact]
    public async Task StartSendsSnakeCaseTaskIds()
    {
        string? body = null;
        var api = Fake.Api(req =>
        {
            body = req.Content!.ReadAsStringAsync().Result;
            return Fake.Json(
                "{\"id\":\"aaaaaaaaaaaa\",\"notebook_id\":\"abcdef123456\",\"goal\":{\"title\":\"Bio\",\"exam_date\":\"2026-11-01\",\"daily_minutes\":20,\"focus_topics\":[]},\"status\":\"active\",\"generated_by\":\"basic\",\"notice\":null,\"tasks\":[],\"attempts\":[],\"created_at\":\"2026-10-01T00:00:00Z\",\"completed_at\":null}",
                HttpStatusCode.OK);
        });

        await api.StartCoachSessionAsync("abcdef123456", "aaaaaaaaaaaa", ["111111111111"]);
        Assert.NotNull(body);
        using var doc = JsonDocument.Parse(body!);
        Assert.Equal("111111111111", doc.RootElement.GetProperty("task_ids")[0].GetString());
    }

    [Fact]
    public async Task BuildSendsSnakeCaseUseAi()
    {
        string? body = null;
        var api = Fake.Api(req =>
        {
            body = req.Content!.ReadAsStringAsync().Result;
            return Fake.Json(
                "{\"id\":\"bbbbbbbbbbbb\",\"notebook_id\":\"abcdef123456\",\"goal\":{\"title\":\"Bio\",\"exam_date\":\"2026-11-01\",\"daily_minutes\":20,\"focus_topics\":[]},\"status\":\"draft\",\"generated_by\":\"basic\",\"notice\":null,\"tasks\":[],\"attempts\":[],\"created_at\":\"2026-10-01T00:00:00Z\",\"completed_at\":null}",
                HttpStatusCode.Created);
        });

        await api.BuildCoachSessionAsync("abcdef123456", true);
        Assert.NotNull(body);
        using var doc = JsonDocument.Parse(body!);
        Assert.True(doc.RootElement.GetProperty("use_ai").GetBoolean());
    }

    [Fact]
    public async Task AttemptSendsSnakeCaseFields()
    {
        string? body = null;
        var api = Fake.Api(req =>
        {
            body = req.Content!.ReadAsStringAsync().Result;
            return Fake.Json(
                "{\"id\":\"aaaaaaaaaaaa\",\"notebook_id\":\"abcdef123456\",\"goal\":{\"title\":\"Bio\",\"exam_date\":\"2026-11-01\",\"daily_minutes\":20,\"focus_topics\":[]},\"status\":\"active\",\"generated_by\":\"basic\",\"notice\":null,\"tasks\":[],\"attempts\":[],\"created_at\":\"2026-10-01T00:00:00Z\",\"completed_at\":null}",
                HttpStatusCode.OK);
        });

        await api.RecordCoachAttemptAsync("abcdef123456", "aaaaaaaaaaaa", "111111111111", "got_it", "unit");
        Assert.NotNull(body);
        using var doc = JsonDocument.Parse(body!);
        Assert.Equal("111111111111", doc.RootElement.GetProperty("task_id").GetString());
        Assert.Equal("got_it", doc.RootElement.GetProperty("rating").GetString());
        Assert.Equal("unit", doc.RootElement.GetProperty("response").GetString());
    }

    [Fact]
    public async Task PasteDuplicateReturnsHintWithoutSaving()
    {
        var api = Fake.Api(_ => Fake.Json(
            "{\"saved\":false,\"duplicate_of\":{\"id\":\"abc123def456\",\"title\":\"Existing\"}}",
            HttpStatusCode.OK));
        var res = await api.PasteSourceAsync("abcdef123456", "T", "hello", false);
        Assert.False(res.Saved);
        Assert.NotNull(res.DuplicateOf);
        Assert.Equal("abc123def456", res.DuplicateOf!.Id);
    }

    [Fact]
    public async Task ExplainDecodesCitationsAndModel()
    {
        var api = Fake.Api(_ => Fake.Json(
            "{\"answer\":\"Cells divide.\",\"citations\":[{\"source_id\":\"abcdef123456\",\"source_title\":\"Bio text\",\"pages\":[3]}],\"model\":null,\"generated_by\":\"basic\",\"notice\":null}",
            HttpStatusCode.OK));
        var e = await api.ExplainCoachTaskAsync("abcdef123456", "aaaaaaaaaaaa", "111111111111", false);
        Assert.Equal([3], e.Citations[0].Pages);
        Assert.Equal("basic", e.GeneratedBy);
    }

    [Fact]
    public async Task GetChunksSendsOffsetAndLimit()
    {
        string? query = null;
        var api = Fake.Api(req =>
        {
            query = req.RequestUri!.Query;
            return Fake.Json("{\"total\":0,\"chunks\":[]}", HttpStatusCode.OK);
        });
        var page = await api.GetSourceChunksAsync("abcdef123456", 10, 25);
        Assert.Equal(0, page.Total);
        Assert.NotNull(query);
        Assert.Contains("offset=10", query!);
        Assert.Contains("limit=25", query!);
    }
}
