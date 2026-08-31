fn main() {
    println!("cargo:rerun-if-changed=native/notifications.m");
    println!("cargo:rerun-if-changed=native/files.m");
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        cc::Build::new()
            .file("native/notifications.m")
            .file("native/files.m")
            .flag("-fobjc-arc")
            .flag("-fblocks")
            .flag("-mmacosx-version-min=14.0")
            .compile("cadence_notifications");
        println!("cargo:rustc-link-lib=framework=Foundation");
        println!("cargo:rustc-link-lib=framework=AppKit");
        println!("cargo:rustc-link-lib=framework=UserNotifications");
    }
    tauri_build::build();
}
