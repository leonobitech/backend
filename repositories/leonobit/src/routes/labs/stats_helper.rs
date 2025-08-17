use std::sync::Arc;
use std::collections::HashMap;
use webrtc::ice_transport::ice_connection_state::RTCIceConnectionState;
use webrtc::peer_connection::RTCPeerConnection;
use webrtc::stats::StatsReportType;
use tracing::info;

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

    // Mapear candidates por id → (ip, port, tipo, net)
    let mut locals:  HashMap<String, (String, u16, String, String)> = HashMap::new();
    let mut remotes: HashMap<String, (String, u16, String, String)> = HashMap::new();

    let mut selected_local_id: Option<String> = None;
    let mut selected_remote_id: Option<String> = None;
    let mut selected_info: Option<(String, u64, u64)> = None; // (state, bytes_sent, bytes_recv)

    for (_id, item) in &report.reports {
        match item {
            StatsReportType::LocalCandidate(c) => {
                locals.insert(
                    c.id.clone(),
                    (c.ip.clone(), c.port, format!("{:?}", c.candidate_type), format!("{:?}", c.network_type)),
                );
            }
            StatsReportType::RemoteCandidate(c) => {
                remotes.insert(
                    c.id.clone(),
                    (c.ip.clone(), c.port, format!("{:?}", c.candidate_type), format!("{:?}", c.network_type)),
                );
            }
            StatsReportType::CandidatePair(p) if p.nominated => {
                selected_local_id  = Some(p.local_candidate_id.clone());
                selected_remote_id = Some(p.remote_candidate_id.clone());
                selected_info      = Some((format!("{:?}", p.state), p.bytes_sent, p.bytes_received));
            }
            _ => {}
        }
    }

    if let (Some(lid), Some(rid), Some((state, sent, recv))) =
        (selected_local_id, selected_remote_id, selected_info)
    {
        match (locals.get(&lid), remotes.get(&rid)) {
            (Some((lip, lport, ltyp, lnet)), Some((rip, rport, rtyp, rnet))) => {
                info!("🔗 Selected ICE Pair:");
                info!("   local  = {}:{} ({}/{})", lip, lport, ltyp, lnet);
                info!("   remote = {}:{} ({}/{})", rip, rport, rtyp, rnet);
                info!("   state  = {}  nominated=true  traffic: sent={}B recv={}B", state, sent, recv);
            }
            _ => {
                info!("🔗 Selected ICE Pair (ids): local_id={} remote_id={} state={} nominated=true", lid, rid, state);
            }
        }
        Ok(())
    } else {
        Err("no nominated pair found (todavía)".into())
    }
}