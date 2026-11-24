// Prints how wide each printable ASCII character is in 11px Verdana, the badge font.
// Rebuild src/lambda/verdana.ts with:
//   swift scripts/verdana-widths.swift > src/lambda/verdana.ts
import AppKit

guard let font = NSFont(name: "Verdana", size: 11) else {
    FileHandle.standardError.write("Verdana isn't installed\n".data(using: .utf8)!)
    exit(1)
}

var widths: [String] = []
for code in 32...126 {
    let ch = String(UnicodeScalar(code)!)
    let w = (ch as NSString).size(withAttributes: [.font: font]).width
    widths.append(String(format: "%.2f", w))
}

print("// Made by scripts/verdana-widths.swift. Widths of 11px Verdana for ASCII 32 to 126.")
print("export const VERDANA_11 = [")
for i in stride(from: 0, to: widths.count, by: 12) {
    print("  " + widths[i..<min(i + 12, widths.count)].joined(separator: ", ") + ",")
}
print("];")
