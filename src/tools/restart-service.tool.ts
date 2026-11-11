import { auditService } from '../audit/audit.service.js';
import { env } from '../config/env.js';

export interface RestartServiceInput {
  incidentId: number;
  serviceName: string;
  timeout?: number; // seconds, default 30
  force?: boolean;
}

export interface RestartServiceResult {
  success: boolean;
  serviceName: string;
  restartedAt: Date;
  previousStatus: string;
  newStatus: string;
  duration: number; // ms
  output?: string;
  errorMessage?: string;
}

/**
 * Simulated service restart (demo version, no real systemd/Docker integration).
 * Only services in ALLOWED_SERVICES_TO_RESTART may be restarted.
 */
export async function restartService(input: RestartServiceInput): Promise<RestartServiceResult> {
  const startTime = Date.now();

  await auditService.record({
    incidentId: input.incidentId,
    event: 'service_restart_initiated',
    actorType: 'system',
    metadata: { serviceName: input.serviceName },
  });

  try {
    if (!env.ALLOWED_SERVICES_TO_RESTART.includes(input.serviceName)) {
      throw new Error(
        `Service "${input.serviceName}" is not in the allowed restart whitelist (ALLOWED_SERVICES_TO_RESTART)`,
      );
    }

    // Simulate the restart taking between 100-500ms
    await new Promise((resolve) => setTimeout(resolve, 100 + Math.random() * 400));

    const duration = Date.now() - startTime;
    console.log(`[restart_service] incident=${input.incidentId} service="${input.serviceName}" restarted in ${duration}ms`);

    const result: RestartServiceResult = {
      success: true,
      serviceName: input.serviceName,
      restartedAt: new Date(),
      previousStatus: 'running',
      newStatus: 'running',
      duration,
      output: `Service restarted successfully in ${duration}ms`,
    };

    await auditService.record({
      incidentId: input.incidentId,
      event: 'service_restart_success',
      actorType: 'system',
      metadata: { serviceName: input.serviceName, duration },
    });

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    await auditService.record({
      incidentId: input.incidentId,
      event: 'service_restart_failed',
      actorType: 'system',
      metadata: { serviceName: input.serviceName, error: errorMessage },
    });

    return {
      success: false,
      serviceName: input.serviceName,
      restartedAt: new Date(),
      previousStatus: 'unknown',
      newStatus: 'unknown',
      duration,
      errorMessage,
    };
  }
}
