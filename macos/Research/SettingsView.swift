import SwiftUI

/// Native Settings: actual /api/settings/ai provider settings + sign out.
/// Available logged-out (AI section explains login is required).
struct SettingsView: View {
    @EnvironmentObject private var appState: AppState
    @State private var provider = "gemini"
    @State private var apiKey = ""
    @State private var model = "gemini-3.5-flash-lite"
    @State private var configured = false
    @State private var busy = false
    @State private var message: String?
    @AppStorage("notaeo.native.appearance") private var appearance = "system"
    @AppStorage("notaeo.native.reduceMotion") private var reduceMotion = false
    @State private var previewing = false
    @State private var previewTask: Task<Void, Never>?

    private let providers = ["gemini", "openrouter", "groq"]
    private let defaultModels = [
        "gemini": "gemini-3.5-flash-lite",
        "openrouter": "nvidia/nemotron-3-ultra-550b-a55b:free",
        "groq": "openai/gpt-oss-20b",
    ]

    var body: some View {
        Form {
            Section("Appearance and motion") {
                Picker("Appearance", selection: $appearance) {
                    Text("System").tag("system")
                    Text("Light").tag("light")
                    Text("Dark").tag("dark")
                }
                Toggle("Reduce motion", isOn: $reduceMotion)
                Button("Preview AI loading") {
                    previewing = true
                    previewTask = Task { @MainActor in
                        try? await Task.sleep(for: .seconds(3))
                        guard !Task.isCancelled else { return }
                        previewing = false
                    }
                }.disabled(previewing)
                if previewing { NativeAIActivity(label: "Preparing an explanation…") }
                Text("The preview runs locally for three seconds.").font(.caption).foregroundStyle(.secondary)
            }
            Section("Account") {
                if let email = appState.userEmail, appState.isLoggedIn {
                    Text(email).textSelection(.enabled)
                    Button("Sign out") { Task { await appState.signOut() } }
                } else {
                    Text("Sign in to access your notebooks and optional AI settings.")
                        .font(.callout).foregroundStyle(.secondary)
                }
            }
            Section("Optional AI") {
                Text("Your key is saved with your account and used only when you request an AI feature.")
                    .font(.caption).foregroundStyle(.secondary)
                Picker("Provider", selection: Binding(get: { provider }, set: {
                    provider = $0
                    model = defaultModels[$0] ?? model
                    apiKey = ""
                })) {
                    ForEach(providers, id: \.self) { Text($0).tag($0) }
                }
                SecureField("API key", text: $apiKey).disabled(!appState.isLoggedIn)
                TextField("Model", text: $model).textFieldStyle(.roundedBorder).disabled(!appState.isLoggedIn)
                Text(configured ? "AI is configured." : "AI is not configured. Coach works without a key.")
                    .font(.caption).foregroundStyle(.secondary)
                HStack {
                    Button(busy ? "Saving…" : (configured ? "Replace key" : "Enable AI")) {
                        Task { await save() }
                    }.disabled(busy || !appState.isLoggedIn || apiKey.trimmingCharacters(in: .whitespaces).count < 10)
                    if configured {
                        Button("Remove key") { Task { await remove() } }.disabled(busy || !appState.isLoggedIn)
                    }
                }
                if let message { Text(message).font(.callout).foregroundStyle(.secondary) }
            }
        }
        .formStyle(.grouped)
        .disabled(busy)
        .frame(width: 560, height: 660)
        .task(id: appState.accountToken) {
            configured = false; apiKey = ""; message = nil
            await load()
        }
        .onDisappear { previewTask?.cancel(); previewing = false }
    }

    private func api() -> NotaeoAPI? { appState.makeAPI() }

    private func load() async {
        guard appState.isLoggedIn, let api = api() else { return }
        let account = appState.accountToken
        do {
            let s = try await api.getAISettings()
            guard !Task.isCancelled, account == appState.accountToken else { return }
            configured = s.configured
            if let p = s.provider { provider = p }
            if let m = s.model, !m.isEmpty { model = m }
        } catch {
            guard !Task.isCancelled, account == appState.accountToken else { return }
            message = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }

    private func save() async {
        guard let api = api() else { message = "Sign in first."; return }
        busy = true; defer { busy = false }
        do {
            let s = try await api.saveAISettings(provider: provider, apiKey: apiKey.trimmingCharacters(in: .whitespaces), model: model.trimmingCharacters(in: .whitespaces))
            configured = s.configured
            apiKey = ""
            message = "AI settings saved."
        } catch {
            message = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }

    private func remove() async {
        guard let api = api() else { return }
        busy = true; defer { busy = false }
        do {
            try await api.clearAISettings()
            configured = false
            message = "AI key removed."
        } catch {
            message = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }
}
