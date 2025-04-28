import pb from 'protobufjs';
import assert from 'assert';
import { liqi } from './liqi.proto';
import { z } from 'zod';
import { Codec, type UnwrappedMessage } from './codec';

const versionInfoSchema = z.object({
  version: z.string(),
  force_version: z.string(),
  code: z.string(),
});
export async function getVersionInfo() {
  const res = await fetch(`https://mahjongsoul.game.yo-star.com/version.json`);
  const data = await res.json();
  return versionInfoSchema.parse(data);
}

const { version } = await getVersionInfo();

export enum MessageType {
  Notification = 1,
  Request = 2,
  Response = 3,
}

export type ProtobufSchemas = typeof liqi.nested.lq.nested;
export type ServiceNames<T> = {
  [K in keyof T]-?: T[K] extends {
    methods: Record<
      string,
      {
        requestType: string;
        responseType: string;
      }
    >;
  }
    ? K
    : never;
}[keyof T];
export type MethodNames<ServiceName extends ServiceNames<ProtobufSchemas>> =
  Extract<keyof ProtobufSchemas[ServiceName]['methods'], string>;

export type MethodParam<
  ServiceName extends ServiceNames<ProtobufSchemas>,
  MethodName extends MethodNames<ServiceName>
> = ProtoSchemaToTs<
  ProtobufSchemas[RequestType<
    ServiceName,
    MethodName
  > extends keyof ProtobufSchemas
    ? RequestType<ServiceName, MethodName>
    : never]
>;

export type MethodReturn<
  ServiceName extends ServiceNames<ProtobufSchemas>,
  MethodName extends MethodNames<ServiceName>
> = ProtoSchemaToTs<
  ProtobufSchemas[ResponseType<
    ServiceName,
    MethodName
  > extends keyof ProtobufSchemas
    ? ResponseType<ServiceName, MethodName>
    : never]
>;

export type RequestType<
  R extends ServiceNames<ProtobufSchemas>,
  P extends Extract<keyof ProtobufSchemas[R]['methods'], string>
> = ProtobufSchemas[R]['methods'][P] extends { requestType: infer Req }
  ? Req
  : never;

export type ResponseType<
  R extends ServiceNames<ProtobufSchemas>,
  P extends Extract<keyof ProtobufSchemas[R]['methods'], string>
> = ProtobufSchemas[R]['methods'][P] extends { responseType: infer Res }
  ? Res
  : never;

