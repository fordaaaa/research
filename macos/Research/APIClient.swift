import Foundation

// MARK: - Errors

enum APIError: LocalizedError, Equatable, Sendable {
    case unauthorized(String)
    case forbidden(String)
    case notFound(String)
    case rateLimited(retryAfter: Int?)
    case validation(String)
    case server(status: Int, message: String)
    case decoding(String)
    case network(String)

    var errorDescription: String? {
        switch self {
        case .unauthorized(let m): return m.isEmpty ? "login required" : m
        case .forbidden(let m): return m.isEmpty ? "desktop session required" : m
        case .notFound(let m): return m.isEmpty ? "not found" : m
        case .rateLimited(let r):
            if let r { return "Too many attempts — try again in \(r)s" }
            return "Too many attempts — try again shortly"
        case .validation(let m): return m
        case .server(let s, let m): return m.isEmpty ? "request failed (\(s))" : m
        case .decoding(let m): return m
        case .network(let m): return m
        }
    }
}

// MARK: - Client

/// Native JSON API client for the Notaeo sidecar.
///
/// Contract (matches frontend/src/api/*):
/// - JSON uses snake_case on the wire; Swift uses camelCase.
/// - Account auth is `Authorization: Bearer <token>`.
/// - Desktop loopback guard is `X-Notaeo-Desktop-Token: <per-launch token>`.
/// - Base URL is the loopback sidecar root (e.g. http://127.0.0.1:PORT).
protocol NotebookSearching: Sendable {
    func searchNotebook(notebookId: String, request: NativeSearchRequest) async throws -> SearchPage
}

final class NotaeoAPI: NotebookSearching {
    static let desktopTokenHeader = "X-Notaeo-Desktop-Token"

    let baseURL: URL
    let desktopToken: String
    private let session: URLSession
    private let accountToken: @Sendable () -> String?
    private let onUnauthorized: @Sendable () async -> Void

    init(
        baseURL: URL,
        desktopToken: String,
        session: URLSession = .shared,
        accountToken: @escaping @Sendable () -> String? = { nil },
        onUnauthorized: @escaping @Sendable () async -> Void = {}
    ) {
        self.baseURL = baseURL
        self.desktopToken = desktopToken
        self.session = session
        self.accountToken = accountToken
        self.onUnauthorized = onUnauthorized
    }

    var decoder: JSONDecoder {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        return d
    }

    var encoder: JSONEncoder {
        let e = JSONEncoder()
        e.keyEncodingStrategy = .convertToSnakeCase
        return e
    }

    // MARK: - Low level

    struct RawResponse {
        var data: Data
        var status: Int
        var retryAfter: Int?
    }

