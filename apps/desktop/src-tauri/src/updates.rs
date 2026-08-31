use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateConfiguration {
    configured: bool,
    version: String,
}

fn valid_configuration(identifier: &str, config: Option<&serde_json::Value>) -> bool {
    if identifier != "app.cadence.desktop" {
        return false;
    }
    let Some(config) = config else {
        return false;
    };
    if !config
        .get("pubkey")
        .and_then(|v| v.as_str())
        .is_some_and(|v| !v.trim().is_empty())
    {
        return false;
    }
    for flag in [
        "dangerousInsecureTransportProtocol",
        "dangerousAcceptInvalidCerts",
        "dangerousAcceptInvalidHostnames",
    ] {
        if config.get(flag).is_some_and(|v| v != false) {
            return false;
        }
    }
    config
        .get("endpoints")
        .and_then(|v| v.as_array())
        .is_some_and(|endpoints| {
            !endpoints.is_empty()
                && endpoints.iter().all(|value| {
                    value
                        .as_str()
                        .and_then(|v| tauri::Url::parse(v).ok())
                        .is_some_and(|url| {
                            url.scheme() == "https"
                                && url.host_str().is_some()
                                && url.username().is_empty()
                                && url.password().is_none()
                        })
                })
        })
}

pub fn is_configured(app: &tauri::AppHandle) -> bool {
    valid_configuration(
        &app.config().identifier,
        app.config().plugins.0.get("updater"),
    )
}

#[tauri::command]
pub fn read_update_configuration(app: tauri::AppHandle) -> UpdateConfiguration {
    UpdateConfiguration {
        configured: is_configured(&app),
        version: app.package_info().version.to_string(),
    }
}

#[tauri::command]
pub fn restart_after_update(app: tauri::AppHandle) -> Result<(), String> {
    if !is_configured(&app) {
        return Err("Signed updates are not configured for this build.".into());
    }
    app.restart()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn updater_requires_final_identity_key_https_and_certificate_validation() {
        let config = json!({"pubkey":"test-key", "endpoints":["https://releases.cadence.invalid/latest.json"]});
        assert!(valid_configuration("app.cadence.desktop", Some(&config)));
        assert!(!valid_configuration(
            "app.cadence.desktop-spike",
            Some(&config)
        ));
        assert!(!valid_configuration("app.cadence.desktop", None));
        for bad in [
            json!({"pubkey":"", "endpoints":["https://releases.cadence.invalid/latest.json"]}),
            json!({"pubkey":"test-key", "endpoints":[]}),
            json!({"pubkey":"test-key", "endpoints":["http://releases.cadence.invalid/latest.json"]}),
            json!({"pubkey":"test-key", "endpoints":["https://user:secret@releases.cadence.invalid/latest.json"]}),
            json!({"pubkey":"test-key", "endpoints":["https://releases.cadence.invalid/latest.json"], "dangerousAcceptInvalidCerts":true}),
        ] {
            assert!(!valid_configuration("app.cadence.desktop", Some(&bad)));
        }
    }
}
