import type { Root, Type } from "protobufjs";
import {
  MessageType,
  type Method,
  type MethodName,
  type ProtobufClass,
  type ServiceName,
  type TypeName,
} from ".";
import type { lq } from "../liqi";

export type DecodedMessage = {
  [T in TypeName]: {
    name: T;
    data: InstanceType<ProtobufClass<T>>;
  } & (
    | { index: number; type: MessageType.Response | MessageType.Request }
    | { type: MessageType.Notification }
  );
}[TypeName];
export class Codec {
  public static stripMessageType(data: Buffer): {
    type: MessageType;
    data: Uint8Array;
  } {
    return {
      type: data[0],
      data: data.subarray(1),
    };
  }

  public static addMessageType(type: MessageType, data: Uint8Array): Buffer {
    return Buffer.concat([Buffer.from([type]), data]);
  }

  public static stripIndex(data: Uint8Array): {
    index: number;
    data: Uint8Array;
  } {
    return {
      index: data[0] | (data[1] << 8),
      data: data.slice(2),
    };
  }

  public static addIndex(index: number, data: Uint8Array): Buffer {
    return Buffer.concat([Buffer.from([index & 0xff, index >> 8]), data]);
  }

  public readonly wrapper: Type;

  constructor(public readonly root: Root) {
    this.wrapper = root.lookupType("Wrapper");
  }

  public decode<T extends TypeName>(
    name: T,
    data: Uint8Array,
  ): InstanceType<ProtobufClass<T>> {
    return this.root.lookupType(name).decode(data) as unknown as InstanceType<
      ProtobufClass<T>
    >;
  }

  public enDecodeAction(p: Uint8Array) {
    for (
      let L = [132, 94, 78, 66, 57, 162, 31, 96, 28], t = 0;
      t < p.byteLength;
      t++
    ) {
      const j = ((23 ^ p.byteLength) + 5 * t + L[t % L.length]) & 255;
      p[t] ^= j;
    }
    return p;
  }

  public unwrap(data: Uint8Array) {
    return this.wrapper.decode(data) as unknown as lq.Wrapper;
  }

  public decodeMessage(
    message: Buffer,
    nameMap: { name: TypeName }[],
  ): DecodedMessage {
    const { type, data: wrappedData } = Codec.stripMessageType(message);
    if (type === MessageType.Notification) {
      const { name, data } = this.unwrap(wrappedData);
      return {
        type,
        name: name.slice(4),
        data: this.decode(name as TypeName, data),
      } as DecodedMessage;
    }
    if (type !== MessageType.Response && type !== MessageType.Request) {
      throw new Error(`Unknown Message Type ${type}`);
    }
    const { index, data } = Codec.stripIndex(wrappedData);
    const unwrappedMessage = this.unwrap(data);
    const name = nameMap[index].name;
    return {
      type,
      index,
      name: name,
      data: this.decode(name as TypeName, unwrappedMessage.data),
    } as DecodedMessage;
  }

  public encodeMessage<S extends ServiceName, M extends MethodName<S>>(
    serviceName: S,
    methodName: M,
    data: Parameters<Method<S, M>>[0],
  ) {
    const name = `.lq.${serviceName}.${methodName}`;

    const service = this.root.lookupService(["lq", serviceName]);
    const method = service.methods[methodName];

    const reqType = this.root.lookupType(method.requestType);
    const payload = {
      name,
      data: reqType
        .encode(reqType.create(data as Record<string, unknown>))
        .finish(),
    };

    return {
      method,
      data: this.wrapper.encode(this.wrapper.create(payload)).finish(),
    };
  }
}
