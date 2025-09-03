// Mensajes de salida del worker de STT (parciales y finales)
#[derive(Debug, Clone)]
pub enum SttMsg {
  Partial { text: String },
  Final { text: String },
}
