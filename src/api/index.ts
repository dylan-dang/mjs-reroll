import pb, { type rpc } from "protobufjs";
import { Codec } from "./codec.ts";
import type { lq } from "../liqi";
import liqi from "../../external/res/proto/liqi.json" with { type: "json" };
import { version } from "../../external/version.json" with { type: "json" };
import { EventEmitter, once } from "node:events";
import { servers } from "../../external/server.json" with { type: "json" };

const [server] = servers;

export enum MessageType {
  Notification = 1,
  Request = 2,
  Response = 3,
}

// biome-ignore lint/suspicious/noExplicitAny: General Class
type ClassDefinition = abstract new (...args: any) => any;

export type ProtobufClass<T extends keyof typeof lq> =
  (typeof lq)[T] extends ClassDefinition ? (typeof lq)[T] : never;

export type TypeName<T = keyof typeof lq> = T extends keyof typeof lq
  ? ProtobufClass<T> extends never
    ? never
    : InstanceType<ProtobufClass<T>> extends rpc.Service
      ? never
      : T
  : never;

export type ServiceName<T = keyof typeof lq> = T extends keyof typeof lq
  ? ProtobufClass<T> extends never
    ? never
    : InstanceType<ProtobufClass<T>> extends rpc.Service
      ? T
      : never
  : never;

export type MethodName<S extends ServiceName> = Exclude<
  keyof InstanceType<ProtobufClass<S>>,
  keyof rpc.Service | symbol
>;
export type Method<
  S extends ServiceName,
  M extends MethodName<S>,
> = InstanceType<ProtobufClass<S>>[M];

// biome-ignore lint/suspicious/noExplicitAny: generic
type DropTwo<T extends any[]> = T extends [any, any, ...infer Rest] ? Rest : [];

export type ServiceProxy<S extends ServiceName> = {
  [M in MethodName<S>]: (
    ...params: DropTwo<Parameters<typeof NetAgent.prototype.sendRequest<S, M>>>
  ) => ReturnType<typeof NetAgent.prototype.sendRequest<S, M>>;
};

export type FieldTypeMap = {
  string: string;
  uint32: number;
  int32: number;
  bool: boolean;
  float: number;
  double: number;
  bytes: Buffer;
};

export interface NetAgentOptions {
  throwErrors: boolean;
}

interface MessageQueueItem<T extends TypeName = TypeName> {
  name: T;
  cb(response: InstanceType<ProtobufClass<T>>): void;
}

export class NetAgent extends WebSocket {
  static gateway = `wss://${server}/gateway`;
  static gameGateway = `wss://${server}/game-gateway-zone`;
  private msgQueue: MessageQueueItem[] = [];
  private msgIndex = 0;
  public version = version;
  public readonly codec = new Codec(pb.Root.fromJSON(liqi as pb.INamespace));
  public throwErrors: boolean;

  public readonly notify = new EventEmitter<{
    [T in TypeName]: [InstanceType<ProtobufClass<T>>];
  }>();

  public async once<T extends TypeName>(
    notification: T,
  ): Promise<InstanceType<ProtobufClass<T>>> {
    const [result] = await once(this.notify, notification);
    return result;
  }

  constructor(url: string, opts: Partial<NetAgentOptions> = {}) {
    super(url);
    this.throwErrors = opts.throwErrors ?? false;

    this.addEventListener("message", (event: MessageEvent<Buffer>) => {
      const msg = this.codec.decodeMessage(event.data, this.msgQueue);

      if (msg.type === MessageType.Notification) {
        this.notify.emit(msg.name, msg.data);

        if (msg.name === "ActionPrototype") {
          const actionName = msg.data.name as TypeName;
          const action = this.codec.decode(
            actionName,
            this.codec.enDecodeAction(msg.data.data!),
          );

          this.notify.emit(actionName, action);
        }
      } else if (msg.type === MessageType.Response) {
        if (this.msgQueue[msg.index] !== undefined) {
          this.msgQueue[msg.index].cb(msg.data);
          delete this.msgQueue[msg.index];
        }
      }
    });
  }

  sendRequest<S extends ServiceName, M extends MethodName<S>>(
    serviceName: S,
    methodName: M,
    data: Parameters<Method<S, M>>[0] = {},
    opts?: Partial<{
      throwError: boolean;
    }>,
  ) {
    return new Promise<Awaited<ReturnType<Method<S, M>>>>((resolve) => {
      const encoded = this.codec.encodeMessage(serviceName, methodName, data);

      this.msgIndex %= 60007;
      this.msgQueue[this.msgIndex] = {
        name: encoded.method.responseType as TypeName,
        cb: (val: Awaited<ReturnType<Method<S, M>>>) => {
          if ((opts?.throwError ?? this.throwErrors) && val.error?.code)
            throw new Error(
              `${serviceName}.${methodName}(${JSON.stringify(
                data,
              )}) failed with error ${JSON.stringify(val.error)}`,
            );
          resolve(val);
        },
      };
      const buf = Buffer.concat([
        Buffer.from([
          MessageType.Request,
          this.msgIndex - ((this.msgIndex >> 8) << 8),
          this.msgIndex >> 8,
        ]),
        encoded.data,
      ]);
      this.send(buf);
      this.msgIndex++;
    });
  }

  waitForOpen() {
    return new Promise<Event | null>((resolve) => {
      if (this.readyState === this.OPEN) resolve(null);
      this.addEventListener("open", resolve);
    });
  }

  waitForClose(): Promise<CloseEvent | null> {
    return new Promise((resolve) => {
      if (this.readyState === this.CLOSED) resolve(null);
      this.addEventListener("close", resolve);
    });
  }

  proxyService<S extends ServiceName>(serviceName: S) {
    // biome-ignore lint/suspicious/noExplicitAny: Coerecion to Service Proxy
    return new Proxy<ServiceProxy<S>>(this as any, {
      get(target, prop) {
        // @ts-ignore
        return target.sendRequest.bind(target, serviceName, prop);
      },
    });
  }
}
