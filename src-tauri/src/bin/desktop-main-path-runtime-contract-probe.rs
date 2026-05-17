fn main() {
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .expect("create runtime for desktop main-path probe");

    match runtime.block_on(scribeflow_lib::run_desktop_main_path_runtime_contract_probe()) {
        Ok(summary) => {
            println!(
                "{}",
                serde_json::json!({
                    "ok": true,
                    "probe": "desktop-main-path-runtime-contract",
                    "summary": summary
                })
            );
        }
        Err(error) => {
            eprintln!("desktop main-path runtime contract probe failed: {error}");
            std::process::exit(1);
        }
    }
}
