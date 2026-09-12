// Draws the disk image background, in the same language as the website: paper, ink,
// one red mark, thin rules on a wide grid, and labels set in monospace capitals with
// the letters spaced out. Nothing is drawn where the two icons sit.
//
//   swift scripts/make-dmg-background.swift <version> <output directory>
//
// Writes background.png and background@2x.png, which make-dmg.sh folds into a single
// tiff so the window looks right on both kinds of display.

import AppKit
import CoreText

let arguments = CommandLine.arguments
guard arguments.count >= 4 else {
    FileHandle.standardError.write(
        ("usage: make-dmg-background.swift <version> <minimum macos>"
            + " <output directory>\n").data(using: .utf8)!)
    exit(1)
}
let version = arguments[1]
// read from the app being packaged rather than written here, so raising the deployment
// target cannot leave the window claiming something the app no longer supports
let minimumSystem = arguments[2]
let outputDirectory = arguments[3]

// the window make-dmg.sh opens, in points
let width: CGFloat = 600
let height: CGFloat = 430

// where the icons land, so the art can stay out of their way
let appIcon = CGPoint(x: 150, y: 175)
let applicationsIcon = CGPoint(x: 450, y: 175)
// the webloc sits here, so nothing is drawn over it either
let linkIcon = CGPoint(x: 300, y: 320)

let paper = NSColor(srgbRed: 0xf1 / 255, green: 0xf1 / 255, blue: 0xef / 255, alpha: 1)
let ink = NSColor(srgbRed: 0x0b / 255, green: 0x0b / 255, blue: 0x0c / 255, alpha: 1)
let inkSoft = NSColor(srgbRed: 0x45 / 255, green: 0x45 / 255, blue: 0x4a / 255, alpha: 1)
let inkFaint = NSColor(srgbRed: 0x8a / 255, green: 0x8a / 255, blue: 0x90 / 255, alpha: 1)
let rule = NSColor(srgbRed: 0x0b / 255, green: 0x0b / 255, blue: 0x0c / 255, alpha: 0.12)

/* The wordmark is set in the same dot matrix face the website and the starter widget
   use. The app carries a subset holding only the letters of the name, which is all
   this needs. Where it cannot be registered, a monospace face stands in rather than
   the drawing failing. */
func wordmarkFont(size: CGFloat) -> NSFont {
    let candidates = [
        "Gailan/gailan-wordmark.ttf",
        "../Gailan/gailan-wordmark.ttf",
    ]
    for path in candidates where FileManager.default.fileExists(atPath: path) {
        let url = URL(fileURLWithPath: path)
        CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
        if let font = NSFont(name: "DotGothic16", size: size) {
            return font
        }
    }
    return NSFont.monospacedSystemFont(ofSize: size, weight: .semibold)
}

/* Letters set apart from each other, the way the site sets a label. AppKit takes the
   tracking as a fraction of the point size, so this is written as ems. */
func spacedOut(_ text: String, font: NSFont, color: NSColor, ems: CGFloat)
    -> NSAttributedString
{
    NSAttributedString(
        string: text,
        attributes: [
            .font: font,
            .foregroundColor: color,
            .kern: font.pointSize * ems,
        ])
}

