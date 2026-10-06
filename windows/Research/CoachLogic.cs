// Pure coach resume/next-question helpers. No WinForms refs so the portable
// net10 test project can exercise the real decoded API payloads.
namespace Notaeo;

internal static class CoachLogic
{
    /// <summary>Mirrors ExamCoachPanel: prefer the active session, else the first saved one.</summary>
    internal static CoachSession? ResumeSession(CoachState state)
    {
        ArgumentNullException.ThrowIfNull(state);
        return state.Sessions.FirstOrDefault(s => s.Status == "active") ?? state.Sessions.FirstOrDefault();
    }

    /// <summary>Index of the first task without a saved attempt (-1 when all rated).</summary>
    internal static int NextQuestionIndex(CoachSession session)
    {
        ArgumentNullException.ThrowIfNull(session);
        for (var i = 0; i < session.Tasks.Count; i++)
        {
            var taskId = session.Tasks[i].Id;
            if (!session.Attempts.Any(a => a.TaskId == taskId))
            {
                return i;
            }
        }

        return -1;
    }

    internal static bool IsComplete(CoachSession session)
    {
        ArgumentNullException.ThrowIfNull(session);
        return session.Tasks.Count > 0
            && session.Tasks.All(t => session.Attempts.Any(a => a.TaskId == t.Id));
    }
}
