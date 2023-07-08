use clap::{Args, Parser, Subcommand};
use config::{Config, ServerConfig, ServerCorsConfig};
use ed25519_dalek::{Keypair, PublicKey, PUBLIC_KEY_LENGTH, SECRET_KEY_LENGTH};
use rand::rngs::OsRng;
use server::{run_server, ServerContext};
use std::{
    env,
    fs::{self, OpenOptions},
    io::Write,
    os::unix::prelude::OpenOptionsExt,
    path::Path,
    process,
};
use tokio::{
    signal::unix::{signal, SignalKind},
    sync::oneshot,
};

mod config;
mod server;

const DEFAULT_PORT: u16 = 8082;
const EXPIRATION_IN_SECONDS_MIN: u8 = 5;
const EXPIRATION_IN_SECONDS_MAX: u8 = 120;
const DEFAULT_EXPIRATION_IN_SECONDS: u8 = EXPIRATION_IN_SECONDS_MAX;

const DEFAULT_KEYGEN_PATH: &str = "./endorsementKey.json";

#[tokio::main]
async fn main() {
    if env::var("RUST_LOG").is_err() {
        // Use info log level by default
        env::set_var("RUST_LOG", "info")
    }
    env_logger::init();

    let top_command = Cli::parse();
    match top_command.command {
        Commands::Start(args) => {
            let (server_exit_send, server_exit_recv) = oneshot::channel();
            let (sigint_send, sigint_recv) = oneshot::channel();
            tokio::spawn(async move {
                start(args).await;
                server_exit_send.send(())
            });

            let mut sigint_stream = signal(SignalKind::interrupt())
                .unwrap_or_else(|e| log_and_exit(format!("Failed to set up signal handler: {e}")));
            tokio::spawn(async move {
                sigint_stream.recv().await;
                sigint_send.send(())
            });

            tokio::select! {
                _ = server_exit_recv => {
                    log_and_exit("Failed to start server. Exiting...".to_string());
                }
                _ = sigint_recv => {
                    log::info!("Received SIGINT. Exiting...");
                }
            }
        }

        Commands::KeyCommand(args) => match args.key_commands {
            KeySubCommands::Generate(args) => {
                key_generate(args);
            }

            KeySubCommands::Parse(args) => {
                key_parse(args);
            }
        },
    }
}

async fn start(args: StartArgs) {
    let config = match args.config_path {
        Some(config_path) => {
            let yaml_str = fs::read_to_string(&config_path).unwrap_or_else(|e| {
                log_and_exit(format!("Failed to read config file {config_path}: {e}"))
            });
            serde_yaml::from_str::<Config>(&yaml_str)
                .map(Some)
                .unwrap_or_else(|e| {
                    log_and_exit(format!("Failed to parse config file {config_path}: {e}"))
                })
        }
        None => None,
    };

    let endorsement_key = args
        .endorsement_key_path
        .or_else(|| config.clone().and_then(|x| x.endorsement_key_path))
        .map(|path| read_endorsement_key_from_file(&path))
        .or_else(|| {
            env::var("ENDORSEMENT_KEY").map_or(None, |raw| Some(parse_endorsement_key(&raw)))
        })
        .unwrap_or_else(|| {
            log_and_exit(
            "Endorsement key not provided via CLI, config file, or ENDORSEMENT_KEY environment \
            variable. You must specify an endorsement key using one of these methods.".to_string()
        )
        });

    let expiration_in_seconds = args
        .expiration_in_seconds
        .or_else(|| config.clone().and_then(|x| x.expiration_in_seconds))
        .unwrap_or(DEFAULT_EXPIRATION_IN_SECONDS);
    if expiration_in_seconds < EXPIRATION_IN_SECONDS_MIN {
        log_and_exit(format!(
            "Endorsement expiration must be at least {EXPIRATION_IN_SECONDS_MIN} seconds"
        ));
    } else if expiration_in_seconds > EXPIRATION_IN_SECONDS_MAX {
        log_and_exit(format!(
            "Endorsement expiration must be at most {EXPIRATION_IN_SECONDS_MAX} seconds"
        ));
    }

    let disable_payment_in_lieu_approval = args
        .disable_payment_in_lieu_approval
        .or_else(|| {
            config
                .clone()
                .and_then(|x| x.disable_payment_in_lieu_approval)
        })
        .unwrap_or(false);

    let port = args
        .server_port
        .or_else(|| config.clone().and_then(|c| c.server.map(|s| s.port)))
        .unwrap_or(DEFAULT_PORT);

    let cors_origin = args.server_cors_origin.or_else(|| {
        config
            .clone()
            .and_then(|c| c.server.and_then(|s| s.cors.map(|sc| sc.origin)))
    });

    let base58_endorsement_key = get_base58_public_key(endorsement_key.public);
    let server_context = ServerContext {
        endorsement_key,
        base58_endorsement_key,
        expiration_in_seconds,
        disable_payment_in_lieu_approval,
        server: ServerConfig {
            port,
            cors: cors_origin.map(|origin| ServerCorsConfig { origin }),
        },
    };

    run_server(server_context).await;
}

