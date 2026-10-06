import Foundation

// MARK: - Account

struct UserPublic: Codable, Equatable, Sendable {
    var id: String
    var email: String
}

struct AuthResponse: Codable, Sendable {
    var user: UserPublic
    var token: String
}

enum RegisterOutcome: Sendable {
    case authed(AuthResponse)
    case duplicate(detail: String)
}

// MARK: - Notebooks / sources

struct Notebook: Codable, Identifiable, Equatable, Sendable {
    var id: String
    var name: String
    var createdAt: String
}

struct SourcePage: Codable, Equatable, Sendable {
    var number: Int
    var text: String
}

struct SourceChunk: Codable, Equatable, Sendable {
    var seq: Int
    var pages: [Int]
    var text: String
}

struct ImportantPassage: Codable, Equatable, Sendable {
    var text: String
    var score: Double
    var chunkSeq: Int
    var pages: [Int]
}

struct SourceSummary: Codable, Identifiable, Equatable, Sendable {
    var id: String
    var notebookId: String
    var kind: String
    var title: String
    var tags: [String]
    var createdAt: String
    var chunkCount: Int
}

struct SourceDetail: Codable, Identifiable, Equatable, Sendable {
    var id: String
    var notebookId: String
    var kind: String
    var title: String
    var tags: [String]
    var createdAt: String
    var pages: [SourcePage]
    var chunks: [SourceChunk]
    var canonicalUrl: String?
    var siteName: String?
    var byline: String?
    var published: String?
    var importantPassages: [ImportantPassage]?

    var fullText: String {
        if !pages.isEmpty { return pages.map { $0.text }.joined(separator: "\n\n") }
        return chunks.map { $0.text }.joined(separator: "\n\n")
    }
}

struct SourceChunksPage: Codable, Sendable {
    var total: Int
    var chunks: [SourceChunk]
}

struct DuplicateRef: Codable, Equatable, Sendable {
    var id: String
    var title: String
}

struct PasteResult: Sendable {
    var saved: Bool
    var duplicateOf: DuplicateRef?
    var summary: SourceSummary?
}

// MARK: - Coach (mirrors backend/core/models.py + frontend api/types/coach.ts)

struct ExamGoal: Codable, Equatable, Sendable {
    var title: String
    var examDate: String
    var dailyMinutes: Int
    var focusTopics: [String]
}

struct CoachCitation: Codable, Equatable, Sendable {
    var sourceId: String
    var sourceTitle: String
    var pages: [Int]
}

struct CoachTask: Codable, Identifiable, Equatable, Sendable {
    var id: String
    var topic: String
    var prompt: String
    var answer: String
    var minutes: Int
    var reason: String
    var sourceId: String?
    var sourceTitle: String?
    var pages: [Int]
    var chunkSeq: Int?
    var cardId: String?
}

struct CoachAttempt: Codable, Equatable, Sendable {
    var taskId: String
    var rating: String
    var response: String
    var createdAt: String
}

struct CoachSession: Codable, Identifiable, Equatable, Sendable {
    var id: String
    var notebookId: String
    var goal: ExamGoal
    var status: String
    var generatedBy: String
    var notice: String?
    var tasks: [CoachTask]
    var attempts: [CoachAttempt]
    var createdAt: String
    var completedAt: String?
}

struct CoachState: Codable, Equatable, Sendable {
    var goal: ExamGoal?
    var sessions: [CoachSession]
}

struct CoachExplanation: Codable, Equatable, Sendable {
    var answer: String
    var citations: [CoachCitation]
    var model: String?
    var generatedBy: String
    var notice: String?
}

// MARK: - AI settings (mirrors GET/PUT /api/settings/ai)

struct AISettings: Codable, Equatable, Sendable {
    var configured: Bool
    var provider: String?
    var model: String?
}

// MARK: - Coach helpers (resume/next-question logic shared by app + tests)

enum CoachLogic {
    /// Mirrors ExamCoachPanel: prefer the active session, else the first saved one.
    static func resumeSession(in state: CoachState) -> CoachSession? {
        state.sessions.first(where: { $0.status == "active" }) ?? state.sessions.first
    }

    /// Index of the first task without a saved attempt (-1 when all rated).
    static func nextQuestionIndex(in session: CoachSession) -> Int {
        session.tasks.firstIndex(where: { task in
            !session.attempts.contains(where: { $0.taskId == task.id })
        }) ?? -1
    }

    static func isComplete(_ session: CoachSession) -> Bool {
        !session.tasks.isEmpty && session.tasks.allSatisfy { task in
            session.attempts.contains(where: { $0.taskId == task.id })
        }
    }
}
