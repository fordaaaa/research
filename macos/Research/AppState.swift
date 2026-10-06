import Foundation
import Security

/// Account session + API wiring for the native shell.
///
/// - The sidecar base URL + per-launch desktop token come from BackendProcess.
/// - Account credentials live in the macOS Keychain; preferences hold no tokens.
@MainActor
final class AppState: ObservableObject {
    @Published var baseURL: URL?
    @Published var desktopToken: String = ""
    @Published var accountToken: String? {
        didSet { credentials.save(accountToken) }
    }
    @Published var userEmail: String?
    @Published var authError: String?
    @Published var authBusy = false

    static let tokenKey = "notaeo.accountToken"
    static let emailKey = "notaeo.accountEmail"

    private let credentials: any SessionCredentialStore
    private let preferences: UserDefaults

    static func isTestHost(environment: [String: String] = ProcessInfo.processInfo.environment) -> Bool {
        #if DEBUG
        return environment["XCTestConfigurationFilePath"] != nil
            || environment["XCTestBundlePath"] != nil
            || NSClassFromString("XCTestCase") != nil
        #else
        return false
        #endif
    }

    static func forApplication(environment: [String: String] = ProcessInfo.processInfo.environment) -> AppState {
        #if DEBUG
        if isTestHost(environment: environment) {
            return AppState(credentials: TestHostCredentials(),
                            preferences: UserDefaults(suiteName: "notaeo.test-host.\(UUID().uuidString)")!)
        }
        #endif
        return AppState()
    }

    init(credentials: any SessionCredentialStore = KeychainSessionStore(), preferences: UserDefaults = .standard) {
        self.credentials = credentials
        self.preferences = preferences
        preferences.removeObject(forKey: Self.tokenKey)
        accountToken = credentials.load()
        if accountToken != nil { userEmail = preferences.string(forKey: Self.emailKey) }
    }

    private func expireSession(matching token: String?) {
        guard token != nil, accountToken == token else { return }
        accountToken = nil
        userEmail = nil
        preferences.removeObject(forKey: Self.emailKey)
        authError = "Your session expired. Sign in again."
    }

    var isLoggedIn: Bool { accountToken != nil && !(accountToken?.isEmpty ?? true) }

    func configureBackend(baseURL: URL, desktopToken: String) {
        self.baseURL = baseURL
        self.desktopToken = desktopToken
    }

    func makeAPI(session: URLSession = .shared) -> NotaeoAPI? {
        guard let baseURL, !desktopToken.isEmpty else { return nil }
        let token = accountToken
        return NotaeoAPI(baseURL: baseURL, desktopToken: desktopToken, session: session,
            accountToken: { token }, onUnauthorized: { [weak self] in
                await self?.expireSession(matching: token)
            })
    }

    func disconnectBackend() {
        baseURL = nil
        desktopToken = ""
    }

    func login(email: String, password: String, session: URLSession = .shared) async {
        guard let api = makeAPI(session: session) else { authError = "Backend is not ready yet."; return }
        authBusy = true; authError = nil
        defer { authBusy = false }
        do {
            let res = try await api.login(email: email, password: password)
            accountToken = res.token
            userEmail = res.user.email
            preferences.set(res.user.email, forKey: Self.emailKey)
        } catch {
            authError = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }

    func register(email: String, password: String, session: URLSession = .shared) async -> Bool {
        guard let api = makeAPI(session: session) else { authError = "Backend is not ready yet."; return false }
        authBusy = true; authError = nil
        defer { authBusy = false }
        do {
            switch try await api.register(email: email, password: password) {
            case .authed(let res):
                accountToken = res.token
                userEmail = res.user.email
                preferences.set(res.user.email, forKey: Self.emailKey)
                return true
            case .duplicate(let detail):
                authError = detail
                return false
            }
        } catch {
            authError = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
            return false
        }
    }

    func signOut(session: URLSession = .shared) async {
        let signingOutToken = accountToken
        if let api = makeAPI(session: session) {
            try? await api.logout()
        }
        guard accountToken == signingOutToken else { return }
        accountToken = nil
        userEmail = nil
        preferences.removeObject(forKey: Self.emailKey)
    }
}


@MainActor
protocol SessionCredentialStore {
    func load() -> String?
    func save(_ token: String?)
}

#if DEBUG
@MainActor
private final class TestHostCredentials: SessionCredentialStore {
    private var token: String?
    func load() -> String? { token }
    func save(_ token: String?) { self.token = token }
}
#endif

@MainActor
private final class KeychainSessionStore: SessionCredentialStore {
    private var query: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: "com.fordaaaa.research.account",
         kSecAttrAccount as String: "current-session"]
    }
    func load() -> String? {
        var request = query
        request[kSecReturnData as String] = true
        request[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        guard SecItemCopyMatching(request as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }
    func save(_ token: String?) {
        guard let token, !token.isEmpty else {
            SecItemDelete(query as CFDictionary)
            return
        }
        let data = Data(token.utf8)
        let attributes = [kSecValueData as String: data]
        let status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            var item = query
            item[kSecValueData as String] = data
            item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            SecItemAdd(item as CFDictionary, nil)
        }
    }
}
