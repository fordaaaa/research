import Foundation

/// Owns the bundled sidecar child process for the native API-only shell.
///
/// - Binds a random 127.0.0.1 port (sidecar announces `RESEARCH_READY <url>`).
/// - Per-launch strong token via UUID; sent as `X-Notaeo-Desktop-Token` on
///   every /api request (see NotaeoAPI). Account Bearer auth still applies.
/// - Data lives in Application Support `research/data`; only this child
///   process is ever terminated (never unrelated processes).
/// - Native mode sets `RESEARCH_NATIVE_DESKTOP=1` and never requires bundled
///   renderer assets (`RESEARCH_WEB_DIR` unset). API-only over loopback.
@MainActor
final class BackendProcess: ObservableObject {
    enum State: Equatable {
        case idle
        case starting
        case ready(URL)
        case failed(String)
    }

    @Published private(set) var state: State = .idle
    @Published private(set) var desktopToken: String = ""

    private var process: Process?
    private var outputPipe: Pipe?
    private var outputBuffer = ""
    private var launchToken = ""
    private var startupTask: Task<Void, Never>?

    var baseURL: URL? {
        if case .ready(let url) = state { return url }
        return nil
    }

    func start() {
        switch state {
        case .starting, .ready:
            return
        case .idle, .failed:
            break
        }
        stop()
        guard let executable = Bundle.main.url(
            forResource: "research-backend",
            withExtension: nil,
            subdirectory: "backend"
        ) else {
            state = .failed("The bundled Notaeo backend is missing.")
            return
        }

        do {
            launchToken = UUID().uuidString + "-" + UUID().uuidString
            let process = Process()
            let pipe = Pipe()
            process.executableURL = executable
            process.standardOutput = pipe
            process.standardError = pipe
            process.environment = ProcessInfo.processInfo.environment.merging([
                "RESEARCH_DATA_DIR": try dataDirectory().path,
                "RESEARCH_NATIVE_DESKTOP": "1",
                "RESEARCH_DESKTOP_TOKEN": launchToken,
            ]) { _, appValue in appValue }
            self.process = process
            self.outputPipe = pipe
            state = .starting
            pipe.fileHandleForReading.readabilityHandler = { [weak self, weak process] handle in
                let data = handle.availableData
                guard !data.isEmpty, let text = String(data: data, encoding: .utf8) else { return }
                Task { @MainActor in
                    guard let self, let process, self.process === process else { return }
                    self.consumeOutput(text)
                }
            }
            process.terminationHandler = { [weak self] process in
                Task { @MainActor in
                    guard let self, self.process === process else { return }
                    self.startupTask?.cancel()
                    self.startupTask = nil
                    guard self.state != .idle else { return }
                    self.state = .failed("The local backend stopped unexpectedly (status \(process.terminationStatus)).")
                }
            }
            try process.run()
            startupTask = Task { [weak self, weak process] in
                try? await Task.sleep(for: .seconds(20))
                guard let self, !Task.isCancelled, let process, self.process === process,
                      self.state == .starting else { return }
                self.stop()
                self.state = .failed("The local backend did not start within 20 seconds. Try Again to restart it.")
            }
        } catch {
            stop()
            state = .failed("Could not start the local backend: \(error.localizedDescription)")
        }
    }

    func stop() {
        startupTask?.cancel()
        startupTask = nil
        outputPipe?.fileHandleForReading.readabilityHandler = nil
        outputPipe = nil
        outputBuffer = ""
        launchToken = ""
        desktopToken = ""
        if let process, process.isRunning {
            process.terminate()
        }
        process = nil
        state = .idle
    }

    /// Idempotent startup for view re-appear: starts only from idle/failed,
    /// never restarts a live sidecar.
    func startIfNeeded() {
        switch state {
        case .starting, .ready:
            return
        case .idle, .failed:
            start()
        }
    }

    private func consumeOutput(_ text: String) {
        guard state == .starting else { return }
        outputBuffer += text
        let lines = outputBuffer.split(separator: "\n", omittingEmptySubsequences: false)
        outputBuffer = lines.last.map(String.init) ?? ""
        if outputBuffer.utf8.count > 65_536 { outputBuffer = "" }
        for line in lines.dropLast() where line.hasPrefix("RESEARCH_READY ") {
            let raw = String(line.dropFirst("RESEARCH_READY ".count)).trimmingCharacters(in: .whitespacesAndNewlines)
            guard state == .starting, let url = Self.readyURL(from: raw) else { continue }
            startupTask?.cancel()
            startupTask = nil
            desktopToken = launchToken
            state = .ready(url)
        }
    }

    nonisolated static func readyURL(from raw: String) -> URL? {
        guard let url = URL(string: raw), url.scheme == "http", url.host == "127.0.0.1",
              let port = url.port, (1...65535).contains(port), url.user == nil, url.password == nil,
              url.query == nil, url.fragment == nil, url.path.isEmpty || url.path == "/" else { return nil }
        return url
    }

    private func dataDirectory() throws -> URL {
        let directory = try FileManager.default.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )
        let data = directory.appending(path: "research/data", directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: data, withIntermediateDirectories: true)
        return data
    }
}
