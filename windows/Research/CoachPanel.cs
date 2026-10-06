// Native exam coach: goal → build → select → start/resume → write →
// reveal → self-rate → finish → history, plus basic/AI explanations.
// Mirrors macos/CoachView.swift + frontend ExamCoachPanel contracts.
namespace Notaeo;

internal sealed class CoachPanel : UserControl
{
    private readonly Func<NotaeoApi?> _apiFactory;

    private Notebook? _notebook;
    private int _epoch;

    private CoachState? _state;
    private string? _sessionId;
    private int _index;
    private readonly Dictionary<string, string> _responses = new();
    private bool _revealed;
    private CoachExplanation? _explanation;
    private bool _aiConfigured;

    // Goal controls
    private readonly TextBox _goalTitleBox = new() { PlaceholderText = "Exam title", Width = 260 };
    private readonly DateTimePicker _examDatePicker = new() { Format = DateTimePickerFormat.Short, Value = DateTime.Today.AddDays(7) };
    private readonly NumericUpDown _minutesBox = new() { Minimum = 5, Maximum = 120, Value = 20, Width = 70 };
    private readonly TextBox _topicsBox = new() { PlaceholderText = "Focus topics, comma separated (optional)", Width = 260 };
    private readonly CheckBox _useAiBox = new() { Text = "Use AI for practice", AutoSize = true };
    private readonly Button _saveGoalButton = new() { Text = "Save exam goal", AutoSize = true };
    private readonly Button _buildButton = new() { Text = "Build revision session", AutoSize = true };
    private readonly Button _resumeActiveButton = new() { Text = "Resume active session", AutoSize = true };
    private readonly Label _savedGoalLabel = new() { AutoSize = true, MaximumSize = new Size(600, 0) };

    // Session controls
    private readonly Label _sessionHeader = new() { AutoSize = true, Font = new Font(FontFamily.GenericSansSerif, 10, System.Drawing.FontStyle.Bold) };
    private readonly Label _sessionMeta = new() { AutoSize = true, MaximumSize = new Size(600, 0) };
    private readonly CheckedListBox _draftList = new() { Height = 140, Dock = DockStyle.Top };
    private readonly Label _selectedMinutesLabel = new() { AutoSize = true };
    private readonly Button _startButton = new() { Text = "Start selected session", AutoSize = true };
    private readonly Label _questionPos = new() { AutoSize = true };
    private readonly Label _questionTopic = new() { AutoSize = true, Font = new Font(FontFamily.GenericSansSerif, 10, System.Drawing.FontStyle.Bold) };
    private readonly TextBox _questionPrompt = new() { Multiline = true, ReadOnly = true, Height = 60, ScrollBars = ScrollBars.Vertical, Dock = DockStyle.Top };
    private readonly Label _questionReason = new() { AutoSize = true, MaximumSize = new Size(600, 0) };
    private readonly TextBox _answerBox = new() { Multiline = true, Height = 90, ScrollBars = ScrollBars.Vertical, Dock = DockStyle.Top };
    private readonly Button _revealButton = new() { Text = "Show reference answer", AutoSize = true };
    private readonly Button _explainButton = new() { Text = "Show explanation", AutoSize = true };
    private readonly TextBox _referenceBox = new() { Multiline = true, ReadOnly = true, Height = 80, ScrollBars = ScrollBars.Vertical, Dock = DockStyle.Top, Visible = false };
    private readonly TextBox _explanationBox = new() { Multiline = true, ReadOnly = true, Height = 80, ScrollBars = ScrollBars.Vertical, Dock = DockStyle.Top, Visible = false };
    private readonly Button _gotItButton = new() { Text = "Got it", AutoSize = true };
    private readonly Button _reviseButton = new() { Text = "Revise again", AutoSize = true };
    private readonly Button _prevButton = new() { Text = "Previous question", AutoSize = true };
    private readonly Button _nextButton = new() { Text = "Next question", AutoSize = true };
    private readonly Button _finishButton = new() { Text = "Finish session", AutoSize = true };

