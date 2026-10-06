import AppKit
import SwiftUI

/// Terminates only the sidecar this shell started.
@MainActor
private final class AppDelegate: NSObject, NSApplicationDelegate {
    weak var backend: BackendProcess?

    func applicationWillTerminate(_ notification: Notification) {
        backend?.stop()
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag { sender.windows.first(where: { $0.title == "Notaeo" })?.makeKeyAndOrderFront(nil) }
        return true
    }
}

@main
struct NotaeoApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var backend = BackendProcess()
    @StateObject private var appState = AppState.forApplication()
    @AppStorage("notaeo.native.appearance") private var appearance = "system"

    var body: some Scene {
        Window("Notaeo", id: "main") {
            ContentView()
                .preferredColorScheme(appearance == "dark" ? .dark : appearance == "light" ? .light : nil)
                .environmentObject(backend)
                .environmentObject(appState)
                .onAppear {
                    appDelegate.backend = backend
                    if !AppState.isTestHost() { backend.startIfNeeded() }
                }
                .onChange(of: backend.state, initial: true) { _, state in
                    if case .ready(let url) = state {
                        appState.configureBackend(baseURL: url, desktopToken: backend.desktopToken)
                    } else {
                        appState.disconnectBackend()
                    }
                }
        }
        .defaultSize(width: 1200, height: 800)

        // Native Settings scene: visible via app menu + Cmd+, throughout.
        // Available logged-out (SettingsView handles both states).
        Settings {
            SettingsView()
                .environmentObject(appState)
                .preferredColorScheme(appearance == "dark" ? .dark : appearance == "light" ? .light : nil)
                .tint(NativePalette.accent)
        }
    }
}

private struct ContentView: View {
    @EnvironmentObject private var backend: BackendProcess
    @EnvironmentObject private var appState: AppState
    @Environment(\.openSettings) private var openSettings
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @AppStorage("notaeo.native.reduceMotion") private var reduceMotion = false

    private var motion: NativeMotionPolicy {
        NativeMotionPolicy(systemReduceMotion: systemReduceMotion, appReduceMotion: reduceMotion)
    }

    var body: some View {
        Group {
            switch backend.state {
            case .failed(let message):
                VStack(spacing: 12) {
                    Image(systemName: "exclamationmark.triangle").font(.largeTitle)
                    Text("Couldn’t start Notaeo").font(.title2)
                    Text(message).foregroundStyle(.secondary)
                    Button("Try Again") { backend.start() }
                }
            case .ready:
                if appState.isLoggedIn {
                    MainView()
                        .environmentObject(appState)
                        .transition(motion.transition)
                } else {
                    AuthView()
                        .environmentObject(appState)
                        .transition(motion.transition)
                }
            case .idle, .starting:
                StartupView()
            }
        }
        .frame(minWidth: 960, minHeight: 640)
        .font(NativeType.body)
        .tint(NativePalette.accent)
        .animation(motion.animation, value: appState.isLoggedIn)
        .transaction { transaction in
            if motion.reducesMotion {
                transaction.animation = nil
                transaction.disablesAnimations = true
            }
        }
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    openSettings()
                } label: {
                    Label("Settings", systemImage: "gearshape")
                }
                .help("Open Settings (⌘,)")
            }
        }
    }
}

private struct StartupView: View {
    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "book.closed.fill").font(.system(size: 32))
                .foregroundStyle(NativePalette.accent).accessibilityHidden(true)
            Text("Notaeo").font(NativeType.display)
            NativeAIActivity(label: "Preparing your workspace…")
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(NativePalette.canvas)
    }
}
