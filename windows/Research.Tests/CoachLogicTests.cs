using System.Text.Json;
using Notaeo;
using Xunit;

namespace Notaeo.Tests;

// Resume/next-question logic over real decoded API payloads (not string greps).
public sealed class CoachLogicTests
{
    private static readonly JsonSerializerOptions Snake = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        PropertyNameCaseInsensitive = true,
    };

    private static CoachState DecodeState(bool activeFirst)
    {
        const string draft = "{\"id\":\"bbbbbbbbbbbb\",\"notebook_id\":\"abcdef123456\",\"goal\":{\"title\":\"Bio\",\"exam_date\":\"2026-11-01\",\"daily_minutes\":20,\"focus_topics\":[]},\"status\":\"draft\",\"generated_by\":\"basic\",\"notice\":null,\"tasks\":[],\"attempts\":[],\"created_at\":\"2026-10-01T00:00:00Z\",\"completed_at\":null}";
        const string active = "{\"id\":\"aaaaaaaaaaaa\",\"notebook_id\":\"abcdef123456\",\"goal\":{\"title\":\"Bio\",\"exam_date\":\"2026-11-01\",\"daily_minutes\":20,\"focus_topics\":[]},\"status\":\"active\",\"generated_by\":\"basic\",\"notice\":null,\"tasks\":[{\"id\":\"111111111111\",\"topic\":\"Cells\",\"prompt\":\"What is a cell?\",\"answer\":\"Basic unit\",\"minutes\":10,\"reason\":\"missed\",\"source_id\":null,\"source_title\":null,\"pages\":[],\"chunk_seq\":null,\"card_id\":null},{\"id\":\"222222222222\",\"topic\":\"DNA\",\"prompt\":\"What is DNA?\",\"answer\":\"Code\",\"minutes\":10,\"reason\":\"fresh\",\"source_id\":null,\"source_title\":null,\"pages\":[],\"chunk_seq\":null,\"card_id\":null}],\"attempts\":[{\"task_id\":\"111111111111\",\"rating\":\"got_it\",\"response\":\"unit\",\"created_at\":\"2026-10-02T00:00:00Z\"}],\"created_at\":\"2026-10-01T00:00:00Z\",\"completed_at\":null}";
        var order = activeFirst ? $"[{active},{draft}]" : $"[{draft},{active}]";
        var json = "{\"goal\":{\"title\":\"Bio\",\"exam_date\":\"2026-11-01\",\"daily_minutes\":20,\"focus_topics\":[]},\"sessions\":" + order + "}";
        return JsonSerializer.Deserialize<CoachState>(json, Snake)!;
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void ResumePrefersActiveSessionRegardlessOfOrder(bool activeFirst)
    {
        var state = DecodeState(activeFirst);
        Assert.Equal("aaaaaaaaaaaa", CoachLogic.ResumeSession(state)?.Id);
    }

    [Fact]
    public void NextQuestionSkipsAnsweredTask()
    {
        var state = DecodeState(activeFirst: true);
        var active = state.Sessions.First(s => s.Id == "aaaaaaaaaaaa");
        Assert.Equal(1, CoachLogic.NextQuestionIndex(active));
        Assert.False(CoachLogic.IsComplete(active));
    }

    [Fact]
    public void CompleteWhenAllRated()
    {
        var state = DecodeState(activeFirst: true);
        var active = state.Sessions.First(s => s.Id == "aaaaaaaaaaaa");
        var completed = active with
        {
            Attempts =
            [
                new CoachAttempt("111111111111", "got_it", "unit", "2026-10-02T00:00:00Z"),
                new CoachAttempt("222222222222", "revise", "code", "2026-10-02T00:00:00Z"),
            ],
        };
        Assert.Equal(-1, CoachLogic.NextQuestionIndex(completed));
        Assert.True(CoachLogic.IsComplete(completed));
    }

    [Fact]
    public void ResumeReturnsNullWhenNoSessions()
    {
        var state = new CoachState(null, []);
        Assert.Null(CoachLogic.ResumeSession(state));
    }

    [Fact]
    public void ResumeFallsBackToFirstSaved()
    {
        var state = DecodeState(activeFirst: true) with
        {
            Sessions = [DecodeState(true).Sessions.First(s => s.Status == "draft")],
        };
        Assert.Equal("bbbbbbbbbbbb", CoachLogic.ResumeSession(state)?.Id);
    }
}
