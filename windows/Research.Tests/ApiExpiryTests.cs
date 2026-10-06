using System.Net;
using Notaeo;
using Xunit;

namespace Notaeo.Tests;

public sealed class ApiExpiryTests
{
    [Fact]
    public async Task UnauthorizedInvokesCallbackWithAttemptedToken()
    {
        string? seen = "unset";
        var api = new NotaeoApi(
            new HttpClient(new FakeHandler(_ => Fake.Json("{\"detail\":\"login required\"}", HttpStatusCode.Unauthorized))),
            Fake.Base,
            "desk-per-launch",
            () => "acct-1",
            t => seen = t);

        var ex = await Assert.ThrowsAsync<ApiException>(() => api.ListNotebooksAsync());
        Assert.Equal(ApiErrorKind.Unauthorized, ex.Kind);
        Assert.Equal("acct-1", seen);
    }

    [Fact]
    public async Task SuccessDoesNotInvokeCallback()
    {
        var invoked = false;
        var api = new NotaeoApi(
            new HttpClient(new FakeHandler(_ => Fake.Json("[]", HttpStatusCode.OK))),
            Fake.Base,
            "desk-per-launch",
            () => "acct-1",
            _ => invoked = true);

        await api.ListNotebooksAsync();
        Assert.False(invoked);
    }

    [Fact]
    public async Task ForbiddenDoesNotInvokeExpiryCallback()
    {
        var invoked = false;
        var api = new NotaeoApi(
            new HttpClient(new FakeHandler(_ => Fake.Json("{\"detail\":\"x\"}", HttpStatusCode.Forbidden))),
            Fake.Base,
            "desk-per-launch",
            () => "acct-1",
            _ => invoked = true);

        await Assert.ThrowsAsync<ApiException>(() => api.ListNotebooksAsync());
        Assert.False(invoked);
    }

    [Fact]
    public async Task CallbackExceptionStillMapsToUnauthorized()
    {
        var api = new NotaeoApi(
            new HttpClient(new FakeHandler(_ => Fake.Json("{\"detail\":\"login required\"}", HttpStatusCode.Unauthorized))),
            Fake.Base,
            "desk-per-launch",
            () => "acct-1",
            _ => throw new InvalidOperationException("boom"));

        var ex = await Assert.ThrowsAsync<ApiException>(() => api.ListNotebooksAsync());
        Assert.Equal(ApiErrorKind.Unauthorized, ex.Kind);
    }
}
