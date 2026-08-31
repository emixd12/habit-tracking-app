fn main() {
    let Some(path) = std::env::args_os().nth(1) else {
        eprintln!("Usage: local-store-contract <temporary SQLite path>");
        std::process::exit(2);
    };
    if let Err(error) = cadence_desktop_spike::run_local_store_contract(std::path::Path::new(&path))
    {
        eprintln!("{error}");
        std::process::exit(1);
    }
}
