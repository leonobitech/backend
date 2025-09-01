use std::collections::HashMap;
use std::sync::Arc;

use tracing::info;
use webrtc::ice_transport::ice_connection_state::RTCIceConnectionState;
use webrtc::peer_connection::RTCPeerConnection;
use webrtc::stats::StatsReportType;

pub fn install_selected_pair_logger(pc: &Arc<RTCPeerConnection>) {
  let pc_for_stats = Arc::clone(pc);

  pc.on_ice_connection_state_change(Box::new(move |st| {
    let pc_in = Arc::clone(&pc_for_stats);
    Box::pin(async move {
      if st == RTCIceConnectionState::Connected {
        if let Err(e) = log_selected_pair(pc_in).await {
          info!("ℹ️ selected-pair logger: {e}");
        }
      }
    })
  }));
}

async fn log_selected_pair(pc: Arc<RTCPeerConnection>) -> Result<(), String> {
  let report = pc.get_stats().await;

  // id -> (ip, port, candidate_type, network_type)
  let mut locals: HashMap<String, (String, u16, String, String)> = HashMap::new();
  let mut remotes: HashMap<String, (String, u16, String, String)> = HashMap::new();

  let mut selected_local_id: Option<String> = None;
  let mut selected_remote_id: Option<String> = None;

  // Extras útiles del par (si el crate los expone)
  let mut nominated_state: Option<String> = None;
  let mut bytes_sent: Option<u64> = None;
  let mut bytes_recv: Option<u64> = None;
  // Nota: algunas versiones del crate exponen `current_round_trip_time` en segundos (f64).
  let rtt_ms: Option<u32> = None;

  for item in report.reports.values() {
    match item {
      StatsReportType::LocalCandidate(c) => {
        locals.insert(
          c.id.clone(),
          (
            c.ip.clone(),
            c.port,
            format!("{:?}", c.candidate_type),
            format!("{:?}", c.network_type),
          ),
        );
      }
      StatsReportType::RemoteCandidate(c) => {
        remotes.insert(
          c.id.clone(),
          (
            c.ip.clone(),
            c.port,
            format!("{:?}", c.candidate_type),
            format!("{:?}", c.network_type),
          ),
        );
      }
      StatsReportType::CandidatePair(p) if p.nominated => {
        selected_local_id = Some(p.local_candidate_id.clone());
        selected_remote_id = Some(p.remote_candidate_id.clone());
        nominated_state = Some(format!("{:?}", p.state));
        bytes_sent = Some(p.bytes_sent);
        bytes_recv = Some(p.bytes_received);

        // si existe en tu versión del crate:
        #[allow(unused_variables)]
        {
          // p.current_round_trip_time (f64, segundos) en webrtc-rs recientes
          // Si tu versión no lo tiene, este bloque no compilará: simplemente bórralo.
          // rtt_ms = Some((p.current_round_trip_time * 1000.0).round() as u32);
        }
      }
      _ => {}
    }
  }

  if let (Some(lid), Some(rid)) = (selected_local_id, selected_remote_id) {
    let (l, r) = (locals.get(&lid), remotes.get(&rid));
    let (lip, lport, ltyp, lnet) = l.cloned().unwrap_or_default();
    let (rip, rport, rtyp, rnet) = r.cloned().unwrap_or_default();

    // Protocolo: de network_type se puede inferir udp/tcp (Udp4/Udp6/Tcp4/Tcp6)
    let proto = lnet.to_lowercase();
    let proto = if proto.contains("udp") {
      "udp"
    } else if proto.contains("tcp") {
      "tcp"
    } else {
      "?"
    };

    // Resumen legible del camino
    let path = format!("{proto} / {}→{}", short_typ(&ltyp), short_typ(&rtyp));

    info!("🔗 Selected ICE Pair:");
    if l.is_some() && r.is_some() {
      info!("   local  = {}:{} ({}/{})", lip, lport, ltyp, lnet);
      info!("   remote = {}:{} ({}/{})", rip, rport, rtyp, rnet);
    } else {
      info!("   local_id = {lid}, remote_id = {rid}");
    }
    if let Some(st) = nominated_state.as_deref() {
      info!("   state  = {}  nominated=true", st);
    }
    if let (Some(s), Some(rv)) = (bytes_sent, bytes_recv) {
      info!("   traffic: sent={}B recv={}B", s, rv);
    }
    if let Some(ms) = rtt_ms {
      info!("   rtt    = {} ms", ms);
    }
    info!("   path   = {}", path);

    Ok(())
  } else {
    Err("no nominated pair found (todavía)".into())
  }
}

fn short_typ(s: &str) -> &str {
  // recorta "ServerReflexive" -> "srflx", "Relay" -> "relay", "Host" -> "host"
  let ls = s.to_lowercase();
  if ls.contains("reflexive") {
    "srflx"
  } else if ls.contains("relay") {
    "relay"
  } else if ls.contains("host") {
    "host"
  } else {
    "?"
  }
}
