import {
  type RequestScope,
  type ScopeMethods,
  type Sender,
  scopeMethods,
  stableIdempotencyKey,
  writeRequest,
} from "../core/builder";

export type StateChangeTerminal = "archive" | "reactivate";

interface StateChangeState extends RequestScope {
  expectedUpdatedAt?: string;
  idempotencyKey?: string;
}

interface StateChangeMethods<TResource, TTerminal extends StateChangeTerminal>
  extends ScopeMethods<StateChangeBuilder<TResource, TTerminal>> {
  expectedUpdatedAt(expectedUpdatedAt: string): StateChangeBuilder<TResource, TTerminal>;
  idempotencyKey(idempotencyKey: string): StateChangeBuilder<TResource, TTerminal>;
}

export type StateChangeBuilder<
  TResource,
  TTerminal extends StateChangeTerminal,
> = StateChangeMethods<TResource, TTerminal> & Record<TTerminal, () => Promise<TResource>>;

export function stateChange<TResource, TTerminal extends StateChangeTerminal>(
  send: Sender,
  path: () => string,
  terminal: TTerminal,
  state: StateChangeState,
): StateChangeBuilder<TResource, TTerminal> {
  const idempotencyKeyFor = stableIdempotencyKey();
  const next = (update: Partial<StateChangeState>) =>
    stateChange<TResource, TTerminal>(send, path, terminal, { ...state, ...update });
  return Object.freeze({
    ...scopeMethods(next),
    expectedUpdatedAt: (expectedUpdatedAt: string) => next({ expectedUpdatedAt }),
    idempotencyKey: (idempotencyKey: string) => next({ idempotencyKey }),
    [terminal]: async () =>
      await send<TResource>(
        writeRequest(
          "POST",
          `${path()}/${terminal}`,
          { ...state, idempotencyKey: idempotencyKeyFor(state.idempotencyKey) },
          state.expectedUpdatedAt === undefined
            ? undefined
            : { expectedUpdatedAt: state.expectedUpdatedAt },
        ),
      ),
  }) as StateChangeBuilder<TResource, TTerminal>;
}
