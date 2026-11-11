// Este archivo contiene una función de utilidad para crear tareas internas en el sistema.
export async function createInternalTask(input: {
  incidentId: number;
  title: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
}): Promise<{ taskId: string }> {
  const taskId = `task-${input.incidentId}-${Date.now()}`;
  console.log(
    `[create_internal_task] incident=${input.incidentId} priority=${input.priority} title="${input.title}" -> ${taskId}`,
  );
  return { taskId };
}
