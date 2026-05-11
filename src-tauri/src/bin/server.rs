use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{delete, get, post, put},
    Json, Router,
};
use cc_switch_lib::{
    AppSettings, AppState, AppType, Database, Provider, ProviderService, SwitchResult,
};
use serde::Deserialize;
use serde_json::json;
use std::{net::SocketAddr, str::FromStr, sync::Arc};
use tower_http::cors::CorsLayer;

type SharedState = Arc<AppState>;

#[derive(Debug)]
struct ApiError(String);

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (
            StatusCode::BAD_REQUEST,
            Json(json!({
                "error": self.0,
            })),
        )
            .into_response()
    }
}

impl From<cc_switch_lib::AppError> for ApiError {
    fn from(value: cc_switch_lib::AppError) -> Self {
        Self(value.to_string())
    }
}

fn parse_app(app: &str) -> Result<AppType, ApiError> {
    AppType::from_str(app).map_err(|err| ApiError(err.to_string()))
}

async fn health() -> Json<serde_json::Value> {
    Json(json!({
        "ok": true,
        "service": "cc-switch-web",
    }))
}

async fn get_settings() -> Json<AppSettings> {
    Json(cc_switch_lib::get_settings_for_frontend())
}

async fn save_settings(Json(settings): Json<AppSettings>) -> Result<Json<bool>, ApiError> {
    cc_switch_lib::update_settings(settings)?;
    Ok(Json(true))
}

async fn list_providers(
    State(state): State<SharedState>,
    Path(app): Path<String>,
) -> Result<Json<indexmap::IndexMap<String, Provider>>, ApiError> {
    Ok(Json(ProviderService::list(&state, parse_app(&app)?)?))
}

async fn current_provider(
    State(state): State<SharedState>,
    Path(app): Path<String>,
) -> Result<Json<String>, ApiError> {
    Ok(Json(ProviderService::current(&state, parse_app(&app)?)?))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AddProviderPayload {
    provider: Provider,
    add_to_live: Option<bool>,
}

async fn add_provider(
    State(state): State<SharedState>,
    Path(app): Path<String>,
    Json(payload): Json<AddProviderPayload>,
) -> Result<Json<bool>, ApiError> {
    Ok(Json(ProviderService::add(
        &state,
        parse_app(&app)?,
        payload.provider,
        payload.add_to_live.unwrap_or(true),
    )?))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateProviderPayload {
    provider: Provider,
    original_id: Option<String>,
}

async fn update_provider(
    State(state): State<SharedState>,
    Path(app): Path<String>,
    Json(payload): Json<UpdateProviderPayload>,
) -> Result<Json<bool>, ApiError> {
    Ok(Json(ProviderService::update(
        &state,
        parse_app(&app)?,
        payload.original_id.as_deref(),
        payload.provider,
    )?))
}

async fn delete_provider(
    State(state): State<SharedState>,
    Path((app, id)): Path<(String, String)>,
) -> Result<Json<bool>, ApiError> {
    ProviderService::delete(&state, parse_app(&app)?, &id)?;
    Ok(Json(true))
}

async fn switch_provider(
    State(state): State<SharedState>,
    Path((app, id)): Path<(String, String)>,
) -> Result<Json<SwitchResult>, ApiError> {
    Ok(Json(ProviderService::switch(&state, parse_app(&app)?, &id)?))
}

fn app_router(state: SharedState) -> Router {
    Router::new()
        .route("/api/health", get(health))
        .route("/api/settings", get(get_settings).put(save_settings))
        .route("/api/providers/:app", get(list_providers).post(add_provider))
        .route("/api/providers/:app/current", get(current_provider))
        .route("/api/providers/:app/:id", put(update_provider).delete(delete_provider))
        .route("/api/providers/:app/:id/switch", post(switch_provider))
        .layer(CorsLayer::permissive())
        .with_state(state)
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let host = std::env::var("CC_SWITCH_WEB_HOST").unwrap_or_else(|_| "127.0.0.1".to_string());
    let port = std::env::var("CC_SWITCH_WEB_PORT")
        .ok()
        .and_then(|value| value.parse::<u16>().ok())
        .unwrap_or(15730);
    let addr: SocketAddr = format!("{host}:{port}").parse()?;

    let db = Arc::new(Database::init()?);
    let state = Arc::new(AppState::new(db));
    let listener = tokio::net::TcpListener::bind(addr).await?;

    println!("cc-switch-web API listening on http://{addr}");
    axum::serve(listener, app_router(state)).await?;
    Ok(())
}
