export interface PlatformEvent {
  id: string;
  environmentId: string;
  type: string;
  correlationId: string | null;
  payload: Record<string, unknown>;
  occurredAt: string;
  createdAt: string;
}
