using System.Net;
using System.Text;
using System.Text.Json;
using Notaeo;
using Xunit;

namespace Notaeo.Tests;

internal sealed class InMemoryAccountStore : IAccountFileStore
{
    public string? Content;

    public bool Exists() => Content is not null;

    public string? ReadAllText() => Content;

    public void WriteAllText(string content) => Content = content;

    public void Delete() => Content = null;

    public void EnsureDirectory() { }
}

internal sealed class FakeProtector : ITokenProtector
{
    public string Protect(string plaintext)
    {
        return "PROT:" + Convert.ToBase64String(Encoding.UTF8.GetBytes(plaintext ?? string.Empty));
    }

    public string? Unprotect(string protectedPayload)
    {
        try
        {
            if (string.IsNullOrEmpty(protectedPayload) || !protectedPayload.StartsWith("PROT:", StringComparison.Ordinal))
            {
                return null;
            }

            var s = Encoding.UTF8.GetString(Convert.FromBase64String(protectedPayload["PROT:".Length..]));
            return string.IsNullOrEmpty(s) ? null : s;
        }
        catch (Exception)
        {
            return null;
        }
    }
}

public sealed class SessionStoreTests
{
    [Fact]
    public void LateLogoutDoesNotClearNewLoginOrRaiseExpiry()
    {
        var session = new SessionStore(NoNetwork(), new InMemoryAccountStore(), new FakeProtector());
        session.ApplyLogin("fresh-account", "a@b.c");
        var expired = 0;
        session.SessionExpired += () => expired++;
        Assert.False(session.ClearAccountIfMatching("old-account"));
        Assert.Equal("fresh-account", session.AccountToken);
        Assert.True(session.ClearAccountIfMatching("fresh-account"));
        Assert.False(session.IsLoggedIn);
        Assert.Equal(0, expired);
    }

    private sealed class FailingProtector : ITokenProtector
    {
        public string Protect(string value) => throw new InvalidOperationException("DPAPI unavailable");
        public string? Unprotect(string value) => null;
    }

    [Fact]
    public void MigrationFailureRemovesLegacyPlaintext()
    {
        var store = new InMemoryAccountStore { Content = "{\"token\":\"legacy-secret\",\"email\":\"a@b.c\"}" };
        _ = new SessionStore(NoNetwork(), store, new FailingProtector());
        Assert.Null(store.Content);
    }

    private static HttpClient NoNetwork() => new(new FakeHandler(_ => Fake.Json("[]", HttpStatusCode.OK)));

    [Fact]
    public void RoundTripDoesNotStorePlaintext()
    {
        var store = new InMemoryAccountStore();
        var protector = new FakeProtector();
        var session = new SessionStore(NoNetwork(), store, protector);
        session.ApplyLogin("secret-token-123", "a@b.c");

        Assert.NotNull(store.Content);
        Assert.DoesNotContain("secret-token-123", store.Content);
        Assert.Contains("token_protected", store.Content);
        Assert.DoesNotContain("\"token\"", store.Content);

        var reloaded = new SessionStore(NoNetwork(), store, protector);
        Assert.Equal("secret-token-123", reloaded.AccountToken);
        Assert.Equal("a@b.c", reloaded.UserEmail);
    }

    [Fact]
    public void LegacyPlaintextMigratesAndClearsPlaintext()
    {
        var store = new InMemoryAccountStore
        {
            Content = JsonSerializer.Serialize(new { token = "legacy-plain", email = "a@b.c" }),
        };
        var protector = new FakeProtector();
        var session = new SessionStore(NoNetwork(), store, protector);

        Assert.Equal("legacy-plain", session.AccountToken);
        Assert.Equal("a@b.c", session.UserEmail);
        Assert.NotNull(store.Content);
        Assert.DoesNotContain("legacy-plain", store.Content);
        Assert.Contains("token_protected", store.Content);

        var reloaded = new SessionStore(NoNetwork(), store, protector);
        Assert.Equal("legacy-plain", reloaded.AccountToken);
    }

    [Fact]
    public void TryExpireOnlyClearsMatchingToken()
    {
        var store = new InMemoryAccountStore();
        var session = new SessionStore(NoNetwork(), store, new FakeProtector());
        session.ApplyLogin("token-A", "a@b.c");

        Assert.False(session.TryExpireToken("token-B"));
        Assert.True(session.IsLoggedIn);
        Assert.Equal("token-A", session.AccountToken);

        Assert.True(session.TryExpireToken("token-A"));
        Assert.False(session.IsLoggedIn);
        Assert.Null(store.Content);
    }

    [Fact]
    public void TryExpireIgnoresNullOrEmpty()
    {
        var store = new InMemoryAccountStore();
        var session = new SessionStore(NoNetwork(), store, new FakeProtector());
        session.ApplyLogin("token-A", "a@b.c");
        Assert.False(session.TryExpireToken(null));
        Assert.False(session.TryExpireToken(""));
        Assert.True(session.IsLoggedIn);
    }

    [Fact]
    public async Task UnauthorizedViaApiClearsMatchingTokenAndRaises()
    {
        var store = new InMemoryAccountStore();
        var protector = new FakeProtector();
        var http = new HttpClient(new FakeHandler(_ => Fake.Json("{\"detail\":\"login required\"}", HttpStatusCode.Unauthorized)));
        var session = new SessionStore(http, store, protector);
        session.ConfigureBackend(new Uri("http://127.0.0.1:9/"), "desk-1");
        session.ApplyLogin("acct-1", "a@b.c");

        var expired = 0;
        session.SessionExpired += () => expired++;

        var api = session.MakeApi();
        Assert.NotNull(api);
        await Assert.ThrowsAsync<ApiException>(() => api!.ListNotebooksAsync());

        Assert.False(session.IsLoggedIn);
        Assert.Equal(1, expired);
    }

    [Fact]
    public async Task UnauthorizedDoesNotClearFreshTokenAfterRace()
    {
        var store = new InMemoryAccountStore();
        var protector = new FakeProtector();
        string? currentForHandler = "old-token";
        var http = new HttpClient(new FakeHandler(req =>
        {
            // Simulate a stale 401 for the old token arriving after a fresh login.
            return Fake.Json("{\"detail\":\"login required\"}", HttpStatusCode.Unauthorized);
        }));
        var session = new SessionStore(http, store, protector);
        session.ConfigureBackend(new Uri("http://127.0.0.1:9/"), "desk-1");
        session.ApplyLogin("old-token", "a@b.c");
        var staleApi = session.MakeApi();

        // Fresh login races the stale 401.
        session.ApplyLogin("fresh-token", "a@b.c");
        _ = currentForHandler;

        await Assert.ThrowsAsync<ApiException>(() => staleApi!.ListNotebooksAsync());

        // Stale 401 for old-token must not clear the fresh login.
        Assert.True(session.IsLoggedIn);
        Assert.Equal("fresh-token", session.AccountToken);
    }
}