    private readonly ListBox _historyList = new() { Height = 90, Dock = DockStyle.Top };
    private readonly Label _noticeLabel = new() { AutoSize = true, MaximumSize = new Size(600, 0) };
    private readonly Label _errorLabel = new() { AutoSize = true, ForeColor = System.Drawing.Color.Red, MaximumSize = new Size(600, 0) };
    private readonly Button _reloadButton = new() { Text = "Reload coach", AutoSize = true };
    private readonly ProgressBar _busyBar = new() { Style = ProgressBarStyle.Marquee, Visible = false, Height = 12, Dock = DockStyle.Top };

    internal CoachPanel(Func<NotaeoApi?> apiFactory)
    {
        _apiFactory = apiFactory ?? throw new ArgumentNullException(nameof(apiFactory));
        Dock = DockStyle.Fill;

        var scroll = new Panel { Dock = DockStyle.Fill, AutoScroll = true };
        var layout = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, WrapContents = false, AutoScroll = true, Padding = new Padding(10) };
        layout.Controls.Add(BuildGoalBox());
        layout.Controls.Add(BuildSessionBox());
        layout.Controls.Add(BuildHistoryBox());
        layout.Controls.Add(_busyBar);
        layout.Controls.Add(_errorLabel);
        layout.Controls.Add(_reloadButton);
        layout.Controls.Add(_noticeLabel);
        scroll.Controls.Add(layout);
        Controls.Add(scroll);

