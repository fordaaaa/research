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
    @State private var sourceTarget: SourceOpenTarget?
    @State private var searchFocusVersion = 0
    @StateObject private var searchController = NativeSearchController()
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @AppStorage("notaeo.native.reduceMotion") private var reduceMotion = false

    private var motion: NativeMotionPolicy {
        NativeMotionPolicy(systemReduceMotion: systemReduceMotion, appReduceMotion: reduceMotion)
    }

    enum Tab: String, CaseIterable { case sources = "Sources", search = "Search", coach = "Exam coach" }

    private struct SourceOpenTarget {
        let sourceId: String
        let page: Int?
    }

    var body: some View {
        NavigationSplitView {
            notebookSidebar
        } detail: {
            if let id = selectedId, let nb = notebooks.first(where: { $0.id == id }) {
                VStack(spacing: 0) {
                    HStack(alignment: .center, spacing: 20) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(nb.name).font(NativeType.title).lineLimit(1)
                            Text(tab == .sources ? "Make room for what you're learning." : tab == .search ? "Find it, then read it in context." : "One focused session at a time.")
                                .font(NativeType.caption).foregroundStyle(.secondary)
                        }
                        Spacer(minLength: 12)
                        Picker("Notebook view", selection: $tab) {
                            ForEach(Tab.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                        }.pickerStyle(.segmented).labelsHidden().frame(width: 310)
                    }
                    .padding(.horizontal, 24).padding(.vertical, 18)
                    .background(NativePalette.surface)
                    Divider()
                    Group {
                        switch tab {
                        case .sources:
                            SourcesView(notebook: nb, initialSourceId: sourceTarget?.sourceId, initialPage: sourceTarget?.page)
                                .id(nb.id).transition(motion.transition)
                        case .search:
                            SearchView(notebook: nb, focusVersion: searchFocusVersion, controller: searchController) { hit in
                                sourceTarget = SourceOpenTarget(sourceId: hit.sourceId, page: hit.pages.first)
                                tab = .sources
                            }.id(nb.id).transition(motion.transition)
                        case .coach: CoachView(notebook: nb).id(nb.id).transition(motion.transition)
                        }
                    }
                    .animation(motion.animation, value: tab)
                }
            } else {
                ContentUnavailableView("A space for your next exam", systemImage: "books.vertical", description: Text("Create a notebook for a course, then add your material and plan a revision session."))
            }
        }
        .font(NativeType.body)
        .background(NativePalette.canvas)
        .task { await reload() }
        .onChange(of: selectedId) { _, _ in sourceTarget = nil; searchController.clear() }
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    tab = .search
                    searchFocusVersion += 1
                } label: { Label("Search course material", systemImage: "magnifyingglass") }
                .keyboardShortcut("f", modifiers: .command)
                .disabled(selectedId == nil)
                .help("Search course material (⌘F)")
            }
        }
    }

    private var notebookSidebar: some View {
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                Image(systemName: "book.closed.fill").foregroundStyle(NativePalette.accent).accessibilityHidden(true)
                Text("Your notebooks").font(NativeType.heading)
                Spacer()
                if loading { ProgressView().controlSize(.small).accessibilityLabel("Loading notebooks") }
            }.padding(.horizontal, 16).padding(.vertical, 18)
            List(selection: $selectedId) {
                ForEach(notebooks) { nb in
                    Label(nb.name, systemImage: "text.book.closed")
                        .font(.system(size: 14, weight: .medium))
                        .padding(.vertical, 5)
                        .tag(nb.id as String?)
                }
            }
            Divider()
            VStack(alignment: .leading, spacing: 10) {
                Text("Start a new course").font(NativeType.caption).foregroundStyle(.secondary)
                TextField("New notebook name", text: $newName).textFieldStyle(.roundedBorder)
                Button {
                    Task { await create() }
                } label: { Label("Create notebook", systemImage: "plus") }
                .disabled(newName.trimmingCharacters(in: .whitespaces).isEmpty || loading)
                if let notice { Text(notice).font(NativeType.caption).foregroundStyle(.secondary) }
            }.padding(16)
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
    let initialSourceId: String?
    let initialPage: Int?
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
    @State private var addingSources = false
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @AppStorage("notaeo.native.reduceMotion") private var reduceMotion = false

    private var motion: NativeMotionPolicy {
        NativeMotionPolicy(systemReduceMotion: systemReduceMotion, appReduceMotion: reduceMotion)
    }

    init(notebook: Notebook, initialSourceId: String? = nil, initialPage: Int? = nil) {
        self.notebook = notebook
        self.initialSourceId = initialSourceId
        self.initialPage = initialPage
        _selectedSourceId = State(initialValue: initialSourceId)
    }

    var body: some View {
        NavigationSplitView {
            List(selection: $selectedSourceId) {
                ForEach(sources) { s in
                    HStack(alignment: .top, spacing: 9) {
                        Image(systemName: s.kind == "url" ? "link" : "doc.text")
                            .foregroundStyle(NativePalette.accent).padding(.top, 2).accessibilityHidden(true)
                        VStack(alignment: .leading, spacing: 4) {
                            Text(s.title).font(.system(size: 14, weight: .medium)).lineLimit(2)
                            Text(s.kind.uppercased()).font(NativeType.caption).foregroundStyle(.secondary)
                        }
                    }.padding(.vertical, 5).tag(s.id as String?)
                }
            }
            .navigationSplitViewColumnWidth(min: 220, ideal: 280)
            .task(id: notebook.id) { await reload() }
            .onChange(of: selectedSourceId, initial: true) { _, v in
                if let v { Task { await read(id: v) } } else { detail = nil }
            }
        } detail: {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 24) {
                        addControls
                        if readingId != nil { ProgressView("Opening source…").padding(.vertical, 24) }
                        if let detail {
                            VStack(alignment: .leading, spacing: 8) {
                                if detail.id == initialSourceId, let initialPage {
                                    Text("Opened from search · Page \(initialPage)")
                                        .font(NativeType.caption).foregroundStyle(NativePalette.accent)
                                }
                                Text(detail.title).font(NativeType.title)
                                Text("\(detail.kind.uppercased()) · \(detail.pages.count) \(detail.pages.count == 1 ? "page" : "pages")")
                                    .font(NativeType.caption).foregroundStyle(.secondary)
                            }
                            ForEach(detail.pages, id: \.number) { page in
                                VStack(alignment: .leading, spacing: 12) {
                                    Text("PAGE \(page.number)").font(NativeType.caption).tracking(1.2).foregroundStyle(.secondary)
                                    Text(page.text).font(NativeType.reading).lineSpacing(6).textSelection(.enabled)
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(24)
                                .background(NativePalette.surface, in: RoundedRectangle(cornerRadius: 14))
                                .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(NativePalette.border))
                                .id("page-\(page.number)")
                            }
                            if detail.pages.isEmpty {
                                ForEach(detail.chunks, id: \.seq) { chunk in
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text("Passage \(chunk.seq + 1)").font(.caption.bold()).foregroundStyle(.secondary)
                                        Text(chunk.text).font(NativeType.reading).lineSpacing(6).textSelection(.enabled)
                                    }
                                }
                            }
                        } else if readingId == nil {
                            ContentUnavailableView("Bring your course material", systemImage: "doc.text.magnifyingglass", description: Text("Add lecture notes, a PDF, or an article. Select a source to settle in and read."))
                        }
                        if let notice {
                            Text(notice).font(.callout).foregroundStyle(.secondary)
                                .padding(12).frame(maxWidth: .infinity, alignment: .leading)
                                .background(NativePalette.surface, in: RoundedRectangle(cornerRadius: 10))
                                .transition(motion.transition)
                        }
                    }
                    .padding(24).frame(maxWidth: 820, alignment: .leading)
                    .frame(maxWidth: .infinity)
                    .animation(motion.animation, value: notice)
                }
                .background(NativePalette.canvas)
                .onChange(of: detail?.id) { _, id in
                    guard id == initialSourceId, let initialPage else { return }
                    proxy.scrollTo("page-\(initialPage)", anchor: .top)
                }
            }
        }
    }

    private var addControls: some View {
        DisclosureGroup("Add course material", isExpanded: $addingSources) {
            VStack(alignment: .leading, spacing: 10) {
                TextField("Paste title", text: $pasteTitle).textFieldStyle(.roundedBorder)
                TextEditor(text: $pasteText).frame(minHeight: 90)
                    .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(NativePalette.border))
                    .accessibilityLabel("Source text to paste")
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
            }.font(NativeType.body).padding(.top, 10)
        }
        .font(.system(size: 14, weight: .medium))
        .padding(16)
        .background(NativePalette.surface, in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(NativePalette.border))
        .animation(motion.animation, value: addingSources)
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
            if sources.isEmpty { addingSources = true }
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
