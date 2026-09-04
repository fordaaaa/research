import SwiftUI

@main
struct ResearchApp: App {
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
                    Text("Couldn’t start research")
                        .font(.title2)
                    Text(message)
                        .foregroundStyle(.secondary)
                    Button("Try Again") { backend.start() }
                }
            case .idle, .starting, .ready:
                ContentUnavailableView("Starting research", systemImage: "books.vertical", description: Text("Preparing your local workspace…"))
            }
        }
        .frame(minWidth: 960, minHeight: 640)
    }
}
