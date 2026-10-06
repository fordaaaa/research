import SwiftUI

/// Native exam coach: goal → build → select → start/resume → write →
/// reveal → self-rate → finish → history, plus basic/AI explanations.
struct CoachView: View {
    @EnvironmentObject private var appState: AppState
    let notebook: Notebook

    @State private var state: CoachState?
    @State private var goalTitle = ""
    @State private var examDate = Calendar.current.date(byAdding: .day, value: 7, to: Date()) ?? Date()
    @State private var dailyMinutes = 20
    @State private var focusTopics = ""
    @State private var useAi = false
    @State private var aiConfigured = false
    @State private var sessionId: String?
    @State private var selected: [String] = []
    @State private var index = 0
    @State private var responses: [String: String] = [:]
    @State private var revealed = false
    @State private var explanation: CoachExplanation?
    @State private var busy: String?
    @State private var error: String?

    private static let dayFmt: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        return f
    }()

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                header
                if let error {
                    Text(error).font(.callout).foregroundStyle(.red)
                    Button("Reload coach") { Task { await load() } }
                }
                if busy != nil && busy?.hasPrefix("ai-") == true {
                    NativeAIActivity(label: "Waiting for AI…")
                } else if busy != nil {
                    ProgressView("Saving your revision progress…")
                }
                goalCard
                if let session = currentSession {
                    sessionCard(session)
                }
                historyCard
            }.padding().frame(maxWidth: 720, alignment: .leading)
        }
        .disabled(busy != nil)
        .task(id: notebook.id) { await load() }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Your exam coach").font(.title2.bold())
            Text("Know what to study next. Use your course material, practise, and revisit what you missed.")
                .font(.callout).foregroundStyle(.secondary)
        }
    }

    private var currentSession: CoachSession? {
        state?.sessions.first(where: { $0.id == sessionId })
    }

    // MARK: - Goal

    private var goalCard: some View {
        GroupBox("Exam goal") {
            VStack(alignment: .leading, spacing: 8) {
                TextField("Exam title", text: $goalTitle).textFieldStyle(.roundedBorder)
                HStack {
                    DatePicker("Exam date", selection: $examDate, displayedComponents: .date)
                    Stepper("Minutes: \(dailyMinutes)", value: $dailyMinutes, in: 5...120)
                }
                TextField("Focus topics, comma separated (optional)", text: $focusTopics).textFieldStyle(.roundedBorder)
                HStack {
                    Button("Save exam goal") { Task { await saveGoal() } }
                        .disabled(busy != nil || goalTitle.trimmingCharacters(in: .whitespaces).isEmpty)
                    Toggle("Use AI for practice", isOn: $useAi).disabled(!aiConfigured)
                }
                if !aiConfigured {
                    Text("Source-based practice works now. Add an optional AI key in Settings for explanations.")
                        .font(.caption).foregroundStyle(.secondary)
                }
                if let g = state?.goal {
                    Text("Saved: \(g.title) · \(g.dailyMinutes) min · \(g.examDate)").font(.caption).foregroundStyle(.secondary)
                }
                Button("Build revision session") { Task { await build() } }
                    .disabled(busy != nil || state?.goal == nil || hasActive || goalDirty)
                if hasActive {
                    HStack {
                        Text("Finish your active session before building another.").font(.callout).foregroundStyle(.secondary)
                        Button("Resume active session") {
                            if let active = state?.sessions.first(where: { $0.status == "active" }) {
                                sessionId = active.id
                                index = max(0, CoachLogic.nextQuestionIndex(in: active))
                                revealed = false; explanation = nil
                            }
                        }
                    }
                }
            }
        }
    }

    private var hasActive: Bool { state?.sessions.contains(where: { $0.status == "active" }) ?? false }

    private var goalDirty: Bool {
        guard let g = state?.goal else { return true }
        let topics = focusTopics.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        return g.title != goalTitle.trimmingCharacters(in: .whitespaces)
            || g.examDate != Self.dayFmt.string(from: examDate)
            || g.dailyMinutes != dailyMinutes
            || g.focusTopics != topics
    }

    // MARK: - Session

    private func sessionCard(_ session: CoachSession) -> some View {
        GroupBox(session.status == "completed" ? "Session complete" : session.status == "draft" ? "Your revision session" : "Practice session") {
            VStack(alignment: .leading, spacing: 10) {
                Text("\(session.goal.title) · \(session.tasks.reduce(0) { $0 + $1.minutes }) min · \(session.generatedBy == "ai" ? "AI practice" : "Source-based practice")")
                    .font(.caption).foregroundStyle(.secondary)
                if let n = session.notice, !n.isEmpty { Text(n).font(.callout).foregroundStyle(.orange) }
                if session.status == "draft" {
                    draftList(session)
                } else if session.status == "active" {
                    if let task = session.tasks.indices.contains(index) ? session.tasks[index] : nil {
                        activeQuestion(session, task: task)
                    }
                } else {
                    completedList(session)
                }
            }
        }
    }

    private func draftList(_ session: CoachSession) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Choose your questions and their order before starting.").font(.callout).foregroundStyle(.secondary)
            ForEach(session.tasks) { item in
                Toggle(isOn: Binding(
                    get: { selected.contains(item.id) },
                    set: { on in
                        if on { if !selected.contains(item.id) { selected.append(item.id) } }
                        else { selected.removeAll { $0 == item.id } }
                    }
                )) {
                    VStack(alignment: .leading) {
                        Text("\(item.topic) · \(item.minutes) min").font(.headline)
                        Text(item.prompt).font(.callout).foregroundStyle(.secondary)
                        Text(item.reason).font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
            Text("Selected: \(selectedMinutes(session)) of \(session.goal.dailyMinutes) minutes").font(.callout).foregroundStyle(.secondary)
            Button("Start selected session") { Task { await start(session) } }
                .disabled(busy != nil || selected.isEmpty || selected.count > 10 || selectedMinutes(session) > session.goal.dailyMinutes)
            Text("Choose up to 10 questions within your time budget.").font(.caption).foregroundStyle(.secondary)
        }
    }

    private func selectedMinutes(_ session: CoachSession) -> Int {
        session.tasks.filter { selected.contains($0.id) }.reduce(0) { $0 + $1.minutes }
    }

    private func activeQuestion(_ session: CoachSession, task: CoachTask) -> some View {
        let key = "\(session.id):\(task.id)"
        let attempt = session.attempts.first(where: { $0.taskId == task.id })
        return VStack(alignment: .leading, spacing: 8) {
            Text("Question \(index + 1) of \(session.tasks.count) · \(session.attempts.count) answered")
                .font(.caption).foregroundStyle(.secondary)
            Text(task.topic).font(.headline)
            Text(task.prompt)
            Text(task.reason).font(.caption).foregroundStyle(.secondary)
            Text("Your answer").font(.caption.bold())
            TextEditor(text: Binding(get: { responses[key] ?? attempt?.response ?? "" }, set: { responses[key] = $0 }))
                .frame(minHeight: 90).border(Color.secondary.opacity(0.3))
            Text("Choose Got it or Revise again to save your answer. Unrated drafts stay while you move between questions.")
                .font(.caption).foregroundStyle(.secondary)
            HStack {
                Button("Show reference answer") { revealed = true }
                Button(useAi && aiConfigured ? "Explain with AI" : "Show explanation") {
                    Task { await explain(session, task: task) }
                }
            }
            if revealed {
                GroupBox("Reference answer") {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(task.answer).textSelection(.enabled)
                        if task.sourceId != nil {
                            Text("\(task.sourceTitle ?? "Course source")\(task.pages.isEmpty ? "" : " · p. \(task.pages.map(String.init).joined(separator: ", "))")")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                        Text("Compare your answer, then choose how to revise. These ratings are your self-assessment.")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
            if let explanation {
                GroupBox("Explanation (\(explanation.generatedBy))") {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(explanation.answer).textSelection(.enabled)
                        if let n = explanation.notice, !n.isEmpty { Text(n).font(.callout).foregroundStyle(.orange) }
                        ForEach(explanation.citations, id: \.sourceId) { c in
                            Text("\(c.sourceTitle) · p. \(c.pages.map(String.init).joined(separator: ", "))").font(.caption).foregroundStyle(.secondary)
                        }
                        if let m = explanation.model { Text(m).font(.caption2).foregroundStyle(.tertiary) }
                    }
                }
            }
            if revealed || explanation != nil || attempt != nil {
                HStack {
                    Button("Got it") { Task { await rate(session, task: task, rating: "got_it") } }
                    Button("Revise again") { Task { await rate(session, task: task, rating: "revise") } }
                }
            }
            HStack {
                Button("Previous question") { navigate(to: index - 1) }.disabled(index == 0)
                Button("Next question") { navigate(to: index + 1) }.disabled(index >= session.tasks.count - 1)
                if CoachLogic.isComplete(session) || allRatedLocally(session) {
                    Button("Finish session") { Task { await finish(session) } }
                }
            }
        }
    }

    private func allRatedLocally(_ session: CoachSession) -> Bool {
        // Attempt counts come from the server; local drafts without ratings still block finish server-side.
        CoachLogic.isComplete(session)
    }

    private func completedList(_ session: CoachSession) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            let revise = session.attempts.filter { $0.rating == "revise" }.count
            Text("\(revise) topic\(revise == 1 ? "" : "s") to revisit in your next session.").font(.callout)
            Text("Your ratings guide the next plan. They do not estimate your exam score.").font(.caption).foregroundStyle(.secondary)
            ForEach(session.tasks) { item in
                let saved = session.attempts.first(where: { $0.taskId == item.id })
                DisclosureGroup("\(item.topic) · \(saved?.rating == "revise" ? "Revisit" : "Got it")") {
                    VStack(alignment: .leading, spacing: 6) {
                        Text((saved?.response.isEmpty == false) ? saved!.response : "No written answer")
                        Text("Reference: \(item.answer)").font(.callout).foregroundStyle(.secondary).textSelection(.enabled)
                    }
                }
            }
        }
    }

    private var historyCard: some View {
        GroupBox("Saved sessions") {
            let done = state?.sessions.filter { $0.status == "completed" } ?? []
            if done.isEmpty {
                Text("No finished sessions yet.").font(.callout).foregroundStyle(.secondary)
            } else {
                FlowWrapping(buttons: done.map { s in
                    (label: "\(s.goal.title) · \(s.attempts.count) answers", id: s.id)
                }, selectedId: $sessionId, onPick: { id in
                    sessionId = id; navigate(to: 0); revealed = false; explanation = nil
                })
            }
        }
    }

    private func navigate(to next: Int) {
        index = next; revealed = false; explanation = nil
    }

    // MARK: - API calls

    private func api() -> NotaeoAPI? { appState.makeAPI() }

    private func load() async {
        guard let api = api() else { return }
        busy = "load"; error = nil; defer { busy = nil }
        do {
            let s = try await api.getCoachState(notebookId: notebook.id)
            guard !Task.isCancelled else { return }
            state = s
            if let g = s.goal {
                goalTitle = g.title
                focusTopics = g.focusTopics.joined(separator: ", ")
                dailyMinutes = g.dailyMinutes
                if let d = Self.dayFmt.date(from: g.examDate) { examDate = d }
            }
            if let resume = CoachLogic.resumeSession(in: s) {
                sessionId = resume.id
                selected = resume.tasks.map { $0.id }
                let next = CoachLogic.nextQuestionIndex(in: resume)
                index = max(0, next)
            } else {
                sessionId = nil
            }
            responses = [:]; revealed = false; explanation = nil
            let settings = try? await api.getAISettings()
            aiConfigured = settings?.configured ?? false
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }

    private func saveGoal() async {
        guard let api = api() else { return }
        busy = "save"; error = nil; defer { busy = nil }
        let topics = focusTopics.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        let goal = ExamGoal(title: goalTitle.trimmingCharacters(in: .whitespaces), examDate: Self.dayFmt.string(from: examDate), dailyMinutes: dailyMinutes, focusTopics: topics)
        do {
            let saved = try await api.saveExamGoal(notebookId: notebook.id, goal: goal)
            state?.goal = saved
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }

    private func build() async {
        guard let api = api() else { return }
        busy = (useAi && aiConfigured) ? "ai-plan" : "plan"; error = nil; defer { busy = nil }
        do {
            let s = try await api.buildCoachSession(notebookId: notebook.id, useAi: useAi && aiConfigured)
            upsert(s)
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }

    private func start(_ session: CoachSession) async {
        guard let api = api() else { return }
        busy = "start"; error = nil; defer { busy = nil }
        do {
            let s = try await api.startCoachSession(notebookId: notebook.id, sessionId: session.id, taskIds: selected)
            upsert(s)
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }

    private func rate(_ session: CoachSession, task: CoachTask, rating: String) async {
        guard let api = api() else { return }
        busy = "attempt"; error = nil; defer { busy = nil }
        let key = "\(session.id):\(task.id)"
        let text = responses[key] ?? session.attempts.first(where: { $0.taskId == task.id })?.response ?? ""
        do {
            let s = try await api.recordCoachAttempt(notebookId: notebook.id, sessionId: session.id, taskId: task.id, rating: rating, response: text)
            responses.removeValue(forKey: key)
            upsert(s)
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }

    private func explain(_ session: CoachSession, task: CoachTask) async {
        guard let api = api() else { return }
        busy = (useAi && aiConfigured) ? "ai-explanation" : "explanation"; error = nil; defer { busy = nil }
        do {
            explanation = try await api.explainCoachTask(notebookId: notebook.id, sessionId: session.id, taskId: task.id, useAi: useAi && aiConfigured)
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }

    private func finish(_ session: CoachSession) async {
        guard let api = api() else { return }
        busy = "finish"; error = nil; defer { busy = nil }
        do {
            let s = try await api.finishCoachSession(notebookId: notebook.id, sessionId: session.id)
            upsert(s)
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }

    private func upsert(_ session: CoachSession) {
        let previousSessionId = sessionId
        var sessions = state?.sessions.filter { $0.id != session.id } ?? []
        // Drop stale drafts like the web client does; keep actives + completed.
        sessions.removeAll(where: { $0.status == "draft" && $0.id != session.id })
        sessions.insert(session, at: 0)
        state?.sessions = sessions
        sessionId = session.id
        selected = session.tasks.map { $0.id }
        let next = CoachLogic.nextQuestionIndex(in: session)
        if session.id != previousSessionId { index = max(0, next) }
        else if next >= 0 { index = min(index, session.tasks.count - 1) }
        revealed = false; explanation = nil
    }
}

struct NativeAIActivity: View {
    let label: String
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @AppStorage("notaeo.native.reduceMotion") private var reduceMotion = false

    var body: some View {
        HStack(spacing: 10) {
            TimelineView(.animation(minimumInterval: 1.0 / 30, paused: reduceMotion || systemReduceMotion)) { context in
                HStack(spacing: 4) {
                    ForEach(0..<3) { index in
                        let phase = context.date.timeIntervalSinceReferenceDate * 4 - Double(index) * 0.8
                        Circle().fill(.tint).frame(width: 6, height: 6)
                            .opacity(reduceMotion || systemReduceMotion ? 0.7 : 0.55 + 0.3 * sin(phase))
                            .offset(y: reduceMotion || systemReduceMotion ? 0 : -2 * max(0, sin(phase)))
                    }
                }.frame(height: 18)
            }.accessibilityHidden(true)
            Text(label).font(.callout).foregroundStyle(.secondary)
        }.accessibilityElement(children: .combine)
    }
}

private struct FlowWrapping: View {
    let buttons: [(label: String, id: String)]
    @Binding var selectedId: String?
    let onPick: (String) -> Void
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(buttons, id: \.id) { b in
                Button(b.label) { onPick(b.id) }
                    .buttonStyle(.link)
                    .opacity(b.id == selectedId ? 1 : 0.8)
            }
        }
    }
}
