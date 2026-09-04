import SwiftUI

@main
struct ResearchApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}

private struct ContentView: View {
    var body: some View {
        ContentUnavailableView(
            "Starting research",
            systemImage: "books.vertical",
            description: Text("Preparing your local workspace…")
        )
        .frame(minWidth: 960, minHeight: 640)
    }
}
