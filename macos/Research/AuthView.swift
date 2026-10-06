import SwiftUI

/// Native email login/register gate with pure SwiftUI controls.
struct AuthView: View {
    @EnvironmentObject private var appState: AppState
    @State private var email = ""
    @State private var password = ""
    @State private var mode: Mode = .login
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @AppStorage("notaeo.native.reduceMotion") private var reduceMotion = false

    private var motion: NativeMotionPolicy {
        NativeMotionPolicy(systemReduceMotion: systemReduceMotion, appReduceMotion: reduceMotion)
    }

    enum Mode { case login, register }

    var body: some View {
        VStack(spacing: 26) {
            VStack(spacing: 12) {
                Image(systemName: "book.closed.fill")
                    .font(.system(size: 25, weight: .medium))
                    .foregroundStyle(NativePalette.accent)
                    .frame(width: 60, height: 60)
                    .background(NativePalette.accent.opacity(0.09), in: RoundedRectangle(cornerRadius: 18))
                    .accessibilityHidden(true)
                Text("Notaeo").font(NativeType.display)
                Text("Know what to study next.").font(NativeType.heading).foregroundStyle(.secondary)
                Text("Your course material, a revision plan, and a little more clarity.")
                    .font(NativeType.body).foregroundStyle(.secondary).multilineTextAlignment(.center)
            }
            VStack(alignment: .leading, spacing: 18) {
                Picker("Mode", selection: $mode) {
                    Text("Log in").tag(Mode.login)
                    Text("Create account").tag(Mode.register)
                }.pickerStyle(.segmented).disabled(appState.authBusy)
                VStack(alignment: .leading, spacing: 6) {
                    Text("Email").font(NativeType.caption).foregroundStyle(.secondary)
                    TextField("you@example.com", text: $email)
                        .textFieldStyle(.roundedBorder)
                        .textContentType(.emailAddress)
                        .accessibilityLabel("Email")
                        .disabled(appState.authBusy)
                }
                VStack(alignment: .leading, spacing: 6) {
                    Text("Password").font(NativeType.caption).foregroundStyle(.secondary)
                    SecureField(mode == .register ? "At least 8 characters" : "Your password", text: $password)
                        .textFieldStyle(.roundedBorder)
                        .textContentType(.password)
                        .accessibilityLabel("Password")
                        .disabled(appState.authBusy)
                }
                if let err = appState.authError {
                    Text(err).font(.callout).foregroundStyle(.red)
                        .fixedSize(horizontal: false, vertical: true)
                        .transition(motion.transition)
                }
                HStack {
                    Button(appState.authBusy ? (mode == .login ? "Signing in…" : "Creating account…") : (mode == .login ? "Log in" : "Create account")) {
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
                    if appState.authBusy { ProgressView().controlSize(.small).accessibilityLabel("Signing in") }
                }
                Text("Your notebooks belong to your account. AI is optional.")
                    .font(NativeType.caption).foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(24)
            .frame(width: 390)
            .background(NativePalette.surface, in: RoundedRectangle(cornerRadius: 20))
            .overlay(RoundedRectangle(cornerRadius: 20).strokeBorder(NativePalette.border))
            .animation(motion.animation, value: appState.authError)
            .animation(motion.animation, value: appState.authBusy)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(32)
        .background(NativePalette.canvas)
        .font(NativeType.body)
    }

    private var canSubmit: Bool {
        email.contains("@") && (mode == .login ? !password.isEmpty : password.count >= 8)
    }
}