    func send(path: String, method: String, query: [String: String] = [:], json: Encodable? = nil, contentType: String? = nil, body: Data? = nil) async throws -> RawResponse {
        var comps = URLComponents(url: baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false)!
        if !query.isEmpty {
            comps.queryItems = query.map { URLQueryItem(name: $0.key, value: $0.value) }
        }
        guard let url = comps.url else { throw APIError.network("bad request URL") }
        var req = URLRequest(url: url)
        req.httpMethod = method
        if !desktopToken.isEmpty {
            req.setValue(desktopToken, forHTTPHeaderField: Self.desktopTokenHeader)
        }
        if let token = accountToken(), !token.isEmpty {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let json {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try encoder.encode(AnyEncodable(json))
        } else if let body {
            if let contentType { req.setValue(contentType, forHTTPHeaderField: "Content-Type") }
            req.httpBody = body
        }
        let data: Data
        let resp: URLResponse
        do {
            (data, resp) = try await session.data(for: req)
        } catch {
            throw APIError.network(error.localizedDescription)
        }
        guard let http = resp as? HTTPURLResponse else { throw APIError.network("bad response") }
        let retry = http.value(forHTTPHeaderField: "Retry-After").flatMap { Int($0.trimmingCharacters(in: .whitespaces)) }
        if (200...299).contains(http.statusCode) {
            return RawResponse(data: data, status: http.statusCode, retryAfter: retry)
        }
        if http.statusCode == 401 { await onUnauthorized() }
        throw mapError(status: http.statusCode, data: data, retryAfter: retry)
    }

    func mapError(status: Int, data: Data, retryAfter: Int?) -> APIError {
        let detail = detailMessage(from: data) ?? HTTPURLResponse.localizedString(forStatusCode: status)
        switch status {
        case 401: return .unauthorized(detail)
        case 403: return .forbidden(detail)
        case 404: return .notFound(detail)
        case 429: return .rateLimited(retryAfter: retryAfter)
        case 400, 409, 422: return .validation(detail)
        default: return .server(status: status, message: detail)
        }
    }

    func detailMessage(from data: Data) -> String? {
        guard !data.isEmpty,
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let detail = obj["detail"] else { return nil }
        if let s = detail as? String, !s.isEmpty { return s }
        if let arr = detail as? [[String: Any]] {
            let msgs = arr.compactMap { $0["msg"] as? String }.filter { !$0.isEmpty }
            if !msgs.isEmpty { return msgs.joined(separator: "; ") }
        }
        return nil
    }

    func decode<T: Decodable>(_ type: T.Type, from data: Data) throws -> T {
        do {
            return try decoder.decode(type, from: data)
        } catch {
            throw APIError.decoding("could not read server response: \(error.localizedDescription)")
        }
    }

    // MARK: - Auth (POST /api/auth/*, GET /api/auth/me)

    func register(email: String, password: String) async throws -> RegisterOutcome {
        struct Body: Encodable { var email: String; var password: String }
        let res = try await send(path: "api/auth/register", method: "POST", json: Body(email: email, password: password))
        if res.status == 201 {
            return .authed(try decode(AuthResponse.self, from: res.data))
        }
        // 200 {registered:false, detail} — anti-enumeration duplicate.
        if let obj = try? JSONSerialization.jsonObject(with: res.data) as? [String: Any],
           (obj["registered"] as? Bool) == false {
            return .duplicate(detail: (obj["detail"] as? String) ?? "An account with this email may already exist — try logging in instead.")
        }
        // Fallback: treat unknown 2xx as validation error.
        throw APIError.validation(detailMessage(from: res.data) ?? "registration failed")
    }

    func login(email: String, password: String) async throws -> AuthResponse {
        struct Body: Encodable { var email: String; var password: String }
        let res = try await send(path: "api/auth/login", method: "POST", json: Body(email: email, password: password))
        return try decode(AuthResponse.self, from: res.data)
    }

    func logout() async throws {
        _ = try await send(path: "api/auth/logout", method: "POST")
    }

    func me() async throws -> UserPublic {
        let res = try await send(path: "api/auth/me", method: "GET")
        return try decode(UserPublic.self, from: res.data)
    }

    // MARK: - Notebooks

    func listNotebooks() async throws -> [Notebook] {
        let res = try await send(path: "api/notebooks", method: "GET")
        return try decode([Notebook].self, from: res.data)
    }

    func createNotebook(name: String) async throws -> Notebook {
        struct Body: Encodable { var name: String }
        let res = try await send(path: "api/notebooks", method: "POST", json: Body(name: name))
        return try decode(Notebook.self, from: res.data)
    }

    func exportNotebook(id: String) async throws -> Data {
        try await send(path: "api/notebooks/\(id)/export", method: "GET").data
    }

    // MARK: - Sources

    func searchNotebook(notebookId: String, request: NativeSearchRequest) async throws -> SearchPage {
        var query = ["q": request.query, "related": request.related ? "true" : "false",
                     "offset": String(request.offset), "limit": String(request.limit)]
        if let kind = request.kind, !kind.isEmpty { query["kind"] = kind }
        let response = try await send(path: "api/notebooks/\(notebookId)/search/page", method: "GET", query: query)
        return try decode(SearchPage.self, from: response.data)
    }

    func listSources(notebookId: String) async throws -> [SourceSummary] {
        let res = try await send(path: "api/notebooks/\(notebookId)/sources", method: "GET")
        return try decode([SourceSummary].self, from: res.data)
    }

    func getSource(id: String) async throws -> SourceDetail {
        let res = try await send(path: "api/sources/\(id)", method: "GET")
        return try decode(SourceDetail.self, from: res.data)
    }

    func getSourceChunks(id: String, offset: Int = 0, limit: Int = 50) async throws -> SourceChunksPage {
        let res = try await send(path: "api/sources/\(id)/chunks", method: "GET", query: ["offset": "\(offset)", "limit": "\(limit)"])
        return try decode(SourceChunksPage.self, from: res.data)
    }

    func pasteSource(notebookId: String, title: String, text: String, force: Bool = false) async throws -> PasteResult {
        struct Body: Encodable { var title: String; var text: String; var force: Bool }
        let res = try await send(path: "api/notebooks/\(notebookId)/sources/text", method: "POST", json: Body(title: title, text: text, force: force))
        guard let obj = try? JSONSerialization.jsonObject(with: res.data) as? [String: Any] else {
            throw APIError.decoding("could not read paste response")
        }
        if res.status == 201 {
            let summary = try? decode(SourceSummary.self, from: res.data)
            return PasteResult(saved: true, duplicateOf: nil, summary: summary)
        }
        // 200 warn-before-save: {saved:false, duplicate_of:{id,title}}
        let saved = (obj["saved"] as? Bool) ?? false
        var dup: DuplicateRef?
        if let d = obj["duplicate_of"] as? [String: Any],
           let did = d["id"] as? String, let t = d["title"] as? String {
            dup = DuplicateRef(id: did, title: t)
        } else if let d = obj["duplicateOf"] as? [String: Any],
                  let did = d["id"] as? String, let t = d["title"] as? String {
            dup = DuplicateRef(id: did, title: t)
        }
        return PasteResult(saved: saved, duplicateOf: dup, summary: nil)
    }

    func addURLSource(notebookId: String, url: String, force: Bool = false) async throws -> PasteResult {
        struct Body: Encodable { var url: String; var force: Bool }
        let res = try await send(path: "api/notebooks/\(notebookId)/sources/url", method: "POST", json: Body(url: url, force: force))
        if res.status == 201 {
            let summary = try? decode(SourceSummary.self, from: res.data)
            return PasteResult(saved: true, duplicateOf: nil, summary: summary)
        }
        let obj = (try? JSONSerialization.jsonObject(with: res.data) as? [String: Any]) ?? [:]
        let saved = (obj["saved"] as? Bool) ?? false
        var dup: DuplicateRef?
        if let d = obj["duplicate_of"] as? [String: Any],
           let did = d["id"] as? String, let t = d["title"] as? String {
            dup = DuplicateRef(id: did, title: t)
        }
        return PasteResult(saved: saved, duplicateOf: dup, summary: nil)
    }

    func uploadFiles(notebookId: String, files: [(filename: String, data: Data, mime: String)]) async throws -> (sources: [SourceSummary], errors: [[String: String]]) {
        let boundary = "Notaeo-\(UUID().uuidString)"
        var body = Data()
        for f in files {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            let filename = DownloadHandler.sanitizedExportFilename(f.filename, fallback: "source.txt")
            body.append("Content-Disposition: form-data; name=\"files\"; filename=\"\(filename)\"\r\n".data(using: .utf8)!)
            body.append("Content-Type: \(f.mime)\r\n\r\n".data(using: .utf8)!)
            body.append(f.data)
            body.append("\r\n".data(using: .utf8)!)
        }
        body.append("--\(boundary)--\r\n".data(using: .utf8)!)
        let res = try await send(
            path: "api/notebooks/\(notebookId)/sources",
            method: "POST",
            contentType: "multipart/form-data; boundary=\(boundary)",
            body: body
        )
        struct UploadReply: Decodable {
            var sources: [SourceSummary]
            var errors: [[String: String]]?
        }
        // errors entries are {file, detail} strings.
        let reply = try decode(UploadReply.self, from: res.data)
        return (reply.sources, reply.errors ?? [])
    }

    // MARK: - Coach

    func getCoachState(notebookId: String) async throws -> CoachState {
        let res = try await send(path: "api/notebooks/\(notebookId)/coach", method: "GET")
        return try decode(CoachState.self, from: res.data)
    }

    func saveExamGoal(notebookId: String, goal: ExamGoal) async throws -> ExamGoal {
        let res = try await send(path: "api/notebooks/\(notebookId)/coach/goal", method: "PUT", json: goal)
        return try decode(ExamGoal.self, from: res.data)
    }

    func buildCoachSession(notebookId: String, useAi: Bool) async throws -> CoachSession {
        struct Body: Encodable { var useAi: Bool }
        let res = try await send(path: "api/notebooks/\(notebookId)/coach/sessions", method: "POST", json: Body(useAi: useAi))
        return try decode(CoachSession.self, from: res.data)
    }

    func startCoachSession(notebookId: String, sessionId: String, taskIds: [String]) async throws -> CoachSession {
        struct Body: Encodable { var taskIds: [String] }
        let res = try await send(path: "api/notebooks/\(notebookId)/coach/sessions/\(sessionId)/start", method: "POST", json: Body(taskIds: taskIds))
        return try decode(CoachSession.self, from: res.data)
    }

    func recordCoachAttempt(notebookId: String, sessionId: String, taskId: String, rating: String, response: String) async throws -> CoachSession {
        struct Body: Encodable { var taskId: String; var rating: String; var response: String }
        let res = try await send(path: "api/notebooks/\(notebookId)/coach/sessions/\(sessionId)/attempts", method: "POST", json: Body(taskId: taskId, rating: rating, response: response))
        return try decode(CoachSession.self, from: res.data)
    }

    func finishCoachSession(notebookId: String, sessionId: String) async throws -> CoachSession {
        struct Empty: Encodable {}
        let res = try await send(path: "api/notebooks/\(notebookId)/coach/sessions/\(sessionId)/finish", method: "POST", json: Empty())
        return try decode(CoachSession.self, from: res.data)
    }

    func explainCoachTask(notebookId: String, sessionId: String, taskId: String, useAi: Bool) async throws -> CoachExplanation {
        struct Body: Encodable { var useAi: Bool }
        let res = try await send(path: "api/notebooks/\(notebookId)/coach/sessions/\(sessionId)/tasks/\(taskId)/explain", method: "POST", json: Body(useAi: useAi))
        return try decode(CoachExplanation.self, from: res.data)
    }

    // MARK: - AI settings

    func getAISettings() async throws -> AISettings {
        let res = try await send(path: "api/settings/ai", method: "GET")
        return try decode(AISettings.self, from: res.data)
    }

    func saveAISettings(provider: String, apiKey: String, model: String) async throws -> AISettings {
        struct Body: Encodable { var provider: String; var apiKey: String; var model: String }
        let res = try await send(path: "api/settings/ai", method: "PUT", json: Body(provider: provider, apiKey: apiKey, model: model))
        return try decode(AISettings.self, from: res.data)
    }

    func clearAISettings() async throws {
        _ = try await send(path: "api/settings/ai", method: "DELETE")
    }
}

// MARK: - Type-erased Encodable (snake_case via JSONEncoder)

private struct AnyEncodable: Encodable {
    let base: Encodable
    init(_ base: Encodable) { self.base = base }
    func encode(to encoder: Encoder) throws { try base.encode(to: encoder) }
}
