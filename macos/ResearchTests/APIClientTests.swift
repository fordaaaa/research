import XCTest
@testable import Notaeo

final class NativeMotionTests: XCTestCase {
    @MainActor
    func testTestHostStartsWithoutRestoringOrSharingAccountState() {
        let environment = ["XCTestConfigurationFilePath": "/tmp/test-host.xctestconfiguration"]
        let first = AppState.forApplication(environment: environment)
        XCTAssertNil(first.accountToken)
        XCTAssertNil(first.userEmail)
        first.accountToken = "test-only-token"
        first.userEmail = "test@example.invalid"
        let second = AppState.forApplication(environment: environment)
        XCTAssertNil(second.accountToken)
        XCTAssertNil(second.userEmail)
    }

    func testEitherReduceMotionPreferenceStopsAnimationAndActivityMovement() {
        for (system, app) in [(true, false), (false, true), (true, true)] {
            let policy = NativeMotionPolicy(systemReduceMotion: system, appReduceMotion: app)
            XCTAssertTrue(policy.reducesMotion)
            XCTAssertNil(policy.animation)
            for index in 0..<3 {
                let first = policy.activitySample(time: 0, index: index)
                let later = policy.activitySample(time: 17.5, index: index)
                XCTAssertEqual(first.offset, 0)
                XCTAssertEqual(first.opacity, later.opacity)
                XCTAssertEqual(later.offset, 0)
            }
        }
    }

    func testActivityIsGentlePeriodicAndStaggeredWithoutReduceMotion() {
        let policy = NativeMotionPolicy(systemReduceMotion: false, appReduceMotion: false)
        XCTAssertFalse(policy.reducesMotion)
        XCTAssertNotNil(policy.animation)
        for index in 0..<3 {
            for time in stride(from: 0.0, to: 4.0, by: 0.05) {
                let sample = policy.activitySample(time: time, index: index)
                XCTAssertTrue((-3.0...0.0).contains(sample.offset))
                XCTAssertTrue((0.35...0.9).contains(sample.opacity))
                let repeatSample = policy.activitySample(time: time + 1.8, index: index)
                XCTAssertEqual(sample.offset, repeatSample.offset, accuracy: 0.0001)
                XCTAssertEqual(sample.opacity, repeatSample.opacity, accuracy: 0.0001)
            }
        }
        XCTAssertNotEqual(policy.activitySample(time: 0.5, index: 0).offset,
                          policy.activitySample(time: 0.5, index: 1).offset)
    }
}

// MARK: - Stub transport (real URLSession request pipeline, not source checks)

