// Este archivo contiene una función de utilidad para notificar a un consultor sobre un incidente.
export async function notifyConsultant(input: {
  incidentId: number;
  team: string;
}): Promise<{ notificationId: string }> {
  const notificationId = `notif-${input.incidentId}-${Date.now()}`;
  console.log(`[notify_consultant] incident=${input.incidentId} team="${input.team}" -> ${notificationId}`);
  return { notificationId };
}