        _saveGoalButton.Click += async (_, _) => await SaveGoalAsync();
        _buildButton.Click += async (_, _) => await BuildAsync();
        _resumeActiveButton.Click += (_, _) => ResumeActive();
        _startButton.Click += async (_, _) => await StartAsync();
        _revealButton.Click += (_, _) => { _revealed = true; RenderSession(); };
        _explainButton.Click += async (_, _) => await ExplainAsync();
        _gotItButton.Click += async (_, _) => await RateAsync("got_it");
        _reviseButton.Click += async (_, _) => await RateAsync("revise");
        _prevButton.Click += (_, _) => NavigateTo(_index - 1);
        _nextButton.Click += (_, _) => NavigateTo(_index + 1);
        _finishButton.Click += async (_, _) => await FinishAsync();
        _reloadButton.Click += async (_, _) => await ReloadAsync();
        _draftList.ItemCheck += (_, _) => BeginInvoke((MethodInvoker)UpdateSelectedMinutes);
        _historyList.SelectedIndexChanged += (_, _) =>
        {
            if (_historyList.SelectedItem is CoachSession s)
            {
                _sessionId = s.Id;
                NavigateTo(0);
                RenderSession();
            }
        };
        _answerBox.TextChanged += (_, _) =>
        {
            var key = ResponseKey();
            if (key is not null)
            {
                _responses[key] = _answerBox.Text;
            }
        };
    }

    private GroupBox BuildGoalBox()
    {
        var box = new GroupBox { Text = "Exam goal", AutoSize = true, Dock = DockStyle.Top, Width = 640 };
        var layout = new FlowLayoutPanel { FlowDirection = FlowDirection.TopDown, AutoSize = true, Dock = DockStyle.Fill, Padding = new Padding(8) };
        var row1 = new FlowLayoutPanel { AutoSize = true, FlowDirection = FlowDirection.LeftToRight };
        row1.Controls.Add(new Label { Text = "Title:", AutoSize = true });
        row1.Controls.Add(_goalTitleBox);
        var row2 = new FlowLayoutPanel { AutoSize = true, FlowDirection = FlowDirection.LeftToRight };
        row2.Controls.Add(new Label { Text = "Exam date:", AutoSize = true });
        row2.Controls.Add(_examDatePicker);
        row2.Controls.Add(new Label { Text = "Minutes:", AutoSize = true });
        row2.Controls.Add(_minutesBox);
        var row3 = new FlowLayoutPanel { AutoSize = true, FlowDirection = FlowDirection.LeftToRight };
        row3.Controls.Add(new Label { Text = "Focus:", AutoSize = true });
        row3.Controls.Add(_topicsBox);
        var row4 = new FlowLayoutPanel { AutoSize = true, FlowDirection = FlowDirection.LeftToRight };
        row4.Controls.Add(_saveGoalButton);
        row4.Controls.Add(_useAiBox);
        var row5 = new FlowLayoutPanel { AutoSize = true, FlowDirection = FlowDirection.LeftToRight };
        row5.Controls.Add(_buildButton);
        row5.Controls.Add(_resumeActiveButton);
        layout.Controls.Add(row1);
        layout.Controls.Add(row2);
        layout.Controls.Add(row3);
        layout.Controls.Add(row4);
        layout.Controls.Add(new Label { Text = "Source-based practice works now. Add an optional AI key in Settings for explanations.", AutoSize = true, MaximumSize = new Size(600, 0) });
        layout.Controls.Add(_savedGoalLabel);
        layout.Controls.Add(row5);
        box.Controls.Add(layout);
        return box;
    }

    private GroupBox BuildSessionBox()
    {
        var box = new GroupBox { Text = "Revision session", AutoSize = true, Dock = DockStyle.Top, Width = 640 };
        var layout = new FlowLayoutPanel { FlowDirection = FlowDirection.TopDown, AutoSize = true, Dock = DockStyle.Fill, Padding = new Padding(8) };
        layout.Controls.Add(_sessionHeader);
        layout.Controls.Add(_sessionMeta);
        layout.Controls.Add(_draftList);
        layout.Controls.Add(_selectedMinutesLabel);
        layout.Controls.Add(_startButton);
        layout.Controls.Add(_questionPos);
        layout.Controls.Add(_questionTopic);
        layout.Controls.Add(_questionPrompt);
        layout.Controls.Add(_questionReason);
        layout.Controls.Add(new Label { Text = "Your answer", AutoSize = true });
        layout.Controls.Add(_answerBox);
        layout.Controls.Add(new Label { Text = "Choose Got it or Revise again to save your answer. Unrated drafts stay while you move between questions.", AutoSize = true, MaximumSize = new Size(600, 0) });
        var row = new FlowLayoutPanel { AutoSize = true, FlowDirection = FlowDirection.LeftToRight };
        row.Controls.Add(_revealButton);
        row.Controls.Add(_explainButton);
        layout.Controls.Add(row);
        layout.Controls.Add(_referenceBox);
        layout.Controls.Add(_explanationBox);
        var rate = new FlowLayoutPanel { AutoSize = true, FlowDirection = FlowDirection.LeftToRight };
        rate.Controls.Add(_gotItButton);
        rate.Controls.Add(_reviseButton);
        layout.Controls.Add(rate);
        var nav = new FlowLayoutPanel { AutoSize = true, FlowDirection = FlowDirection.LeftToRight };
        nav.Controls.Add(_prevButton);
        nav.Controls.Add(_nextButton);
        nav.Controls.Add(_finishButton);
        layout.Controls.Add(nav);
        box.Controls.Add(layout);
        return box;
    }

    private GroupBox BuildHistoryBox()
    {
        var box = new GroupBox { Text = "Saved sessions", AutoSize = true, Dock = DockStyle.Top, Width = 640 };
        box.Controls.Add(_historyList);
        return box;
    }

    private readonly PendingGuard _guard = new();

    internal async Task BindNotebookAsync(Notebook notebook)
    {
        _notebook = notebook;
        _epoch++;
        await ReloadAsync();
    }

    private void SetBusy(bool busy, bool ai = false)
    {
        _ = ai;
        if (busy)
        {
            _guard.TryEnter();
            _busyBar.Visible = true;
            ApplyBusyEnabled(false);
        }
        else
        {
            _guard.Exit();
            _busyBar.Visible = false;
            // Restore state-correct enabled flags; RenderSession respects the guard.
            RenderSession();
        }
    }

    private void ApplyBusyEnabled(bool enabled)
    {
        _saveGoalButton.Enabled = enabled;
        _buildButton.Enabled = enabled;
        _resumeActiveButton.Enabled = enabled;
        _startButton.Enabled = enabled;
        _revealButton.Enabled = enabled;
        _explainButton.Enabled = enabled;
        _gotItButton.Enabled = enabled;
        _reviseButton.Enabled = enabled;
        _prevButton.Enabled = enabled;
        _nextButton.Enabled = enabled;
        _finishButton.Enabled = enabled;
        _reloadButton.Enabled = enabled;
        _goalTitleBox.Enabled = enabled;
        _examDatePicker.Enabled = enabled;
        _minutesBox.Enabled = enabled;
        _topicsBox.Enabled = enabled;
        _useAiBox.Enabled = enabled;
        _draftList.Enabled = enabled;
        _answerBox.Enabled = enabled;
        _historyList.Enabled = enabled;
    }

    private async Task ReloadAsync()
    {
        var api = _apiFactory();
        if (api is null || _notebook is null)
        {
            return;
        }

        var epoch = _epoch;
        SetBusy(true);
        _errorLabel.Text = string.Empty;
        try
        {
            var state = await api.GetCoachStateAsync(_notebook.Id).ConfigureAwait(true);
            if (epoch != _epoch)
            {
                return;
            }

            _state = state;
            if (state.Goal is not null)
            {
                _goalTitleBox.Text = state.Goal.Title;
                _topicsBox.Text = string.Join(", ", state.Goal.FocusTopics);
                _minutesBox.Value = Math.Min(Math.Max(state.Goal.DailyMinutes, 5), 120);
                if (DateTime.TryParse(state.Goal.ExamDate, out var d))
                {
                    _examDatePicker.Value = d;
                }

                _savedGoalLabel.Text = $"Saved: {state.Goal.Title} · {state.Goal.DailyMinutes} min · {state.Goal.ExamDate}";
            }

            var resume = CoachLogic.ResumeSession(state);
            if (resume is not null)
            {
                _sessionId = resume.Id;
                var next = CoachLogic.NextQuestionIndex(resume);
                _index = Math.Max(0, next);
            }
            else
            {
                _sessionId = null;
                _index = 0;
            }

            _responses.Clear();
            _revealed = false;
            _explanation = null;

            try
            {
                var settings = await api.GetAISettingsAsync().ConfigureAwait(true);
                if (epoch != _epoch)
                {
                    return;
                }

                _aiConfigured = settings.Configured;
            }
            catch (ApiException)
            {
                _aiConfigured = false;
            }

            _useAiBox.Enabled = _aiConfigured;
            _useAiBox.Checked = false;
            UpdateExplainLabel();
            RenderSession();
            RenderHistory();
        }
        catch (ApiException ex)
        {
            if (epoch == _epoch)
            {
                _errorLabel.Text = ex.Message;
            }
        }
        catch (Exception ex)
        {
            if (epoch == _epoch)
            {
                _errorLabel.Text = ex.Message;
            }
        }
        finally
        {
            if (epoch == _epoch)
            {
                SetBusy(false);
            }
        }
    }

    private CoachSession? CurrentSession() => _state?.Sessions.FirstOrDefault(s => s.Id == _sessionId);

    private void UpdateExplainLabel()
    {
        _explainButton.Text = (_useAiBox.Checked && _aiConfigured) ? "Explain with AI" : "Show explanation";
    }

    private void ResumeActive()
    {
        if (_guard.IsBusy)
        {
            return;
        }

        var active = _state?.Sessions.FirstOrDefault(s => s.Status == "active");
        if (active is not null)
        {
            _sessionId = active.Id;
            _index = Math.Max(0, CoachLogic.NextQuestionIndex(active));
            _revealed = false;
            _explanation = null;
            RenderSession();
        }
    }

    private void NavigateTo(int next)
    {
        if (_guard.IsBusy)
        {
            return;
        }

        var session = CurrentSession();
        if (session is null)
        {
            return;
        }

        _index = Math.Clamp(next, 0, Math.Max(0, session.Tasks.Count - 1));
        _revealed = false;
        _explanation = null;
        RenderSession();
    }

    private string? ResponseKey()
    {
        var session = CurrentSession();
        if (session is null || _index < 0 || _index >= session.Tasks.Count)
        {
            return null;
        }

        return $"{session.Id}:{session.Tasks[_index].Id}";
    }

    private void UpdateSelectedMinutes()
    {
        var session = CurrentSession();
        if (session is null)
        {
            _selectedMinutesLabel.Text = string.Empty;
            return;
        }

        var selected = SelectedTaskIds(session);
        var minutes = session.Tasks.Where(t => selected.Contains(t.Id)).Sum(t => t.Minutes);
        _selectedMinutesLabel.Text = $"Selected: {minutes} of {session.Goal.DailyMinutes} minutes";
        _startButton.Enabled = selected.Count > 0 && minutes <= session.Goal.DailyMinutes && !_guard.IsBusy;
    }

    private List<string> SelectedTaskIds(CoachSession session)
    {
        var ids = new List<string>();
        for (var i = 0; i < _draftList.Items.Count && i < session.Tasks.Count; i++)
        {
            if (_draftList.GetItemChecked(i))
            {
                ids.Add(session.Tasks[i].Id);
            }
        }

        return ids;
    }

    private void RenderSession()
    {
        var session = CurrentSession();
        UpdateExplainLabel();
        if (session is null)
        {
            _sessionHeader.Text = "No session yet";
            _sessionMeta.Text = "Save an exam goal, then build a revision session.";
            _draftList.Items.Clear();
            _startButton.Enabled = false;
            _questionPos.Text = string.Empty;
            _questionTopic.Text = string.Empty;
            _questionPrompt.Text = string.Empty;
            _questionReason.Text = string.Empty;
            _answerBox.Text = string.Empty;
            _referenceBox.Visible = false;
            _explanationBox.Visible = false;
            _prevButton.Enabled = false;
            _nextButton.Enabled = false;
            _finishButton.Enabled = false;
            _gotItButton.Enabled = false;
            _reviseButton.Enabled = false;
            EnforceBusy();
            return;
        }

        _sessionHeader.Text = session.Status switch
        {
            "completed" => "Session complete",
            "draft" => "Your revision session",
            _ => "Practice session",
        };
        _sessionMeta.Text = $"{session.Goal.Title} · {session.Tasks.Sum(t => t.Minutes)} min · {(session.GeneratedBy == "ai" ? "AI practice" : "Source-based practice")}"
            + (string.IsNullOrEmpty(session.Notice) ? string.Empty : $" · {session.Notice}");

        var hasActive = _state?.Sessions.Any(s => s.Status == "active") ?? false;
        _buildButton.Enabled = _state?.Goal is not null && !hasActive;
        _resumeActiveButton.Enabled = hasActive;

        if (session.Status == "draft")
        {
            _draftList.Items.Clear();
            foreach (var t in session.Tasks)
            {
                _draftList.Items.Add($"{t.Topic} · {t.Minutes} min — {t.Prompt}", true);
            }

            UpdateSelectedMinutes();
            _startButton.Enabled = session.Tasks.Count > 0 && !_guard.IsBusy;
            _questionPos.Text = "Choose your questions and their order before starting.";
            _questionTopic.Text = string.Empty;
            _questionPrompt.Text = string.Empty;
            _answerBox.Text = string.Empty;
            _referenceBox.Visible = false;
            _explanationBox.Visible = false;
            _prevButton.Enabled = false;
            _nextButton.Enabled = false;
            _finishButton.Enabled = false;
            EnforceBusy();
            return;
        }

        if (session.Status == "completed")
        {
            var revise = session.Attempts.Count(a => a.Rating == "revise");
            _questionPos.Text = $"{revise} topic{(revise == 1 ? "" : "s")} to revisit in your next session.";
            _questionTopic.Text = "Your ratings guide the next plan. They do not estimate your exam score.";
            _questionPrompt.Text = string.Empty;
            _questionReason.Text = string.Empty;
            _answerBox.Text = string.Empty;
            _referenceBox.Visible = false;
            _explanationBox.Visible = false;
            _draftList.Items.Clear();
            _startButton.Enabled = false;
            _prevButton.Enabled = false;
            _nextButton.Enabled = false;
            _finishButton.Enabled = false;
            _gotItButton.Enabled = false;
            _reviseButton.Enabled = false;
            EnforceBusy();
            return;
        }

        // Active: single question view.
        _draftList.Items.Clear();
        _startButton.Enabled = false;
        if (_index < 0 || _index >= session.Tasks.Count)
        {
            _index = Math.Max(0, CoachLogic.NextQuestionIndex(session));
        }

        var task = session.Tasks[_index];
        var attempt = session.Attempts.FirstOrDefault(a => a.TaskId == task.Id);
        var key = $"{session.Id}:{task.Id}";
        _questionPos.Text = $"Question {_index + 1} of {session.Tasks.Count} · {session.Attempts.Count} answered";
        _questionTopic.Text = task.Topic;
        _questionPrompt.Text = task.Prompt;
        _questionReason.Text = task.Reason;
        var savedText = _responses.TryGetValue(key, out var draft) ? draft : (attempt?.Response ?? string.Empty);
        if (_answerBox.Text != savedText)
        {
            _answerBox.Text = savedText;
        }

        _prevButton.Enabled = _index > 0;
        _nextButton.Enabled = _index < session.Tasks.Count - 1;

        if (_revealed)
        {
            var cite = task.SourceId is not null
                ? $"\n\n{task.SourceTitle ?? "Course source"}{(task.Pages.Count == 0 ? string.Empty : $" · p. {string.Join(", ", task.Pages)}")}"
                : string.Empty;
            _referenceBox.Text = task.Answer + cite + "\n\nCompare your answer, then choose how to revise. These ratings are your self-assessment.";
            _referenceBox.Visible = true;
        }
        else
        {
            _referenceBox.Visible = false;
        }

        if (_explanation is not null)
        {
            var cites = string.Join("\n", _explanation.Citations.Select(c => $"{c.SourceTitle} · p. {string.Join(", ", c.Pages)}"));
            _explanationBox.Text = $"[{_explanation.GeneratedBy}] {_explanation.Answer}"
                + (string.IsNullOrEmpty(_explanation.Notice) ? string.Empty : $"\n\n{_explanation.Notice}")
                + (string.IsNullOrEmpty(cites) ? string.Empty : $"\n\n{cites}")
                + (_explanation.Model is null ? string.Empty : $"\n\n{_explanation.Model}");
            _explanationBox.Visible = true;
        }
        else
        {
            _explanationBox.Visible = false;
        }

        var canRate = _revealed || _explanation is not null || attempt is not null;
        _gotItButton.Enabled = canRate && !_guard.IsBusy;
        _reviseButton.Enabled = canRate && !_guard.IsBusy;
        _finishButton.Enabled = CoachLogic.IsComplete(session) && !_guard.IsBusy;
        if (!_guard.IsBusy)
        {
            _prevButton.Enabled = _index > 0;
            _nextButton.Enabled = _index < session.Tasks.Count - 1;
        }
        else
        {
            _prevButton.Enabled = false;
            _nextButton.Enabled = false;
        }

        EnforceBusy();
    }

    private void EnforceBusy()
    {
        if (_guard.IsBusy)
        {
            ApplyBusyEnabled(false);
            _busyBar.Visible = true;
        }
    }

    private void RenderHistory()
    {
        _historyList.Items.Clear();
        var done = _state?.Sessions.Where(s => s.Status == "completed").ToList() ?? [];
        if (done.Count == 0)
        {
            return;
        }

        foreach (var s in done)
        {
            _historyList.Items.Add(s);
        }

        _historyList.DisplayMember = "Id";
    }

    private void Upsert(CoachSession session)
    {
        var sessions = _state?.Sessions.Where(s => s.Id != session.Id).ToList() ?? [];
        // Drop stale drafts like the web client does; keep actives + completed.
        sessions.RemoveAll(s => s.Status == "draft" && s.Id != session.Id);
        sessions.Insert(0, session);
        if (_state is not null)
        {
            _state = _state with { Sessions = sessions };
        }

        _sessionId = session.Id;
        _revealed = false;
        _explanation = null;
        var next = CoachLogic.NextQuestionIndex(session);
        if (next >= 0)
        {
            _index = Math.Min(_index, Math.Max(0, session.Tasks.Count - 1));
            if (CoachLogic.ResumeSession(_state!)?.Id == session.Id && next >= 0)
            {
                // Keep the user's place unless the next unanswered moved earlier.
                _index = Math.Min(_index, session.Tasks.Count - 1);
            }
        }

        RenderSession();
        RenderHistory();
    }

    // ---------- API calls ----------

    private async Task SaveGoalAsync()
    {
        if (_guard.IsBusy)
        {
            return;
        }

        var api = _apiFactory();
        if (api is null || _notebook is null)
        {
            return;
        }

        if (string.IsNullOrWhiteSpace(_goalTitleBox.Text))
        {
            _errorLabel.Text = "Enter an exam title.";
            return;
        }

        var epoch = _epoch;
        SetBusy(true);
        _errorLabel.Text = string.Empty;
        try
        {
            var topics = _topicsBox.Text.Split(',').Select(t => t.Trim()).Where(t => !string.IsNullOrEmpty(t)).ToList();
            var goal = new ExamGoal(
                _goalTitleBox.Text.Trim(),
                _examDatePicker.Value.ToString("yyyy-MM-dd"),
                (int)_minutesBox.Value,
                topics);
            var saved = await api.SaveExamGoalAsync(_notebook.Id, goal).ConfigureAwait(true);
            if (epoch != _epoch)
            {
                return;
            }

            if (_state is not null)
            {
                _state = _state with { Goal = saved };
            }

            _savedGoalLabel.Text = $"Saved: {saved.Title} · {saved.DailyMinutes} min · {saved.ExamDate}";
            RenderSession();
        }
        catch (ApiException ex)
        {
            if (epoch == _epoch)
            {
                _errorLabel.Text = ex.Message;
            }
        }
        catch (Exception ex)
        {
            if (epoch == _epoch)
            {
                _errorLabel.Text = ex.Message;
            }
        }
        finally
        {
            if (epoch == _epoch)
            {
                SetBusy(false);
            }
        }
    }

    private async Task BuildAsync()
    {
        if (_guard.IsBusy)
        {
            return;
        }

        var api = _apiFactory();
        if (api is null || _notebook is null)
        {
            return;
        }

        var epoch = _epoch;
        SetBusy(true, _useAiBox.Checked && _aiConfigured);
        _errorLabel.Text = string.Empty;
        try
        {
            var session = await api.BuildCoachSessionAsync(_notebook.Id, _useAiBox.Checked && _aiConfigured).ConfigureAwait(true);
            if (epoch != _epoch)
            {
                return;
            }

            Upsert(session);
        }
        catch (ApiException ex)
        {
            if (epoch == _epoch)
            {
                _errorLabel.Text = ex.Message;
            }
        }
        catch (Exception ex)
        {
            if (epoch == _epoch)
            {
                _errorLabel.Text = ex.Message;
            }
        }
        finally
        {
            if (epoch == _epoch)
            {
                SetBusy(false);
            }
        }
    }

    private async Task StartAsync()
    {
        if (_guard.IsBusy)
        {
            return;
        }

        var api = _apiFactory();
        var session = CurrentSession();
        if (api is null || _notebook is null || session is null)
        {
            return;
        }

        var taskIds = SelectedTaskIds(session);
        if (taskIds.Count == 0)
        {
            _errorLabel.Text = "Select at least one question.";
            return;
        }

        var epoch = _epoch;
        SetBusy(true);
        _errorLabel.Text = string.Empty;
        try
        {
            var started = await api.StartCoachSessionAsync(_notebook.Id, session.Id, taskIds).ConfigureAwait(true);
            if (epoch != _epoch)
            {
                return;
            }

            Upsert(started);
            _index = 0;
            RenderSession();
        }
        catch (ApiException ex)
        {
            if (epoch == _epoch)
            {
                _errorLabel.Text = ex.Message;
            }
        }
        catch (Exception ex)
        {
            if (epoch == _epoch)
            {
                _errorLabel.Text = ex.Message;
            }
        }
        finally
        {
            if (epoch == _epoch)
            {
                SetBusy(false);
            }
        }
    }

    private async Task RateAsync(string rating)
    {
        if (_guard.IsBusy)
        {
            return;
        }

        var api = _apiFactory();
        var session = CurrentSession();
        if (api is null || _notebook is null || session is null)
        {
            return;
        }

        if (_index < 0 || _index >= session.Tasks.Count)
        {
            return;
        }

        var task = session.Tasks[_index];
        var key = $"{session.Id}:{task.Id}";
        var text = _responses.TryGetValue(key, out var draft) ? draft : (session.Attempts.FirstOrDefault(a => a.TaskId == task.Id)?.Response ?? _answerBox.Text ?? string.Empty);

        var epoch = _epoch;
        SetBusy(true);
        _errorLabel.Text = string.Empty;
        try
        {
            var updated = await api.RecordCoachAttemptAsync(_notebook.Id, session.Id, task.Id, rating, text).ConfigureAwait(true);
            if (epoch != _epoch)
            {
                return;
            }

            _responses.Remove(key);
            Upsert(updated);
            // Advance to the next unanswered question when possible.
            var next = CoachLogic.NextQuestionIndex(updated);
            if (next >= 0)
            {
                _index = next;
                _revealed = false;
                _explanation = null;
                RenderSession();
            }
            else
            {
                RenderSession();
            }
        }
        catch (ApiException ex)
        {
            if (epoch == _epoch)
            {
                _errorLabel.Text = ex.Message;
            }
        }
        catch (Exception ex)
        {
            if (epoch == _epoch)
            {
                _errorLabel.Text = ex.Message;
            }
        }
        finally
        {
            if (epoch == _epoch)
            {
                SetBusy(false);
            }
        }
    }

    private async Task ExplainAsync()
    {
        if (_guard.IsBusy)
        {
            return;
        }

        var api = _apiFactory();
        var session = CurrentSession();
        if (api is null || _notebook is null || session is null)
        {
            return;
        }

        if (_index < 0 || _index >= session.Tasks.Count)
        {
            return;
        }

        var task = session.Tasks[_index];
        var epoch = _epoch;
        SetBusy(true, _useAiBox.Checked && _aiConfigured);
        _errorLabel.Text = string.Empty;
        try
        {
            var explanation = await api.ExplainCoachTaskAsync(_notebook.Id, session.Id, task.Id, _useAiBox.Checked && _aiConfigured).ConfigureAwait(true);
            if (epoch != _epoch)
            {
                return;
            }

            _explanation = explanation;
            RenderSession();
        }
        catch (ApiException ex)
        {
            if (epoch == _epoch)
            {
                _errorLabel.Text = ex.Message;
            }
        }
        catch (Exception ex)
        {
            if (epoch == _epoch)
            {
                _errorLabel.Text = ex.Message;
            }
        }
        finally
        {
            if (epoch == _epoch)
            {
                SetBusy(false);
            }
        }
    }

    private async Task FinishAsync()
    {
        if (_guard.IsBusy)
        {
            return;
        }

        var api = _apiFactory();
        var session = CurrentSession();
        if (api is null || _notebook is null || session is null)
        {
            return;
        }

        var epoch = _epoch;
        SetBusy(true);
        _errorLabel.Text = string.Empty;
        try
        {
            var finished = await api.FinishCoachSessionAsync(_notebook.Id, session.Id).ConfigureAwait(true);
            if (epoch != _epoch)
            {
                return;
            }

            Upsert(finished);
        }
        catch (ApiException ex)
        {
            if (epoch == _epoch)
            {
                _errorLabel.Text = ex.Message;
            }
        }
        catch (Exception ex)
        {
            if (epoch == _epoch)
            {
                _errorLabel.Text = ex.Message;
            }
        }
        finally
        {
            if (epoch == _epoch)
            {
                SetBusy(false);
            }
        }
    }
}
