#!/usr/bin/env swift

import Foundation
import ImageIO
import Vision

// Tesseract가 없는 macOS 로컬 검증에서 Vision OCR을 사용한다. 생성형 이미지의 세로 캡션도
// 놓치지 않도록 네 방향을 모두 읽고, 글자 후보가 하나라도 있으면 실패한다.
let imagePaths = Array(CommandLine.arguments.dropFirst())
guard !imagePaths.isEmpty else {
  FileHandle.standardError.write(Data("usage: verify-image-no-text-vision.swift <image>...\n".utf8))
  exit(64)
}

let orientations: [(String, CGImagePropertyOrientation)] = [
  ("up", .up),
  ("right", .right),
  ("down", .down),
  ("left", .left),
]

var rows: [[String: Any]] = []
var hasText = false

for imagePath in imagePaths {
  let fileURL = URL(fileURLWithPath: imagePath)
  guard
    let source = CGImageSourceCreateWithURL(fileURL as CFURL, nil),
    let image = CGImageSourceCreateImageAtIndex(source, 0, nil)
  else {
    rows.append(["path": imagePath, "error": "image decode failed"])
    hasText = true
    continue
  }

  var detections: [[String: Any]] = []
  for (orientationName, orientation) in orientations {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = false
    request.recognitionLanguages = ["en-US", "ko-KR"]
    let handler = VNImageRequestHandler(cgImage: image, orientation: orientation, options: [:])

    do {
      try handler.perform([request])
      for observation in request.results ?? [] {
        guard let candidate = observation.topCandidates(1).first else { continue }
        let normalized = candidate.string.trimmingCharacters(in: .whitespacesAndNewlines)
        let containsLetterOrNumber = normalized.unicodeScalars.contains {
          CharacterSet.alphanumerics.contains($0)
        }
        guard containsLetterOrNumber, candidate.confidence >= 0.45 else { continue }
        detections.append([
          "orientation": orientationName,
          "text": normalized,
          "confidence": Double(candidate.confidence),
        ])
      }
    } catch {
      detections.append([
        "orientation": orientationName,
        "text": "OCR_ERROR: \(error.localizedDescription)",
        "confidence": 1.0,
      ])
    }
  }

  if !detections.isEmpty { hasText = true }
  rows.append([
    "path": imagePath,
    "detections": detections,
    "textDetected": !detections.isEmpty,
  ])
}

let output = try JSONSerialization.data(withJSONObject: [
  "engine": "Apple Vision VNRecognizeTextRequest",
  "orientations": orientations.map(\.0),
  "images": rows,
  "ok": !hasText,
], options: [.prettyPrinted, .sortedKeys])
FileHandle.standardOutput.write(output)
FileHandle.standardOutput.write(Data("\n".utf8))
exit(hasText ? 2 : 0)
