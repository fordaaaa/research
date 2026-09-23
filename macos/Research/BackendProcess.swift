import Foundation

@MainActor
final class BackendProcess: ObservableObject {
    enum State: Equatable {
        case idle
        case starting
        case ready(URL)
        case failed(String)
    }

    @Published private(set) var state: State = .idle

    private var process: Process?
    private var outputPipe: Pipe?
    private var outputBuffer = ""
    private var launchToken = ""
    private var startupTask: Task<Void, Never>?

    func start() {
        stop()
        guard let executable = Bundle.main.url(
            forResource: "research-backend",
            withExtension: nil,
            subdirectory: "backend"
        ) else {
            state = .failed("The bundled research backend is missing.")
            return
        }
        guard let webDirectory = Bundle.main.resourceURL?.appending(path: "web") else {
            state = .failed("The bundled research frontend is missing.")
            return
        }

        do {
            launchToken = UUID().uuidString
            let process = Process()
            let pipe = Pipe()
            process.executableURL = executable
            process.standardOutput = pipe
            process.standardError = pipe
            process.environment = ProcessInfo.processInfo.environment.merging([
                "RESEARCH_DATA_DIR": try dataDirectory().path,
                "RESEARCH_WEB_DIR": webDirectory.path,
                "RESEARCH_DESKTOP_TOKEN": launchToken,
            ]) { _, appValue in appValue }
            pipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
                let data = handle.availableData
                guard !data.isEmpty, let text = String(data: data, encoding: .utf8) else { return }
                Task { @MainActor in self?.consumeOutput(text) }
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
            self.process = process
            self.outputPipe = pipe
            state = .starting
            startupTask = Task { [weak self, weak process] in
                try? await Task.sleep(for: .seconds(20))
                guard let self, !Task.isCancelled, let process, self.process === process,
                      self.state == .starting else { return }
                self.stop()
                self.state = .failed("The local backend did not start within 20 seconds. Try Again to restart it.")
            }
        } catch {
            state = .failed("Could not start the local backend: \(error.localizedDescription)")
        }
    }

    func stop() {
        startupTask?.cancel()
        startupTask = nil
        outputPipe?.fileHandleForReading.readabilityHandler = nil
        outputPipe = nil
        outputBuffer = ""
        if let process, process.isRunning {
            process.terminate()
        }
        process = nil
        state = .idle
    }

    private func consumeOutput(_ text: String) {
        outputBuffer += text
        let lines = outputBuffer.split(separator: "\n", omittingEmptySubsequences: false)
        outputBuffer = lines.last.map(String.init) ?? ""
        for line in lines.dropLast() where line.hasPrefix("RESEARCH_READY ") {
            guard let url = URL(string: String(line.dropFirst("RESEARCH_READY ".count))) else { continue }
            startupTask?.cancel()
            startupTask = nil
            state = .ready(url.appending(queryItems: [URLQueryItem(name: "desktop_token", value: launchToken)]))
        }
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
