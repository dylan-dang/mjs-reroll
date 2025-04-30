import pb, { type rpc } from 'protobufjs';
import { Codec } from './codec';
import type { lq } from './liqi.d.ts';
import liqi from '../external/res/proto/liqi.json' with { type: 'json' };
import { version } from '../external/version.json' with { type: 'json' };
import { EventEmitter } from 'events';
import { servers } from '../external/server.json' with {type: 'json'};

const [server] = servers;

export enum MessageType {
  Notification = 1,
  Request = 2,
  Response = 3,
}

export type ProtobufClass<T extends keyof typeof lq> = 
(typeof lq)[T] extends abstract new (...args: any) => any
  ? (typeof lq)[T]
  : never
  ;

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



export type MethodName<S extends ServiceName> = Exclude<keyof InstanceType<ProtobufClass<S>>, keyof rpc.Service | symbol>;
export type Method<S extends ServiceName, M extends MethodName<S>> = InstanceType<ProtobufClass<S>>[M];

export type ServiceProxy<S extends ServiceName> = {
  [M in MethodName<S>]: Method<S, M> extends (request: infer Req) => Promise<infer Res> ? (request?: Req) => Promise<Res> : never;
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
  debugNotifications: boolean;
  debugResponses: boolean;
};

export class NetAgent extends WebSocket {
  static gateway = `wss://${server}/gateway`;
  static gameGateway = `wss://${server}/game-gateway-zone`;
  private msgQueue: { name: TypeName; cb: (response: any) => void }[] = [];
  private msgIndex = 0;
  public version = version;
  private readonly codec = new Codec(pb.Root.fromJSON(liqi as pb.INamespace));
  public throwErrors: boolean;
  public debugNotifications: boolean;
  public debugResponses: boolean;

  public readonly notify = new EventEmitter<{[T in TypeName]: [InstanceType<ProtobufClass<T>>] }>();

  constructor(url: string, opts: Partial<NetAgentOptions> = {}) {
    super(url);
    this.throwErrors = opts.throwErrors ?? false;
    this.debugNotifications = opts.debugNotifications ?? false;
    this.debugResponses = opts.debugResponses ?? false;

    this.addEventListener('message', (event: MessageEvent<Buffer>) => {
      const msg = this.codec.decodeMessage(event.data, this.msgQueue);

      if (msg.type === MessageType.Notification) {
        
        // if(this.debugNotifications) console.log(`Notification: ${name}`, data.toJSON());
        this.notify.emit(msg.name, msg.data as any);

        if (msg.name === "ActionPrototype") {
          const actionName = msg.data.name as TypeName;
          const action = this.codec.decode(actionName, this.codec.enDecodeAction(msg.data.data!));
          
          if(this.debugNotifications) console.log(`Action: ${msg.data.name}`, action.toJSON());

          this.notify.emit(actionName, action as any);
        }
      } else if (msg.type === MessageType.Response) {
        if (this.msgQueue[msg.index] !== undefined) {
          this.msgQueue[msg.index].cb(msg.data);
          delete this.msgQueue[msg.index];
        }
      }
    });
  }

  sendRequest<
    S extends ServiceName,
    M extends MethodName<S>
  >(
    serviceName: S,
    methodName: M,
    data: Parameters<Method<S, M>>[0] = {},
    debug = false
  ) {
    return new Promise<Awaited<ReturnType<Method<S, M>>>>((resolve) => {
      const encoded = this.codec.encodeMessage(serviceName, methodName, data);

      this.msgIndex %= 60007;
      this.msgQueue[this.msgIndex] = {
        name: encoded.method.responseType as TypeName,
        cb:(val: lq.ResCommon) => {
          if (this.throwErrors && val.error?.code)
            throw new Error(
              `${serviceName}.${methodName}(${JSON.stringify(
                data
              )}) failed with error ${JSON.stringify(val.error)}`
            );
            if (debug || this.debugResponses) console.log(`${serviceName}.${methodName} => ${encoded.method.responseType}`, val.toJSON());
          resolve(val as any);
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

  waitForOpen(): Promise<Event> {
    return new Promise((resolve) => {
      this.addEventListener('open', resolve);
    });
  }

  waitForClose(): Promise<CloseEvent> {
    return new Promise((resolve) => {
      this.addEventListener('close', resolve);
    });
  }

  proxyService<S extends ServiceName>(
    serviceName: S
  ) {
    return new Proxy<ServiceProxy<S>>(
      this as any,
      {
        get(target, prop) {
          // @ts-ignore
          return target.sendRequest.bind(target, serviceName, prop);
        },
      }
    );
  }
}