final class StubURLProtocol: URLProtocol {
    nonisolated(unsafe) static var handler: ((URLRequest) throws -> (HTTPURLResponse, Data))?

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        guard let handler = Self.handler else {
            client?.urlProtocol(self, didFailWithError: NSError(domain: "stub", code: -1))
            return
        }
        do {
            let (resp, data) = try handler(request)
            client?.urlProtocol(self, didReceive: resp, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override func stopLoading() {}
}

private func stubSession() -> URLSession {
    let config = URLSessionConfiguration.ephemeral
    config.protocolClasses = [StubURLProtocol.self]
    return URLSession(configuration: config)
}

private let base = URL(string: "http://127.0.0.1:9")!

private func http(_ url: URL, status: Int, headers: [String: String] = [:]) -> HTTPURLResponse {
    HTTPURLResponse(url: url, statusCode: status, httpVersion: nil, headerFields: headers)!
}

private func api(token: String? = "acct-1") -> NotaeoAPI {
    let t = token
    return NotaeoAPI(baseURL: base, desktopToken: "desk-per-launch", session: stubSession(), accountToken: { t })
}

private func bodyData(_ req: URLRequest) -> Data {
    if let b = req.httpBody, !b.isEmpty { return b }
    if let s = req.httpBodyStream {
        s.open()
        defer { s.close() }
        var data = Data()
        let size = 8192
        var buf = [UInt8](repeating: 0, count: size)
        while s.hasBytesAvailable {
            let n = s.read(&buf, maxLength: size)
            if n <= 0 { break }
            data.append(buf, count: n)
        }
        return data
    }
    return Data()
}

// MARK: - Auth + headers + errors (actual request/response behavior)

final class APIClientTests: XCTestCase {
    func testMultipartFilenameCannotInjectHeaders() async throws {
        StubURLProtocol.handler = { request in
            let body = String(decoding: bodyData(request), as: UTF8.self)
            XCTAssertTrue(body.contains("filename=\"biology.pdf\""))
            XCTAssertFalse(body.contains("bio\"\r\nlogy.pdf"))
            return (http(request.url!, status: 200), Data(#"{"sources":[],"errors":[]}"#.utf8))
        }
        _ = try await api().uploadFiles(notebookId: "course", files: [(filename: "bio\"\r\nlogy.pdf", data: Data([1]), mime: "application/pdf")])
    }

    func testExportUsesAuthenticatedAPIAndReturnsBytes() async throws {
        StubURLProtocol.handler = { request in
            XCTAssertEqual(request.url?.path, "/api/notebooks/course/export")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer acct-1")
            XCTAssertNil(request.url?.query)
            return (http(request.url!, status: 200), Data([80, 75, 3, 4]))
        }
        let result = try await api().exportNotebook(id: "course")
        XCTAssertEqual(result, Data([80, 75, 3, 4]))
    }

    override func tearDown() {
        StubURLProtocol.handler = nil
        super.tearDown()
    }

    func testLoginSendsDesktopTokenAndDecodesAuth() async throws {
        var sawHeaders: [String: String] = [:]
        var sawBody: [String: Any] = [:]
        StubURLProtocol.handler = { req in
            sawHeaders = req.allHTTPHeaderFields ?? [:]
            sawBody = (try? JSONSerialization.jsonObject(with: bodyData(req)) as? [String: Any]) ?? [:]
            let data = #"{"user":{"id":"u1","email":"a@b.c"},"token":"tok-123"}"#.data(using: .utf8)!
            return (http(req.url!, status: 201), data)
        }
        let res = try await api(token: nil).login(email: "a@b.c", password: "secret123")
        XCTAssertEqual(res.token, "tok-123")
        XCTAssertEqual(res.user.email, "a@b.c")
        XCTAssertEqual(sawHeaders["X-Notaeo-Desktop-Token"], "desk-per-launch")
        XCTAssertEqual(sawBody["email"] as? String, "a@b.c")
        // No bearer on the login call itself (no session yet).
        XCTAssertNil(sawHeaders["Authorization"])
    }

    func testAuthedRequestCarriesBearerAndDesktopToken() async throws {
        var sawHeaders: [String: String] = [:]
        StubURLProtocol.handler = { req in
            sawHeaders = req.allHTTPHeaderFields ?? [:]
            return (http(req.url!, status: 200), #"[]"#.data(using: .utf8)!)
        }
        _ = try await api().listNotebooks()
        XCTAssertEqual(sawHeaders["Authorization"], "Bearer acct-1")
        XCTAssertEqual(sawHeaders["X-Notaeo-Desktop-Token"], "desk-per-launch")
    }

    func testUnauthorizedMapsToLoginRequired() async {
        StubURLProtocol.handler = { req in
            (http(req.url!, status: 401), #"{"detail":"login required"}"#.data(using: .utf8)!)
        }
        do {
            _ = try await api().listNotebooks()
            XCTFail("expected 401")
        } catch {
            let e = error as? APIError
            XCTAssertEqual(e, .unauthorized("login required"))
        }
    }

    func testForbiddenMapsToDesktopSession() async {
        StubURLProtocol.handler = { req in
            (http(req.url!, status: 403), #"{"detail":"desktop session required"}"#.data(using: .utf8)!)
        }
        do {
            _ = try await api().listNotebooks()
            XCTFail("expected 403")
        } catch {
            let e = error as? APIError
            XCTAssertEqual(e, .forbidden("desktop session required"))
        }
    }

    func testNotFoundAndValidation() async {
        StubURLProtocol.handler = { req in
            (http(req.url!, status: 404), #"{"detail":"notebook not found"}"#.data(using: .utf8)!)
        }
        do {
            _ = try await api().getSource(id: "abcdef123456")
            XCTFail("expected 404")
        } catch {
            let e = error as? APIError
            XCTAssertEqual(e, .notFound("notebook not found"))
        }

        StubURLProtocol.handler = { req in
            (http(req.url!, status: 422), #"{"detail":[{"loc":["body"],"msg":"name must not be blank","type":"value_error"}]}"#.data(using: .utf8)!)
        }
        do {
            _ = try await api().createNotebook(name: "")
            XCTFail("expected 422")
        } catch {
            if case .validation(let m) = error as? APIError {
                XCTAssertTrue(m.contains("name must not be blank"), "got: \(m)")
            } else { XCTFail("wrong error \(error)") }
        }
    }

    func testRateLimitedCarriesRetryAfter() async {
        StubURLProtocol.handler = { req in
            (http(req.url!, status: 429, headers: ["Retry-After": "7"]), Data())
        }
        do {
            _ = try await api().listNotebooks()
            XCTFail("expected 429")
        } catch {
            let e = error as? APIError
            XCTAssertEqual(e, .rateLimited(retryAfter: 7))
        }
    }

    func testRegisterDuplicateDoesNotAuth() async throws {
        StubURLProtocol.handler = { req in
            let data = #"{"registered":false,"detail":"An account with this email may already exist — try logging in instead."}"#.data(using: .utf8)!
            return (http(req.url!, status: 200), data)
        }
        let out = try await api(token: nil).register(email: "dup@x.y", password: "password123")
        if case .duplicate(let detail) = out {
            XCTAssertTrue(detail.contains("already exist"))
        } else { XCTFail("expected duplicate") }
    }

    func testSaveGoalEncodesSnakeCase() async throws {
        var sawBody: [String: Any] = [:]
        StubURLProtocol.handler = { req in
            sawBody = (try? JSONSerialization.jsonObject(with: bodyData(req)) as? [String: Any]) ?? [:]
            let data = #"{"title":"Biology 101","exam_date":"2026-11-01","daily_minutes":25,"focus_topics":["cells"]}"#.data(using: .utf8)!
            return (http(req.url!, status: 200), data)
        }
        let goal = ExamGoal(title: "Biology 101", examDate: "2026-11-01", dailyMinutes: 25, focusTopics: ["cells"])
        let saved = try await api().saveExamGoal(notebookId: "abcdef123456", goal: goal)
        XCTAssertEqual(saved.examDate, "2026-11-01")
        XCTAssertEqual(sawBody["exam_date"] as? String, "2026-11-01")
        XCTAssertEqual(sawBody["daily_minutes"] as? Int, 25)
        XCTAssertEqual(sawBody["focus_topics"] as? [String], ["cells"])
    }
}

final class NativeStartupTests: XCTestCase {
    func testReadyURLAcceptsOnlyCredentialFreeLoopbackAPI() {
        XCTAssertEqual(BackendProcess.readyURL(from: "http://127.0.0.1:8123")?.port, 8123)
        for raw in ["https://127.0.0.1:8123", "http://example.com:8123", "http://127.0.0.1", "http://user:secret@127.0.0.1:8123", "http://127.0.0.1:8123/?token=secret", "http://127.0.0.1:8123/api"] {
            XCTAssertNil(BackendProcess.readyURL(from: raw))
        }
    }
}

@MainActor
private final class MemoryCredentials: SessionCredentialStore {
    var token: String?
    init(_ token: String? = nil) { self.token = token }
    func load() -> String? { token }
    func save(_ value: String?) { token = value }
}

@MainActor
final class NativeAccountTests: XCTestCase {
    func testLateLogoutDoesNotClearNewLogin() async {
        let credentials = MemoryCredentials("old-account")
        let state = AppState(credentials: credentials, preferences: UserDefaults(suiteName: "notaeo.test.\(UUID().uuidString)")!)
        state.configureBackend(baseURL: base, desktopToken: "launch")
        StubURLProtocol.handler = { request in
            let changed = DispatchSemaphore(value: 0)
            Task { @MainActor in state.accountToken = "fresh-account"; changed.signal() }
            XCTAssertEqual(changed.wait(timeout: .now() + 5), .success)
            return (http(request.url!, status: 204), Data())
        }
        await state.signOut(session: stubSession())
        XCTAssertEqual(state.accountToken, "fresh-account")
        XCTAssertEqual(credentials.token, "fresh-account")
        StubURLProtocol.handler = nil
    }

    func testExpiredSessionClearsStoredCredentialsAndReturnsToLogin() async throws {
        let credentials = MemoryCredentials("expired-account")
        let preferences = UserDefaults(suiteName: "notaeo.test.\(UUID().uuidString)")!
        let state = AppState(credentials: credentials, preferences: preferences)
        state.configureBackend(baseURL: base, desktopToken: "launch")
        StubURLProtocol.handler = { request in
            (http(request.url!, status: 401), Data(#"{"detail":"login required"}"#.utf8))
        }
        do { _ = try await state.makeAPI(session: stubSession())!.listNotebooks() } catch {}
        XCTAssertFalse(state.isLoggedIn)
        XCTAssertNil(credentials.token)
        StubURLProtocol.handler = nil
    }

    func testLegacyPlaintextTokenIsRemovedFromPreferences() {
        let preferences = UserDefaults(suiteName: "notaeo.test.\(UUID().uuidString)")!
        preferences.set("old-plaintext-token", forKey: "notaeo.accountToken")
        let state = AppState(credentials: MemoryCredentials(), preferences: preferences)
        XCTAssertFalse(state.isLoggedIn)
        XCTAssertNil(preferences.string(forKey: "notaeo.accountToken"))
    }
}

// MARK: - Resume (real decoded API payloads, not string greps)

final class CoachResumeTests: XCTestCase {
    private func stateJSON(activeFirst: Bool) -> Data {
        let draft = #"{"id":"bbbbbbbbbbbb","notebook_id":"abcdef123456","goal":{"title":"Bio","exam_date":"2026-11-01","daily_minutes":20,"focus_topics":[]},"status":"draft","generated_by":"basic","notice":null,"tasks":[],"attempts":[],"created_at":"2026-10-01T00:00:00Z","completed_at":null}"#
        let active = #"{"id":"aaaaaaaaaaaa","notebook_id":"abcdef123456","goal":{"title":"Bio","exam_date":"2026-11-01","daily_minutes":20,"focus_topics":[]},"status":"active","generated_by":"basic","notice":null,"tasks":[{"id":"111111111111","topic":"Cells","prompt":"What is a cell?","answer":"Basic unit","minutes":10,"reason":"missed","source_id":null,"source_title":null,"pages":[],"chunk_seq":null,"card_id":null},{"id":"222222222222","topic":"DNA","prompt":"What is DNA?","answer":"Code","minutes":10,"reason":"fresh","source_id":null,"source_title":null,"pages":[],"chunk_seq":null,"card_id":null}],"attempts":[{"task_id":"111111111111","rating":"got_it","response":"unit","created_at":"2026-10-02T00:00:00Z"}],"created_at":"2026-10-01T00:00:00Z","completed_at":null}"#
        let order = activeFirst ? "[\(active),\(draft)]" : "[\(draft),\(active)]"
        return #"{"goal":{"title":"Bio","exam_date":"2026-11-01","daily_minutes":20,"focus_topics":[]},"sessions":\#(order)}"#.data(using: .utf8)!
    }

    private func decode(_ data: Data) throws -> CoachState {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        return try d.decode(CoachState.self, from: data)
    }

    func testResumePrefersActiveSessionRegardlessOfOrder() throws {
        for activeFirst in [true, false] {
            let s = try decode(stateJSON(activeFirst: activeFirst))
            XCTAssertEqual(CoachLogic.resumeSession(in: s)?.id, "aaaaaaaaaaaa")
        }
    }

    func testNextQuestionSkipsAnsweredTask() throws {
        let s = try decode(stateJSON(activeFirst: true))
        let active = s.sessions.first(where: { $0.id == "aaaaaaaaaaaa" })!
        XCTAssertEqual(CoachLogic.nextQuestionIndex(in: active), 1)
        XCTAssertFalse(CoachLogic.isComplete(active))
    }

    func testExplainDecodesCitationsAndModel() throws {
        let data = #"{"answer":"Cells divide.","citations":[{"source_id":"abcdef123456","source_title":"Bio text","pages":[3]}],"model":null,"generated_by":"basic","notice":null}"#.data(using: .utf8)!
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        let e = try d.decode(CoachExplanation.self, from: data)
        XCTAssertEqual(e.citations.first?.pages, [3])
        XCTAssertEqual(e.generatedBy, "basic")
    }

    func testStartSendsSnakeCaseTaskIds() async throws {
        var sawBody: [String: Any] = [:]
        StubURLProtocol.handler = { req in
            sawBody = (try? JSONSerialization.jsonObject(with: bodyData(req)) as? [String: Any]) ?? [:]
            let data = #"{"id":"aaaaaaaaaaaa","notebook_id":"abcdef123456","goal":{"title":"Bio","exam_date":"2026-11-01","daily_minutes":20,"focus_topics":[]},"status":"active","generated_by":"basic","notice":null,"tasks":[],"attempts":[],"created_at":"2026-10-01T00:00:00Z","completed_at":null}"#.data(using: .utf8)!
            return (http(req.url!, status: 200), data)
        }
        _ = try await api().startCoachSession(notebookId: "abcdef123456", sessionId: "aaaaaaaaaaaa", taskIds: ["111111111111"])
        XCTAssertEqual(sawBody["task_ids"] as? [String], ["111111111111"])
    }
}
