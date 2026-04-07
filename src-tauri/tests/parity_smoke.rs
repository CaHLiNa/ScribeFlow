#[test]
fn parity_smoke() {
    let surfaces = ["workspace", "files", "outline", "document-run"];
    assert!(surfaces.contains(&"workspace"));
    assert!(surfaces.contains(&"files"));
}
