import type { DeferredSender, RequestScope, ScopeMethods } from "../core/builder";
import { readRequest, scopeMethods, writeRequest } from "../core/builder";
import { encodePathSegment } from "../core/request-target";
import type { MigrationNotificationPlan } from "./types";

export interface PlanState extends RequestScope {
  version?: number;
  channel?: string;
  availableAt?: string;
  idempotencyKey?: string;
}

interface PlanMethods<TState extends PlanState>
  extends ScopeMethods<NotificationPlanBuilder<TState>> {
  version(version: number): NotificationPlanBuilder<TState & { version: number }>;
  channel(channel: string): NotificationPlanBuilder<TState & { channel: string }>;
  availableAt(availableAt: string): NotificationPlanBuilder<TState & { availableAt: string }>;
  idempotencyKey(idempotencyKey: string): NotificationPlanBuilder<TState>;
  get(): Promise<MigrationNotificationPlan>;
}

export interface RetryableNotification {
  retry(): Promise<MigrationNotificationPlan>;
}

export interface ReschedulableNotification {
  reschedule(): Promise<MigrationNotificationPlan>;
}

export type NotificationPlanBuilder<TState extends PlanState = PlanState> = PlanMethods<TState> &
  (TState extends { version: number; channel: string } ? RetryableNotification : object) &
  (TState extends { version: number; availableAt: string } ? ReschedulableNotification : object);

export function notificationPlan<TState extends PlanState>(
  send: DeferredSender,
  migrationPath: () => string,
  state: TState,
): NotificationPlanBuilder<TState> {
  const next = (update: Partial<PlanState>) =>
    notificationPlan(send, migrationPath, { ...state, ...update });
  const versioned = () =>
    `${migrationPath()}/notification-plans/${encodePathSegment(String(state.version))}`;
  const builder: Record<string, unknown> = {
    ...scopeMethods(next),
    version: (version: number) => next({ version }),
    channel: (channel: string) => next({ channel }),
    availableAt: (availableAt: string) => next({ availableAt }),
    idempotencyKey: (idempotencyKey: string) => next({ idempotencyKey }),
    get: () =>
      send<MigrationNotificationPlan>(() =>
        readRequest(`${migrationPath()}/notification-plan`, state),
      ),
  };
  const channel = state.channel;
  if (state.version !== undefined && channel !== undefined) {
    builder.retry = () =>
      send<MigrationNotificationPlan>(() =>
        writeRequest("POST", `${versioned()}/channels/${encodePathSegment(channel)}/retry`, state),
      );
  }
  if (state.version !== undefined && state.availableAt !== undefined) {
    builder.reschedule = () =>
      send<MigrationNotificationPlan>(() =>
        writeRequest("POST", `${versioned()}/reschedule`, state, {
          availableAt: state.availableAt,
        }),
      );
  }
  return Object.freeze(builder) as NotificationPlanBuilder<TState>;
}