fn key_generate(args: KeyGenerateArgs) {
    let outfile = &args.outfile;
    if Path::new(&outfile).exists() && !args.force {
        log_and_exit(format!("Refusing to overwrite {outfile} without --force"));
    }
    let mut csprng = OsRng {};
    let keypair = Keypair::generate(&mut csprng);
    let public_key_base58 = get_base58_public_key(keypair.public);
    println!("Generated endorsement key: {public_key_base58}");
    let mut serialized = [0_u8; SECRET_KEY_LENGTH + PUBLIC_KEY_LENGTH];
    serialized[..SECRET_KEY_LENGTH].copy_from_slice(keypair.secret.as_bytes());
    serialized[PUBLIC_KEY_LENGTH..].copy_from_slice(keypair.public.as_bytes());
    let serialized = serde_json::to_string(serialized.as_ref())
        .unwrap_or_else(|e| log_and_exit(format!("Failed to serialize endorsement key: {e}")));
    println!("Writing endorsement key to {outfile}");
    let mut file = OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .mode(0o600)
        .open(outfile)
        .unwrap_or_else(|e| log_and_exit(format!("Failed to open outfile {outfile}: {e}")));
    file.write_all(serialized.as_bytes())
        .unwrap_or_else(|e| log_and_exit(format!("Failed to write secret key to {outfile}: {e}")));
}

fn key_parse(args: KeyParseArgs) {
    let parsed = read_endorsement_key_from_file(&args.filepath);
    let public_key_base58 = get_base58_public_key(parsed.public);
    println!("{public_key_base58}");
}

fn log_and_exit(msg: String) -> ! {
    log::error!("{msg}");
    process::exit(1)
}

fn read_endorsement_key_from_file(path: &str) -> Keypair {
    let raw_endorsement_key: String = fs::read_to_string(path).unwrap_or_else(|e| {
        log_and_exit(format!(
            "Failed to read endorsement key from file {path}. {e}"
        ))
    });
    parse_endorsement_key(&raw_endorsement_key)
}

fn parse_endorsement_key(raw: &str) -> Keypair {
    let secret_key_bytes: Vec<u8> = serde_json::from_str(raw)
        .unwrap_or_else(|e| log_and_exit(format!("Failed to parse endorsement key: {e}")));
    if secret_key_bytes.len() != 64 {
        log_and_exit("Invalid endorsement key. Must have length 64.".to_string());
    }
    Keypair::from_bytes(&secret_key_bytes)
        .unwrap_or_else(|e| log_and_exit(format!("Failed to construct endorsement key: {e}")))
}

fn get_base58_public_key(public_key: PublicKey) -> String {
    return bs58::encode(public_key.as_bytes()).into_string();
}

#[derive(Parser)]
#[command(author, version, about, long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Run the endorsement server
    Start(StartArgs),

    /// Endorsement key commands
    #[clap(name = "key")]
    KeyCommand(KeyCommand),
}

#[derive(Args)]
struct StartArgs {
    /// Config filepath
    #[arg(short, long = "config", name = "CONFIG_FILEPATH")]
    config_path: Option<String>,

    /// Endorsement key filepath
    #[arg(long, name = "ENDORSEMENT_KEY_FILEPATH")]
    endorsement_key_path: Option<String>,

    /// Each endorsement expires this many seconds after it is issued
    #[arg(long, name = "EXPIRATION_IN_SECONDS")]
    expiration_in_seconds: Option<u8>,

    /// Disable payment in lieu approval endpoint
    #[arg(long)]
    disable_payment_in_lieu_approval: Option<bool>,

    /// Port to listen on
    #[arg(long = "server.port", name = "PORT")]
    server_port: Option<u16>,

    /// CORS allowed origin
    #[arg(long = "server.cors.origin", name = "ORIGIN")]
    server_cors_origin: Option<String>,
}

#[derive(Parser)]
struct KeyCommand {
    #[structopt(subcommand)]
    key_commands: KeySubCommands,
}

#[derive(Subcommand)]
enum KeySubCommands {
    /// Generate an endorsement key
    Generate(KeyGenerateArgs),

    /// Show an endorsement key's Base58-encoded public key
    Parse(KeyParseArgs),
}

#[derive(Args)]
struct KeyGenerateArgs {
    /// Filepath for the generated endorsement key
    #[arg(short, long, name = "FILEPATH", default_value_t = String::from(DEFAULT_KEYGEN_PATH))]
    outfile: String,

    /// Overwrite the output file if it already exists
    #[arg(short, long)]
    force: bool,
}

#[derive(Args)]
struct KeyParseArgs {
    /// Filepath for the endorsement key
    #[arg(index = 1, name = "FILEPATH", default_value_t = String::from(DEFAULT_KEYGEN_PATH))]
    filepath: String,
}
