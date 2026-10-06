import AppKit
import SwiftUI
import UniformTypeIdentifiers

/// Native workspace: notebooks sidebar + sources reader + coach tab.
struct MainView: View {
    @EnvironmentObject private var appState: AppState
    @State private var notebooks: [Notebook] = []
    @State private var selectedId: String?
    @State private var newName = ""
    @State private var notice: String?
    @State private var loading = false
    @State private var tab: Tab = .sources
    @Environment(\.openSettings) private var openSettings

    enum Tab: String, CaseIterable { case sources = "Sources", coach = "Exam coach" }

    var body: some View {
        NavigationSplitView {
            notebookSidebar
        } detail: {
            if let id = selectedId, let nb = notebooks.first(where: { $0.id == id }) {
                VStack(spacing: 0) {
                    Picker("", selection: $tab) {
                        ForEach(Tab.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                    }.pickerStyle(.segmented).padding([.top, .horizontal])
                    Group {
                        switch tab {
                        case .sources: SourcesView(notebook: nb).id(nb.id)
                        case .coach: CoachView(notebook: nb).id(nb.id)
                        }
                    }
                }
            } else {
                ContentUnavailableView("Select a notebook", systemImage: "books.vertical", description: Text("Create one or pick from the sidebar."))
            }
        }
        .task { await reload() }
    }

    private var notebookSidebar: some View {
        VStack(spacing: 0) {
            List(selection: $selectedId) {
                Section("Notebooks") {
                    ForEach(notebooks) { nb in
                        Text(nb.name).tag(nb.id as String?)
                    }
                }
            }
            Divider()
            VStack(spacing: 8) {
                TextField("New notebook name", text: $newName).textFieldStyle(.roundedBorder)
                Button("Create notebook") {
                    Task { await create() }
                }.disabled(newName.trimmingCharacters(in: .whitespaces).isEmpty || loading)
                if let notice { Text(notice).font(.caption).foregroundStyle(.secondary) }
            }.padding(10)
        }
        .navigationSplitViewColumnWidth(min: 220, ideal: 260)
    }

    private func api() -> NotaeoAPI? { appState.makeAPI() }

    private func reload() async {
        guard let api = api() else { return }
        loading = true; defer { loading = false }
        do {
            notebooks = try await api.listNotebooks()
            if selectedId == nil { selectedId = notebooks.first?.id }
            notice = nil
        } catch {
            notice = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }

    private func create() async {
        guard let api = api() else { return }
        let name = newName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { return }
        loading = true; defer { loading = false }
        do {
            let nb = try await api.createNotebook(name: name)
            notebooks.insert(nb, at: 0)
            selectedId = nb.id
            newName = ""
            notice = nil
        } catch {
            notice = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }
}

// MARK: - Sources

struct SourcesView: View {
    @EnvironmentObject private var appState: AppState
    let notebook: Notebook
    @State private var sources: [SourceSummary] = []
    @State private var selectedSourceId: String?
    @State private var detail: SourceDetail?
    @State private var notice: String?
    @State private var busy = false
    @State private var pasteTitle = ""
    @State private var pasteText = ""
    @State private var urlText = ""
    @State private var importerPresented = false
    @State private var readingId: String?

    var body: some View {
        NavigationSplitView {
            List(selection: $selectedSourceId) {
                ForEach(sources) { s in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(s.title).font(.headline).lineLimit(2)
                        Text(s.kind.uppercased()).font(.caption).foregroundStyle(.secondary)
                    }.tag(s.id as String?)
                }
            }
            .navigationSplitViewColumnWidth(min: 220, ideal: 280)
            .task(id: notebook.id) { await reload() }
            .onChange(of: selectedSourceId) { _, v in
                if let v { Task { await read(id: v) } } else { detail = nil }
            }
        } detail: {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 12) {
                    addControls
                    Divider()
                    if readingId != nil { ProgressView("Opening source…") }
                    if let detail {
                        Text(detail.title).font(.title2.bold())
                        Text("\(detail.kind.uppercased()) · \(detail.pages.count) pages").font(.caption).foregroundStyle(.secondary)
                        ForEach(detail.pages, id: \.number) { page in
                            VStack(alignment: .leading, spacing: 4) {
                                Text("Page \(page.number)").font(.caption.bold()).foregroundStyle(.secondary)
                                Text(page.text).font(.body).textSelection(.enabled)
                            }
                        }
                        if detail.pages.isEmpty {
                            ForEach(detail.chunks, id: \.seq) { chunk in
                                VStack(alignment: .leading, spacing: 4) {
                                    Text("Passage \(chunk.seq + 1)").font(.caption.bold()).foregroundStyle(.secondary)
                                    Text(chunk.text).font(.body).textSelection(.enabled)
                                }
                            }
                        }
                    } else {
                        Text("Pick a source to read. Use Add sources to paste text, import a URL, or upload a file.")
                            .foregroundStyle(.secondary)
                    }
                    if let notice { Text(notice).font(.callout).foregroundStyle(.secondary) }
                }.padding().frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }

    private var addControls: some View {
        GroupBox("Add sources") {
            VStack(alignment: .leading, spacing: 10) {
                TextField("Paste title", text: $pasteTitle).textFieldStyle(.roundedBorder)
                TextEditor(text: $pasteText).frame(minHeight: 90).border(Color.secondary.opacity(0.3))
                HStack {
                    Button("Save paste") { Task { await savePaste(force: false) } }.disabled(busy || pasteText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    Button("Upload file…") { importerPresented = true }.disabled(busy)
                    Button("Export notebook…") { Task { await export() } }.disabled(busy)
                }
                HStack {
                    TextField("https://example.com/article", text: $urlText).textFieldStyle(.roundedBorder)
                    Button("Add URL") { Task { await addURL(force: false) } }.disabled(busy || urlText.trimmingCharacters(in: .whitespaces).isEmpty)
                }
                if busy { ProgressView().controlSize(.small) }
            }.padding(.top, 4)
        }
        .fileImporter(isPresented: $importerPresented, allowedContentTypes: [.pdf, .plainText, UTType(filenameExtension: "docx") ?? .data], allowsMultipleSelection: true) { result in
            Task { await upload(result) }
        }
    }

    private func api() -> NotaeoAPI? { appState.makeAPI() }

    private func reload() async {
        guard let api = api() else { return }
        do {
            let result = try await api.listSources(notebookId: notebook.id)
            guard !Task.isCancelled else { return }
            sources = result
            if selectedSourceId == nil { selectedSourceId = sources.first?.id }
            notice = nil
        } catch {
            notice = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }

    private func read(id: String) async {
        guard let api = api() else { return }
        readingId = id
        defer { if readingId == id { readingId = nil } }
        detail = nil
        do {
            let result = try await api.getSource(id: id)
            guard readingId == id, selectedSourceId == id else { return }
            detail = result
        } catch {
            guard readingId == id else { return }
            notice = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }

    private func export() async {
        guard !busy, let api = api() else { return }
        busy = true; defer { busy = false }
        do {
            let data = try await api.exportNotebook(id: notebook.id)
            let panel = NSSavePanel()
            panel.allowedContentTypes = [.zip]
            panel.nameFieldStringValue = DownloadHandler.sanitizedExportFilename(notebook.name + ".zip", fallback: "notebook.zip")
            guard await panel.begin() == .OK, let url = panel.url else { return }
            try data.write(to: url, options: .atomic)
            notice = "Notebook exported."
        } catch { notice = error.localizedDescription }
    }

    private func savePaste(force: Bool) async {
        guard let api = api() else { return }
        busy = true; defer { busy = false }
        let title = pasteTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Pasted note" : pasteTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            let res = try await api.pasteSource(notebookId: notebook.id, title: title, text: pasteText, force: force)
            if res.saved {
                pasteTitle = ""; pasteText = ""
                await reload()
                notice = "Paste saved."
            } else if let dup = res.duplicateOf {
                notice = "Already saved as “\(dup.title)”. Saving again creates a copy."
                // One-tap confirm: retry with force after warning.
                let second = try await api.pasteSource(notebookId: notebook.id, title: title, text: pasteText, force: true)
                if second.saved { pasteTitle = ""; pasteText = ""; await reload(); notice = "Duplicate saved as a copy." }
            }
        } catch {
            notice = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }

    private func addURL(force: Bool) async {
        guard let api = api() else { return }
        busy = true; defer { busy = false }
        do {
            let res = try await api.addURLSource(notebookId: notebook.id, url: urlText.trimmingCharacters(in: .whitespacesAndNewlines), force: force)
            if res.saved {
                urlText = ""
                await reload()
                notice = "URL imported."
            } else if let dup = res.duplicateOf {
                notice = "Already saved as “\(dup.title)”."
            }
        } catch {
            notice = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }

    private func upload(_ result: Result<[URL], Error>) async {
        guard let api = api() else { return }
        guard case .success(let urls) = result else { notice = "Import cancelled."; return }
        guard urls.count <= 20 else { notice = "Choose up to 20 files per upload."; return }
        busy = true; defer { busy = false }
        var files: [(filename: String, data: Data, mime: String)] = []
        var totalBytes = 0
        for url in urls {
            let gaining = url.startAccessingSecurityScopedResource()
            defer { if gaining { url.stopAccessingSecurityScopedResource() } }
            do {
                let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
                guard size <= 50 * 1024 * 1024, totalBytes + size <= 200 * 1024 * 1024 else {
                    notice = "Files must be at most 50 MB each and 200 MB combined."
                    return
                }
                let data = try Data(contentsOf: url, options: .mappedIfSafe)
                totalBytes += data.count
                files.append((url.lastPathComponent, data, mime(for: url)))
            } catch {
                notice = "Could not read \(url.lastPathComponent): \(error.localizedDescription)"
                return
            }
        }
        guard !files.isEmpty else { notice = "Could not read the chosen files."; return }
        do {
            let reply = try await api.uploadFiles(notebookId: notebook.id, files: files)
            await reload()
            if reply.errors.isEmpty {
                notice = "Uploaded \(reply.sources.count) file(s)."
            } else {
                notice = "Uploaded \(reply.sources.count); \(reply.errors.count) failed: " + reply.errors.compactMap { $0["detail"] }.joined(separator: "; ")
            }
        } catch {
            notice = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }

    private func mime(for url: URL) -> String {
        let ext = url.pathExtension.lowercased()
        switch ext {
        case "pdf": return "application/pdf"
        case "docx": return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        case "txt", "md", "markdown": return "text/plain"
        default: return "application/octet-stream"
        }
    }
}