func draw(scale: CGFloat) -> NSBitmapImageRep {
    let pixelsWide = Int(width * scale)
    let pixelsHigh = Int(height * scale)

    let rep = NSBitmapImageRep(
        bitmapDataPlanes: nil, pixelsWide: pixelsWide, pixelsHigh: pixelsHigh,
        bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
        colorSpaceName: .calibratedRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    rep.size = NSSize(width: width, height: height)

    NSGraphicsContext.saveGraphicsState()
    let context = NSGraphicsContext(bitmapImageRep: rep)!
    NSGraphicsContext.current = context
    let cg = context.cgContext

    paper.setFill()
    cg.fill(CGRect(x: 0, y: 0, width: width, height: height))

    // A wide grid, drawn faintly. The site sets its columns at 120, and the same
    // measure keeps the window feeling like part of the same object.
    cg.setStrokeColor(rule.withAlphaComponent(0.5).cgColor)
    cg.setLineWidth(0.5)
    for x in stride(from: 120.0, to: width, by: 120.0) {
        cg.move(to: CGPoint(x: x, y: 0))
        cg.addLine(to: CGPoint(x: x, y: height))
    }
    cg.strokePath()

    // the header, and the rule under it
    let mark = spacedOut("GAILAN", font: wordmarkFont(size: 20), color: ink, ems: 0.10)
    mark.draw(at: CGPoint(x: 40, y: height - 52))

    let label = NSFont.monospacedSystemFont(ofSize: 8, weight: .medium)
    spacedOut("DESKTOP WIDGETS", font: label, color: inkFaint, ems: 0.22)
        .draw(at: CGPoint(x: 41, y: height - 66))

    cg.setStrokeColor(rule.cgColor)
    cg.setLineWidth(1)
    cg.move(to: CGPoint(x: 40, y: height - 80))
    cg.addLine(to: CGPoint(x: width - 40, y: height - 80))
    cg.strokePath()

    /* Between the icons, an arrow built out of dots rather than drawn as a line, so it
       belongs to the same dot matrix as the wordmark and the widgets. A shaft of dots
       on the pitch, then a chevron stepping off it, which is how an arrow reads when
       every mark has to sit on a grid.

       Kept clear of both icons by the radius they occupy. */
    let dot: CGFloat = 3
    let pitch: CGFloat = 7
    let centre = height - appIcon.y
    let clearance: CGFloat = 76
    let shaftStart = appIcon.x + clearance
    let tip = applicationsIcon.x - clearance

    cg.setFillColor(ink.withAlphaComponent(0.45).cgColor)

    /* Snapped to whole pixels. Drawn at halves, a three pixel square lands across four
       and antialiases into a smudge, which is the opposite of a dot matrix. */
    func plot(_ x: CGFloat, _ y: CGFloat) {
        cg.fill(CGRect(x: (x - dot / 2).rounded(), y: (y - dot / 2).rounded(),
                       width: dot, height: dot))
    }

    var x = shaftStart
    while x <= tip {
        plot(x, centre)
        x += pitch
    }

    // the head: three dots up and three down, stepping back from the tip
    for step in 1...3 {
        let back = tip - CGFloat(step) * pitch
        let spread = CGFloat(step) * pitch
        plot(back, centre + spread)
        plot(back, centre - spread)
    }

    // the instruction, under the icons, centered
    let instruction = spacedOut(
        "DRAG GAILAN TO APPLICATIONS",
        font: NSFont.monospacedSystemFont(ofSize: 9, weight: .medium),
        color: inkSoft, ems: 0.20)
    let instructionWidth = instruction.size().width
    instruction.draw(at: CGPoint(x: (width - instructionWidth) / 2, y: height - 250))

    // a rule between installing and the link below it
    cg.setStrokeColor(rule.cgColor)
    cg.setLineWidth(1)
    cg.move(to: CGPoint(x: 40, y: height - 268))
    cg.addLine(to: CGPoint(x: width - 40, y: height - 268))
    cg.strokePath()

    // the footer: what this is on the left, what it needs on the right
    cg.setStrokeColor(rule.cgColor)
    cg.move(to: CGPoint(x: 40, y: 52))
    cg.addLine(to: CGPoint(x: width - 40, y: 52))
    cg.strokePath()

    let footer = NSFont.monospacedSystemFont(ofSize: 8, weight: .regular)
    spacedOut("VERSION \(version)", font: footer, color: inkFaint, ems: 0.18)
        .draw(at: CGPoint(x: 40, y: 32))

    let requirement = spacedOut(
        "REQUIRES MACOS \(minimumSystem)", font: footer, color: inkFaint, ems: 0.18)
    requirement.draw(at: CGPoint(x: width - 40 - requirement.size().width, y: 32))

    NSGraphicsContext.restoreGraphicsState()
    return rep
}

func write(_ rep: NSBitmapImageRep, to path: String) {
    guard let data = rep.representation(using: .png, properties: [:]) else {
        FileHandle.standardError.write("could not encode \(path)\n".data(using: .utf8)!)
        exit(1)
    }
    do {
        try data.write(to: URL(fileURLWithPath: path))
        print("  wrote \(path) (\(rep.pixelsWide)x\(rep.pixelsHigh))")
    } catch {
        FileHandle.standardError.write("could not write \(path)\n".data(using: .utf8)!)
        exit(1)
    }
}

write(draw(scale: 1), to: "\(outputDirectory)/background.png")
write(draw(scale: 2), to: "\(outputDirectory)/background@2x.png")
