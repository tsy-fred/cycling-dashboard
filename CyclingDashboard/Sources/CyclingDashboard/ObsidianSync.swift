import Foundation

struct ObsidianSync {
    var projectRoot: URL

    func sync() async -> String {
        await withCheckedContinuation { cont in
            DispatchQueue.global(qos: .userInitiated).async {
                cont.resume(returning: self.syncSync())
            }
        }
    }

    func syncSync() -> String {
        let script = projectRoot.appendingPathComponent("scripts/sync_obsidian.py")
        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/usr/local/bin/python3")
        task.arguments = [script.path]
        task.currentDirectoryURL = projectRoot

        let outPipe = Pipe()
        let errPipe = Pipe()
        task.standardOutput = outPipe
        task.standardError = errPipe

        do {
            try task.run()
            task.waitUntilExit()
            let errData = errPipe.fileHandleForReading.readDataToEndOfFile()
            let log = String(data: errData, encoding: .utf8) ?? ""
            guard task.terminationStatus == 0 else {
                return "同步失败: \(log)"
            }
            return log.trimmingCharacters(in: .whitespacesAndNewlines)
        } catch {
            return "同步异常: \(error.localizedDescription)"
        }
    }
}
