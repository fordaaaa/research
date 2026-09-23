import XCTest
@testable import Notaeo

/// Safe filenames and navigation policy for native downloads.
final class DownloadHandlerTests: XCTestCase {
    // MARK: - Safe filenames

    func testServerFilenamesPassThrough() {
        XCTAssertEqual(
            DownloadHandler.sanitizedExportFilename("My-Biology.zip", fallback: "notebook-abc.zip"),
            "My-Biology.zip"
        )
        XCTAssertEqual(
            DownloadHandler.sanitizedExportFilename("Study-deck-flashcards.tsv", fallback: "notebook-abc-flashcards.tsv"),
            "Study-deck-flashcards.tsv"
        )
        XCTAssertEqual(
            DownloadHandler.sanitizedExportFilename("Study-mindmap.md", fallback: "notebook-abc-mindmap.md"),
            "Study-mindmap.md"
        )
    }

    func testPathTraversalIsStripped() {
        XCTAssertEqual(
            DownloadHandler.sanitizedExportFilename("../../etc/passwd", fallback: "export.zip"),
            "passwd"
        )
        XCTAssertEqual(
            DownloadHandler.sanitizedExportFilename("a/b\\c.zip", fallback: "export.zip"),
            "c.zip"
        )
    }

    func testEmptyAndDotNamesFallBack() {
        XCTAssertEqual(DownloadHandler.sanitizedExportFilename(nil, fallback: "export.zip"), "export.zip")
        XCTAssertEqual(DownloadHandler.sanitizedExportFilename("", fallback: "export.zip"), "export.zip")
        XCTAssertEqual(DownloadHandler.sanitizedExportFilename("   ", fallback: "export.zip"), "export.zip")
        XCTAssertEqual(DownloadHandler.sanitizedExportFilename(".", fallback: "export.zip"), "export.zip")
        XCTAssertEqual(DownloadHandler.sanitizedExportFilename("..", fallback: "export.zip"), "export.zip")
    }

    func testUnsafeCharactersAreRemoved() {
        let clean = DownloadHandler.sanitizedExportFilename("a:b*c?d\"e<f>g|h\n.zip", fallback: "export.zip")
        XCTAssertFalse(clean.contains(":"))
        XCTAssertFalse(clean.contains("*"))
        XCTAssertFalse(clean.contains("?"))
        XCTAssertFalse(clean.contains("\""))
        XCTAssertFalse(clean.contains("<"))
        XCTAssertFalse(clean.contains(">"))
        XCTAssertFalse(clean.contains("|"))
        XCTAssertFalse(clean.contains("\n"))
        XCTAssertTrue(clean.hasSuffix(".zip"))
    }

    func testLongFilenamesAreTruncatedWithExtensionPreserved() {
        let long = String(repeating: "a", count: 300) + ".md"
        let clean = DownloadHandler.sanitizedExportFilename(long, fallback: "export.md")
        XCTAssertLessThanOrEqual(clean.count, 255)
        XCTAssertTrue(clean.hasSuffix(".md"))
    }

    func testUnicodeFilenameFitsFilesystemByteLimit() {
        let long = String(repeating: "é", count: 200) + ".zip"
        let clean = DownloadHandler.sanitizedExportFilename(long, fallback: "export.zip")
        XCTAssertLessThanOrEqual(clean.utf8.count, 255)
        XCTAssertTrue(clean.hasSuffix(".zip"))
    }

    func testLeadingDotIsMadeVisibleSafe() {
        let clean = DownloadHandler.sanitizedExportFilename(".hidden.md", fallback: "export.md")
        XCTAssertFalse(clean.hasPrefix("."))
        XCTAssertTrue(clean.hasSuffix(".md"))
    }

    // MARK: - Auth URL behavior (must be preserved)

    func testLoopbackURLsStayInApp() {
        XCTAssertFalse(DownloadHandler.shouldOpenExternally(url: URL(string: "http://127.0.0.1:8000/?desktop_token=abc")!))
        XCTAssertFalse(DownloadHandler.shouldOpenExternally(url: URL(string: "http://127.0.0.1:1234/api/notebooks/abc/export")!))
        XCTAssertTrue(DownloadHandler.shouldAllowNavigation(url: URL(string: "http://127.0.0.1:8000/?desktop_token=abc")!))
    }

    func testExternalHttpOpensInBrowser() {
        XCTAssertTrue(DownloadHandler.shouldOpenExternally(url: URL(string: "https://example.com/article")!))
        XCTAssertTrue(DownloadHandler.shouldOpenExternally(url: URL(string: "http://example.com/article")!))
        XCTAssertFalse(DownloadHandler.shouldAllowNavigation(url: URL(string: "https://example.com/article")!))
    }

    func testBlobAndDataURLsNeverOpenExternally() {
        XCTAssertFalse(DownloadHandler.shouldOpenExternally(url: URL(string: "blob:https://example.com/uuid")!))
        XCTAssertFalse(DownloadHandler.shouldOpenExternally(url: URL(string: "data:text/plain,hello")!))
        XCTAssertFalse(DownloadHandler.shouldAllowNavigation(url: URL(string: "blob:https://example.com/uuid")!))
    }
}
