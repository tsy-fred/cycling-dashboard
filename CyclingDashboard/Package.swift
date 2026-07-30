// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "CyclingDashboard",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "CyclingDashboard", targets: ["CyclingDashboard"])
    ],
    targets: [
        .executableTarget(
            name: "CyclingDashboard"
        ),
        .testTarget(
            name: "CyclingDashboardTests",
            dependencies: ["CyclingDashboard"]
        )
    ]
)