export type ServiceProxy<ServiceName extends ServiceNames<ProtobufSchemas>> = {
  [MethodName in MethodNames<ServiceName>]: typeof NetAgent.prototype.sendRequest<ServiceName, MethodName> extends (arg0: any, arg1: any, ...rest: infer Args) => infer Ret ? (...args: Args) => Ret : never
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

export type ProtoSchemaToTs<T, Path extends string[] = []> = Partial<
  T extends {
    fields: Record<string, { type: string; rule?: string }>;
  }
    ? {
        [K in keyof T['fields']]: T['fields'][K] extends {
          type: infer TypeName extends string;
          rule?: string;
        }
          ? TypeName extends keyof FieldTypeMap
            ? T['fields'][K]['rule'] extends 'repeated'
              ? FieldTypeMap[TypeName][]
              : FieldTypeMap[TypeName]
            : TypeName extends keyof ProtobufSchemas
            ? T['fields'][K]['rule'] extends 'repeated'
              ? ProtoSchemaToTs<
                  ProtobufSchemas[TypeName],
                  [...Path, K & string]
                >[]
              : ProtoSchemaToTs<
                  ProtobufSchemas[TypeName],
                  [...Path, K & string]
                >
            : never
          : never;
      } extends infer Mapped
      ? Mapped
      : never
    : never
>;

export type NetAgentOptions = {
  throwErrors: boolean;
  debugNotifications: boolean;
  debugResponses: boolean;
};

type NotificationCallbackReturn<R extends keyof ProtobufSchemas> = UnwrappedMessage<ProtoSchemaToTs<ProtobufSchemas[R]>>;

const file = Bun.file('./actions.txt');
const writer = file.writer();

export class NetAgent extends WebSocket {
  static gateway = 'wss://engame.mahjongsoul.com/gateway';
  static gameGateway = 'wss://engame.mahjongsoul.com/game-gateway-zone';
  private msgQueue: { name: string; cb: (response: any) => void }[] = [];
  private msgIndex = 0;
  private events: Record<string, Function[]> = {};
  public version = version;
  private readonly codec = new Codec(pb.Root.fromJSON(liqi as pb.INamespace));
  public throwErrors: boolean;
  public debugNotifications: boolean;
  public debugResponses: boolean;

  private emit(event: string, data: any) {
    const callbacks = this.events[event];
    if (!callbacks) return;
    for (const cb of callbacks) {
      cb(data);
    }
  }

  constructor(url: string, opts: Partial<NetAgentOptions> = {}) {
    super(url);
    this.throwErrors = opts.throwErrors ?? false;
    this.debugNotifications = opts.debugNotifications ?? false;
    this.debugResponses = opts.debugResponses ?? false;

    this.addEventListener('message', (event: MessageEvent<Buffer>) => {
      const {data, name, ...msg} = this.codec.decodeMessage(event.data, this.msgQueue);

      if (msg.type === MessageType.Notification) {

        // if(this.debugNotifications) console.log(`Notification: ${name}`, data.toJSON());
        this.emit(name, data);

        if (name === "ActionPrototype") {
          assert(data.name, "ActionPrototype has no name");

          const action = this.codec.decode(data.name, this.codec.enDecodeAction(data.data));
          if(this.debugNotifications) console.log(`Action: ${data.name}`, action.toJSON());
          writer.write(`${data.name} ${JSON.stringify(action.toJSON(), null, 2)}\n`);

          this.emit(data.name, action);
        }
      } else if (msg.type === MessageType.Response) {
        if (this.msgQueue[msg.index] !== undefined) {
          this.msgQueue[msg.index].cb(data);
          delete this.msgQueue[msg.index];
        }
      }
    });
  }

  removeNotificationListener<R extends keyof ProtobufSchemas>(
    route: R,
    cb: (res: NotificationCallbackReturn<R>) => void
  ) {
    if (!this.events[route]) return;
    this.events[route] = this.events[route].filter((f) => f !== cb);
  }

  onNotification<R extends keyof ProtobufSchemas>(
    route: R,
    cb: (res: NotificationCallbackReturn<R>) => void
  ) {
    if (!this.events[route]) this.events[route] = [];
    this.events[route].push(cb);
  }

  waitForNotification<R extends keyof ProtobufSchemas>(
    route: R
  ): Promise<NotificationCallbackReturn<R>> {
    return new Promise((resolve) => {
      this.onNotification(route, (notification) => {
        this.removeNotificationListener(route, resolve as any);
        resolve(notification);
      });
    });
  }

  sendRequest<
    ServiceName extends ServiceNames<ProtobufSchemas>,
    MethodName extends MethodNames<ServiceName>
  >(
    serviceName: ServiceName,
    methodName: MethodName,
    data: MethodParam<ServiceName, MethodName> = {},
    debug = false
  ) {
    return new Promise<UnwrappedMessage<MethodReturn<ServiceName, MethodName>>>((resolve) => {
      const encoded = this.codec.encodeMessage(serviceName, methodName, data);

      this.msgIndex %= 60007;
      this.msgQueue[this.msgIndex] = {
        name: encoded.method.responseType,
        cb: (val: UnwrappedMessage<ProtoSchemaToTs<ProtobufSchemas['ResCommon']>>) => {
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

  proxyService<ServiceName extends ServiceNames<ProtobufSchemas>>(
    serviceName: ServiceName
  ) {
    return new Proxy<ServiceProxy<ServiceName>>(
      this as ServiceProxy<ServiceName>,
      {
        get(target, prop: never) {
          // @ts-expect-error voodoo magic
          return target.sendRequest.bind(target, serviceName, prop);
        },
      }
    );
  }
}
