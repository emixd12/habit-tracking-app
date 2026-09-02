fn main() {
    println!("cargo:rerun-if-changed=native/notifications.m");
    println!("cargo:rerun-if-changed=native/files.m");
    println!("cargo:rerun-if-changed=native/auth.m");
    println!("cargo:rerun-if-env-changed=CADENCE_LEGACY_KEYCHAIN_QA");
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        let mut native = cc::Build::new();
        if std::env::var("CADENCE_LEGACY_KEYCHAIN_QA").as_deref() == Ok("1") {
            native.define("CADENCE_LEGACY_KEYCHAIN_QA", "1");
        }
        native
            .file("native/notifications.m")
            .file("native/files.m")
            .file("native/auth.m")
            .flag("-fobjc-arc")
            .flag("-fblocks")
            .flag("-mmacosx-version-min=14.0")
            .compile("cadence_notifications");
        println!("cargo:rustc-link-lib=framework=Foundation");
        println!("cargo:rustc-link-lib=framework=AppKit");
        println!("cargo:rustc-link-lib=framework=Security");
        println!("cargo:rustc-link-lib=framework=UniformTypeIdentifiers");
        println!("cargo:rustc-link-lib=framework=UserNotifications");
    }
    tauri_build::build();
}
