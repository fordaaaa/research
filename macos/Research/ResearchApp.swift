import SwiftUI

@main
struct NotaeoApp: App {
    @StateObject private var backend = BackendProcess()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(backend)
                .onAppear { backend.start() }
                .onDisappear { backend.stop() }
        }
    }
}

private struct ContentView: View {
    @EnvironmentObject private var backend: BackendProcess

    var body: some View {
        Group {
            switch backend.state {
            case .failed(let message):
                VStack(spacing: 12) {
                    Image(systemName: "exclamationmark.triangle")
                        .font(.largeTitle)
                    Text("Couldn’t start Notaeo")
                        .font(.title2)
                    Text(message)
                        .foregroundStyle(.secondary)
                    Button("Try Again") { backend.start() }
                }
            case .ready(let url):
                ResearchWebView(url: url)
            case .idle, .starting:
                StartupView()
            }
        }
        .frame(minWidth: 960, minHeight: 640)
    }
}

private struct StartupView: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var animating = false

    var body: some View {
        VStack(spacing: 22) {
            ZStack {
                Circle()
                    .stroke(Color.teal.opacity(0.16), lineWidth: 2)
                    .frame(width: 104, height: 104)
                ForEach(0..<3) { index in
                    Circle()
                        .fill(Color.teal.opacity(index == 0 ? 1 : 0.55))
                        .frame(width: index == 0 ? 18 : 12, height: index == 0 ? 18 : 12)
                        .offset(y: -52)
                        .rotationEffect(.degrees(Double(index) * 120 + (animating && !reduceMotion ? 360 : 0)))
                }
                Image(systemName: "books.vertical.fill")
                    .font(.system(size: 31, weight: .medium))
                    .foregroundStyle(.teal)
            }
            .frame(width: 128, height: 128)
            .accessibilityHidden(true)

            VStack(spacing: 7) {
                Text("Notaeo")
                    .font(.system(size: 28, weight: .semibold, design: .rounded))
                Text("Preparing your workspace…")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            .accessibilityElement(children: .combine)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(nsColor: .windowBackgroundColor))
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(.linear(duration: 2.2).repeatForever(autoreverses: false)) {
                animating = true
            }
        }
    }
}
