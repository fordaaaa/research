import SwiftUI

/// Native email login/register gate with pure SwiftUI controls.
struct AuthView: View {
    @EnvironmentObject private var appState: AppState
    @State private var email = ""
    @State private var password = ""
    @State private var mode: Mode = .login

    enum Mode { case login, register }

    var body: some View {
        VStack(spacing: 16) {
            VStack(spacing: 6) {
                Text("Notaeo").font(.system(size: 30, weight: .semibold, design: .rounded))
                Text("Sign in to your notebooks").font(.subheadline).foregroundStyle(.secondary)
            }
            Picker("Mode", selection: $mode) {
                Text("Log in").tag(Mode.login)
                Text("Register").tag(Mode.register)
            }.pickerStyle(.segmented).frame(maxWidth: 320)
            VStack(spacing: 10) {
                TextField("Email", text: $email)
                    .textFieldStyle(.roundedBorder)
                    .textContentType(.emailAddress)
                SecureField("Password (8+ characters to register)", text: $password)
                    .textFieldStyle(.roundedBorder)
                    .textContentType(.password)
            }.frame(maxWidth: 360)
            if let err = appState.authError {
                Text(err).font(.callout).foregroundStyle(.red).frame(maxWidth: 360)
            }
            Button(appState.authBusy ? "Please wait…" : (mode == .login ? "Log in" : "Create account")) {
                Task {
                    let e = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
                    if mode == .login {
                        await appState.login(email: e, password: password)
                    } else {
                        _ = await appState.register(email: e, password: password)
                    }
                }
            }
            .buttonStyle(.borderedProminent)
            .disabled(appState.authBusy || !canSubmit)
            .keyboardShortcut(.defaultAction)
            Text("Accounts are required for notebooks. AI keys stay optional in Settings.")
                .font(.caption).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding()
    }

    private var canSubmit: Bool {
        email.contains("@") && (mode == .login ? !password.isEmpty : password.count >= 8)
    }
}
