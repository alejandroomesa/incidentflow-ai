// Agente IA que hace recomendaciones de acción para el equipo de seguridad de la empresa.
const PROTOCOLS: Record<string, string> = {
  unauthorized_access:
    'Protocol INT-01: Identify affected systems, force credential rotation for compromised accounts, review access logs for the last 90 days, log a task for the security team.',
  data_breach_external_disclosure:
    'Protocol INT-02: Identify volume and category of data disclosed, identify recipients, request confirmation of deletion from the external recipient, notify the privacy consultant team for evaluation of regulatory notification duties.',
  improper_data_sharing:
    'Protocol INT-03: Confirm the sharing channel and scope of recipients, request containment (recall/deletion) where feasible, log an internal task to review the sharing process that caused the incident.',
  data_loss_destruction:
    'Protocol INT-04: Check backup availability, assess recoverability, log a task to evaluate data subject impact.',
  phishing_social_engineering:
    'Protocol INT-05: Identify compromised credentials or systems, notify IT security, log a task for user awareness follow-up.',
  system_misconfiguration:
    'Protocol INT-06: Identify exposed system/data, remediate configuration, log a task for a configuration review.',
  physical_security:
    'Protocol INT-07: Identify physical access point, review physical security logs, log a task for facilities/security review.',
  other:
    'Protocol INT-00: General triage — gather more detail from the reporter, log a task for consultant review.',
};

// Devuelve el protocolo interno correspondiente a la categoría de incidente proporcionada
export function getInternalProtocol(category: string): string {
  return PROTOCOLS[category] ?? PROTOCOLS.other;
}
