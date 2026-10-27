mod agy;
mod api;
mod auth;
mod compat;
mod config;
mod conversations;
mod mcp;

use axum::{
    middleware,
    routing::{delete, get, post},
    Router,
};
use config::Config;
use std::sync::Arc;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;
use tracing::info;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Load .env file if available
    let _ = dotenvy::dotenv();

    // Initialize tracing
    tracing_subscriber::registry()
        .with(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "backend=info,tower_http=info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let config = Arc::new(Config::from_env());

    info!("Starting Antigravity API server");
    info!("Host: {}:{}", config.host, config.port);
    info!("Workspace Directory: {:?}", config.workspace_dir);
    info!("Gemini CLI Directory: {:?}", config.gemini_cli_dir);
    info!("Antigravity CLI Binary: {:?}", config.agy_bin);
    if config.api_key.is_some() {
        info!("Authentication enabled (API Key configured)");
    } else {
        info!("Authentication disabled (API Key not set, allowing all requests)");
    }

    // Configure CORS
    let cors = CorsLayer::permissive();

use tower_http::services::{ServeDir, ServeFile};

    // Build API router
    let mut app = Router::new()
        .route("/health", get(api::health_check))
        .route("/api/auth/status", get(api::auth_status))
        .route("/api/auth/start-login", post(api::start_login))
        .route("/api/auth/check-login", get(api::check_login))
        .route("/api/auth/me", get(api::auth_me))
        .route("/api/auth/logout", post(api::auth_logout))
        .route("/api/terminal/token", post(api::create_user_terminal_token))
        .route("/api/internal/verify-terminal-ticket", get(api::verify_terminal_ticket))
        .route("/api/user/key", get(api::get_user_key))
        .route("/api/user/key/regenerate", post(api::regenerate_user_key))
        .route("/api/models", get(api::get_models))
        .route("/api/conversations", get(api::list_conversations).delete(api::clear_conversations))
        .route("/api/conversations/clear", post(api::clear_conversations))
        .route(
            "/api/conversations/{id}",
            delete(api::delete_conversation),
        )
        .route(
            "/api/conversations/{id}/transcript",
            get(api::get_conversation_transcript),
        )
        .route("/api/mcp", get(api::list_mcp_servers).post(api::add_mcp_server))
        .route("/api/mcp/presets", get(api::list_mcp_presets))
        .route("/api/mcp/{name}", delete(api::delete_mcp_server))
        .route("/api/mcp/{name}/toggle", post(api::toggle_mcp_server))
        .route("/api/chat", post(api::handle_chat))
        .route("/api/spawn", post(api::spawn_instance_handler).get(api::spawn_instance_handler))
        .route("/spawn", get(api::spawn_instance_handler).post(api::spawn_instance_handler))
        .route("/launch.sh", get(api::launch_script))
        // OpenAI compatibility endpoints (Cursor, Continue, Aider, Cline)
        .route("/v1/chat/completions", post(compat::openai_chat_completions))
        .route("/chat/completions", post(compat::openai_chat_completions))
        .route("/v1/models", get(compat::list_models_openai))
        .route("/models", get(compat::list_models_openai))
        // Anthropic compatibility endpoints (Claude Code, Anthropic SDK)
        .route("/v1/messages", post(compat::anthropic_messages))
        .route("/messages", post(compat::anthropic_messages))
        .layer(middleware::from_fn_with_state(
            config.clone(),
            auth::auth_middleware,
        ))
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(config.clone());

    // Serve frontend static assets if available (with Single-Page Application fallback)
    let static_dirs = ["/app/dist", "./dist", "../frontend/dist"];
    for dir in &static_dirs {
        let p = std::path::Path::new(dir);
        if p.exists() && p.is_dir() {
            info!("Serving frontend static assets from: {:?}", p);
            let index_html = p.join("index.html");
            let serve_dir = ServeDir::new(p).not_found_service(ServeFile::new(index_html));
            app = app.fallback_service(serve_dir);
            break;
        }
    }

    let addr = format!("{}:{}", config.host, config.port);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    info!("Server listening on http://{}", addr);

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    Ok(())
}

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to install signal handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }

    info!("Signal received, shutting down gracefully");
}
