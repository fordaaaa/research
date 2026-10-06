import AppKit
import SwiftUI

enum NativeType {
    static let display = Font.system(size: 38, weight: .semibold, design: .rounded)
    static let title = Font.system(size: 25, weight: .semibold, design: .rounded)
    static let heading = Font.system(size: 16, weight: .semibold)
    static let body = Font.system(size: 15)
    static let caption = Font.system(size: 12)
    static let reading = Font.system(size: 17, design: .serif)
}

enum NativePalette {
    static let accent = adaptive(light: 0x256B62, dark: 0x89C9B9)
    static let canvas = adaptive(light: 0xF6F5F1, dark: 0x202523)
    static let surface = adaptive(light: 0xFDFCFA, dark: 0x292E2C)
    static let border = Color.primary.opacity(0.12)
    static let warning = adaptive(light: 0x805112, dark: 0xF0C589)

    private static func adaptive(light: UInt32, dark: UInt32) -> Color {
        Color(nsColor: NSColor(name: nil) { appearance in
            let hex = appearance.bestMatch(from: [.aqua, .darkAqua]) == .darkAqua ? dark : light
            return NSColor(srgbRed: Double((hex >> 16) & 0xff) / 255,
                           green: Double((hex >> 8) & 0xff) / 255,
                           blue: Double(hex & 0xff) / 255, alpha: 1)
        })
    }
}

struct NativeMotionPolicy {
    let reducesMotion: Bool

    init(systemReduceMotion: Bool, appReduceMotion: Bool) {
        reducesMotion = systemReduceMotion || appReduceMotion
    }

    var animation: Animation? {
        reducesMotion ? nil : .smooth(duration: 0.22, extraBounce: 0)
    }

    var transition: AnyTransition {
        reducesMotion ? .identity : .opacity.combined(with: .offset(y: 5))
    }

    struct ActivitySample {
        let opacity: Double
        let offset: Double
    }

    func activitySample(time: Double, index: Int) -> ActivitySample {
        guard !reducesMotion else { return ActivitySample(opacity: 0.7, offset: 0) }
        // Keep phase small even after months of uptime. Three dots share a 1.8s cycle.
        let phase = time.truncatingRemainder(dividingBy: 1.8) / 1.8 * 2 * .pi - Double(index) * 0.85
        let lift = max(0, sin(phase))
        return ActivitySample(opacity: 0.6 + 0.25 * sin(phase), offset: -3 * lift)
    }
}

struct NativeCard<Content: View>: View {
    let title: String
    let systemImage: String?
    private let content: Content

    init(title: String, systemImage: String? = nil, @ViewBuilder content: () -> Content) {
        self.title = title
        self.systemImage = systemImage
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 8) {
                if let systemImage {
                    Image(systemName: systemImage).foregroundStyle(NativePalette.accent)
                        .accessibilityHidden(true)
                }
                Text(title).font(NativeType.heading).accessibilityAddTraits(.isHeader)
            }
            content.frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(NativePalette.surface, in: RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(NativePalette.border))
    }
}
