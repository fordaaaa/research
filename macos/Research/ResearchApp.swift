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
    @State private var settled = false
    @State private var highlightOn = false
    @State private var beaconOn = false

    // Folio motif mirrors the shared offline loader (paper card, ruled
    // lines, seafoam highlight sweep, citation beacon). Sound stays staged
    // off by default — no autoplay in the native shell for this pass
    // (see docs/LOADING_SOUND.md for the WebAudio plan + native hook).
    var body: some View {
        VStack(spacing: 22) {
            ZStack {
                RoundedRectangle(cornerRadius: 14)
                    .fill(Color.white)
                    .stroke(Color(red: 0.9, green: 0.88, blue: 0.83), lineWidth: 1.8)
                    .frame(width: 200, height: 175)
                    .shadow(color: Color(red: 0.11, green: 0.14, blue: 0.17).opacity(0.08), radius: 12, y: 8)
                    .scaleEffect(settled && !reduceMotion ? 1 : 0.92)
                    .rotationEffect(.degrees(settled && !reduceMotion ? 0 : -1.5))
                    .opacity(settled && !reduceMotion ? 1 : 0.6)
                VStack(spacing: 10) {
                    RoundedRectangle(cornerRadius: 2)
                        .fill(Color(red: 0.8, green: 0.83, blue: 0.86))
                        .frame(width: 78, height: 6)
                        .padding(.trailing, 54)
                    RoundedRectangle(cornerRadius: 2)
                        .fill(Color(red: 0.8, green: 0.83, blue: 0.86))
                        .frame(width: 132, height: 6)
                    RoundedRectangle(cornerRadius: 2)
                        .fill(Color(red: 0.8, green: 0.83, blue: 0.86))
                        .frame(width: 108, height: 6)
                        .padding(.trailing, 24)
                    ZStack(alignment: .leading) {
                        Capsule()
                            .fill(Color(red: 0.89, green: 0.96, blue: 0.93))
                            .frame(width: 128, height: 10)
                        Capsule()
                            .fill(Color(red: 0.15, green: 0.63, blue: 0.55))
                            .frame(width: 128, height: 5)
                            .scaleEffect(x: highlightOn && !reduceMotion ? 1 : 0, anchor: .leading)
                            .opacity(highlightOn && !reduceMotion ? 1 : 0)
                    }
                    .padding(.top, 8)
                }
                .offset(y: -12)
                ZStack {
                    Circle()
                        .stroke(Color(red: 0.15, green: 0.63, blue: 0.55), lineWidth: 2)
                        .frame(width: beaconOn && !reduceMotion ? 32 : 10, height: beaconOn && !reduceMotion ? 32 : 10)
                        .opacity(beaconOn && !reduceMotion ? 0 : 0.8)
                    Circle()
                        .fill(Color.white)
                        .stroke(Color(red: 0.15, green: 0.63, blue: 0.55), lineWidth: 2)
                        .frame(width: 12, height: 12)
                    Circle()
                        .fill(Color(red: 0.15, green: 0.63, blue: 0.55))
                        .frame(width: 6, height: 6)
                }
                .offset(x: 66, y: 33)
                .scaleEffect(beaconOn && !reduceMotion ? 1 : 0.6)
                .opacity(beaconOn && !reduceMotion ? 1 : 0)
            }
            .frame(width: 220, height: 195)
            .accessibilityHidden(true)

            VStack(spacing: 7) {
                Text("Notaeo")
                    .font(.system(size: 28, weight: .semibold, design: .rounded))
                Text("Preparing your workspace…")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                Text("Laying folio flat…")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }
            .accessibilityElement(children: .combine)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(nsColor: .windowBackgroundColor))
        .onAppear {
            guard !reduceMotion else {
                settled = true
                highlightOn = true
                beaconOn = true
                return
            }
            withAnimation(.easeInOut(duration: 1.6).repeatForever(autoreverses: true)) {
                settled = true
            }
            withAnimation(.easeInOut(duration: 1.6).repeatForever(autoreverses: true).delay(0.9)) {
                highlightOn = true
            }
            withAnimation(.easeInOut(duration: 1.6).repeatForever(autoreverses: true).delay(1.5)) {
                beaconOn = true
            }
        }
    }
}
