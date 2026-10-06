import SwiftUI

@MainActor
final class NativeSearchController: ObservableObject {
    @Published private(set) var page: SearchPage?
    @Published private(set) var isLoading = false
    @Published private(set) var error: String?
    @Published private(set) var lastRequest: NativeSearchRequest?
    private(set) var notebookId: String?
    private var generation = 0

    func clear() {
        generation += 1
        page = nil; error = nil; lastRequest = nil; notebookId = nil; isLoading = false
    }

    func search(notebookId: String, request: NativeSearchRequest, using service: any NotebookSearching) async {
        guard !Task.isCancelled else { return }
        generation += 1
        let current = generation
        isLoading = true; error = nil; page = nil; lastRequest = request
        self.notebookId = notebookId
        defer { if generation == current { isLoading = false } }
        do {
            let result = try await service.searchNotebook(notebookId: notebookId, request: request)
            guard !Task.isCancelled, generation == current else { return }
            page = result
        } catch {
            guard !Task.isCancelled, generation == current else { return }
            self.error = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }
}

struct SearchView: View {
    @EnvironmentObject private var appState: AppState
    let notebook: Notebook
    let focusVersion: Int
    let onOpenSource: (SearchHit) -> Void
    @ObservedObject private var controller: NativeSearchController
    @State private var query = ""
    @State private var kind = ""
    @State private var related = true
    @State private var request: NativeSearchRequest?
    @State private var searchVersion = 0
    @FocusState private var searchFocused: Bool
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @AppStorage("notaeo.native.reduceMotion") private var reduceMotion = false

    private var motion: NativeMotionPolicy {
        NativeMotionPolicy(systemReduceMotion: systemReduceMotion, appReduceMotion: reduceMotion)
    }

    init(notebook: Notebook, focusVersion: Int, controller: NativeSearchController, onOpenSource: @escaping (SearchHit) -> Void) {
        self.notebook = notebook
        self.focusVersion = focusVersion
        self.controller = controller
        self.onOpenSource = onOpenSource
        let saved = controller.notebookId == notebook.id ? controller.lastRequest : nil
        _query = State(initialValue: saved?.query ?? "")
        _kind = State(initialValue: saved?.kind ?? "")
        _related = State(initialValue: saved?.related ?? true)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Find the passage you need").font(NativeType.title)
                    Text("Search your imported course material. Use quotes for an exact phrase.")
                        .font(NativeType.body).foregroundStyle(.secondary)
                }
                NativeCard(title: "Search this notebook", systemImage: "magnifyingglass") {
                    VStack(alignment: .leading, spacing: 14) {
                        HStack(spacing: 12) {
                            TextField("Topic, question, or exact phrase", text: $query)
                                .textFieldStyle(.roundedBorder)
                                .focused($searchFocused)
                                .accessibilityLabel("Search course material")
                                .onSubmit { submit() }
                            Button("Search") { submit() }
                                .buttonStyle(.borderedProminent)
                                .disabled(query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || query.count > 500)
                        }
                        HStack(spacing: 20) {
                            Picker("Sources", selection: $kind) {
                                Text("All material").tag("")
                                Text("PDF documents").tag("pdf")
                                Text("Word documents").tag("docx")
                                Text("Text files").tag("txt")
                                Text("Markdown files").tag("md")
                                Text("Pasted notes").tag("paste")
                                Text("Web articles").tag("url")
                            }.frame(maxWidth: 270)
                            Toggle("Include related terms", isOn: $related)
                        }
                        Text("Related terms include supported academic aliases and clear typos. No AI key needed.")
                            .font(NativeType.caption).foregroundStyle(.secondary)
                        if query.count > 500 {
                            Text("Use 500 characters or fewer.").font(NativeType.caption).foregroundStyle(.secondary)
                        }
                    }
                }
                if controller.isLoading {
                    HStack {
                        ProgressView("Searching your material…")
                        Spacer()
                        Button("Cancel") { request = nil; searchVersion += 1; controller.clear() }
                    }.transition(motion.transition)
                } else if let error = controller.error {
                    NativeCard(title: "Search couldn't finish", systemImage: "exclamationmark.circle") {
                        Text(error).font(NativeType.body).textSelection(.enabled)
                        Button("Try again") {
                            submit()
                        }
                    }
                } else if let page = controller.page {
                    results(page)
                } else {
                    ContentUnavailableView("Your course, within reach", systemImage: "text.magnifyingglass",
                        description: Text("Try a topic from your lecture notes, then open a result to read it in context."))
                }
            }
            .padding(24).frame(maxWidth: 900, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .background(NativePalette.canvas)
        .task(id: searchVersion) {
            guard let request, let api = appState.makeAPI() else { return }
            await controller.search(notebookId: notebook.id, request: request, using: api)
        }
        .onChange(of: focusVersion, initial: true) { _, _ in searchFocused = true }
    }

    @ViewBuilder
    private func results(_ page: SearchPage) -> some View {
        if page.hits.isEmpty {
            ContentUnavailableView(page.offset > 0 ? "No more passages" : "No matching passages", systemImage: "magnifyingglass",
                description: Text("Try fewer words, another source filter, or related terms."))
            if page.offset > 0 {
                Button("Back to first results") { paginate(offset: 0) }
            }
        } else {
            HStack {
                Text("\(page.offset + 1)–\(page.offset + page.hits.count) of \(page.total) passages")
                    .font(NativeType.heading)
                Spacer()
                Text(page.related ? "Related terms included" : "Keyword matches")
                    .font(NativeType.caption).foregroundStyle(.secondary)
            }
            Text("Results for “\(page.query)”").font(NativeType.caption).foregroundStyle(.secondary)
            ForEach(Array(page.hits.enumerated()), id: \.offset) { _, hit in
                NativeCard(title: hit.sourceTitle, systemImage: "doc.text") {
                    Text(hit.snippet).font(NativeType.body).lineSpacing(4).textSelection(.enabled)
                    HStack {
                        if !hit.pages.isEmpty {
                            Text("Page \(hit.pages.map(String.init).joined(separator: ", "))")
                                .font(NativeType.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        Button { onOpenSource(hit) } label: { Label("Read source", systemImage: "arrow.up.right") }
                    }
                }
            }
            HStack {
                Button("Previous results") { paginate(offset: max(0, page.offset - page.limit)) }
                    .disabled(page.offset == 0)
                Spacer()
                Button("Next results") { paginate(offset: page.offset + page.limit) }
                    .disabled(!page.hasMore)
            }
        }
    }

    private func submit() {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, trimmed.count <= 500 else { return }
        let next = NativeSearchRequest(query: trimmed, kind: kind.isEmpty ? nil : kind, related: related)
        request = next
        searchVersion += 1
    }

    private func paginate(offset: Int) {
        guard var next = controller.lastRequest else { return }
        next.offset = offset
        request = next
        searchVersion += 1
    }
}
