import AppKit

let output = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)

func color(_ hex: UInt32) -> CGColor {
    CGColor(
        colorSpace: CGColorSpaceCreateDeviceRGB(),
        components: [CGFloat((hex >> 16) & 255) / 255, CGFloat((hex >> 8) & 255) / 255, CGFloat(hex & 255) / 255, 1]
    )!
}

for size in [16, 32, 64, 128, 256, 512, 1024] {
    let context = CGContext(
        data: nil,
        width: size,
        height: size,
        bitsPerComponent: 8,
        bytesPerRow: 0,
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    )!
    context.scaleBy(x: CGFloat(size) / 64, y: CGFloat(size) / 64)
    context.setFillColor(color(0x06303e))
    context.addPath(CGPath(roundedRect: CGRect(x: 0, y: 0, width: 64, height: 64), cornerWidth: 15, cornerHeight: 15, transform: nil))
    context.fillPath()

    let left = CGMutablePath()
    left.move(to: CGPoint(x: 11, y: 47))
    left.addCurve(to: CGPoint(x: 32, y: 45), control1: CGPoint(x: 19, y: 50), control2: CGPoint(x: 26, y: 49))
    left.addLine(to: CGPoint(x: 32, y: 17))
    left.addCurve(to: CGPoint(x: 11, y: 19), control1: CGPoint(x: 26, y: 21), control2: CGPoint(x: 19, y: 22))
    left.closeSubpath()
    let right = CGMutablePath()
    right.move(to: CGPoint(x: 53, y: 47))
    right.addCurve(to: CGPoint(x: 32, y: 45), control1: CGPoint(x: 45, y: 50), control2: CGPoint(x: 38, y: 49))
    right.addLine(to: CGPoint(x: 32, y: 17))
    right.addCurve(to: CGPoint(x: 53, y: 19), control1: CGPoint(x: 38, y: 21), control2: CGPoint(x: 45, y: 22))
    right.closeSubpath()
    context.setFillColor(color(0xf2faf8))
    context.addPath(left)
    context.addPath(right)
    context.fillPath()
    context.setStrokeColor(color(0x0a5f57))
    context.setLineWidth(2)
    context.move(to: CGPoint(x: 32, y: 45))
    context.addLine(to: CGPoint(x: 32, y: 17))
    context.strokePath()
    context.setFillColor(color(0x19b8a6))
    context.fillEllipse(in: CGRect(x: 38, y: 31, width: 10, height: 10))

    let bitmap = NSBitmapImageRep(cgImage: context.makeImage()!)
    try bitmap.representation(using: .png, properties: [:])!.write(to: output.appending(path: "icon-\(size).png"))
}
